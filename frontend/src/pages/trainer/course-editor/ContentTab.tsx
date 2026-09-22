import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, type QueryKey } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, FileText, Link2, Pencil, Plus, PlayCircle, Trash2, TextQuote } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { errorMessage } from '../../../api/client';
import { keys } from '../../../api/keys';
import { QueryBoundary } from '../../../components/domain/QueryBoundary';
import { Badge, Button, Card, EmptyState, InlineAlert, Modal, SelectField, TextAreaField, TextField, useConfirm } from '../../../components/ui';
import { useApiMutation } from '../../../hooks/misc';
import { fetchRegistrationOptions } from '../../../services/meta';
import { addMaterial, createModule, deleteMaterial, deleteModule, fetchCourseContent, reorderModules, updateMaterial, updateModule } from '../../../services/trainer';
import type { LearningMaterial, LearnContent, MaterialType } from '../../../types';
import { applyServerErrors } from '../../../utils/forms';
import { formatDuration, formatFileSize, plural } from '../../../utils/format';

type ModuleItem = LearnContent['modules'][number];

const ICON: Record<MaterialType, typeof FileText> = { VIDEO: PlayCircle, DOCUMENT: FileText, LINK: Link2, TEXT: TextQuote };
const TYPE_LABEL: Record<MaterialType, string> = { TEXT: 'Text reading', LINK: 'Link to a web page', VIDEO: 'Video', DOCUMENT: 'Document (PDF, Office, text)' };
const DOCUMENT_ACCEPT = '.pdf,.docx,.pptx,.xlsx,.txt,.md,.csv';
const VIDEO_ACCEPT = '.mp4,.webm';

// ---------------------------------------------------------------------------------------------
// Module dialog
// ---------------------------------------------------------------------------------------------

const moduleSchema = z.object({
  title: z.string().trim().min(2, 'Enter a module title').max(150),
  description: z.string().trim().max(1000, 'At most 1000 characters'),
  durationMinutes: z.string().trim().refine((value) => value === '' || (/^\d+$/.test(value) && Number(value) <= 6000), 'Enter whole minutes (up to 6000)'),
});
type ModuleValues = z.infer<typeof moduleSchema>;

