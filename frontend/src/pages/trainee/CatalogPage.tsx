import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { BookOpen, FilterX } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keys } from '../../api/keys';
import { CourseCard } from '../../components/domain/CourseCard';
import { PlainLanguageSearch } from '../../components/domain/PlainLanguageSearch';
import { Button, Card, EmptyState, ErrorState, PageHeader, Pagination, SearchInput, SelectField, Skeleton } from '../../components/ui';
import { useDebounce, usePageTitle } from '../../hooks/misc';
import { fetchCompetencies, fetchCourses, type CourseFilters } from '../../services/learner';
import { plural } from '../../utils/format';

const PAGE_SIZE = 9;

interface FilterState {
  q: string;
  category: string;
  difficulty: string;
  competencyId: string;
  completion: string;
  sort: string;
}

export default function CatalogPage() {
  usePageTitle('Course catalog');
  const [params] = useSearchParams();
  // Deep links (for example from a skill gap) can pre-select a competency or a search term.
  const [filters, setFilters] = useState<FilterState>({
    q: params.get('q') ?? '',
    category: '',
    difficulty: '',
    competencyId: params.get('competencyId') ?? '',
    completion: '',
    sort: 'newest',
  });
  const [page, setPage] = useState(1);
  const debouncedQuery = useDebounce(filters.q, 350);

  const update = (patch: Partial<FilterState>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(1);
  };
  const clear = () => {
    setFilters({ q: '', category: '', difficulty: '', competencyId: '', completion: '', sort: 'newest' });
    setPage(1);
  };

  const request: CourseFilters = {
    q: debouncedQuery || undefined,
    category: filters.category || undefined,
    difficulty: filters.difficulty || undefined,
    competencyId: filters.competencyId || undefined,
    completion: filters.completion || undefined,
    sort: filters.sort,
    page,
    pageSize: PAGE_SIZE,
  };
  const courses = useQuery({ queryKey: keys.courses(request), queryFn: () => fetchCourses(request), placeholderData: keepPreviousData });
  const competencies = useQuery({ queryKey: keys.competencies({ catalog: true }), queryFn: () => fetchCompetencies({ pageSize: 100 }), staleTime: 5 * 60_000 });

  const hasFilters = Boolean(filters.q || filters.category || filters.difficulty || filters.competencyId || filters.completion);
  const categories = courses.data?.meta.categories ?? [];

  return (
    <div className="animate-fade-in">
      <PageHeader eyebrow="Trainee workspace" title="Course catalog" description="Published courses mapped to the IMD competency framework. Filter by competency to find training that closes a specific skill gap." />

      <PlainLanguageSearch />

      <Card className="mb-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
          <SearchInput className="md:col-span-2" label="Search courses" placeholder="Search by title or description" value={filters.q} onChange={(q) => update({ q })} />
          <SelectField label="Competency" wrapperClassName="xl:col-span-1" value={filters.competencyId} onChange={(event) => update({ competencyId: event.target.value })}>
            <option value="">All competencies</option>
            {(competencies.data?.items ?? []).map((competency) => (
              <option key={competency.id} value={competency.id}>
                {competency.name}
              </option>
            ))}
          </SelectField>
          <SelectField label="Category" value={filters.category} onChange={(event) => update({ category: event.target.value })}>
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </SelectField>
          <SelectField label="Level" value={filters.difficulty} onChange={(event) => update({ difficulty: event.target.value })}>
            <option value="">All levels</option>
            <option value="BEGINNER">Beginner</option>
            <option value="INTERMEDIATE">Intermediate</option>
            <option value="ADVANCED">Advanced</option>
          </SelectField>
          <SelectField label="My progress" value={filters.completion} onChange={(event) => update({ completion: event.target.value })}>
            <option value="">Any</option>
            <option value="NOT_ENROLLED">Not enrolled</option>
            <option value="IN_PROGRESS">In progress</option>
            <option value="ASSESSMENT_PENDING">Assessment pending</option>
            <option value="COMPLETED">Completed</option>
          </SelectField>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-500" aria-live="polite">
            {courses.data ? plural(courses.data.meta.total, 'course') : 'Loading courses…'}
            {courses.isFetching && courses.data ? ' · updating' : ''}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <SelectField label="Sort by" wrapperClassName="w-44" value={filters.sort} onChange={(event) => update({ sort: event.target.value })}>
              <option value="newest">Newest</option>
              <option value="popular">Most popular</option>
              <option value="title">Title (A-Z)</option>
              <option value="duration">Shortest first</option>
            </SelectField>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clear} leftIcon={<FilterX size={14} />}>
                Clear filters
              </Button>
            )}
          </div>
        </div>
      </Card>

      {courses.isLoading ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3" role="status" aria-label="Loading courses">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-80 rounded-2xl" />
          ))}
        </div>
      ) : courses.isError ? (
        <ErrorState error={courses.error} onRetry={() => void courses.refetch()} />
      ) : courses.data && courses.data.items.length === 0 ? (
        <EmptyState
          title="No courses match"
          description={hasFilters ? 'Try removing a filter or searching for a different term.' : 'No courses have been published yet.'}
          icon={<BookOpen size={18} />}
          action={hasFilters ? <Button variant="secondary" onClick={clear}>Clear filters</Button> : undefined}
        />
      ) : courses.data ? (
        <>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {courses.data.items.map((course) => (
              <CourseCard key={course.id} course={course} role="TRAINEE" />
            ))}
          </div>
          <Card padded={false} className="mt-6">
            <Pagination meta={courses.data.meta} onPage={setPage} label="Course pages" />
          </Card>
        </>
      ) : null}
    </div>
  );
}
