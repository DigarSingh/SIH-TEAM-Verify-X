import { useMutation } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { errorMessage } from '../../api/client';
import { useAiEnabled } from '../../hooks/misc';
import { searchCoursesInPlainLanguage } from '../../services/ai';
import type { AiSearchResult } from '../../types';
import { Badge, Button, Card, EmptyState, InlineAlert, TextField } from '../ui';
import { AiDisclosure, AiProvider } from './AiParts';
import { CourseCard } from './CourseCard';

function Result({ result, onClear }: { result: AiSearchResult; onClear: () => void }) {
  const understood = result.interpretation.length > 0;
  return (
    <div className="mt-5 space-y-4 border-t border-slate-100 pt-5" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
            {result.method === 'ai' ? 'Understood with the AI service as' : 'Understood by keyword matching as'}
          </p>
          {understood ? (
            <ul className="flex flex-wrap gap-1.5">
              {result.interpretation.map((part) => (
                <li key={part}>
                  <Badge tone="info">{part}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-600">Nothing specific was recognised.</p>
          )}
          {result.explanation && <p className="mt-2 text-sm italic text-slate-500">{result.explanation}</p>}
        </div>
        <Button variant="ghost" size="sm" onClick={onClear}>
          Clear
        </Button>
      </div>

      {!understood ? (
        <InlineAlert tone="info">Try naming a competency, a level (beginner, intermediate, advanced) or a maximum duration, for example “advanced radar course under 3 hours”.</InlineAlert>
      ) : result.courses.length === 0 ? (
        <EmptyState title="No published course fits all of that" description="Try different words, a longer time limit, another level or fewer conditions." />
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {result.courses.map((course) => (
            <CourseCard key={course.id} course={course} role="TRAINEE" />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * "Describe what you need": a request in ordinary words becomes catalogue filters that the user can see and
 * check. The results always come from the real catalogue. With no AI service configured, a built-in
 * keyword interpreter is used instead, so this works everywhere.
 */
export function PlainLanguageSearch() {
  const aiEnabled = useAiEnabled();
  const [text, setText] = useState('');
  const search = useMutation({ mutationFn: searchCoursesInPlainLanguage });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (text.trim().length >= 2) search.mutate(text.trim());
  };

  return (
    <Card
      className="mb-6"
      title={
        <span className="inline-flex items-center gap-2">
          <Sparkles size={16} className="text-violet-500" aria-hidden /> Describe what you need
        </span>
      }
      description="Say it in your own words: a topic, a level and how much time you have."
    >
      <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end" noValidate>
        <TextField wrapperClassName="flex-1" label="What do you want to learn?" maxLength={200} placeholder="e.g. advanced radar course under 3 hours" value={text} onChange={(event) => setText(event.target.value)} />
        <Button type="submit" loading={search.isPending} disabled={text.trim().length < 2} leftIcon={<Sparkles size={15} />}>
          Find courses
        </Button>
      </form>
      {search.isError && (
        <InlineAlert tone="danger" className="mt-4">
          {errorMessage(search.error)}
        </InlineAlert>
      )}
      {search.data && <Result result={search.data} onClear={() => search.reset()} />}
      {aiEnabled && (
        <div className="mt-4">
          <AiDisclosure>The words you type here are sent to <AiProvider /> to turn them into filters. Only filters come back: the courses shown are always the ones in your catalog.</AiDisclosure>
        </div>
      )}
    </Card>
  );
}
