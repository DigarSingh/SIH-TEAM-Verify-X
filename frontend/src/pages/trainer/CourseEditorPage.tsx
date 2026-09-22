import { useQuery } from '@tanstack/react-query';
import { Archive, ArrowLeft, CheckCircle2, Circle, Eye, Rocket, Trash2, Undo2 } from 'lucide-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { keys } from '../../api/keys';
import { CourseStatusBadge, DifficultyBadge } from '../../components/domain/badges';
import { QueryBoundary } from '../../components/domain/QueryBoundary';
import { Button, ButtonLink, Card, InlineAlert, TabPanel, Tabs, useConfirm, useToast } from '../../components/ui';
import { useApiMutation, usePageTitle } from '../../hooks/misc';
import { useCurrentUser } from '../../hooks/useAuth';
import { fetchCourse } from '../../services/learner';
import { changeCourseStatus, deleteCourse } from '../../services/trainer';
import type { CourseDetail, CourseStatus } from '../../types';
import { plural } from '../../utils/format';
import { AnalyticsTab } from './course-editor/AnalyticsTab';
import { AssessmentTab } from './course-editor/AssessmentTab';
import { CompetenciesTab } from './course-editor/CompetenciesTab';
import { ContentTab } from './course-editor/ContentTab';
import { DetailsTab } from './course-editor/DetailsTab';
import { TraineesTab } from './course-editor/TraineesTab';

type TabId = 'details' | 'content' | 'competencies' | 'assessment' | 'trainees' | 'analytics';
const TAB_IDS: TabId[] = ['details', 'content', 'competencies', 'assessment', 'trainees', 'analytics'];

