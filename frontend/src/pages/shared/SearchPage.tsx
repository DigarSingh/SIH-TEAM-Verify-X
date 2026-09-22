import { useQuery } from '@tanstack/react-query';
import { BookOpen, FileText, Library, Search, UsersRound } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keys } from '../../api/keys';
import { CourseStatusBadge, DifficultyBadge, RoleBadge } from '../../components/domain/badges';
import { QueryBoundary } from '../../components/domain/QueryBoundary';
import { Card, EmptyState, PageHeader, SearchInput } from '../../components/ui';
import { useCurrentUser } from '../../hooks/useAuth';
import { useDebounce, usePageTitle } from '../../hooks/misc';
import { searchEverything } from '../../services/notifications';
import type { SearchResults } from '../../types';
import { paths } from '../../utils/links';

function Group({ title, icon, count, children }: { title: string; icon: ReactNode; count: number; children: ReactNode }) {
  if (count === 0) return null;
  return (
    <section aria-label={title}>
      <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-bold text-navy">
        <span className="text-sky-deep" aria-hidden>
          {icon}
        </span>
        {title} <span className="text-sm font-semibold text-slate-500">({count})</span>
      </h2>
      <Card padded={false}>
        <ul className="divide-y divide-slate-100">{children}</ul>
      </Card>
    </section>
  );
}

function Results({ results }: { results: SearchResults }) {
  const user = useCurrentUser();
  const total = results.courses.length + results.competencies.length + results.materials.length + results.employees.length;
  if (total === 0) {
    return <EmptyState title={`No results for “${results.query}”`} description="Check the spelling or try a shorter, more general term." icon={<Search size={18} />} />;
  }
  return (
    <div className="space-y-8">
      <Group title="Courses" icon={<BookOpen size={18} />} count={results.courses.length}>
        {results.courses.map((course) => (
          <li key={course.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5">
            <div>
              <Link to={paths.course(user.role, course.id)} className="text-sm font-bold text-navy hover:text-sky-deep">
                {course.title}
              </Link>
              <p className="text-xs text-slate-500">{course.category}</p>
            </div>
            <div className="flex items-center gap-1.5">
              <DifficultyBadge difficulty={course.difficulty} />
              {user.role !== 'TRAINEE' && <CourseStatusBadge status={course.status} />}
            </div>
          </li>
        ))}
      </Group>

      <Group title="Competencies" icon={<Library size={18} />} count={results.competencies.length}>
        {results.competencies.map((competency) => (
          <li key={competency.id} className="px-5 py-3.5">
            <Link to={`/competencies/${competency.id}`} className="text-sm font-bold text-navy hover:text-sky-deep">
              {competency.name}
            </Link>
            <p className="text-xs text-slate-500">{competency.category}</p>
            {competency.snippet && <p className="mt-1 text-xs leading-5 text-slate-500">{competency.snippet}</p>}
          </li>
        ))}
      </Group>

      <Group title="Learning materials" icon={<FileText size={18} />} count={results.materials.length}>
        {results.materials.map((material) => (
          <li key={material.id} className="px-5 py-3.5">
            <p className="text-sm font-bold text-navy">{material.title}</p>
            <p className="text-xs text-slate-500">
              In{' '}
              <Link to={paths.course(user.role, material.courseId)} className="font-semibold text-sky-deep hover:text-navy">
                {material.courseTitle}
              </Link>{' '}
              · {material.moduleTitle}
            </p>
            {material.snippet && <p className="mt-1 text-xs leading-5 text-slate-500">{material.snippet}</p>}
          </li>
        ))}
      </Group>

      <Group title="Employees" icon={<UsersRound size={18} />} count={results.employees.length}>
        {results.employees.map((employee) => (
          <li key={employee.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5">
            <div>
              {employee.role === 'TRAINEE' ? (
                <Link to={paths.employee(user.role, employee.id)} className="text-sm font-bold text-navy hover:text-sky-deep">
                  {employee.name}
                </Link>
              ) : (
                <span className="text-sm font-bold text-navy">{employee.name}</span>
              )}
              <p className="text-xs text-slate-500">
                {employee.email}
                {employee.department ? ` · ${employee.department}` : ''}
                {employee.employeeId ? ` · ${employee.employeeId}` : ''}
              </p>
            </div>
            <RoleBadge role={employee.role} />
          </li>
        ))}
      </Group>
    </div>
  );
}

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('q') ?? '';
  const q = raw.trim();
  usePageTitle(q ? `Search: ${q}` : 'Search');
  const debounced = useDebounce(q, 300);
  const query = useQuery({ queryKey: keys.search(debounced), queryFn: () => searchEverything(debounced, 10), enabled: debounced.length >= 2 });

  return (
    <div className="animate-fade-in">
      <PageHeader eyebrow="Search" title={q ? `Results for “${q}”` : 'Search'} description="Courses, competencies, learning materials and (where you are allowed to see them) employees." />
      <div className="mb-8 max-w-xl">
        <SearchInput value={raw} onChange={(value) => setParams(value ? { q: value } : {}, { replace: true })} placeholder="Search Capacity Connect" label="Search Capacity Connect" />
      </div>
      {q.length < 2 ? (
        <EmptyState title="Type at least two characters" description="The search covers everything you have access to." icon={<Search size={18} />} />
      ) : (
        <QueryBoundary query={query}>{(results) => <Results results={results} />}</QueryBoundary>
      )}
    </div>
  );
}
