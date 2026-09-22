import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Gauge, TrendingDown, TriangleAlert, UsersRound } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keys } from '../../api/keys';
import { DifficultyBadge, PriorityBadge, SeverityBadge } from '../../components/domain/badges';
import { Card, CheckboxField, DataTable, Drawer, EmptyState, ErrorState, InlineAlert, PageHeader, Pagination, Segmented, SelectField, Skeleton, StatCard, Td, Th } from '../../components/ui';
import { ReadinessTimeTravel } from '../../components/domain/ReadinessParts';
import { usePageTitle } from '../../hooks/misc';
import { fetchDepartments, fetchHeatmap, fetchHeatmapCell, fetchRoles, type HeatmapFilters } from '../../services/admin';
import { fetchCompetencies } from '../../services/learner';
import type { FreshnessStatus, Heatmap, HeatmapCell, HeatmapRow } from '../../types';
import { cn } from '../../utils/cn';
import { FRESHNESS_META, gapColor, levelColor } from '../../utils/constants';

/**
 * What the grid is showing.
 *
 * `decay` is a different question from the other two: it asks the server for
 * the freshness layer, where every level is decayed to the measured date first,
 * so a cell reports what has faded rather than what was never learned.
 */
type Mode = 'level' | 'gap' | 'decay';
interface Selected {
  competencyId: string;
  competencyName: string;
  groupId: string;
  groupName: string;
}

const cellSummary = (row: HeatmapRow, name: string, cell: HeatmapCell | undefined, periodDays: number, mode: Mode) => {
  if (!cell || cell.employees === 0) return `${row.name}, ${name}: no employees have this requirement`;
  if (mode === 'decay' && cell.decay) {
    const breakdown = (Object.entries(cell.decay.byStatus) as [FreshnessStatus, number][])
      .filter(([, count]) => count > 0)
      .map(([status, count]) => `${count} ${FRESHNESS_META[status].label.toLowerCase()}`)
      .join(', ');
    return `${row.name}, ${name}: ${cell.decay.averageDecay} points lost to decay on average, ${cell.decay.needingRefresher} of ${cell.employees} employees need a refresher (${breakdown})`;
  }
  if (cell.average === null) return `${row.name}, ${name}: not assessed yet`;
  const change = cell.change === null ? '' : `, ${cell.change >= 0 ? '+' : ''}${cell.change} points over ${periodDays} days`;
  return `${row.name}, ${name}: average ${cell.average}%, required ${cell.required}%, ${cell.affected} of ${cell.employees} employees below target${change}`;
};

