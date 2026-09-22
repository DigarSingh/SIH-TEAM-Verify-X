import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Library } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { keys } from '../../api/keys';
import { DifficultyBadge, PriorityBadge, SeverityBadge } from '../../components/domain/badges';
import { CompetencyMeter } from '../../components/domain/CompetencyMeter';
import { QueryBoundary } from '../../components/domain/QueryBoundary';
import { Badge, ButtonLink, Card, DataTable, EmptyState, PageHeader, SectionLabel, StatCard, Td, Th } from '../../components/ui';
import { useCurrentUser } from '../../hooks/useAuth';
import { usePageTitle } from '../../hooks/misc';
import { fetchCompetencyDetail, type CompetencyDetail } from '../../services/admin';
import { fetchMyCompetencies } from '../../services/learner';
import { cn } from '../../utils/cn';
import { formatDuration } from '../../utils/format';
import { paths } from '../../utils/links';

const BANDS = [
  { key: 'foundation', label: 'Foundation', range: '0-39', tone: 'bg-slate-100 text-slate-600' },
  { key: 'developing', label: 'Developing', range: '40-69', tone: 'bg-sky/10 text-sky-deep' },
  { key: 'proficient', label: 'Proficient', range: '70-89', tone: 'bg-teal/10 text-teal-deep' },
  { key: 'expert', label: 'Expert', range: '90-100', tone: 'bg-violet-50 text-violet-700' },
] as const;

function MyLevel({ competencyId }: { competencyId: string }) {
  const query = useQuery({ queryKey: keys.competenciesMe, queryFn: fetchMyCompetencies });
  const record = query.data?.competencies.find((item) => item.competencyId === competencyId);
  if (!record) return null;
  return (
    <Card title="Your level" description={record.reason}>
      <div className="pt-4">
        <CompetencyMeter current={record.currentLevel} required={record.requiredLevel} severity={record.severity} label={record.competencyName} />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <SeverityBadge severity={record.severity} met={record.met} />
        {!record.met && <PriorityBadge level={record.priorityLevel} score={record.priorityScore} />}
        <ButtonLink to={`/trainee/courses?competencyId=${competencyId}`} size="sm" variant="secondary" className="ml-auto">
          Find courses
        </ButtonLink>
      </div>
    </Card>
  );
}

function Detail({ competency }: { competency: CompetencyDetail }) {
  const user = useCurrentUser();
  const descriptors = competency.levelDescriptors ?? {};
  return (
    <div className="animate-fade-in">
      <Link to={paths.competencies(user.role)} className="mb-4 inline-flex items-center gap-1.5 text-xs font-bold text-sky-deep hover:text-navy">
        <ArrowLeft size={13} aria-hidden /> Back
      </Link>
      <PageHeader
        eyebrow={competency.category}
        title={competency.name}
        description={competency.description}
        actions={
          <>
            <Badge tone="neutral">{competency.code}</Badge>
            {!competency.isActive && <Badge tone="warning">Inactive</Badge>}
          </>
        }
      />

      {competency.stats && (
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label="Employees assessed" value={competency.stats.employeesAssessed} icon={<Library size={19} />} tone="sky" />
          <StatCard label="Average level" value={`${competency.stats.averageLevel}%`} icon={<Library size={19} />} tone="teal" />
          <StatCard label="Job roles requiring it" value={competency.roles?.length ?? 0} icon={<Library size={19} />} tone="purple" />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-8 lg:col-span-2">
          <section aria-labelledby="ladder">
            <SectionLabel>
              <span id="ladder">What each level means</span>
            </SectionLabel>
            <Card padded={false}>
              <ul className="divide-y divide-slate-100">
                {BANDS.map((band) => (
                  <li key={band.key} className="flex gap-4 px-5 py-4">
                    <span className={cn('flex h-14 w-24 shrink-0 flex-col items-center justify-center rounded-xl text-center', band.tone)}>
                      <span className="text-xs font-bold">{band.label}</span>
                      <span className="text-[11px] font-medium">{band.range}%</span>
                    </span>
                    <p className="self-center text-sm leading-6 text-slate-600">{descriptors[band.key] ?? <span className="text-slate-500">No description has been written for this level yet.</span>}</p>
                  </li>
                ))}
              </ul>
            </Card>
          </section>

          <section aria-labelledby="courses">
            <SectionLabel>
              <span id="courses">Courses that develop it</span>
            </SectionLabel>
            {competency.courses.length === 0 ? (
              <EmptyState title="No published course yet" description="A course mapped to this competency will appear here once it is published." />
            ) : (
              <Card padded={false}>
                <DataTable caption="Courses that develop this competency">
                  <thead>
                    <tr>
                      <Th>Course</Th>
                      <Th>Level</Th>
                      <Th>Takes a learner</Th>
                      <Th>Duration</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {competency.courses.map((course) => (
                      <tr key={course.id} className="hover:bg-slate-50/60">
                        <Td>
                          <Link to={paths.course(user.role, course.id)} className="font-semibold text-navy hover:text-sky-deep">
                            {course.title}
                          </Link>
                        </Td>
                        <Td>
                          <DifficultyBadge difficulty={course.difficulty} />
                        </Td>
                        <Td>
                          {course.levelFrom}% → <strong className="text-navy">{course.levelTo}%</strong>
                        </Td>
                        <Td>{formatDuration(course.durationMinutes)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              </Card>
            )}
          </section>
        </div>

        <div className="space-y-6">
          {user.role === 'TRAINEE' && <MyLevel competencyId={competency.id} />}
          {competency.roles && (
            <Card title="Required by job roles" padded={false}>
              {competency.roles.length === 0 ? (
                <p className="p-5 text-sm text-slate-500">No job role requires this competency yet.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {competency.roles.map((role) => (
                    <li key={role.roleId} className="flex items-center justify-between gap-3 px-5 py-3.5 text-sm">
                      <span>
                        <span className="block font-semibold text-navy">{role.name}</span>
                        <span className="text-xs text-slate-500">Importance {role.importance}/5 · criticality {role.criticality}/5</span>
                      </span>
                      <Badge tone="info">{role.requiredLevel}%</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CompetencyDetailPage() {
  const { competencyId = '' } = useParams();
  const query = useQuery({ queryKey: keys.competency(competencyId), queryFn: () => fetchCompetencyDetail(competencyId), enabled: Boolean(competencyId) });
  usePageTitle(query.data?.name ?? 'Competency');
  return <QueryBoundary query={query}>{(competency) => <Detail competency={competency} />}</QueryBoundary>;
}
