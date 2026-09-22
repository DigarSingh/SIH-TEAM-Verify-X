import { CheckCircle2, CircleDot, Info, Radar } from 'lucide-react';
import { Badge, Card, InlineAlert } from '../ui';
import type { AttemptScenario, ScenarioStepType } from '../../types';
import { cn } from '../../utils/cn';

/**
 * The practical half of an assessment.
 *
 * A scenario is a situation with a sequence of decisions. Unlike the quiz,
 * several choices can be partly right, so the interface deliberately does not
 * hint at which is best: no "correct" styling, no ordering by quality. The
 * marking is only shown in the result.
 */

export const STEP_META: Record<ScenarioStepType, { label: string; hint: string }> = {
  IDENTIFY: { label: 'Identify', hint: 'What are you looking at?' },
  INTERPRET: { label: 'Interpret', hint: 'What does it mean?' },
  ACTION: { label: 'Act', hint: 'What do you do about it?' },
};

export interface ScenarioPlayerProps {
  scenarios: AttemptScenario[];
  /** step id to the chosen option id. */
  choices: Record<string, string>;
  onChoose: (stepId: string, optionId: string) => void;
}

export function ScenarioPlayer({ scenarios, choices, onChoose }: ScenarioPlayerProps) {
  const totalSteps = scenarios.reduce((sum, scenario) => sum + scenario.steps.length, 0);
  const decided = scenarios.reduce((sum, scenario) => sum + scenario.steps.filter((step) => choices[step.id]).length, 0);

  return (
    <div className="space-y-6">
      <InlineAlert tone="info">
        <span className="flex items-start gap-2">
          <Info size={15} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            <strong>Simulated exercise.</strong> These situations are written for training. Several choices may be defensible, and a reasonable but slower decision earns part of the marks - so
            answer as you would on shift, not as you think a marking scheme wants.
          </span>
        </span>
      </InlineAlert>

      <p className="text-sm font-semibold text-slate-600">
        {decided} of {totalSteps} decision{totalSteps === 1 ? '' : 's'} made
      </p>

      {scenarios.map((scenario, scenarioIndex) => (
        <Card
          key={scenario.id}
          title={
            <span className="flex items-center gap-2">
              <Radar size={17} className="text-sky-deep" aria-hidden /> {scenario.title}
            </span>
          }
          description={`Scenario ${scenarioIndex + 1} of ${scenarios.length} · ${scenario.marks} mark${scenario.marks === 1 ? '' : 's'}`}
          action={<Badge tone="purple">Simulated</Badge>}
        >
          <div className="rounded-xl bg-slate-50 p-4">
            <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Situation</h3>
            <p className="mt-1.5 whitespace-pre-line text-sm leading-7 text-slate-700">{scenario.briefing}</p>
          </div>

          {scenario.imageUrl && (
            <figure className="mt-4">
              <img src={scenario.imageUrl} alt={`Supporting product for ${scenario.title}`} className="w-full rounded-xl border border-slate-100" loading="lazy" />
              <figcaption className="mt-1.5 text-[11px] text-slate-500">Simulated product, provided for this exercise.</figcaption>
            </figure>
          )}

          <ol className="mt-5 space-y-6">
            {scenario.steps.map((step, stepIndex) => {
              const meta = STEP_META[step.type];
              const chosen = choices[step.id];
              return (
                <li key={step.id}>
                  <fieldset>
                    <legend className="w-full">
                      <span className="flex flex-wrap items-center gap-2">
                        <Badge tone="info">
                          {meta.label} · step {stepIndex + 1}
                        </Badge>
                        <Badge tone="neutral">
                          {step.marks} mark{step.marks === 1 ? '' : 's'}
                        </Badge>
                        {chosen ? (
                          <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                            <CheckCircle2 size={12} aria-hidden /> Decided
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-[11px] font-bold text-slate-500">
                            <CircleDot size={12} aria-hidden /> Not yet decided
                          </span>
                        )}
                      </span>
                      <span className="mt-2 block font-display text-base font-bold leading-snug text-navy">{step.prompt}</span>
                      <span className="mt-0.5 block text-xs text-slate-500">{meta.hint}</span>
                    </legend>

                    <div className="mt-4 space-y-3">
                      {step.options.map((option) => {
                        const checked = chosen === option.id;
                        return (
                          <label
                            key={option.id}
                            className={cn(
                              'flex cursor-pointer items-start gap-3 rounded-xl border-2 px-4 py-3.5 text-sm transition focus-within:ring-4 focus-within:ring-sky/15',
                              checked ? 'border-sky bg-sky/5 text-navy' : 'border-slate-100 text-slate-700 hover:border-slate-300',
                            )}
                          >
                            <input
                              type="radio"
                              name={`step-${step.id}`}
                              checked={checked}
                              onChange={() => onChoose(step.id, option.id)}
                              className="mt-0.5 h-4 w-4 shrink-0 border-slate-300 text-sky-deep focus:ring-sky"
                            />
                            <span className="leading-6">{option.text}</span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                </li>
              );
            })}
          </ol>
        </Card>
      ))}
    </div>
  );
}
