import { useQuery } from '@tanstack/react-query';
import { UsersRound } from 'lucide-react';
import { useState } from 'react';
import { keys } from '../../api/keys';
import { EmptyState, ErrorState, PageHeader, SelectField, Skeleton } from '../../components/ui';
import { usePageTitle } from '../../hooks/misc';
import { fetchMyCourses } from '../../services/trainer';
import { TraineesTab } from './course-editor/TraineesTab';

/** Monitor the learners of one of your courses: progress, scores and competency change. */
export default function TrainerTraineesPage() {
  usePageTitle('Trainees');
  const [selected, setSelected] = useState('');
  const courses = useQuery({ queryKey: keys.courses({ mine: true, monitor: true }), queryFn: () => fetchMyCourses({ pageSize: 100 }) });

  if (courses.isLoading) return <Skeleton className="h-64 rounded-2xl" />;
  if (courses.isError) return <ErrorState error={courses.error} onRetry={() => void courses.refetch()} />;
  const items = (courses.data?.items ?? []).filter((course) => course.status !== 'DRAFT' || course.enrolledCount > 0);
  const courseId = selected || items.find((course) => course.enrolledCount > 0)?.id || items[0]?.id || '';

  return (
    <div className="animate-fade-in">
      <PageHeader eyebrow="Trainer workspace" title="Trainees" description="See who is learning, how far they have got, how they score and how their competencies have changed. Open a trainee for their full Competency Passport." />
      {items.length === 0 ? (
        <EmptyState title="No courses to monitor" description="Publish a course and learners will appear here as they enrol." icon={<UsersRound size={18} />} />
      ) : (
        <>
          <SelectField label="Course" wrapperClassName="mb-6 max-w-lg" value={courseId} onChange={(event) => setSelected(event.target.value)}>
            {items.map((course) => (
              <option key={course.id} value={course.id}>
                {course.title} ({course.enrolledCount} enrolled)
              </option>
            ))}
          </SelectField>
          {courseId && <TraineesTab key={courseId} courseId={courseId} />}
        </>
      )}
    </div>
  );
}
