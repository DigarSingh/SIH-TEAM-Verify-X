import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { BookOpen, Plus } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keys } from '../../api/keys';
import { CourseCard } from '../../components/domain/CourseCard';
import { CourseFormDialog } from '../../components/domain/CourseFormDialog';
import { Button, Card, EmptyState, ErrorState, PageHeader, Pagination, SearchInput, SelectField, Skeleton } from '../../components/ui';
import { useDebounce, usePageTitle } from '../../hooks/misc';
import { useCurrentUser } from '../../hooks/useAuth';
import { fetchMyCourses } from '../../services/trainer';
import type { CourseStatus } from '../../types';
import { plural } from '../../utils/format';

/** The courses the signed-in trainer owns (an administrator sees every course here). */
export default function TrainerCoursesPage() {
  usePageTitle('My courses');
  const user = useCurrentUser();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<CourseStatus | ''>('');
  const [page, setPage] = useState(1);
  const creating = params.get('new') === '1';
  const debounced = useDebounce(search, 350);

  const request = { q: debounced, status, page, pageSize: 9 };
  const query = useQuery({ queryKey: keys.courses({ mine: true, ...request }), queryFn: () => fetchMyCourses(request), placeholderData: keepPreviousData });
  const closeDialog = () => setParams({}, { replace: true });

  return (
    <div className="animate-fade-in">
      <PageHeader
        eyebrow="Trainer workspace"
        title="My courses"
        description="Create courses, add content, map them to competencies and publish when they are ready."
        actions={
          <Button onClick={() => setParams({ new: '1' }, { replace: true })} leftIcon={<Plus size={16} />}>
            New course
          </Button>
        }
      />

      <Card className="mb-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <SearchInput className="md:col-span-2" label="Search my courses" placeholder="Search by title or description" value={search} onChange={(value) => { setSearch(value); setPage(1); }} />
          <SelectField label="Status" value={status} onChange={(event) => { setStatus(event.target.value as CourseStatus | ''); setPage(1); }}>
            <option value="">All statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="PUBLISHED">Published</option>
            <option value="ARCHIVED">Archived</option>
          </SelectField>
        </div>
        <p className="mt-3 text-sm text-slate-500" aria-live="polite">
          {query.data ? plural(query.data.meta.total, 'course') : 'Loading courses…'}
        </p>
      </Card>

      {query.isLoading ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3" role="status" aria-label="Loading courses">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-80 rounded-2xl" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data && query.data.items.length === 0 ? (
        <EmptyState
          title={debounced || status ? 'No courses match' : 'You have not created a course yet'}
          description={debounced || status ? 'Try a different search or status.' : 'A course groups modules, learning materials and an assessment, and is mapped to competencies.'}
          icon={<BookOpen size={18} />}
          action={
            <Button onClick={() => setParams({ new: '1' }, { replace: true })} leftIcon={<Plus size={16} />}>
              Create a course
            </Button>
          }
        />
      ) : query.data ? (
        <>
          <h2 className="sr-only">Your courses</h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {query.data.items.map((course) => (
              <CourseCard key={course.id} course={course} role={user.role} showStatus />
            ))}
          </div>
          <Card padded={false} className="mt-6">
            <Pagination meta={query.data.meta} onPage={setPage} label="Course pages" />
          </Card>
        </>
      ) : null}

      {creating && <CourseFormDialog categories={query.data?.meta.categories ?? []} onClose={closeDialog} />}
    </div>
  );
}
