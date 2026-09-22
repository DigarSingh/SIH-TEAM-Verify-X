import { useMutation } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { errorMessage } from '../../api/client';
import { useAiEnabled } from '../../hooks/misc';
import { askCourseAssistant } from '../../services/ai';
import type { AiAnswer } from '../../types';
import { Badge, Button, Card, InlineAlert, Spinner, TextAreaField } from '../ui';
import { AiBadge, AiDisclosure, AiProvider } from './AiParts';

interface Turn {
  id: number;
  question: string;
  state: 'pending' | 'done' | 'error';
  answer?: AiAnswer;
  error?: string;
}

const SUGGESTIONS = ['Summarise the key ideas of this course', 'What are the learning outcomes of this course?', 'Explain the most important rule or formula in the readings'];

function AnswerView({ answer }: { answer: AiAnswer }) {
  const { coverage } = answer;
  return (
    <div className="space-y-3">
      <p className="whitespace-pre-line text-sm leading-6 text-slate-700">{answer.answer}</p>
      {!answer.grounded && <InlineAlert tone="warning">The course materials do not back this answer. Do not rely on it: ask the course trainer.</InlineAlert>}
      {answer.sources.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">Sources in this course</p>
          <ul className="flex flex-wrap gap-1.5">
            {answer.sources.map((source) => (
              <li key={source.id}>
                <Badge tone="info">
                  {source.moduleTitle} · {source.title}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      )}
      {coverage.truncated && (
        <p className="text-xs text-amber-700">
          This course has more text than the assistant can read at once: {coverage.includedMaterials} of {coverage.readableMaterials} readable materials were used, so the answer may miss something.
        </p>
      )}
    </div>
  );
}

/**
 * "Ask about this course": answers come from the course's own text materials only, with the sources
 * shown. Rendered only when the deployment has the optional AI features switched on.
 */
export function CourseAssistant({ courseId }: { courseId: string }) {
  const enabled = useAiEnabled();
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const nextId = useRef(1);
  const ask = useMutation({ mutationFn: (text: string) => askCourseAssistant(courseId, text) });

  if (!enabled) return null;

  const update = (id: number, patch: Partial<Turn>) => setTurns((current) => current.map((turn) => (turn.id === id ? { ...turn, ...patch } : turn)));

  const submit = (text: string) => {
    const trimmed = text.trim();
    if (trimmed.length < 3 || ask.isPending) return;
    const id = nextId.current;
    nextId.current += 1;
    setTurns((current) => [...current, { id, question: trimmed, state: 'pending' }]);
    setQuestion('');
    ask.mutate(trimmed, {
      onSuccess: (answer) => update(id, { state: 'done', answer }),
      onError: (error) => update(id, { state: 'error', error: errorMessage(error) }),
    });
  };
  const retry = (turn: Turn) => {
    setTurns((current) => current.filter((item) => item.id !== turn.id));
    submit(turn.question);
  };
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    submit(question);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) submit(question);
  };

  return (
    <Card
      title={
        <span className="inline-flex items-center gap-2">
          <Sparkles size={16} className="text-violet-500" aria-hidden /> Ask about this course
        </span>
      }
      description="Answers come only from this course's own materials, with the sources shown."
      action={<AiBadge />}
    >
      <div className="space-y-5">
        {turns.length === 0 && (
          <div className="flex flex-wrap gap-2" aria-label="Suggested questions">
            {SUGGESTIONS.map((suggestion) => (
              <Button key={suggestion} variant="light" size="sm" disabled={ask.isPending} onClick={() => submit(suggestion)}>
                {suggestion}
              </Button>
            ))}
          </div>
        )}

        {turns.length > 0 && (
          <ol className="space-y-5" aria-live="polite" aria-label="Questions and answers">
            {turns.map((turn) => (
              <li key={turn.id} className="space-y-2">
                <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm font-semibold text-navy">
                  <span className="sr-only">You asked: </span>
                  {turn.question}
                </p>
                {turn.state === 'pending' && <Spinner label="Reading the course materials" />}
                {turn.state === 'error' && (
                  <div className="space-y-2">
                    <InlineAlert tone="danger">{turn.error}</InlineAlert>
                    <Button variant="secondary" size="sm" onClick={() => retry(turn)}>
                      Try again
                    </Button>
                  </div>
                )}
                {turn.state === 'done' && turn.answer && <AnswerView answer={turn.answer} />}
              </li>
            ))}
          </ol>
        )}

        <form onSubmit={onSubmit} className="space-y-3" noValidate>
          <TextAreaField label="Your question" rows={2} maxLength={500} placeholder="Ask about something in this course" hint="Ctrl+Enter to send" value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={onKeyDown} />
          <Button type="submit" loading={ask.isPending} disabled={question.trim().length < 3} leftIcon={<Sparkles size={15} />}>
            Ask
          </Button>
        </form>
        <AiDisclosure>Your question and the text of this course&apos;s materials are sent to <AiProvider /> to write the answer. Nothing else about you is sent. Answers can contain mistakes: check important points in the materials.</AiDisclosure>
      </div>
    </Card>
  );
}
