import { useQuery } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import { useEffect, useState } from 'react';
import { keys } from '../../api/keys';
import { useApiMutation } from '../../hooks/misc';
import { fetchCourseFeedback, submitCourseFeedback } from '../../services/learner';
import { cn } from '../../utils/cn';
import { timeAgo } from '../../utils/format';
import { Avatar, Button, Card, ErrorState, Pagination, Skeleton, Stars, TextAreaField } from '../ui';

/** 1-5 star picker exposed to assistive technology as a radio group. */
function StarInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-bold text-slate-600" id={`star-${label}`}>
        {label}
      </p>
      <div role="radiogroup" aria-labelledby={`star-${label}`} className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={value === star}
            aria-label={`${star} star${star === 1 ? '' : 's'}`}
            onClick={() => onChange(star)}
            className="rounded-md p-0.5 transition hover:scale-110"
          >
            <Star size={24} className={cn(star <= value ? 'fill-amber-400 text-amber-400' : 'text-slate-300')} aria-hidden />
          </button>
        ))}
      </div>
    </div>
  );
}

/** Ratings summary, learner comments and (for enrolled learners) the review form. */
export function CourseFeedback({ courseId, canReview }: { courseId: string; canReview: boolean }) {
  const [page, setPage] = useState(1);
  const query = useQuery({ queryKey: keys.courseFeedback(courseId, page), queryFn: () => fetchCourseFeedback(courseId, page) });

  const [rating, setRating] = useState(0);
  const [trainerRating, setTrainerRating] = useState(0);
  const [comment, setComment] = useState('');
  const mine = query.data?.meta.mine ?? null;

  // Pre-fill the form with the learner's existing review so it can be edited.
  useEffect(() => {
    if (mine) {
      setRating(mine.rating);
      setTrainerRating(mine.trainerRating ?? 0);
      setComment(mine.comment ?? '');
    }
  }, [mine]);

  const submit = useApiMutation({
    mutationFn: () => submitCourseFeedback(courseId, { rating, ...(trainerRating > 0 ? { trainerRating } : {}), ...(comment.trim() ? { comment: comment.trim() } : {}) }),
    successMessage: 'Thank you. Your feedback was saved.',
    invalidate: [keys.coursesAll],
  });

  if (query.isLoading) return <Skeleton className="h-48" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} title="We could not load the feedback" />;
  const data = query.data;
  if (!data) return null;
  const { summary } = data.meta;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="min-w-0 lg:col-span-2">
        <div className="flex flex-wrap items-center gap-6 rounded-2xl bg-slate-50 p-5">
          {summary.count === 0 ? (
            <p className="text-sm text-slate-500">No learner has reviewed this course yet.</p>
          ) : (
            <>
              <div className="text-center">
                <p className="font-display text-4xl font-bold text-navy">{summary.averageRating.toFixed(1)}</p>
                <Stars value={summary.averageRating} size={16} />
                <p className="mt-1 text-xs text-slate-500">{summary.count} review{summary.count === 1 ? '' : 's'}</p>
              </div>
              <ul className="min-w-[200px] flex-1 space-y-1.5" aria-label="Rating distribution">
                {[...summary.distribution].sort((a, b) => b.rating - a.rating).map((row) => (
                  <li key={row.rating} className="flex items-center gap-2 text-xs">
                    <span className="w-8 shrink-0 font-semibold text-slate-500">{row.rating} ★</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
                      <span className="block h-full rounded-full bg-amber-400" style={{ width: `${summary.count ? (row.count / summary.count) * 100 : 0}%` }} />
                    </span>
                    <span className="w-6 text-right text-slate-500">{row.count}</span>
                  </li>
                ))}
              </ul>
              {summary.averageTrainerRating > 0 && (
                <div className="text-center">
                  <p className="font-display text-2xl font-bold text-navy">{summary.averageTrainerRating.toFixed(1)}</p>
                  <p className="text-xs text-slate-500">Trainer rating</p>
                </div>
              )}
            </>
          )}
        </div>

        {data.items.length > 0 && (
          <Card padded={false} className="mt-4">
            <ul className="divide-y divide-slate-100">
              {data.items.map((item) => (
                <li key={item.id} className="flex gap-3 p-4">
                  <Avatar name={item.author.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-sm font-bold text-navy">{item.author.name}</span>
                      <Stars value={item.rating} size={12} />
                      <span className="text-xs text-slate-500">{timeAgo(item.updatedAt)}</span>
                    </div>
                    {item.author.department && <p className="text-xs text-slate-500">{item.author.department}</p>}
                    {item.comment && <p className="mt-1.5 text-sm leading-6 text-slate-600">{item.comment}</p>}
                  </div>
                </li>
              ))}
            </ul>
            <Pagination meta={data.meta} onPage={setPage} label="Review pages" />
          </Card>
        )}
      </div>

      <div>
        {canReview ? (
          <Card title={mine ? 'Update your review' : 'Rate this course'} description="Your feedback helps trainers improve the course.">
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (rating > 0) submit.mutate();
              }}
            >
              <StarInput label="Course" value={rating} onChange={setRating} />
              <StarInput label="Trainer (optional)" value={trainerRating} onChange={setTrainerRating} />
              <TextAreaField label="Comment (optional)" rows={4} maxLength={1000} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="What worked well? What could be better?" />
              <Button type="submit" loading={submit.isPending} disabled={rating === 0} className="w-full">
                {mine ? 'Update review' : 'Submit review'}
              </Button>
              {rating === 0 && <p className="text-xs text-slate-500">Choose a star rating to submit.</p>}
            </form>
          </Card>
        ) : (
          <Card title="Reviews">
            <p className="text-sm text-slate-500">Learners who are enrolled in this course can rate it.</p>
          </Card>
        )}
      </div>
    </div>
  );
}
