import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Sparkles, Target, TrendingUp, TriangleAlert, UsersRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { errorMessage } from '../../api/client';
import { keys } from '../../api/keys';
import { ForecastChart } from '../../charts';
import { useAiEnabled } from '../../hooks/misc';
import { briefForecast, fetchForecast } from '../../services/ai';
import type { CompetencyForecast, ForecastConfidence, ForecastOutlook } from '../../types';
import type { Tone } from '../../utils/constants';
import { Badge, Button, Card, DataTable, EmptyState, ErrorState, InlineAlert, SectionLabel, Segmented, SelectField, Skeleton, Spinner, StatCard, Td, Th } from '../ui';
import { AiBadge, AiDisclosure, AiProvider } from './AiParts';

const HORIZONS = [
  { id: '3', label: '3 months' },
  { id: '6', label: '6 months' },
  { id: '12', label: '12 months' },
];

const OUTLOOK: Record<ForecastOutlook, { label: string; tone: Tone; hint: string }> = {
  MET: { label: 'On target', tone: 'success', hint: 'The average already meets the requirement.' },
  CLOSING: { label: 'Closing', tone: 'success', hint: 'The recent trend is closing the gap.' },
  STAGNANT: { label: 'Stagnant', tone: 'warning', hint: 'The trend is flat: the gap will not close by itself.' },
  WIDENING: { label: 'Widening', tone: 'danger', hint: 'The average is moving away from the requirement.' },
  UNKNOWN: { label: 'Not enough history', tone: 'neutral', hint: 'At least three months of recorded history are needed for a trend.' },
};
const CONFIDENCE: Record<ForecastConfidence, string> = { HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' };

function Trend({ perMonth }: { perMonth: number | null }) {
  if (perMonth === null) return <span className="text-slate-500">n/a</span>;
  const Icon = perMonth > 0.25 ? ArrowUpRight : perMonth < -0.25 ? ArrowDownRight : ArrowRight;
  const color = perMonth > 0.25 ? 'text-emerald-700' : perMonth < -0.25 ? 'text-red-600' : 'text-slate-500';
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap font-semibold ${color}`}>
      <Icon size={14} aria-hidden />
      {perMonth > 0 ? '+' : ''}
      {perMonth} / month
    </span>
  );
}

function Briefing({ horizon }: { horizon: number }) {
  const briefing = useMutation({ mutationFn: () => briefForecast(horizon) });
  const { reset } = briefing;
  // A briefing describes one forecast: when the horizon changes it no longer applies.
  useEffect(() => {
    reset();
  }, [horizon, reset]);

  return (
    <Card
      className="mt-6"
      title={
        <span className="inline-flex items-center gap-2">
          <Sparkles size={16} className="text-violet-500" aria-hidden /> Written briefing
        </span>
      }
      description="A short summary of the numbers above. The AI describes the forecast; it does not calculate it."
      action={<AiBadge />}
    >
      <div className="space-y-4" aria-live="polite">
        {briefing.isPending && <Spinner label="Writing the briefing" />}
        {briefing.isError && (
          <div className="space-y-2">
            <InlineAlert tone="danger">{errorMessage(briefing.error)}</InlineAlert>
            <Button variant="secondary" size="sm" onClick={() => briefing.mutate()}>
              Try again
            </Button>
          </div>
        )}
        {!briefing.data && !briefing.isPending && !briefing.isError && (
          <Button onClick={() => briefing.mutate()} leftIcon={<Sparkles size={15} />}>
            Write a briefing
          </Button>
        )}
        {briefing.data && (
          <>
            <p className="whitespace-pre-line text-sm leading-6 text-slate-700">{briefing.data.summary}</p>
            {briefing.data.priorities.length > 0 && (
              <div>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">Suggested priorities</p>
                <ul className="space-y-2">
                  {briefing.data.priorities.map((priority) => (
                    <li key={priority.competencyId} className="rounded-xl border border-slate-100 px-3 py-2 text-sm">
                      <span className="font-bold text-navy">{priority.competency}</span>
                      <span className="text-slate-600"> · {priority.action}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
        <AiDisclosure>Only the calculated figures shown above (no employee names) are sent to <AiProvider /> to write this briefing.</AiDisclosure>
      </div>
    </Card>
  );
}

/**
 * Where training needs are heading. Entirely calculated from the recorded competency history (a straight-line
 * trend per competency); it needs no AI service. An optional written briefing can be added when AI is enabled.
 */
export function ForecastSection() {
  const aiEnabled = useAiEnabled();
  const [horizon, setHorizon] = useState(6);
  const [selectedId, setSelectedId] = useState('');
  const query = useQuery({ queryKey: keys.forecast(horizon), queryFn: () => fetchForecast(horizon), placeholderData: keepPreviousData });
  const data = query.data;
  const selected: CompetencyForecast | undefined = data?.competencies.find((item) => item.competencyId === selectedId) ?? data?.competencies.find((item) => item.history.length > 0) ?? data?.competencies[0];

  return (
    <section className="mt-12" aria-labelledby="forecast-heading">
      <SectionLabel action={<Segmented label="Look ahead" items={HORIZONS} value={String(horizon)} onChange={(value) => setHorizon(Number(value))} />}>
        <span id="forecast-heading">Forecast: where training needs are heading</span>
      </SectionLabel>
      <p className="-mt-2 mb-5 max-w-3xl text-sm leading-6 text-slate-500">
        Based on how the average competency level of the employees who need each competency has moved month by month. It covers the whole organisation, so the filters above do not apply.
      </p>

      {query.isLoading ? (
        <Skeleton className="h-80 rounded-2xl" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : data ? (
        data.competencies.length === 0 ? (
          <EmptyState title="Nothing to forecast yet" description="A forecast needs employees with job roles and some recorded competency history." icon={<TrendingUp size={18} />} />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Below target now" value={data.summary.affectedNow} meta="employee-competency gaps today" icon={<Target size={19} />} tone="coral" />
              <StatCard label={`Below target in ${data.horizonMonths} months`} value={data.summary.projectedAffected} meta="if recent trends continue" icon={<TrendingUp size={19} />} tone="amber" />
              <StatCard label="Competencies at risk" value={data.summary.atRisk} meta="flat or widening, and still short" icon={<TriangleAlert size={19} />} tone="purple" />
              <StatCard label="Employees in scope" value={data.summary.employees} meta={`${data.summary.competencies} competencies`} icon={<UsersRound size={19} />} tone="sky" />
            </div>

            {selected && (
              <Card
                className="mt-6"
                title={`Trend and projection: ${selected.name}`}
                description={selected.projection.length > 0 ? `Average level of the ${selected.employees} employee${selected.employees === 1 ? '' : 's'} whose role requires it, continued by the recent trend.` : 'There is not enough recorded history to project a trend for this competency.'}
                action={
                  <SelectField label="Competency" wrapperClassName="w-64" value={selected.competencyId} onChange={(event) => setSelectedId(event.target.value)}>
                    {data.competencies.map((item) => (
                      <option key={item.competencyId} value={item.competencyId}>
                        {item.name}
                      </option>
                    ))}
                  </SelectField>
                }
              >
                {selected.history.length === 0 ? (
                  <p className="text-sm text-slate-500">No competency history has been recorded for this competency yet.</p>
                ) : (
                  <div role="img" aria-label={`Line chart of the average ${selected.name} level by month against the required ${selected.requiredAverage} percent. The same figures are in the table below.`}>
                    <ForecastChart history={selected.history} projection={selected.projection} required={selected.requiredAverage} />
                  </div>
                )}
              </Card>
            )}

            <Card padded={false} className="mt-6">
              <DataTable caption={`Forecast for the next ${data.horizonMonths} months, by competency`}>
                <thead>
                  <tr>
                    <Th>Competency</Th>
                    <Th align="right">Average now</Th>
                    <Th align="right">Required</Th>
                    <Th>Trend</Th>
                    <Th align="right">In {data.horizonMonths} months</Th>
                    <Th align="right">Below target</Th>
                    <Th align="right">Months to close</Th>
                    <Th>Outlook</Th>
                    <Th>Confidence</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.competencies.map((item) => (
                    <tr key={item.competencyId} className="hover:bg-slate-50/60">
                      <Td>
                        <button type="button" onClick={() => setSelectedId(item.competencyId)} className="text-left font-semibold text-navy hover:text-sky-deep" aria-label={`Show the chart for ${item.name}`}>
                          {item.name}
                        </button>
                        <p className="text-xs text-slate-500">
                          {item.category} · {item.employees} employee{item.employees === 1 ? '' : 's'}
                        </p>
                      </Td>
                      <Td align="right">{item.currentAverage}%</Td>
                      <Td align="right">{item.requiredAverage}%</Td>
                      <Td>
                        <Trend perMonth={item.trendPerMonth} />
                      </Td>
                      <Td align="right">{item.projectedAverage === null ? <span className="text-slate-500">n/a</span> : `${item.projectedAverage}%`}</Td>
                      <Td align="right">
                        {item.affectedNow} → <strong className="text-navy">{item.projectedAffected}</strong>
                      </Td>
                      <Td align="right">{item.monthsToClose === null ? <span className="text-slate-500">not closing</span> : item.monthsToClose === 0 ? 'on target' : item.monthsToClose}</Td>
                      <Td>
                        <Badge tone={OUTLOOK[item.outlook].tone} title={OUTLOOK[item.outlook].hint}>
                          {OUTLOOK[item.outlook].label}
                        </Badge>
                      </Td>
                      <Td>{item.confidence ? CONFIDENCE[item.confidence] : <span className="text-slate-500">n/a</span>}</Td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </Card>

            <details className="mt-4 text-xs leading-5 text-slate-500">
              <summary className="cursor-pointer font-semibold text-slate-600">How this forecast is calculated</summary>
              <p className="mt-2 max-w-3xl">{data.method}</p>
            </details>

            {aiEnabled && <Briefing horizon={horizon} />}
          </>
        )
      ) : null}
    </section>
  );
}
