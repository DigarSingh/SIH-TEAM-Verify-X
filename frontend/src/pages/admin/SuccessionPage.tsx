import { useQuery } from '@tanstack/react-query';
import { GraduationCap, ShieldAlert, UserMinus, Users } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keys } from '../../api/keys';
import { QueryBoundary } from '../../components/domain/QueryBoundary';
import { ReadinessTimeTravel, SimulationBanner } from '../../components/domain/ReadinessParts';
import { Badge, Card, EmptyState, PageHeader, StatCard } from '../../components/ui';
import { usePageTitle } from '../../hooks/misc';
import { fetchSuccession } from '../../services/readiness';
import type { KnowledgeRisk, SuccessionRisk } from '../../types';
import { formatDate } from '../../utils/format';

/**
 * Knowledge continuity.
 *
 * Where the organisation depends on too few people. This is derived from
 * recorded competency levels and recorded retirement dates - it does not
 * predict who will leave, and it is not a performance assessment.
 */

const RISK_TONE: Record<KnowledgeRisk, 'success' | 'info' | 'warning' | 'danger'> = { LOW: 'success', WATCH: 'info', HIGH: 'warning', CRITICAL: 'danger' };
const RISK_ORDER: KnowledgeRisk[] = ['CRITICAL', 'HIGH', 'WATCH', 'LOW'];

function RiskCard({ risk }: { risk: SuccessionRisk }) {
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/admin/succession/${risk.competencyId}`} className="font-display text-base font-bold text-navy hover:text-sky-deep">
              {risk.competencyName}
            </Link>
            <Badge tone={RISK_TONE[risk.risk]}>{risk.risk.toLowerCase()}</Badge>
            <Badge tone="neutral">criticality {risk.criticality}/5</Badge>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{risk.reason}</p>
        </div>
        <dl className="flex gap-6 text-center">
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Experts</dt>
            <dd className="font-display text-2xl font-bold text-navy">{risk.expertCount}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Leaving</dt>
            <dd className={`font-display text-2xl font-bold ${risk.leavingCount > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{risk.leavingCount}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Developing</dt>
            <dd className="font-display text-2xl font-bold text-navy">{risk.developingCount}</dd>
          </div>
        </dl>
      </div>

      {risk.leavingExperts.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50/60 px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700">Experts with a recorded retirement date</p>
          <ul className="mt-1.5 space-y-1 text-sm text-slate-700">
            {risk.leavingExperts.map((expert) => (
              <li key={expert.userId}>
                <Link to={`/admin/users/${expert.userId}`} className="font-semibold text-navy hover:text-sky-deep">
                  {expert.userName}
                </Link>{' '}
                · {expert.effectiveLevel}% · leaves {formatDate(expert.retirementDate)}
                {expert.daysUntilRetirement !== null && ` (${expert.daysUntilRetirement} days)`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

export default function SuccessionPage() {
  usePageTitle('Knowledge continuity');
  const [offsetDays, setOffsetDays] = useState(0);
  const query = useQuery({ queryKey: keys.succession(offsetDays), queryFn: () => fetchSuccession(offsetDays) });

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        eyebrow="Operational readiness"
        title="Knowledge continuity"
        description="Competencies held by too few people, and what happens to them when those people leave. Derived from recorded competency levels and recorded retirement dates - it does not predict who will actually leave."
      />

      <ReadinessTimeTravel value={offsetDays} onChange={setOffsetDays} />

      <QueryBoundary query={query}>
        {(report) => {
          const summary = report.summary as { competencies: number; atRisk: number; thinlyCovered: number; expertsLeaving: number; byRisk: Record<KnowledgeRisk, number> };
          const risks = report.risks;
          return (
            <div className="space-y-6">
              <SimulationBanner asOf={report.asOf} />

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard label="Competencies reviewed" value={summary.competencies} icon={<Users size={18} />} tone="sky" />
                <StatCard label="At risk" value={summary.atRisk} meta="High or critical" icon={<ShieldAlert size={18} />} tone="coral" />
                <StatCard label="Thinly covered" value={summary.thinlyCovered} meta="Below the minimum number of experts" icon={<UserMinus size={18} />} tone="amber" />
                <StatCard label="Experts leaving" value={summary.expertsLeaving} meta="Retirement date on record" icon={<GraduationCap size={18} />} tone="purple" />
              </div>

              {risks.length === 0 ? (
                <EmptyState title="No continuity risks found" description="Every competency has enough people at expert level for the configured minimum." />
              ) : (
                <div className="space-y-4">
                  {RISK_ORDER.filter((level) => risks.some((risk) => risk.risk === level)).map((level) => (
                    <section key={level}>
                      <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                        {level.toLowerCase()} · {summary.byRisk[level]}
                      </h2>
                      <ul className="space-y-3">
                        {risks
                          .filter((risk) => risk.risk === level)
                          .map((risk) => (
                            <li key={risk.competencyId}>
                              <RiskCard risk={risk} />
                            </li>
                          ))}
                      </ul>
                    </section>
                  ))}
                </div>
              )}
            </div>
          );
        }}
      </QueryBoundary>
    </div>
  );
}