function Grid({ heatmap, mode, onSelect }: { heatmap: Heatmap; mode: Mode; onSelect: (selection: Selected) => void }) {
  const rows = [...heatmap.rows, heatmap.overall];
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-card">
      <table className="w-full border-separate border-spacing-1 p-2 text-left" aria-label="Competency heatmap">
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 z-10 min-w-[170px] bg-white px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              {heatmap.groupBy === 'department' ? 'Department' : 'Job role'}
            </th>
            {heatmap.columns.map((column) => (
              <th key={column.competencyId} scope="col" className="min-w-[104px] px-1.5 py-2 text-center align-bottom text-[11px] font-bold leading-4 text-slate-600" title={`${column.name} (${column.category})`}>
                {column.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => {
            const isOverall = rowIndex === rows.length - 1;
            return (
              <tr key={row.id}>
                <th scope="row" className={cn('sticky left-0 z-10 bg-white px-3 py-2 text-left align-middle', isOverall && 'border-t border-slate-200')}>
                  <span className={cn('block text-sm', isOverall ? 'font-bold text-navy' : 'font-semibold text-slate-700')}>{isOverall ? 'All employees' : row.name}</span>
                  <span className="text-[11px] font-normal text-slate-500">{row.employees} employee{row.employees === 1 ? '' : 's'}</span>
                </th>
                {heatmap.columns.map((column) => {
                  const cell = row.cells.find((item) => item.competencyId === column.competencyId);
                  const value = mode === 'level' ? cell?.average ?? null : mode === 'decay' ? cell?.decay?.averageDecay ?? null : cell?.averageGap ?? null;
                  // Decay is "points lost", so it reads like a gap: more is worse.
                  const colors = mode === 'level' ? levelColor(value) : gapColor(value);
                  const empty = !cell || cell.employees === 0;
                  return (
                    <td key={column.competencyId} className="p-0">
                      <button
                        type="button"
                        disabled={empty}
                        onClick={() => onSelect({ competencyId: column.competencyId, competencyName: column.name, groupId: isOverall ? 'all' : row.id, groupName: isOverall ? 'All employees' : row.name })}
                        aria-label={cellSummary(row, column.name, cell, heatmap.periodDays, mode)}
                        style={empty ? undefined : colors}
                        className={cn(
                          'flex h-[68px] w-full flex-col items-center justify-center rounded-xl text-center transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky/40',
                          empty ? 'cursor-default bg-slate-50 text-slate-300' : 'hover:scale-[1.04] hover:shadow-lift',
                          isOverall && 'ring-1 ring-navy/20',
                        )}
                      >
                        {empty ? (
                          <span className="text-xs">-</span>
                        ) : value === null ? (
                          <span className="text-[11px] font-semibold">Not assessed</span>
                        ) : (
                          <>
                            <span className="font-display text-lg font-bold leading-none">{mode === 'level' ? `${value}%` : `${value}`}</span>
                            <span className="mt-1 text-[10px] font-semibold">
                              {mode === 'decay'
                                ? cell.decay && cell.decay.needingRefresher > 0
                                  ? `${cell.decay.needingRefresher} need a refresher`
                                  : 'all current'
                                : cell.affected > 0
                                  ? `${cell.affected} below target`
                                  : 'target met'}
                            </span>
                            {mode !== 'decay' && cell.change !== null && cell.change !== 0 && (
                              <span className="text-[10px] font-bold">
                                {cell.change > 0 ? '▲' : '▼'} {Math.abs(cell.change)}
                              </span>
                            )}
                          </>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CellDrawer({ selection, groupBy, onClose }: { selection: Selected; groupBy: 'department' | 'role'; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const [onlyGaps, setOnlyGaps] = useState(true);
  const request = { competencyId: selection.competencyId, groupBy, groupId: selection.groupId, page, onlyGaps };
  const query = useQuery({ queryKey: keys.heatmapCell(request), queryFn: () => fetchHeatmapCell(request), placeholderData: keepPreviousData });
  const summary = query.data?.meta.summary;

  return (
    <Drawer open onClose={onClose} width="max-w-2xl" title={`${selection.competencyName}`} description={`${selection.groupName}: who is behind, and what would help`}>
      {query.isLoading ? (
        <Skeleton className="h-64" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data && summary ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Employees" value={summary.employees} icon={<UsersRound size={19} />} />
            <StatCard label="Below target" value={summary.affected} icon={<TriangleAlert size={19} />} tone="coral" />
            <StatCard label="Average level" value={summary.averageCurrent === null ? '-' : `${summary.averageCurrent}%`} meta={summary.averageRequired === null ? undefined : `${summary.averageRequired}% required`} icon={<Gauge size={19} />} tone="teal" />
            <StatCard label="Average gap" value={summary.averageGap === null ? '-' : summary.averageGap} icon={<TrendingDown size={19} />} tone="amber" />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-display text-base font-bold text-navy">Employees</h3>
            <CheckboxField
              label="Only employees below target"
              checked={onlyGaps}
              onChange={(event) => {
                setOnlyGaps(event.target.checked);
                setPage(1);
              }}
            />
          </div>
          {query.data.items.length === 0 ? (
            <EmptyState title="Nobody to show" description={onlyGaps ? 'Every employee in this group meets the requirement.' : 'No employee has this requirement.'} />
          ) : (
            <Card padded={false}>
              <DataTable caption="Employees behind this heatmap cell">
                <thead>
                  <tr>
                    <Th>Employee</Th>
                    <Th align="right">Level</Th>
                    <Th align="right">Required</Th>
                    <Th>Gap</Th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.items.map((employee) => (
                    <tr key={employee.userId}>
                      <Td>
                        <Link to={`/admin/users/${employee.userId}`} className="font-semibold text-navy hover:text-sky-deep">
                          {employee.name}
                        </Link>
                        <p className="text-xs text-slate-500">{[employee.department, employee.jobRole].filter(Boolean).join(' · ')}</p>
                      </Td>
                      <Td align="right">
                        {employee.assessed ? `${employee.currentLevel}%` : <span className="text-xs text-slate-500">not assessed</span>}
                      </Td>
                      <Td align="right">{employee.requiredLevel}%</Td>
                      <Td>
                        <div className="flex flex-wrap gap-1.5">
                          <SeverityBadge severity={employee.severity} met={employee.gap === 0} />
                          {employee.gap > 0 && <PriorityBadge level={employee.priorityLevel} score={employee.priorityScore} />}
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
              <Pagination meta={query.data.meta} onPage={setPage} label="Employee pages" />
            </Card>
          )}

          <div>
            <h3 className="mb-3 font-display text-base font-bold text-navy">Published courses that develop it</h3>
            {query.data.meta.recommendedCourses.length === 0 ? (
              <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">No published course develops this competency yet. Consider commissioning one.</p>
            ) : (
              <ul className="space-y-2">
                {query.data.meta.recommendedCourses.map((course) => (
                  <li key={course.courseId} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-4 py-3 text-sm">
                    <Link to={`/admin/courses/${course.courseId}`} className="font-semibold text-navy hover:text-sky-deep">
                      {course.title}
                    </Link>
                    <span className="flex items-center gap-2 text-xs text-slate-500">
                      {course.levelFrom}% → {course.levelTo}% <DifficultyBadge difficulty={course.difficulty} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </Drawer>
  );
}

export default function HeatmapPage() {
  usePageTitle('Competency heatmap');
  const [groupBy, setGroupBy] = useState<'department' | 'role'>('department');
  const [period, setPeriod] = useState<HeatmapFilters['period']>('90d');
  const [departmentId, setDepartmentId] = useState('');
  const [jobRoleId, setJobRoleId] = useState('');
  const [competencyId, setCompetencyId] = useState('');
  const [mode, setMode] = useState<Mode>('level');
  const [offsetDays, setOffsetDays] = useState(0);
  const [selected, setSelected] = useState<Selected | null>(null);

  const filters: HeatmapFilters = { groupBy, period, departmentId, jobRoleId, competencyId, layer: mode === 'decay' ? 'freshness' : 'competency', offsetDays: mode === 'decay' ? offsetDays : 0 };
  const heatmap = useQuery({ queryKey: keys.heatmap(filters), queryFn: () => fetchHeatmap(filters), placeholderData: keepPreviousData });
  const departments = useQuery({ queryKey: keys.departments(), queryFn: () => fetchDepartments(), staleTime: 5 * 60_000 });
  const roles = useQuery({ queryKey: keys.roles(), queryFn: () => fetchRoles(), staleTime: 5 * 60_000 });
  const competencies = useQuery({ queryKey: keys.competencies({ heatmap: true }), queryFn: () => fetchCompetencies({ pageSize: 100 }), staleTime: 5 * 60_000 });

  return (
    <div className="animate-fade-in">
      <PageHeader
        eyebrow="Administration"
        title="Competency heatmap"
        description="Where the organisation is strong and where it is behind, by competency. Click any cell to see the employees behind it and the courses that could help."
      />

      {mode === 'decay' && <ReadinessTimeTravel value={offsetDays} onChange={setOffsetDays} className="mb-4" />}

      {mode === 'decay' && (
        <InlineAlert tone="info" className="mb-4">
          The freshness layer decays every recorded level to the measured date before building the grid, so a cell shows what has <strong>faded</strong>, not what was never learned. Nothing stored
          changes. Readiness for a specific operational period, and knowledge continuity, have their own pages.
        </InlineAlert>
      )}

      <Card className="mb-6">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
          <div>
            <p className="mb-1.5 text-xs font-bold text-slate-600">Rows</p>
            <Segmented label="Group rows by" value={groupBy} onChange={setGroupBy} items={[{ id: 'department', label: 'Departments' }, { id: 'role', label: 'Job roles' }]} />
          </div>
          <div>
            <p className="mb-1.5 text-xs font-bold text-slate-600">Show</p>
            <Segmented
              label="Cell value"
              value={mode}
              onChange={setMode}
              items={[
                { id: 'level', label: 'Average level' },
                { id: 'gap', label: 'Average gap' },
                { id: 'decay', label: 'Lost to decay' },
              ]}
            />
          </div>
          <div>
            <p className="mb-1.5 text-xs font-bold text-slate-600">Change over</p>
            <Segmented label="Change period" value={period} onChange={setPeriod} items={[{ id: '30d', label: '30 d' }, { id: '90d', label: '90 d' }, { id: '180d', label: '180 d' }, { id: '365d', label: '1 year' }]} />
          </div>
          <SelectField label="Department" wrapperClassName="w-52" value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>
            <option value="">All departments</option>
            {(departments.data ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </SelectField>
          <SelectField label="Job role" wrapperClassName="w-56" value={jobRoleId} onChange={(event) => setJobRoleId(event.target.value)}>
            <option value="">All job roles</option>
            {(roles.data ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </SelectField>
          <SelectField label="Competency" wrapperClassName="w-56" value={competencyId} onChange={(event) => setCompetencyId(event.target.value)}>
            <option value="">All competencies</option>
            {(competencies.data?.items ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </SelectField>
        </div>
      </Card>

      {heatmap.isLoading ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : heatmap.isError ? (
        <ErrorState error={heatmap.error} onRetry={() => void heatmap.refetch()} />
      ) : heatmap.data && heatmap.data.rows.length === 0 ? (
        <EmptyState title="No data for these filters" description="Try widening the filters." />
      ) : heatmap.data ? (
        <>
          <Grid heatmap={heatmap.data} mode={mode} onSelect={setSelected} />
          <div className="mt-5 flex flex-wrap items-center gap-x-8 gap-y-3 text-xs text-slate-500">
            <div className="flex items-center gap-3" aria-hidden>
              <span>{mode === 'level' ? 'Low level' : 'Large gap'}</span>
              <span className="h-3 w-48 rounded-full" style={{ background: mode === 'level' ? `linear-gradient(90deg, ${levelColor(20).background}, ${levelColor(50).background}, ${levelColor(65).background}, ${levelColor(90).background})` : `linear-gradient(90deg, ${gapColor(50).background}, ${gapColor(25).background}, ${gapColor(10).background}, ${gapColor(0).background})` }} />
              <span>{mode === 'level' ? 'High level' : 'No gap'}</span>
            </div>
            <p>
              “Below target” counts employees whose level is under what their job role requires. ▲/▼ shows the change in the average over the last {heatmap.data.periodDays} days, from recorded competency history.
            </p>
          </div>
        </>
      ) : null}

      {selected && <CellDrawer key={`${selected.competencyId}-${selected.groupId}`} selection={selected} groupBy={groupBy} onClose={() => setSelected(null)} />}
    </div>
  );
}