function Readiness({ course }: { course: CourseDetail }) {
  const items = [
    { ok: course.moduleCount > 0, label: 'At least one module', required: true },
    { ok: course.modules.some((module) => module.materials.length > 0), label: 'Learning materials in the modules', required: false },
    { ok: course.competencies.length > 0, label: 'Mapped to at least one competency', required: true },
    { ok: Boolean(course.assessment?.isPublished && course.assessment.questionCount > 0), label: 'A published assessment with questions', required: false },
  ];
  return (
    <Card className="mb-6" title="Before you publish" description="Required items block publishing. Recommended items are what make the course worth taking.">
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <li key={item.label} className="flex items-center gap-2.5 text-sm">
            {item.ok ? <CheckCircle2 size={18} className="shrink-0 text-emerald-500" aria-hidden /> : <Circle size={18} className="shrink-0 text-slate-300" aria-hidden />}
            <span className={item.ok ? 'text-slate-600' : 'font-semibold text-navy'}>
              {item.label}
              <span className="ml-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">{item.required ? 'Required' : 'Recommended'}</span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Editor({ course }: { course: CourseDetail }) {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab') as TabId | null;
  const tab: TabId = requested && TAB_IDS.includes(requested) ? requested : 'details';
  const base = user.role === 'ADMIN' ? '/admin' : '/trainer';

  const status = useApiMutation({
    mutationFn: (next: CourseStatus) => changeCourseStatus(course.id, next),
    invalidate: [keys.course(course.id), keys.coursesAll, keys.dashboardTrainer, keys.recommendations],
    onSuccess: ({ course: updated, warnings }) => {
      toast.success(updated.status === 'PUBLISHED' ? 'Course published. Relevant trainees have been notified.' : updated.status === 'ARCHIVED' ? 'Course archived' : 'Course moved back to draft');
      warnings.forEach((warning) => toast.warning(warning));
    },
  });
  const remove = useApiMutation({
    mutationFn: () => deleteCourse(course.id),
    successMessage: 'Course deleted',
    invalidate: [keys.coursesAll, keys.dashboardTrainer],
    onSuccess: () => navigate(`${base}/courses`, { replace: true }),
  });

  const transition = async (next: CourseStatus) => {
    const copy = {
      PUBLISHED: { title: 'Publish this course?', message: 'Learners will be able to find and enrol in it, and trainees whose skill gaps it addresses will be notified.', label: 'Publish' },
      DRAFT: { title: 'Move the course back to draft?', message: 'It disappears from the catalog. Learners who already enrolled keep their access and progress.', label: 'Move to draft' },
      ARCHIVED: { title: 'Archive this course?', message: 'It disappears from the catalog and can no longer be enrolled in. Existing learners keep their access, progress and certificates.', label: 'Archive' },
    }[next];
    if (await confirm({ title: copy.title, message: copy.message, confirmLabel: copy.label, tone: next === 'ARCHIVED' ? 'danger' : 'primary' })) status.mutate(next);
  };

  const onDelete = async () => {
    if (await confirm({ title: 'Delete this course?', message: 'This removes the course permanently. It is only possible when nobody has enrolled; otherwise archive it instead.', confirmLabel: 'Delete course', tone: 'danger' })) remove.mutate();
  };

  if (!course.canManage) {
    return (
      <div className="animate-fade-in">
        <PageBack base={base} />
        <h1 className="font-display text-3xl font-bold text-navy">{course.title}</h1>
        <InlineAlert tone="info" className="mt-4 max-w-xl">
          This course belongs to {course.trainer.name}. You can preview it as a learner, but only its trainer or an administrator can edit it.
        </InlineAlert>
        <ButtonLink to={`${base}/preview/${course.id}`} className="mt-4" leftIcon={<Eye size={16} />}>
          Preview the course
        </ButtonLink>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <PageBack base={base} />
      <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <CourseStatusBadge status={course.status} />
            <DifficultyBadge difficulty={course.difficulty} />
            <span className="text-xs text-slate-500">
              {plural(course.moduleCount, 'module')} · {plural(course.enrolledCount, 'learner')} enrolled · trainer {course.trainer.name}
            </span>
          </div>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-navy">{course.title}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ButtonLink to={`${base}/preview/${course.id}`} variant="secondary" leftIcon={<Eye size={16} />}>
            Preview
          </ButtonLink>
          {course.status === 'DRAFT' && (
            <Button loading={status.isPending} onClick={() => void transition('PUBLISHED')} leftIcon={<Rocket size={16} />}>
              Publish
            </Button>
          )}
          {course.status === 'PUBLISHED' && (
            <Button variant="secondary" loading={status.isPending} onClick={() => void transition('DRAFT')} leftIcon={<Undo2 size={16} />}>
              Unpublish
            </Button>
          )}
          {course.status === 'ARCHIVED' && (
            <Button variant="secondary" loading={status.isPending} onClick={() => void transition('DRAFT')} leftIcon={<Undo2 size={16} />}>
              Restore as draft
            </Button>
          )}
          {course.status !== 'ARCHIVED' && (
            <Button variant="ghost" onClick={() => void transition('ARCHIVED')} leftIcon={<Archive size={16} />}>
              Archive
            </Button>
          )}
          <Button variant="danger" loading={remove.isPending} disabled={course.enrolledCount > 0} title={course.enrolledCount > 0 ? 'Courses with enrolled learners can only be archived' : undefined} onClick={() => void onDelete()} leftIcon={<Trash2 size={16} />}>
            Delete
          </Button>
        </div>
      </div>

      {course.status === 'DRAFT' && <Readiness course={course} />}

      <Tabs
        label="Course sections"
        value={tab}
        onChange={(id) => setParams({ tab: id }, { replace: true })}
        items={[
          { id: 'details', label: 'Details' },
          { id: 'content', label: 'Content', count: course.moduleCount },
          { id: 'competencies', label: 'Competencies', count: course.competencies.length },
          { id: 'assessment', label: 'Assessment' },
          { id: 'trainees', label: 'Learners', count: course.enrolledCount },
          { id: 'analytics', label: 'Analytics' },
        ]}
      />
      <TabPanel key={tab} id={tab} active>
        {tab === 'details' && <DetailsTab key={course.updatedAt} course={course} />}
        {tab === 'content' && <ContentTab courseId={course.id} />}
        {tab === 'competencies' && <CompetenciesTab key={course.updatedAt} course={course} />}
        {tab === 'assessment' && <AssessmentTab course={course} />}
        {tab === 'trainees' && <TraineesTab courseId={course.id} />}
        {tab === 'analytics' && <AnalyticsTab courseId={course.id} />}
      </TabPanel>
    </div>
  );
}

function PageBack({ base }: { base: string }) {
  return (
    <Link to={`${base}/courses`} className="mb-4 inline-flex items-center gap-1.5 text-xs font-bold text-sky-deep hover:text-navy">
      <ArrowLeft size={13} aria-hidden /> {base === '/admin' ? 'All courses' : 'My courses'}
    </Link>
  );
}

export default function CourseEditorPage() {
  const { courseId = '' } = useParams();
  const query = useQuery({ queryKey: keys.course(courseId), queryFn: () => fetchCourse(courseId), enabled: Boolean(courseId) });
  usePageTitle(query.data?.title ?? 'Course');
  return <QueryBoundary query={query}>{(course) => <Editor course={course} />}</QueryBoundary>;
}
