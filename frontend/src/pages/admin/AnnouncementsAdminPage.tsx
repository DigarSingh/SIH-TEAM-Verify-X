import { zodResolver } from '@hookform/resolvers/zod';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { BellRing, Megaphone, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { errorMessage } from '../../api/client';
import { keys } from '../../api/keys';
import { Badge, Button, Card, CheckboxField, EmptyState, ErrorState, InlineAlert, Modal, PageHeader, Pagination, SelectField, Skeleton, TextAreaField, TextField, useConfirm } from '../../components/ui';
import { useApiMutation, usePageTitle } from '../../hooks/misc';
import { createAnnouncement, deleteAnnouncement, fetchAdminAnnouncements, fetchDepartments, runReminders, updateAnnouncement, type AdminAnnouncement } from '../../services/admin';
import { formatDate } from '../../utils/format';
import { applyServerErrors } from '../../utils/forms';

const AUDIENCE = { ALL: 'Everyone', TRAINEES: 'Trainees', TRAINERS: 'Trainers', ADMINS: 'Administrators' } as const;

const schema = z.object({
  title: z.string().trim().min(3, 'Enter a title (at least 3 characters)').max(150),
  body: z.string().trim().min(3, 'Write the message').max(2000, 'At most 2000 characters'),
  audience: z.enum(['ALL', 'TRAINEES', 'TRAINERS', 'ADMINS']),
  departmentId: z.string(),
  expiresAt: z.string(),
  notify: z.boolean(),
});
type FormValues = z.infer<typeof schema>;

function AnnouncementDialog({ existing, onClose }: { existing: AdminAnnouncement | null; onClose: () => void }) {
  const departments = useQuery({ queryKey: keys.departments(), queryFn: () => fetchDepartments(), staleTime: 5 * 60_000 });
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { title: existing?.title ?? '', body: existing?.body ?? '', audience: existing?.audience ?? 'ALL', departmentId: existing?.departmentId ?? '', expiresAt: existing?.expiresAt ? existing.expiresAt.slice(0, 10) : '', notify: true },
  });
  const save = useApiMutation({
    mutationFn: (values: FormValues) => {
      const shared = { title: values.title, body: values.body, audience: values.audience, departmentId: values.departmentId || null, expiresAt: values.expiresAt ? new Date(`${values.expiresAt}T23:59:59`).toISOString() : null };
      return existing ? updateAnnouncement(existing.id, shared) : createAnnouncement({ ...shared, notify: values.notify });
    },
    successMessage: existing ? 'Announcement updated' : 'Announcement published',
    invalidate: [keys.announcements, keys.announcementsAdminAll, keys.notificationsAll],
    onSuccess: onClose,
    onError: (error) => {
      if (!applyServerErrors(error, setError, ['title', 'body', 'audience', 'departmentId', 'expiresAt'])) setError('root', { message: errorMessage(error) });
    },
  });
  const submit = handleSubmit((values) => save.mutate(values));
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={existing ? 'Edit announcement' : 'New announcement'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.isPending} onClick={() => void submit()}>
            {existing ? 'Save' : 'Publish'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="Title" required wrapperClassName="sm:col-span-2" error={errors.title?.message} {...register('title')} />
        <TextAreaField label="Message" required rows={5} wrapperClassName="sm:col-span-2" error={errors.body?.message} {...register('body')} />
        <SelectField label="Audience" {...register('audience')}>
          {(Object.keys(AUDIENCE) as (keyof typeof AUDIENCE)[]).map((key) => (
            <option key={key} value={key}>
              {AUDIENCE[key]}
            </option>
          ))}
        </SelectField>
        <SelectField label="Department" hint="Optional. Limit the announcement to one department." {...register('departmentId')}>
          <option value="">All departments</option>
          {(departments.data ?? []).map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </SelectField>
        <TextField label="Hide after" type="date" hint="Optional. Leave empty to keep it visible." error={errors.expiresAt?.message} {...register('expiresAt')} />
        {!existing && <CheckboxField label="Also send a notification to the audience" className="self-end pb-2" {...register('notify')} />}
        {errors.root?.message && (
          <InlineAlert tone="danger" className="sm:col-span-2">
            {errors.root.message}
          </InlineAlert>
        )}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}

function Reminders() {
  const send = useApiMutation({ mutationFn: () => runReminders(), invalidate: [keys.notificationsAll] });
  const result = send.data;
  return (
    <Card title="Reminders" description="The platform sends deadline, stalled-learner and skill-gap reminders automatically each day. You can also run them now; a reminder is never sent twice for the same reason.">
      <Button variant="secondary" loading={send.isPending} onClick={() => send.mutate()} leftIcon={<BellRing size={16} />}>
        Send reminders now
      </Button>
      {result && (
        <p className="mt-4 text-sm text-slate-600" role="status">
          Sent <strong className="text-navy">{result.deadlineReminders}</strong> deadline reminder{result.deadlineReminders === 1 ? '' : 's'}, <strong className="text-navy">{result.trainingReminders}</strong> stalled-learner reminder
          {result.trainingReminders === 1 ? '' : 's'} and <strong className="text-navy">{result.gapNudges}</strong> skill-gap nudge{result.gapNudges === 1 ? '' : 's'}.
        </p>
      )}
    </Card>
  );
}

export default function AnnouncementsAdminPage() {
  usePageTitle('Announcements');
  const confirm = useConfirm();
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<AdminAnnouncement | null | 'new'>(null);
  const query = useQuery({ queryKey: keys.announcementsAdmin(page), queryFn: () => fetchAdminAnnouncements(page), placeholderData: keepPreviousData });
  const remove = useApiMutation({ mutationFn: (id: string) => deleteAnnouncement(id), successMessage: 'Announcement deleted', invalidate: [keys.announcements, keys.announcementsAdminAll] });

  return (
    <div className="animate-fade-in">
      <PageHeader
        eyebrow="Administration"
        title="Announcements"
        description="Publish official messages to everyone, to one role, or to one department. Recipients see them on their announcements page and (optionally) as notifications."
        actions={
          <Button onClick={() => setEditing('new')} leftIcon={<Plus size={16} />}>
            New announcement
          </Button>
        }
      />
      <div className="mb-8">
        <Reminders />
      </div>

      {query.isLoading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data && query.data.items.length === 0 ? (
        <EmptyState title="No announcements yet" icon={<Megaphone size={18} />} action={<Button onClick={() => setEditing('new')}>Publish the first one</Button>} />
      ) : query.data ? (
        <div className="space-y-4">
          {query.data.items.map((announcement) => {
            const expired = announcement.expiresAt !== null && new Date(announcement.expiresAt) < new Date();
            return (
              <Card key={announcement.id}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="neutral">{AUDIENCE[announcement.audience]}</Badge>
                      {announcement.department && <Badge tone="info">{announcement.department}</Badge>}
                      {expired && <Badge tone="warning">Expired</Badge>}
                      <span className="text-xs text-slate-500">
                        {formatDate(announcement.publishedAt)} · {announcement.author}
                        {announcement.expiresAt ? ` · hides after ${formatDate(announcement.expiresAt)}` : ''}
                      </span>
                    </div>
                    <h2 className="mt-2 font-display text-lg font-bold text-navy">{announcement.title}</h2>
                    <p className="mt-1 whitespace-pre-line text-sm leading-6 text-slate-600">{announcement.body}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button type="button" aria-label={`Edit ${announcement.title}`} onClick={() => setEditing(announcement)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-navy">
                      <Pencil size={16} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${announcement.title}`}
                      onClick={async () => {
                        if (await confirm({ title: 'Delete this announcement?', message: 'It disappears for everyone. Notifications already sent stay in inboxes.', confirmLabel: 'Delete', tone: 'danger' })) remove.mutate(announcement.id);
                      }}
                      className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-500"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
          <Card padded={false}>
            <Pagination meta={query.data.meta} onPage={setPage} label="Announcement pages" />
          </Card>
        </div>
      ) : null}
      {editing && <AnnouncementDialog existing={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
