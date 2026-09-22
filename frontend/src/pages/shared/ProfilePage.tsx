import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Briefcase, GraduationCap, Pencil, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { errorMessage } from '../../api/client';
import { keys } from '../../api/keys';
import { ChangePasswordForm } from '../../components/domain/ChangePasswordForm';
import { RoleBadge } from '../../components/domain/badges';
import { QueryBoundary } from '../../components/domain/QueryBoundary';
import { Avatar, Badge, Button, Card, CheckboxField, EmptyState, InlineAlert, KeyValue, Modal, PageHeader, SelectField, TabPanel, Tabs, TextAreaField, TextField, useConfirm } from '../../components/ui';
import { useApiMutation, usePageTitle } from '../../hooks/misc';
import { useAuth, useCurrentUser } from '../../hooks/useAuth';
import { addExperience, addQualification, addSkill, deleteExperience, deleteQualification, deleteSkill, fetchProfile, updateExperience, updateMyDetails, updateProfile, updateQualification, updateSkill } from '../../services/profile';
import type { ProfessionalProfile, Qualification, User, WorkExperience } from '../../types';
import { cn } from '../../utils/cn';
import { formatDate, plural } from '../../utils/format';
import { applyServerErrors } from '../../utils/forms';

type Tab = 'account' | 'professional' | 'qualifications' | 'experience' | 'skills' | 'security';

const blank = (value: string | undefined) => (value && value.trim() ? value.trim() : undefined);
const dateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : '');

// ---------------------------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------------------------

const accountSchema = z.object({
  name: z.string().trim().min(2, 'Enter your full name').max(100),
  phone: z.string().trim().max(20, 'At most 20 characters'),
  designation: z.string().trim().max(100),
  location: z.string().trim().max(100),
});
type AccountValues = z.infer<typeof accountSchema>;

function AccountTab({ user }: { user: User }) {
  const { refreshUser } = useAuth();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isDirty },
    reset,
  } = useForm<AccountValues>({ resolver: zodResolver(accountSchema), defaultValues: { name: user.name, phone: user.phone ?? '', designation: user.designation ?? '', location: user.location ?? '' } });

  const save = useApiMutation({
    mutationFn: (values: AccountValues) => updateMyDetails({ name: values.name, phone: blank(values.phone) ?? null, designation: blank(values.designation) ?? null, location: blank(values.location) ?? null }),
    successMessage: 'Your details were saved',
    onSuccess: async (saved) => {
      reset({ name: saved.name, phone: saved.phone ?? '', designation: saved.designation ?? '', location: saved.location ?? '' });
      await refreshUser();
    },
    onError: (error) => {
      if (!applyServerErrors(error, setError, ['name', 'phone', 'designation', 'location'])) setError('root', { message: errorMessage(error) });
    },
  });

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2" title="Personal details" description="These details are shown to trainers and administrators.">
        <form onSubmit={handleSubmit((values) => save.mutate(values))} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label="Full name" required error={errors.name?.message} wrapperClassName="sm:col-span-2" {...register('name')} />
          <TextField label="Phone" error={errors.phone?.message} autoComplete="tel" {...register('phone')} />
          <TextField label="Designation" error={errors.designation?.message} {...register('designation')} />
          <TextField label="Location" error={errors.location?.message} wrapperClassName="sm:col-span-2" {...register('location')} />
          {errors.root?.message && <InlineAlert tone="danger" className="sm:col-span-2">{errors.root.message}</InlineAlert>}
          <div className="sm:col-span-2">
            <Button type="submit" loading={save.isPending} disabled={!isDirty}>
              Save changes
            </Button>
          </div>
        </form>
      </Card>

      <Card title="Employment" description="Managed by your administrator">
        <dl className="space-y-4">
          <KeyValue label="Email">{user.email}</KeyValue>
          <KeyValue label="Employee ID">{user.employeeId}</KeyValue>
          <KeyValue label="Department">{user.department?.name}</KeyValue>
          <KeyValue label="Job role">{user.jobRole?.name}</KeyValue>
          <KeyValue label="Access role">
            <RoleBadge role={user.role} />
          </KeyValue>
          <KeyValue label="Joined">{formatDate(user.joiningDate)}</KeyValue>
          <KeyValue label="Last sign-in">{formatDate(user.lastLoginAt)}</KeyValue>
        </dl>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Professional summary
