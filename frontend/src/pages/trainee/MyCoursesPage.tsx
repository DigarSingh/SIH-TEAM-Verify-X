import { useQuery } from '@tanstack/react-query';
import { BookOpen, Clock, LogOut } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keys } from '../../api/keys';
import { CertificateActions } from '../../components/domain/CertificateActions';
import { AssessmentStateBadge, DifficultyBadge, EnrollmentStatusBadge } from '../../components/domain/badges';
import { CourseCover } from '../../components/domain/CourseCard';
import { QueryBoundary } from '../../components/domain/QueryBoundary';
import { Button, ButtonLink, EmptyState, PageHeader, ProgressBar, TabPanel, Tabs, useConfirm } from '../../components/ui';
import { LEARNING_KEYS } from '../../hooks/learning';
import { useApiMutation, usePageTitle } from '../../hooks/misc';
import { fetchMyEnrollments, withdrawFromCourse } from '../../services/learner';
import type { Enrollment } from '../../types';
import { formatDuration, timeAgo } from '../../utils/format';

type Tab = 'active' | 'completed';
const ACTIVE = new Set(['ENROLLED', 'IN_PROGRESS', 'ASSESSMENT_PENDING']);

function EnrollmentRow({ enrollment }: { enrollment: Enrollment }) {
  const confirm = useConfirm();
  const { course } = enrollment;
  const finished = enrollment.status === 'COMPLETED' || enrollment.status === 'CERTIFIED';
  const withdraw = useApiMutation({ mutationFn: () => withdrawFromCourse(enrollment.id), successMessage: 'You have withdrawn from the course', invalidate: [...LEARNING_KEYS] });

  const onWithdraw = async () => {
    const yes = await confirm({
      title: 'Withdraw from this course?',
      message: `You will lose access to “${course.title}”. Your recorded results and competency levels are kept, and you can enroll again later.`,
      confirmLabel: 'Withdraw',
      tone: 'danger',
    });
    if (yes) withdraw.mutate();
  };

  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-card sm:flex-row" aria-label={course.title}>
      <div className="h-32 shrink-0 sm:h-auto sm:w-48">
        <CourseCover course={{ ...course, thumbnailUrl: course.thumbnailUrl }} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-4 p-5 lg:flex-row lg:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <DifficultyBadge difficulty={course.difficulty} />
            <EnrollmentStatusBadge status={enrollment.status} />
            {enrollment.assessment && enrollment.status !== 'CERTIFIED' && <AssessmentStateBadge state={enrollment.assessment.state} />}
          </div>
          <h3 className="mt-2 font-display text-lg font-bold text-navy">
            <Link to={`/trainee/learn/${course.id}`} className="hover:text-sky-deep">
              {course.title}
            </Link>
          </h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
            <span>{course.trainer.name}</span>
            <span className="flex items-center gap-1">
              <Clock size={12} aria-hidden /> {formatDuration(course.durationMinutes)}
            </span>
            <span>
              {enrollment.modulesCompleted} of {enrollment.modulesTotal} modules
            </span>
            <span>{enrollment.lastAccessedAt ? `Last opened ${timeAgo(enrollment.lastAccessedAt)}` : 'Not opened yet'}</span>
          </p>
          <div className="mt-3 max-w-md">
            <ProgressBar value={enrollment.progress} showLabel label={`${course.title} progress`} color={finished ? 'green' : enrollment.status === 'ASSESSMENT_PENDING' ? 'amber' : 'sky'} />
          </div>
          {!finished && enrollment.nextModule && <p className="mt-2 text-xs text-slate-500">Up next: {enrollment.nextModule.title}</p>}
          {enrollment.assessment?.bestScore !== null && enrollment.assessment?.bestScore !== undefined && <p className="mt-1 text-xs text-slate-500">Best assessment score: {enrollment.assessment.bestScore}%</p>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 lg:flex-col lg:items-stretch">
          <ButtonLink to={`/trainee/learn/${course.id}`} size="sm">
            {finished ? 'Review course' : enrollment.status === 'ASSESSMENT_PENDING' ? 'Take assessment' : enrollment.progress === 0 ? 'Start' : 'Continue'}
          </ButtonLink>
          {enrollment.certificate && enrollment.certificate.status === 'VALID' && <CertificateActions certificate={enrollment.certificate} compact />}
          {!finished && (
            <Button variant="ghost" size="sm" loading={withdraw.isPending} onClick={() => void onWithdraw()} leftIcon={<LogOut size={14} />}>
              Withdraw
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}

function Content({ enrollments }: { enrollments: Enrollment[] }) {
  const [tab, setTab] = useState<Tab>('active');
  const active = enrollments.filter((enrollment) => ACTIVE.has(enrollment.status));
  const completed = enrollments.filter((enrollment) => enrollment.status === 'COMPLETED' || enrollment.status === 'CERTIFIED');
  const rows = tab === 'active' ? active : completed;

  return (
    <div className="animate-fade-in">
      <PageHeader
        eyebrow="Trainee workspace"
        title="My courses"
        description="Everything you are enrolled in, with your progress and what to do next."
        actions={
          <ButtonLink to="/trainee/courses" variant="secondary" leftIcon={<BookOpen size={16} />}>
            Browse the catalog
          </ButtonLink>
        }
      />
      <Tabs
        label="My courses"
        value={tab}
        onChange={setTab}
        items={[
          { id: 'active', label: 'In progress', count: active.length },
          { id: 'completed', label: 'Completed', count: completed.length },
        ]}
      />
      <TabPanel key={tab} id={tab} active>
        <h2 className="sr-only">{tab === 'active' ? 'Courses in progress' : 'Completed courses'}</h2>
        {rows.length === 0 ? (
          <EmptyState
            title={tab === 'active' ? 'You are not learning anything right now' : 'No completed courses yet'}
            description={tab === 'active' ? 'Enroll in a recommended course to start closing your skill gaps.' : 'Finish a course and pass its assessment to see it here.'}
            icon={<BookOpen size={18} />}
            action={tab === 'active' ? <ButtonLink to="/trainee/learning-path">See recommendations</ButtonLink> : undefined}
          />
        ) : (
          <div className="space-y-4">
            {rows.map((enrollment) => (
              <EnrollmentRow key={enrollment.id} enrollment={enrollment} />
            ))}
          </div>
        )}
      </TabPanel>
    </div>
  );
}

export default function MyCoursesPage() {
  usePageTitle('My courses');
  const query = useQuery({ queryKey: keys.myEnrollments(), queryFn: () => fetchMyEnrollments() });
  return <QueryBoundary query={query}>{(enrollments) => <Content enrollments={enrollments} />}</QueryBoundary>;
}
