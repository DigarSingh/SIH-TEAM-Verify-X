import { useMutation } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../../api/client';
import { useAiEnabled } from '../../hooks/misc';
import { explainMyPlan } from '../../services/ai';
import { Button, Card, InlineAlert, Spinner } from '../ui';
import { AiBadge, AiDisclosure, AiProvider } from './AiParts';

/**
 * A plain-language explanation of the rule-based recommendations. The AI only words what the engine already
 * decided: the recommended courses, their order and the reasons are not changed by it.
 */
export function StudyPlanCard() {
  const enabled = useAiEnabled();
  const plan = useMutation({ mutationFn: explainMyPlan });
  if (!enabled) return null;

  return (
    <Card
      className="mb-8"
      title={
        <span className="inline-flex items-center gap-2">
          <Sparkles size={16} className="text-violet-500" aria-hidden /> Your plan in plain language
        </span>
      }
      description="An AI-written explanation of the recommendations below. It does not change them."
      action={<AiBadge />}
    >
      <div className="space-y-4" aria-live="polite">
        {plan.isPending && <Spinner label="Writing your plan" />}
        {plan.isError && (
          <div className="space-y-2">
            <InlineAlert tone="danger">{errorMessage(plan.error)}</InlineAlert>
            <Button variant="secondary" size="sm" onClick={() => plan.mutate()}>
              Try again
            </Button>
          </div>
        )}
        {!plan.data && !plan.isPending && !plan.isError && (
          <Button onClick={() => plan.mutate()} leftIcon={<Sparkles size={15} />}>
            Explain my plan
          </Button>
        )}
        {plan.data && (
          <>
            <p className="text-sm leading-6 text-slate-700">{plan.data.summary}</p>
            {plan.data.steps.length > 0 && (
              <ol className="space-y-3">
                {plan.data.steps.map((step) => (
                  <li key={step.courseId} className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky/10 text-xs font-bold text-sky-deep" aria-hidden>
                      {step.rank}
                    </span>
                    <div className="min-w-0">
                      <Link to={`/trainee/courses/${step.courseId}`} className="text-sm font-bold text-navy hover:text-sky-deep">
                        {step.title}
                      </Link>
                      <p className="text-sm leading-6 text-slate-600">{step.note}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
            <Button variant="ghost" size="sm" loading={plan.isPending} onClick={() => plan.mutate()}>
              Write it again
            </Button>
          </>
        )}
        <AiDisclosure>Your job role, your skill gaps and the recommended courses (no name or contact details) are sent to <AiProvider /> to write this. The recommendations themselves come from the rule-based engine.</AiDisclosure>
      </div>
    </Card>
  );
}