// ---------------------------------------------------------------------------------------------

const summarySchema = z.object({ headline: z.string().trim().max(160, 'At most 160 characters'), bio: z.string().trim().max(2000, 'At most 2000 characters') });
type SummaryValues = z.infer<typeof summarySchema>;

function ProfessionalTab({ profile }: { profile: ProfessionalProfile }) {
  const [expertise, setExpertise] = useState<string[]>(profile.expertise);
  const [draft, setDraft] = useState('');
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
  } = useForm<SummaryValues>({ resolver: zodResolver(summarySchema), defaultValues: { headline: profile.headline ?? '', bio: profile.bio ?? '' } });

  const dirty = isDirty || expertise.join('|') !== profile.expertise.join('|');
  const save = useApiMutation({
    mutationFn: (values: SummaryValues) => updateProfile({ headline: blank(values.headline) ?? null, bio: blank(values.bio) ?? null, expertise }),
    successMessage: 'Your professional profile was saved',
    invalidate: [keys.profile],
    onSuccess: (saved) => reset({ headline: saved.headline ?? '', bio: saved.bio ?? '' }),
  });

  const addTag = () => {
    const tag = draft.trim();
    if (tag && tag.length <= 60 && expertise.length < 20 && !expertise.some((item) => item.toLowerCase() === tag.toLowerCase())) setExpertise([...expertise, tag]);
    setDraft('');
  };

  return (
    <Card title="Professional summary" description="Tell colleagues what you do and where your expertise lies.">
      <form onSubmit={handleSubmit((values) => save.mutate(values))} noValidate className="max-w-2xl space-y-5">
        <TextField label="Headline" placeholder="For example: Scientist working on radar-based nowcasting" error={errors.headline?.message} {...register('headline')} />
        <TextAreaField label="About you" rows={5} error={errors.bio?.message} {...register('bio')} />
        <div>
          <p className="mb-1.5 text-xs font-bold text-slate-600">Areas of expertise</p>
          <div className="flex flex-wrap gap-2">
            {expertise.map((tag) => (
              <span key={tag} className="inline-flex items-center gap-1.5 rounded-full bg-sky/10 py-1 pl-3 pr-1.5 text-xs font-bold text-sky-deep">
                {tag}
                <button type="button" aria-label={`Remove ${tag}`} onClick={() => setExpertise(expertise.filter((item) => item !== tag))} className="rounded-full p-0.5 hover:bg-sky/20">
                  <X size={12} />
                </button>
              </span>
            ))}
            {expertise.length === 0 && <span className="text-xs text-slate-500">No areas added yet.</span>}
          </div>
          <div className="mt-3 flex max-w-sm gap-2">
            <input
              aria-label="Add an area of expertise"
              value={draft}
              maxLength={60}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addTag();
                }
              }}
              placeholder="Add and press Enter"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky focus:ring-4 focus:ring-sky/10"
            />
            <Button type="button" variant="secondary" onClick={addTag} leftIcon={<Plus size={14} />}>
              Add
            </Button>
          </div>
        </div>
        <Button type="submit" loading={save.isPending} disabled={!dirty}>
          Save profile
        </Button>
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------
// Qualifications
// ---------------------------------------------------------------------------------------------

const thisYear = new Date().getFullYear();
const qualificationSchema = z.object({
  degree: z.string().trim().min(2, 'Enter the degree or certification').max(120),
  institution: z.string().trim().min(2, 'Enter the institution').max(160),
  fieldOfStudy: z.string().trim().max(120),
  yearCompleted: z
    .string()
    .trim()
    .refine((value) => value === '' || (/^\d{4}$/.test(value) && Number(value) >= 1950 && Number(value) <= thisYear + 1), `Enter a year between 1950 and ${thisYear + 1}`),
});
type QualificationValues = z.infer<typeof qualificationSchema>;

