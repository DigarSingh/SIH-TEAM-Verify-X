import { Award, CheckCircle2, TrendingUp, XCircle } from 'lucide-react';
import type { ARSubmitResult } from '../../types';
import { cn } from '../../utils/cn';
import { Badge, ButtonLink, Card } from '../ui';
import { CompetencyMeter } from './CompetencyMeter';

/**
 * The outcome of an AR practical.
 *
 * Three things a trainee needs, in order: what they scored, what it did to
 * their competency, and which task they got wrong and why. The competency card
 * is deliberately explicit that the engine calculated the new level rather than
 * copying the score - that distinction is the whole point of the feature.
 */
export function ARResult({ result, moduleKey }: { result: ARSubmitResult; moduleKey: string }) {
  const { attempt, scoring, module } = result;
  const impact = result.competencyImpacts[0];

  return (
    <div className="space-y-6">
      <section
        aria-label="Practical result"
        className={cn(
          'relative overflow-hidden rounded-3xl p-6 text-white shadow-lift md:p-8',
          attempt.passed ? 'bg-gradient-to-br from-emerald-700 via-emerald-600 to-teal' : 'bg-gradient-to-br from-navy via-[#1c3a63] to-slate-600',
        )}
      >
        <span aria-hidden className="absolute -right-20 -top-20 h-64 w-64 rounded-full border-[36px] border-white/[0.07]" />
        <div className="relative">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/70">
            {module.title} · attempt {attempt.attemptNumber}
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold md:text-4xl">{attempt.passed ? 'Practical passed' : 'Not passed this time'}</h1>
          <p className="mt-2 max-w-xl text-sm text-white/85">{scoring.explanation}</p>

          <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-4">
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-wide text-white/60">Practical</dt>
              <dd className="font-display text-3xl font-bold">{scoring.practical}%</dd>
              <dd className="text-[11px] text-white/70">
                {attempt.score} of {attempt.totalPoints} points
              </dd>
            </div>
            {scoring.theory !== null && (
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-wide text-white/60">Theory</dt>
                <dd className="font-display text-3xl font-bold">{scoring.theory}%</dd>
                <dd className="text-[11px] text-white/70">weighted {Math.round(scoring.theoryWeight * 100)}%</dd>
              </div>
            )}
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-wide text-white/60">Final score</dt>
              <dd className="font-display text-3xl font-bold">{scoring.combined}%</dd>
              <dd className="text-[11px] text-white/70">pass mark {module.passingScore}%</dd>
            </div>
            {attempt.durationSeconds !== null && (
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-wide text-white/60">Time</dt>
                <dd className="font-display text-3xl font-bold">
                  {Math.floor(attempt.durationSeconds / 60)}:{String(attempt.durationSeconds % 60).padStart(2, '0')}
                </dd>
              </div>
            )}
          </dl>
        </div>
      </section>

      {impact && (
        <Card
          title={`${impact.competencyName} updated`}
          description="Calculated by the competency engine from all your current evidence, not set to this score"
          action={
            impact.changed ? (
              <Badge tone="success">
                <TrendingUp size={12} aria-hidden /> {impact.previousLevel}% → {impact.newLevel}%
              </Badge>
            ) : (
              <Badge tone="neutral">No change</Badge>
            )
          }
        >
          <CompetencyMeter current={impact.newLevel} required={impact.requiredLevel} label={impact.competencyName} />
          <p className="mt-4 text-sm leading-6 text-slate-600">{impact.explanation}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <ButtonLink to="/trainee/passport" variant="secondary" size="sm">
              See it in my Competency Passport
            </ButtonLink>
            <ButtonLink to="/trainee/readiness" variant="secondary" size="sm">
              My readiness
            </ButtonLink>
          </div>
        </Card>
      )}

      <Card title="Task by task" description="What you selected, and what the right answer was">
        <ol className="space-y-3">
          {result.review.map((row, position) => (
            <li key={row.taskId} className={cn('rounded-xl border px-4 py-3', row.correct ? 'border-emerald-100 bg-emerald-50/50' : 'border-slate-100')}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="min-w-0 text-sm font-semibold text-navy">
                  {position + 1}. {row.instruction}
                </p>
                <Badge tone={row.correct ? 'success' : 'danger'}>
                  {row.correct ? <CheckCircle2 size={12} aria-hidden /> : <XCircle size={12} aria-hidden />} {row.pointsAwarded} / {row.points}
                </Badge>
              </div>
              <p className="mt-1.5 text-xs text-slate-600">
                You selected: <strong>{row.selectedComponentName ?? 'nothing'}</strong>
                {!row.correct && (
                  <>
                    {' · '}correct answer: <strong className="text-emerald-700">{row.correctComponentName}</strong>
                  </>
                )}
              </p>
              {row.explanation && <p className="mt-2 text-xs leading-6 text-slate-500">{row.explanation}</p>}
            </li>
          ))}
        </ol>
      </Card>

      <div className="flex flex-wrap gap-3">
        <ButtonLink to="/trainee/ar-lab" variant="secondary">
          Back to the AR Lab
        </ButtonLink>
        <ButtonLink to={`/trainee/ar-lab/${moduleKey}`} variant="secondary">
          Practise again
        </ButtonLink>
        {attempt.passed && (
          <ButtonLink to="/trainee/certificates" variant="secondary" leftIcon={<Award size={15} />}>
            My certificates
          </ButtonLink>
        )}
      </div>
    </div>
  );
}
