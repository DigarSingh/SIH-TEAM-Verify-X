import { useQuery } from '@tanstack/react-query';
import { GraduationCap, Target, TriangleAlert, UsersRound } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keys } from '../../api/keys';
import { DifficultyBadge, PriorityBadge, SeverityBadge } from '../../components/domain/badges';
import { ForecastSection } from '../../components/domain/ForecastSection';
import { Badge, Card, DataTable, Drawer, EmptyState, ErrorState, InlineAlert, PageHeader, ProgressBar, SelectField, Skeleton, StatCard, Td, Th } from '../../components/ui';
import { usePageTitle } from '../../hooks/misc';
import { fetchDepartments, fetchRoles, fetchTrainingNeed, fetchTrainingNeeds } from '../../services/admin';
import type { TrainingNeed } from '../../types';
import { formatPercent } from '../../utils/format';

function NeedDrawer({ need, filters, onClose }: { need: TrainingNeed; filters: { departmentId?: string; jobRoleId?: string }; onClose: () => void }) {
  const query = useQuery({ queryKey: keys.trainingNeed(need.competencyId, filters), queryFn: () => fetchTrainingNeed(need.competencyId, filters) });
  return (
    <Drawer open onClose={onClose} width="max-w-3xl" title={need.name} description={`${need.category} · ${need.employeesAffected} of ${need.employeesRequired} employees below the required level`}>
      {query.isLoading ? (
        <Skeleton className="h-64" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data ? (
        <div className="space-y-8">
          {need.needsCourseDevelopment ? (
            <InlineAlert tone="warning">No published course develops this competency, so {need.unserved} employee{need.unserved === 1 ? '' : 's'} with a gap cannot be trained. Commission a course for it.</InlineAlert>
          ) : need.unserved > 0 ? (
            <InlineAlert tone="info">
              {need.inTraining} employee{need.inTraining === 1 ? ' is' : 's are'} already enrolled in a relevant course. {need.unserved} more with a gap {need.unserved === 1 ? 'has' : 'have'} not started one.
            </InlineAlert>
          ) : (
            <InlineAlert tone="success">Everyone with a gap is already enrolled in a course that develops this competency.</InlineAlert>
          )}

          <section aria-labelledby="need-departments">
            <h3 id="need-departments" className="mb-3 font-display text-base font-bold text-navy">
              By department
            </h3>
            <Card padded={false}>
              <DataTable caption="Departments">
                <thead>
                  <tr>
                    <Th>Department</Th>
                    <Th align="right">Employees</Th>
                    <Th align="right">Below target</Th>
                    <Th align="right">Average gap</Th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.departments.map((row) => (
                    <tr key={row.id}>
                      <Td className="font-semibold text-navy">{row.name}</Td>
                      <Td align="right">{row.employees}</Td>
                      <Td align="right">{row.affected}</Td>
                      <Td align="right">{row.averageGap}</Td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </Card>
          </section>

          <section aria-labelledby="need-courses">
            <h3 id="need-courses" className="mb-3 font-display text-base font-bold text-navy">
              Courses that develop it
            </h3>
            {query.data.courses.length === 0 ? (
              <p className="text-sm text-slate-500">No published course is mapped to this competency.</p>
            ) : (
              <Card padded={false}>
                <DataTable caption="Courses">
                  <thead>
                    <tr>
                      <Th>Course</Th>
                      <Th>Takes learners</Th>
                      <Th align="right">Enrolled</Th>
                      <Th align="right">Completed</Th>
                      <Th align="right">Gap holders in it</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {query.data.courses.map((course) => (
                      <tr key={course.courseId}>
                        <Td>
                          <Link to={`/admin/courses/${course.courseId}`} className="font-semibold text-navy hover:text-sky-deep">
                            {course.title}
                          </Link>
                          <div className="mt-1">
                            <DifficultyBadge difficulty={course.difficulty} />
                          </div>
                        </Td>
                        <Td>
                          {course.levelFrom}% → {course.levelTo}%
                        </Td>
                        <Td align="right">{course.enrolled}</Td>
                        <Td align="right">{course.completed}</Td>
                        <Td align="right">{course.affectedEnrolled}</Td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              </Card>
            )}
          </section>

          <section aria-labelledby="need-employees">
            <h3 id="need-employees" className="mb-3 font-display text-base font-bold text-navy">
              Employees with the biggest gaps
            </h3>
            {query.data.employees.length === 0 ? (
              <p className="text-sm text-slate-500">Nobody is below the required level.</p>
            ) : (
              <Card padded={false}>
                <DataTable caption="Employees below target">
                  <thead>
                    <tr>
                      <Th>Employee</Th>
                      <Th align="right">Level</Th>
                      <Th align="right">Required</Th>
                      <Th>Priority</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {query.data.employees.slice(0, 15).map((employee) => (
                      <tr key={employee.userId}>
                        <Td>
                          <Link to={`/admin/users/${employee.userId}`} className="font-semibold text-navy hover:text-sky-deep">
                            {employee.name}
                          </Link>
                          <p className="text-xs text-slate-500">{[employee.department, employee.jobRole].filter(Boolean).join(' · ')}</p>
                        </Td>
                        <Td align="right">{employee.currentLevel}%</Td>
                        <Td align="right">{employee.requiredLevel}%</Td>
                        <Td>
                          <PriorityBadge level={employee.priorityLevel} score={employee.priorityScore} />
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              </Card>
            )}
          </section>
        </div>
      ) : null}
    </Drawer>
  );
}

export default function TrainingNeedsPage() {
  usePageTitle('Training needs');
  const [departmentId, setDepartmentId] = useState('');
  const [jobRoleId, setJobRoleId] = useState('');
  const [selected, setSelected] = useState<TrainingNeed | null>(null);
  const filters = { ...(departmentId ? { departmentId } : {}), ...(jobRoleId ? { jobRoleId } : {}) };

  const query = useQuery({ queryKey: keys.trainingNeeds(filters), queryFn: () => fetchTrainingNeeds(filters) });
  const departments = useQuery({ queryKey: keys.departments(), queryFn: () => fetchDepartments(), staleTime: 5 * 60_000 });
  const roles = useQuery({ queryKey: keys.roles(), queryFn: () => fetchRoles(), staleTime: 5 * 60_000 });

  return (
    <div className="animate-fade-in">
      <PageHeader
        eyebrow="Administration"
        title="Training needs analysis"
        description="Competencies ranked by how much organisational training is needed: how many employees are behind, by how much, how important the role requirement is, and whether courses already exist."
      />

      <Card className="mb-6">
        <div className="flex flex-wrap items-end gap-4">
          <SelectField label="Department" wrapperClassName="w-56" value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>
            <option value="">All departments</option>
            {(departments.data ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </SelectField>
          <SelectField label="Job role" wrapperClassName="w-60" value={jobRoleId} onChange={(event) => setJobRoleId(event.target.value)}>
            <option value="">All job roles</option>
            {(roles.data ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </SelectField>
        </div>
      </Card>

      {query.isLoading ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Employees" value={query.data.summary.employees} meta={`${query.data.summary.employeesNeedingTraining} need training`} icon={<UsersRound size={19} />} tone="sky" />
            <StatCard label="Competencies with gaps" value={query.data.summary.competenciesWithGaps} icon={<Target size={19} />} tone="coral" />
            <StatCard label="Not yet in training" value={query.data.summary.unservedDemand} meta="Employee-competency gaps with no enrollment" icon={<GraduationCap size={19} />} tone="amber" />
            <StatCard label="Without a course" value={query.data.summary.competenciesWithoutCourses} meta="Gaps that no published course addresses" icon={<TriangleAlert size={19} />} tone="purple" />
          </div>

          <div className="mt-8">
            {query.data.needs.length === 0 ? (
              <EmptyState title="No training needs found" description="Nobody is below the required level for these filters." />
            ) : (
              <Card padded={false}>
                <DataTable caption="Training needs ranked by priority">
                  <thead>
                    <tr>
                      <Th>#</Th>
                      <Th>Competency</Th>
                      <Th>Employees below target</Th>
                      <Th align="right">Avg gap</Th>
                      <Th>Severity</Th>
                      <Th>Priority</Th>
                      <Th align="right">In training</Th>
                      <Th align="right">Not started</Th>
                      <Th>Courses</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {query.data.needs.map((need, index) => (
                      <tr key={need.competencyId} className="hover:bg-slate-50/60">
                        <Td className="font-bold text-slate-500">{index + 1}</Td>
                        <Td>
                          <button type="button" onClick={() => setSelected(need)} className="text-left font-semibold text-navy hover:text-sky-deep">
                            {need.name}
                          </button>
                          <p className="text-xs text-slate-500">{need.category}</p>
                        </Td>
                        <Td className="min-w-[170px]">
                          <p className="mb-1 text-xs text-slate-500">
                            <strong className="text-navy">{need.employeesAffected}</strong> of {need.employeesRequired}
                          </p>
                          <ProgressBar value={need.affectedShare} color={need.affectedShare >= 60 ? 'red' : need.affectedShare >= 35 ? 'amber' : 'sky'} label={`${need.name}: ${formatPercent(need.affectedShare)} of employees below target`} />
                        </Td>
                        <Td align="right">{need.averageGap}</Td>
                        <Td>
                          <SeverityBadge severity={need.severity} />
                        </Td>
                        <Td>
                          <PriorityBadge level={need.priorityLevel} score={need.priorityScore} />
                        </Td>
                        <Td align="right">{need.inTraining}</Td>
                        <Td align="right">{need.unserved}</Td>
                        <Td>{need.needsCourseDevelopment ? <Badge tone="danger">No course</Badge> : <Badge tone="success">{need.recommendedCourses} available</Badge>}</Td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              </Card>
            )}
            <p className="mt-4 text-xs leading-5 text-slate-500">
              Ranking uses the same formula as individual priorities (gap × importance × role criticality, normalised to 0-100) averaged over the affected employees, so a large gap in a critical competency for many people rises to the top.
              Priority levels use thresholds of {query.data.thresholds.mediumMin} / {query.data.thresholds.highMin} / {query.data.thresholds.criticalMin} (medium / high / critical), which an administrator can change in Engine settings.
            </p>
          </div>
        </>
      ) : null}

      <ForecastSection />

      {selected && <NeedDrawer key={selected.competencyId} need={selected} filters={filters} onClose={() => setSelected(null)} />}
    </div>
  );
}