function QualificationDialog({ existing, onClose }: { existing: Qualification | null; onClose: () => void }) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<QualificationValues>({
    resolver: zodResolver(qualificationSchema),
    defaultValues: { degree: existing?.degree ?? '', institution: existing?.institution ?? '', fieldOfStudy: existing?.fieldOfStudy ?? '', yearCompleted: existing?.yearCompleted ? String(existing.yearCompleted) : '' },
  });
  const save = useApiMutation({
    mutationFn: (values: QualificationValues) => {
      const input = { degree: values.degree, institution: values.institution, fieldOfStudy: blank(values.fieldOfStudy), yearCompleted: values.yearCompleted ? Number(values.yearCompleted) : undefined };
      return existing ? updateQualification(existing.id, input) : addQualification(input);
    },
    successMessage: existing ? 'Qualification updated' : 'Qualification added',
    invalidate: [keys.profile],
    onSuccess: onClose,
    onError: (error) => {
      if (!applyServerErrors(error, setError, ['degree', 'institution', 'fieldOfStudy', 'yearCompleted'])) setError('root', { message: errorMessage(error) });
    },
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={existing ? 'Edit qualification' : 'Add a qualification'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.isPending} onClick={handleSubmit((values) => save.mutate(values))}>
            Save
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit((values) => save.mutate(values))} noValidate className="space-y-4">
        <TextField label="Degree or certification" required error={errors.degree?.message} {...register('degree')} />
        <TextField label="Institution" required error={errors.institution?.message} {...register('institution')} />
        <TextField label="Field of study" error={errors.fieldOfStudy?.message} {...register('fieldOfStudy')} />
        <TextField label="Year completed" inputMode="numeric" maxLength={4} error={errors.yearCompleted?.message} {...register('yearCompleted')} />
        {errors.root?.message && <InlineAlert tone="danger">{errors.root.message}</InlineAlert>}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}

