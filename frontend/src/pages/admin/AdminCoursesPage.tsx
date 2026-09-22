import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { BookOpen, Plus, Star } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keys } from '../../api/keys';
import { CourseStatusBadge, DifficultyBadge } from '../../components/domain/badges';
import { CourseFormDialog } from '../../components/domain/CourseFormDialog';
import { Button, Card, DataTable, EmptyState, ErrorState, PageHeader, Pagination, SearchInput, SelectField, Skeleton, Td, Th } from '../../components/ui';
import { useDebounce, usePageTitle } from '../../hooks/misc';
import { fetchCourses } from '../../services/learner';
import type { CourseStatus } from '../../types';
import { formatDate, plural } from '../../utils/format';

/** Every course in the platform, whatever its status or trainer. */
export default function AdminCoursesPage() {
  usePageTitle('Courses');
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<CourseStatus | ''>('');
  const [page, setPage] = useState(1);
  const debounced = useDebounce(search, 350);
  const creating = params.get('new') === '1';

  const request = { q: debounced, status, page, pageSize: 15, sort: 'newest' };
  const query = useQuery({ queryKey: keys.courses({ admin: true, ...request }), queryFn: () => fetchCourses(request), placeholderData: keepPreviousData });

  return (
    <div className="animate-fade-in">
      <PageHeader
        eyebrow="Administration"
        title="Courses"
        description="Every course on the platform. Open a course to edit it, review its learners and analytics, or archive it."
        actions={
          <Button onClick={() => setParams({ new: '1' }, { replace: true })} leftIcon={<Plus size={16} />}>
            New course
          </Button>
        }
      />
      <Card className="mb-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <SearchInput className="md:col-span-2" label="Search courses" placeholder="Title, description or category" value={search} onChange={(value) => { setSearch(value); setPage(1); }} />
          <SelectField label="Status" value={status} onChange={(event) => { setStatus(event.target.value as CourseStatus | ''); setPage(1); }}>
            <option value="">All statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="PUBLISHED">Published</option>
            <option value="ARCHIVED">Archived</option>
          </SelectField>
        </div>
      </Card>

      {query.isLoading ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data && query.data.items.length === 0 ? (
        <EmptyState title="No courses match" icon={<BookOpen size={18} />} />
      ) : query.data ? (
        <Card padded={false}>
          <DataTable caption="Courses">
            <thead>
              <tr>
                <Th>Course</Th>
                <Th>Trainer</Th>
                <Th>Status</Th>
                <Th align="right">Learners</Th>
                <Th align="right">Rating</Th>
                <Th>Published</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {query.data.items.map((course) => (
                <tr key={course.id} className="hover:bg-slate-50/60">
                  <Td>
                    <Link to={`/admin/courses/${course.id}`} className="font-semibold text-navy hover:text-sky-deep">
                      {course.title}
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <DifficultyBadge difficulty={course.difficulty} />
                      <span className="text-xs text-slate-500">
                        {course.category} · {plural(course.moduleCount, 'module')}
                        {course.competencies.length === 0 ? ' · no competency' : ''}
                        {!course.hasAssessment ? ' · no assessment' : ''}
                      </span>
                    </div>
                  </Td>
                  <Td>{course.trainer.name}</Td>
                  <Td>
                    <CourseStatusBadge status={course.status} />
                  </Td>
                  <Td align="right">{course.enrolledCount}</Td>
                  <Td align="right">
                    {course.rating.count > 0 ? (
                      <span className="inline-flex items-center gap-1 font-bold text-navy">
                        <Star size={13} className="fill-amber-400 text-amber-400" aria-hidden /> {course.rating.average.toFixed(1)}
                      </span>
                    ) : (
                      <span className="text-slate-500">-</span>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap text-xs">{formatDate(course.publishedAt)}</Td>
                  <Td align="right">
                    <div className="flex justify-end gap-3 text-xs font-bold">
                      <Link to={`/admin/courses/${course.id}`} className="text-sky-deep hover:text-navy">
                        Manage
                      </Link>
                      <Link to={`/admin/preview/${course.id}`} className="text-slate-500 hover:text-navy">
                        Preview
                      </Link>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
          <Pagination meta={query.data.meta} onPage={setPage} label="Course pages" />
        </Card>
      ) : null}

      {creating && <CourseFormDialog categories={query.data?.meta.categories ?? []} onClose={() => setParams({}, { replace: true })} />}
    </div>
  );
}