function ModuleDialog({ courseId, existing, onClose, refresh }: { courseId: string; existing: ModuleItem | null; onClose: () => void; refresh: QueryKey[] }) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ModuleValues>({ resolver: zodResolver(moduleSchema), defaultValues: { title: existing?.title ?? '', description: existing?.description ?? '', durationMinutes: existing ? String(existing.durationMinutes) : '' } });
  const save = useApiMutation({
    mutationFn: (values: ModuleValues) => {
      const input = { title: values.title, description: values.description || null, ...(values.durationMinutes ? { durationMinutes: Number(values.durationMinutes) } : {}) };
      return existing ? updateModule(courseId, existing.id, input) : createModule(courseId, input);
    },
    successMessage: existing ? 'Module updated' : 'Module added',
    invalidate: refresh,
    onSuccess: onClose,
    onError: (error) => {
      if (!applyServerErrors(error, setError, ['title', 'description', 'durationMinutes'])) setError('root', { message: errorMessage(error) });
    },
  });
  const submit = handleSubmit((values) => save.mutate(values));
  return (
    <Modal
      open
      onClose={onClose}
      title={existing ? 'Edit module' : 'Add a module'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.isPending} onClick={() => void submit()}>
            Save
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        <TextField label="Module title" required error={errors.title?.message} {...register('title')} />
        <TextAreaField label="Description" rows={3} error={errors.description?.message} {...register('description')} />
        <TextField label="Duration (minutes)" inputMode="numeric" error={errors.durationMinutes?.message} {...register('durationMinutes')} />
        {errors.root?.message && <InlineAlert tone="danger">{errors.root.message}</InlineAlert>}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------
// Material dialog
// ---------------------------------------------------------------------------------------------

const httpUrl = z
  .string()
  .trim()
  .url('Enter a valid link, for example https://example.gov.in/guide')
  .refine((value) => /^https?:\/\//i.test(value), 'Only http(s) links are allowed');

const materialSchema = z.object({
  type: z.enum(['TEXT', 'LINK', 'VIDEO', 'DOCUMENT']),
  title: z.string().trim().min(2, 'Enter a title').max(150),
  url: z.string().trim(),
  content: z.string(),
});
type MaterialValues = z.infer<typeof materialSchema>;

function MaterialDialog({ courseId, module, existing, onClose, refresh }: { courseId: string; module: ModuleItem; existing: LearningMaterial | null; onClose: () => void; refresh: QueryKey[] }) {
  const options = useQuery({ queryKey: keys.options, queryFn: fetchRegistrationOptions, staleTime: 5 * 60_000 });
  const maxMb = options.data?.uploads?.maxMb ?? 25;
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const editing = existing !== null;
  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors },
  } = useForm<MaterialValues>({ resolver: zodResolver(materialSchema), defaultValues: { type: existing?.type ?? 'TEXT', title: existing?.title ?? '', url: existing?.url ?? '', content: existing?.content ?? '' } });
  const type = watch('type');
  const hasUploadedFile = Boolean(existing?.downloadUrl);
  const takesFile = (type === 'DOCUMENT' || type === 'VIDEO') && !editing;

  const save = useApiMutation({
    mutationFn: (values: MaterialValues) => {
      if (existing) {
        return updateMaterial(courseId, module.id, existing.id, {
          title: values.title,
          ...(existing.type === 'TEXT' ? { content: values.content } : {}),
          ...((existing.type === 'LINK' || existing.type === 'VIDEO') && !hasUploadedFile ? { url: values.url } : {}),
        });
      }
      return addMaterial(courseId, module.id, { title: values.title, type: values.type, ...(values.url ? { url: values.url } : {}), ...(values.content ? { content: values.content } : {}), file });
    },
    successMessage: existing ? 'Material updated' : 'Material added',
    invalidate: refresh,
    onSuccess: onClose,
    onError: (error) => {
      if (!applyServerErrors(error, setError, ['title', 'url', 'content'])) setError('root', { message: errorMessage(error) });
    },
  });

  const submit = handleSubmit((values) => {
    // Cross-field rules depend on the material type (the server enforces the same rules).
    if (values.type === 'TEXT' && !values.content.trim()) return setError('content', { message: 'Write the text learners will read' });
    if (values.type === 'LINK' && !httpUrl.safeParse(values.url).success) return setError('url', { message: 'Enter a valid http(s) link' });
    if (!editing && values.type === 'DOCUMENT' && !file) return setFileError('Choose the document to upload');
    if (!editing && values.type === 'VIDEO' && !file && !httpUrl.safeParse(values.url).success) return setFileError('Upload a video file or paste a link to it');
    if (editing && (existing.type === 'VIDEO' && !hasUploadedFile) && !httpUrl.safeParse(values.url).success) return setError('url', { message: 'Enter a valid http(s) link' });
    setFileError(null);
    save.mutate(values);
  });

  const pick = (selected: File | undefined) => {
    setFileError(null);
    if (!selected) return setFile(null);
    if (selected.size > maxMb * 1024 * 1024) {
      setFile(null);
      return setFileError(`This file is ${formatFileSize(selected.size)}. The limit is ${maxMb} MB.`);
    }
    setFile(selected);
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={editing ? 'Edit learning material' : `Add material to “${module.title}”`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.isPending} onClick={() => void submit()}>
            {editing ? 'Save' : 'Add material'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        <SelectField label="Type" disabled={editing} {...register('type')}>
          {(Object.keys(TYPE_LABEL) as MaterialType[]).map((key) => (
            <option key={key} value={key}>
              {TYPE_LABEL[key]}
            </option>
          ))}
        </SelectField>
        <TextField label="Title" required error={errors.title?.message} {...register('title')} />

        {type === 'TEXT' && <TextAreaField label="Text" rows={10} required hint="Plain text. Leave a blank line between paragraphs." error={errors.content?.message} {...register('content')} />}

        {(type === 'LINK' || (type === 'VIDEO' && !hasUploadedFile)) && (
          <TextField label={type === 'VIDEO' ? 'Video link (optional when uploading a file)' : 'Link'} type="url" placeholder="https://" error={errors.url?.message} {...register('url')} />
        )}

        {takesFile && (
          <div>
            <label htmlFor="material-file" className="mb-1.5 block text-xs font-bold text-slate-600">
              {type === 'VIDEO' ? 'Video file (MP4 or WebM)' : 'Document file'}
              {type === 'DOCUMENT' && <span className="ml-0.5 text-orange-700">*</span>}
            </label>
            <input
              id="material-file"
              type="file"
              accept={type === 'VIDEO' ? VIDEO_ACCEPT : DOCUMENT_ACCEPT}
              onChange={(event) => pick(event.target.files?.[0])}
              className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-xl file:border-0 file:bg-mist file:px-4 file:py-2.5 file:text-sm file:font-semibold file:text-sky-deep hover:file:bg-sky/10"
            />
            <p className="mt-1.5 text-xs text-slate-500">
              {type === 'DOCUMENT' ? 'PDF, Word, PowerPoint, Excel, text, Markdown or CSV' : 'MP4 or WebM'} up to {maxMb} MB. Files are checked by their content, not just their name.
            </p>
            {file && <p className="mt-1 text-xs font-semibold text-emerald-700">Selected: {file.name} ({formatFileSize(file.size)})</p>}
            {fileError && (
              <p role="alert" className="mt-1.5 text-xs font-semibold text-red-600">
                {fileError}
              </p>
            )}
          </div>
        )}
        {editing && hasUploadedFile && <p className="text-xs text-slate-500">The uploaded file cannot be replaced. Delete this material and add it again to change the file.</p>}
        {errors.root?.message && <InlineAlert tone="danger">{errors.root.message}</InlineAlert>}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------
// The editor
// ---------------------------------------------------------------------------------------------

type DialogState = { kind: 'module'; module: ModuleItem | null } | { kind: 'material'; module: ModuleItem; material: LearningMaterial | null } | null;

function Editor({ courseId, content }: { courseId: string; content: LearnContent }) {
  const confirm = useConfirm();
  const [dialog, setDialog] = useState<DialogState>(null);
  const refresh = [keys.learn(courseId), keys.course(courseId), keys.coursesAll];
  const modules = content.modules;

  const move = useApiMutation({ mutationFn: (ids: string[]) => reorderModules(courseId, ids), invalidate: refresh });
  const removeModule = useApiMutation({ mutationFn: (moduleId: string) => deleteModule(courseId, moduleId), successMessage: 'Module deleted', invalidate: refresh });
  const removeMaterial = useApiMutation({ mutationFn: (input: { moduleId: string; materialId: string }) => deleteMaterial(courseId, input.moduleId, input.materialId), successMessage: 'Material deleted', invalidate: refresh });

  const swap = (index: number, direction: -1 | 1) => {
    const ids = modules.map((module) => module.id);
    const target = index + direction;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target] as string, ids[index] as string];
    move.mutate(ids);
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {plural(modules.length, 'module')} · {plural(modules.reduce((sum, module) => sum + module.materials.length, 0), 'learning material')}
        </p>
        <Button onClick={() => setDialog({ kind: 'module', module: null })} leftIcon={<Plus size={16} />}>
          Add module
        </Button>
      </div>

      {modules.length === 0 ? (
        <EmptyState title="No modules yet" description="A module groups related learning materials. Learners complete modules in order, and the assessment unlocks when all are done." action={<Button onClick={() => setDialog({ kind: 'module', module: null })}>Add the first module</Button>} />
      ) : (
        <ol className="space-y-4">
          {modules.map((module, index) => (
            <li key={module.id}>
              <Card padded={false}>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-mist text-sm font-bold text-sky-deep">{index + 1}</span>
                    <div className="min-w-0">
                      <h3 className="font-display text-base font-bold text-navy">{module.title}</h3>
                      <p className="text-xs text-slate-500">{module.durationMinutes > 0 ? formatDuration(module.durationMinutes) : 'No duration set'}</p>
                      {module.description && <p className="mt-1 text-sm text-slate-500">{module.description}</p>}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1" role="group" aria-label={`Actions for module ${module.title}`}>
                    <button type="button" aria-label="Move module up" disabled={index === 0 || move.isPending} onClick={() => swap(index, -1)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-navy disabled:opacity-30">
                      <ArrowUp size={16} />
                    </button>
                    <button type="button" aria-label="Move module down" disabled={index === modules.length - 1 || move.isPending} onClick={() => swap(index, 1)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-navy disabled:opacity-30">
                      <ArrowDown size={16} />
                    </button>
                    <button type="button" aria-label="Edit module" onClick={() => setDialog({ kind: 'module', module })} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-navy">
                      <Pencil size={16} />
                    </button>
                    <button
                      type="button"
                      aria-label="Delete module"
                      onClick={async () => {
                        if (await confirm({ title: 'Delete this module?', message: `“${module.title}” and its ${plural(module.materials.length, 'learning material')} will be deleted. Learners' completion of this module is removed too.`, confirmLabel: 'Delete module', tone: 'danger' })) removeModule.mutate(module.id);
                      }}
                      className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-500"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <div className="px-5 py-4">
                  {module.materials.length === 0 ? (
                    <p className="text-sm text-slate-500">No learning materials in this module yet.</p>
                  ) : (
                    <ul className="space-y-2">
                      {module.materials.map((material) => {
                        const Icon = ICON[material.type];
                        return (
                          <li key={material.id} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3.5 py-2.5">
                            <Icon size={16} className="shrink-0 text-sky-deep" aria-hidden />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-navy">{material.title}</p>
                              <p className="truncate text-xs text-slate-500">
                                {TYPE_LABEL[material.type]}
                                {material.fileName ? ` · ${material.fileName}` : ''}
                                {material.sizeBytes ? ` · ${formatFileSize(material.sizeBytes)}` : ''}
                                {!material.fileName && material.url ? ` · ${material.url}` : ''}
                              </p>
                            </div>
                            <button type="button" aria-label={`Edit ${material.title}`} onClick={() => setDialog({ kind: 'material', module, material })} className="rounded-lg p-2 text-slate-500 hover:bg-white hover:text-navy">
                              <Pencil size={15} />
                            </button>
                            <button
                              type="button"
                              aria-label={`Delete ${material.title}`}
                              onClick={async () => {
                                if (await confirm({ title: 'Delete this material?', message: `“${material.title}” will be removed from the module.`, confirmLabel: 'Delete', tone: 'danger' })) removeMaterial.mutate({ moduleId: module.id, materialId: material.id });
                              }}
                              className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-500"
                            >
                              <Trash2 size={15} />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <Button size="sm" variant="secondary" className="mt-3" onClick={() => setDialog({ kind: 'material', module, material: null })} leftIcon={<Plus size={14} />}>
                    Add material
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ol>
      )}

      {dialog?.kind === 'module' && <ModuleDialog courseId={courseId} existing={dialog.module} refresh={refresh} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'material' && <MaterialDialog courseId={courseId} module={dialog.module} existing={dialog.material} refresh={refresh} onClose={() => setDialog(null)} />}
      <p className="mt-6 text-xs text-slate-500">
        <Badge tone="neutral">Tip</Badge> Preview the course to see exactly what learners see.
      </p>
    </div>
  );
}

export function ContentTab({ courseId }: { courseId: string }) {
  const query = useQuery({ queryKey: keys.learn(courseId), queryFn: () => fetchCourseContent(courseId) });
  return <QueryBoundary query={query}>{(content) => <Editor courseId={courseId} content={content} />}</QueryBoundary>;
}