function QualificationsTab({ profile }: { profile: ProfessionalProfile }) {
  const confirm = useConfirm();
  const [editing, setEditing] = useState<Qualification | null | 'new'>(null);
  const remove = useApiMutation({ mutationFn: (id: string) => deleteQualification(id), successMessage: 'Qualification removed', invalidate: [keys.profile] });
  return (
    <Card
      title="Qualifications"
      description="Degrees, diplomas and certifications"
      action={
        <Button size="sm" onClick={() => setEditing('new')} leftIcon={<Plus size={14} />}>
          Add
        </Button>
      }
    >
      {profile.qualifications.length === 0 ? (
        <EmptyState title="No qualifications yet" description="Add your degrees and certifications." icon={<GraduationCap size={18} />} />
      ) : (
        <ul className="divide-y divide-slate-100">
          {profile.qualifications.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0">
              <div>
                <p className="font-bold text-navy">{item.degree}</p>
                <p className="text-sm text-slate-500">
                  {item.institution}
                  {item.fieldOfStudy ? ` · ${item.fieldOfStudy}` : ''}
                  {item.yearCompleted ? ` · ${item.yearCompleted}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button type="button" aria-label={`Edit ${item.degree}`} onClick={() => setEditing(item)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-navy">
                  <Pencil size={15} />
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${item.degree}`}
                  onClick={async () => {
                    if (await confirm({ title: 'Remove this qualification?', message: `“${item.degree}” will be removed from your profile.`, confirmLabel: 'Remove', tone: 'danger' })) remove.mutate(item.id);
                  }}
                  className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-500"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing && <QualificationDialog existing={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------
// Experience
// ---------------------------------------------------------------------------------------------

const experienceSchema = z
  .object({
    title: z.string().trim().min(2, 'Enter your job title').max(120),
    organization: z.string().trim().min(2, 'Enter the organisation').max(160),
    location: z.string().trim().max(120),
    startDate: z.string().min(1, 'Choose the start date'),
    current: z.boolean(),
    endDate: z.string(),
    description: z.string().trim().max(1000),
  })
  .refine((value) => value.current || !value.endDate || value.endDate >= value.startDate, { path: ['endDate'], message: 'End date cannot be before the start date' });
type ExperienceValues = z.infer<typeof experienceSchema>;

function ExperienceDialog({ existing, onClose }: { existing: WorkExperience | null; onClose: () => void }) {
  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors },
  } = useForm<ExperienceValues>({
    resolver: zodResolver(experienceSchema),
    defaultValues: {
      title: existing?.title ?? '',
      organization: existing?.organization ?? '',
      location: existing?.location ?? '',
      startDate: dateInput(existing?.startDate ?? null),
      current: existing ? existing.endDate === null : false,
      endDate: dateInput(existing?.endDate ?? null),
      description: existing?.description ?? '',
    },
  });
  const current = watch('current');
  const save = useApiMutation({
    mutationFn: (values: ExperienceValues) => {
      const input = {
        title: values.title,
        organization: values.organization,
        location: blank(values.location),
        startDate: values.startDate,
        endDate: values.current || !values.endDate ? null : values.endDate,
        description: blank(values.description),
      };
      return existing ? updateExperience(existing.id, input) : addExperience(input);
    },
    successMessage: existing ? 'Experience updated' : 'Experience added',
    invalidate: [keys.profile],
    onSuccess: onClose,
    onError: (error) => {
      if (!applyServerErrors(error, setError, ['title', 'organization', 'location', 'startDate', 'endDate', 'description'])) setError('root', { message: errorMessage(error) });
    },
  });
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={existing ? 'Edit experience' : 'Add work experience'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.isPending} onClick={handleSubmit((values) => save.mutate(values))}>
            Save
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit((values) => save.mutate(values))} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="Job title" required error={errors.title?.message} {...register('title')} />
        <TextField label="Organisation" required error={errors.organization?.message} {...register('organization')} />
        <TextField label="Location" error={errors.location?.message} wrapperClassName="sm:col-span-2" {...register('location')} />
        <TextField label="Start date" type="date" required error={errors.startDate?.message} {...register('startDate')} />
        <TextField label="End date" type="date" disabled={current} error={errors.endDate?.message} {...register('endDate')} />
        <CheckboxField label="I currently work here" className="sm:col-span-2" {...register('current')} />
        <TextAreaField label="Description" rows={3} error={errors.description?.message} wrapperClassName="sm:col-span-2" {...register('description')} />
        {errors.root?.message && <InlineAlert tone="danger" className="sm:col-span-2">{errors.root.message}</InlineAlert>}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}

function ExperienceTab({ profile }: { profile: ProfessionalProfile }) {
  const confirm = useConfirm();
  const [editing, setEditing] = useState<WorkExperience | null | 'new'>(null);
  const remove = useApiMutation({ mutationFn: (id: string) => deleteExperience(id), successMessage: 'Experience removed', invalidate: [keys.profile] });
  return (
    <Card
      title="Work experience"
      description="Most recent first"
      action={
        <Button size="sm" onClick={() => setEditing('new')} leftIcon={<Plus size={14} />}>
          Add
        </Button>
      }
    >
      {profile.experiences.length === 0 ? (
        <EmptyState title="No experience recorded" description="Add the positions you have held." icon={<Briefcase size={18} />} />
      ) : (
        <ul className="divide-y divide-slate-100">
          {profile.experiences.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0">
              <div>
                <p className="font-bold text-navy">{item.title}</p>
                <p className="text-sm text-slate-500">
                  {item.organization}
                  {item.location ? ` · ${item.location}` : ''}
                </p>
                <p className="text-xs text-slate-500">
                  {formatDate(item.startDate)} – {item.endDate ? formatDate(item.endDate) : 'Present'}
                </p>
                {item.description && <p className="mt-1.5 text-sm leading-6 text-slate-600">{item.description}</p>}
              </div>
              <div className="flex shrink-0 gap-1">
                <button type="button" aria-label={`Edit ${item.title}`} onClick={() => setEditing(item)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-navy">
                  <Pencil size={15} />
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${item.title}`}
                  onClick={async () => {
                    if (await confirm({ title: 'Remove this position?', message: `“${item.title}” at ${item.organization} will be removed from your profile.`, confirmLabel: 'Remove', tone: 'danger' })) remove.mutate(item.id);
                  }}
                  className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-500"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing && <ExperienceDialog existing={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------------------------

const PROFICIENCY = ['', 'Beginner', 'Basic', 'Working', 'Advanced', 'Expert'];

function SkillsTab({ profile }: { profile: ProfessionalProfile }) {
  const [name, setName] = useState('');
  const [proficiency, setProficiency] = useState(3);
  const add = useApiMutation({
    mutationFn: () => addSkill({ name: name.trim(), proficiency }),
    successMessage: 'Skill added',
    invalidate: [keys.profile],
    onSuccess: () => setName(''),
  });
  const rate = useApiMutation({ mutationFn: (input: { id: string; proficiency: number }) => updateSkill(input.id, input.proficiency), invalidate: [keys.profile] });
  const remove = useApiMutation({ mutationFn: (id: string) => deleteSkill(id), successMessage: 'Skill removed', invalidate: [keys.profile] });

  return (
    <Card title="Skills" description="Self-declared skills. They do not change your competency levels, which come only from assessed evidence.">
      <form
        className="mb-6 flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim()) add.mutate();
        }}
      >
        <TextField label="Skill" value={name} maxLength={60} onChange={(event) => setName(event.target.value)} wrapperClassName="w-64" placeholder="For example: Python" />
        <SelectField label="Proficiency" wrapperClassName="w-44" value={proficiency} onChange={(event) => setProficiency(Number(event.target.value))}>
          {[1, 2, 3, 4, 5].map((value) => (
            <option key={value} value={value}>
              {value} · {PROFICIENCY[value]}
            </option>
          ))}
        </SelectField>
        <Button type="submit" loading={add.isPending} disabled={!name.trim()} leftIcon={<Plus size={14} />}>
          Add skill
        </Button>
      </form>
      {profile.skills.length === 0 ? (
        <EmptyState title="No skills added" description="Add the tools and methods you work with." icon={<Sparkles size={18} />} />
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {profile.skills.map((skill) => (
            <li key={skill.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-navy">{skill.name}</p>
                <div role="radiogroup" aria-label={`Proficiency in ${skill.name}`} className="mt-1 flex gap-1">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={skill.proficiency === value}
                      aria-label={`${value} of 5, ${PROFICIENCY[value]}`}
                      onClick={() => rate.mutate({ id: skill.id, proficiency: value })}
                      className={cn('h-2 w-7 rounded-full transition', value <= skill.proficiency ? 'bg-sky' : 'bg-slate-200 hover:bg-slate-300')}
                    />
                  ))}
                </div>
                <p className="mt-1 text-[11px] font-semibold text-slate-500">{PROFICIENCY[skill.proficiency]}</p>
              </div>
              <button type="button" aria-label={`Remove ${skill.name}`} onClick={() => remove.mutate(skill.id)} className="rounded-lg p-2 text-slate-300 hover:bg-red-50 hover:text-red-500">
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------

function Content({ profile }: { profile: ProfessionalProfile }) {
  const user = useCurrentUser();
  const [tab, setTab] = useState<Tab>('account');
  return (
    <div className="animate-fade-in">
      <div className="mb-7 flex flex-wrap items-center gap-5">
        <Avatar name={user.name} size="xl" tone="navy" />
        <div>
          <h2 className="font-display text-3xl font-bold text-navy">{user.name}</h2>
          <p className="mt-1 text-sm text-slate-500">{[user.designation, user.department?.name].filter(Boolean).join(' · ') || user.email}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <RoleBadge role={user.role} />
            {user.jobRole && <Badge tone="info">{user.jobRole.name}</Badge>}
          </div>
        </div>
      </div>
      <Tabs
        label="Profile sections"
        value={tab}
        onChange={setTab}
        items={[
          { id: 'account', label: 'Account' },
          { id: 'professional', label: 'Professional' },
          { id: 'qualifications', label: 'Qualifications', count: profile.qualifications.length },
          { id: 'experience', label: 'Experience', count: profile.experiences.length },
          { id: 'skills', label: 'Skills', count: profile.skills.length },
          { id: 'security', label: 'Security' },
        ]}
      />
      <TabPanel key={tab} id={tab} active>
        {tab === 'account' && <AccountTab user={user} />}
        {tab === 'professional' && <ProfessionalTab profile={profile} />}
        {tab === 'qualifications' && <QualificationsTab profile={profile} />}
        {tab === 'experience' && <ExperienceTab profile={profile} />}
        {tab === 'skills' && <SkillsTab profile={profile} />}
        {tab === 'security' && (
          <Card className="max-w-xl" title="Change password" description="Changing your password signs you out of your other devices.">
            <ChangePasswordForm />
          </Card>
        )}
      </TabPanel>
      <p className="mt-6 text-xs text-slate-500">{plural(profile.skills.length, 'skill')} · {plural(profile.qualifications.length, 'qualification')} · {plural(profile.experiences.length, 'position')} recorded</p>
    </div>
  );
}

export default function ProfilePage() {
  usePageTitle('My profile');
  const query = useQuery({ queryKey: keys.profile, queryFn: fetchProfile });
  return (
    <>
      <PageHeader eyebrow="Account" title="My profile" description="Your details, professional summary, qualifications and experience." />
      <QueryBoundary query={query}>{(profile) => <Content profile={profile} />}</QueryBoundary>
    </>
  );
}
