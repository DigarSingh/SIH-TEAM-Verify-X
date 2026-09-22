import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { UsersRound } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keys } from '../../../api/keys';
import { EnrollmentStatusBadge } from '../../../components/domain/badges';
import { Badge, Card, DataTable, EmptyState, ErrorState, Pagination, ProgressBar, SearchInput, Td, Th } from '../../../components/ui';
import { useDebounce } from '../../../hooks/misc';
import { useCurrentUser } from '../../../hooks/useAuth';
import { fetchCourseTrainees } from '../../../services/trainer';
import type { EnrollmentStatus } from '../../../types';
import { cn } from '../../../utils/cn';
import { ENROLLMENT_STATUS_META } from '../../../utils/constants';
import { timeAgo } from '../../../utils/format';
import { paths } from '../../../utils/links';

const STATUSES: EnrollmentStatus[] = ['ENROLLED', 'IN_PROGRESS', 'ASSESSMENT_PENDING', 'COMPLETED', 'CERTIFIED', 'WITHDRAWN'];

export function TraineesTab({ courseId }: { courseId: string }) {
  const user = useCurrentUser();
  const [status, setStatus] = useState<EnrollmentStatus | ''>('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const debounced = useDebounce(search, 350);
  const request = { page, q: debounced, status };
  const query = useQuery({ queryKey: keys.courseTrainees(courseId, request), queryFn: () => fetchCourseTrainees(courseId, request), placeholderData: keepPreviousData });
  const counts = query.data?.meta.statusCounts ?? {};

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="Filter by status">
        <button type="button" aria-pressed={status === ''} onClick={() => { setStatus(''); setPage(1); }} className={cn('rounded-full px-3.5 py-1.5 text-xs font-bold transition', status === '' ? 'bg-navy text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
          All
        </button>
        {STATUSES.map((item) => (
          <button key={item} type="button" aria-pressed={status === item} onClick={() => { setStatus(item); setPage(1); }} className={cn('rounded-full px-3.5 py-1.5 text-xs font-bold transition', status === item ? 'bg-navy text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
            {ENROLLMENT_STATUS_META[item].label} <span className="font-medium">{counts[item] ?? 0}</span>
          </button>
        ))}
      </div>
      <SearchInput className="mb-4 max-w-sm" value={search} onChange={(value) => { setSearch(value); setPage(1); }} label="Search learners" placeholder="Search by name, email or employee ID" />

      {query.isLoading ? (
        <p className="text-sm text-slate-500">Loading learners…</p>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data && query.data.items.length === 0 ? (
        <EmptyState title="No learners" description={debounced || status ? 'No learner matches these filters.' : 'Nobody has enrolled in this course yet.'} icon={<UsersRound size={18} />} />
      ) : query.data ? (
        <Card padded={false}>
          <DataTable caption="Learners enrolled in this course">
            <thead>
              <tr>
                <Th>Learner</Th>
                <Th>Status</Th>
                <Th>Progress</Th>
                <Th>Assessment</Th>
                <Th>Competency change</Th>
                <Th>Last active</Th>
              </tr>
            </thead>
            <tbody>
              {query.data.items.map((row) => (
                <tr key={row.enrollmentId} className="hover:bg-slate-50/60">
                  <Td>
                    <Link to={paths.employee(user.role, row.learner.id)} className="font-semibold text-navy hover:text-sky-deep">
                      {row.learner.name}
                    </Link>
                    <p className="text-xs text-slate-500">{[row.learner.department, row.learner.jobRole].filter(Boolean).join(' · ') || row.learner.email}</p>
                  </Td>
                  <Td>
                    <EnrollmentStatusBadge status={row.status} />
                  </Td>
                  <Td className="min-w-[140px]">
                    <ProgressBar value={row.progress} showLabel label={`${row.learner.name} progress`} />
                  </Td>
                  <Td>
                    {row.attempts === 0 ? (
                      <span className="text-slate-500">Not attempted</span>
                    ) : (
                      <span>
                        <strong className="text-navy">{row.bestScore}%</strong> <span className="text-xs text-slate-500">best of {row.attempts}</span>
                        {row.passed && (
                          <span className="ml-2">
                            <Badge tone="success">Passed</Badge>
                          </span>
                        )}
                      </span>
                    )}
                  </Td>
                  <Td>
                    {row.competencyChanges.length === 0 ? (
                      <span className="text-slate-500">-</span>
                    ) : (
                      <ul className="space-y-1">
                        {row.competencyChanges.map((change) => (
                          <li key={change.competencyName} className="text-xs">
                            <span className="text-slate-500">{change.competencyName}</span>{' '}
                            <strong className="text-emerald-700">
                              {change.previousLevel}% → {change.newLevel}%
                            </strong>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap text-xs">{timeAgo(row.lastAccessedAt)}</Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
          <Pagination meta={query.data.meta} onPage={setPage} label="Learner pages" />
        </Card>
      ) : null}
    </div>
  );
}
