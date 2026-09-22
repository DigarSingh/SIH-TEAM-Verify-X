import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keys } from '../../api/keys';
import { Badge, Button, Card, DataTable, EmptyState, InlineAlert, PageHeader, Pagination, SelectField, Td, TextAreaField, Th } from '../../components/ui';
import { useApiMutation, usePageTitle } from '../../hooks/misc';
import { useCurrentUser } from '../../hooks/useAuth';
import { fetchCourse, fetchEmployeePassport } from '../../services/learner';
import { createEvaluation, fetchCourseTrainees, fetchEvaluations, fetchMyCourses, fetchRubric } from '../../services/trainer';
import type { EvaluationRatings } from '../../types';
import { cn } from '../../utils/cn';
import { formatDateTime } from '../../utils/format';
import { paths } from '../../utils/links';

const SCALE = ['Needs development', 'Below expectation', 'Meets expectation', 'Above expectation', 'Outstanding'];
const EMPTY_RATINGS: Record<keyof EvaluationRatings, number> = { technicalKnowledge: 0, practicalAbility: 0, participation: 0, applicationOfKnowledge: 0, overallCompetency: 0 };

function RatingScale({ label, weight, value, onChange }: { label: string; weight: number; value: number; onChange: (value: number) => void }) {
  const name = `rating-${label}`;
  return (
    <fieldset className="rounded-xl border border-slate-100 p-4">
      <legend className="px-1 text-sm font-bold text-navy">
        {label} <span className="ml-1 text-xs font-semibold text-slate-500">weight {Math.round(weight * 100)}%</span>
      </legend>
      <div className="mt-1 flex flex-wrap gap-2">
        {[1, 2, 3, 4, 5].map((rating) => (
          <label
            key={rating}
            title={SCALE[rating - 1]}
            className={cn('flex h-10 w-12 cursor-pointer items-center justify-center rounded-xl border-2 text-sm font-bold transition focus-within:ring-4 focus-within:ring-sky/15', value === rating ? 'border-sky bg-sky text-white' : 'border-slate-100 text-slate-600 hover:border-slate-300')}
          >
            <input type="radio" name={name} value={rating} checked={value === rating} onChange={() => onChange(rating)} className="sr-only" />
            {rating}
            <span className="sr-only"> - {SCALE[rating - 1]}</span>
          </label>
        ))}
        <span className="self-center text-xs text-slate-500">{value ? SCALE[value - 1] : 'Not rated'}</span>
      </div>
    </fieldset>
  );
}

function RecordForm() {
  const user = useCurrentUser();
  const [params] = useSearchParams();
  const prefillTrainee = params.get('traineeId') ?? '';
  const [courseId, setCourseId] = useState(params.get('courseId') ?? '');
  const [traineeId, setTraineeId] = useState(prefillTrainee);
  const [competencyId, setCompetencyId] = useState('');
  const [type, setType] = useState<'EVALUATION' | 'PRACTICAL'>('EVALUATION');
  const [ratings, setRatings] = useState(EMPTY_RATINGS);
  const [comments, setComments] = useState('');

  const courses = useQuery({ queryKey: keys.courses({ mine: true, evaluation: true }), queryFn: () => fetchMyCourses({ pageSize: 100 }) });
  const rubric = useQuery({ queryKey: keys.rubric, queryFn: fetchRubric, staleTime: 5 * 60_000 });
  const learners = useQuery({ queryKey: keys.courseTrainees(courseId, { evaluate: true }), queryFn: () => fetchCourseTrainees(courseId, { pageSize: 100 }), enabled: Boolean(courseId) });
  const course = useQuery({ queryKey: keys.course(courseId), queryFn: () => fetchCourse(courseId), enabled: Boolean(courseId) });
  const passport = useQuery({ queryKey: keys.employeePassport(prefillTrainee), queryFn: () => fetchEmployeePassport(prefillTrainee), enabled: Boolean(prefillTrainee) });

  // Arriving from a trainee's passport: pick the first of my courses that the trainee takes.
  useEffect(() => {
    if (courseId || !passport.data || !courses.data) return;
    const theirs = new Set([...passport.data.training.inProgress, ...passport.data.training.completed].map((item) => item.courseId));
    const match = courses.data.items.find((item) => theirs.has(item.id));
    if (match) setCourseId(match.id);
  }, [courseId, passport.data, courses.data]);

  const criteria = rubric.data ?? [];
  const complete = criteria.length > 0 && criteria.every((criterion) => ratings[criterion.key] > 0);
  const weighted = complete ? Math.round(criteria.reduce((sum, criterion) => sum + criterion.weight * ((ratings[criterion.key] / 5) * 100), 0) * 10) / 10 : null;
  const learnersOfCourse = learners.data?.items.filter((row) => row.status !== 'WITHDRAWN') ?? [];

  const save = useApiMutation({
    mutationFn: () => createEvaluation({ traineeId, courseId, ...(competencyId ? { competencyId } : {}), type, ...ratings, ...(comments.trim() ? { comments: comments.trim() } : {}) }),
    successMessage: 'Evaluation saved. It now counts as evidence for the trainee’s competency levels.',
    invalidate: [keys.evaluations(), keys.employeePassport(traineeId), keys.courseTrainees(courseId)],
    onSuccess: () => {
      setRatings(EMPTY_RATINGS);
      setComments('');
    },
  });

  return (
    <Card title="Record an evaluation" description="A weighted rubric turns your observation into evidence for the competency engine, so levels do not depend on multiple-choice results alone.">
      <form
        className="space-y-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (complete && traineeId && courseId) save.mutate();
        }}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <SelectField
            label="Course"
            required
            value={courseId}
            onChange={(event) => {
              setCourseId(event.target.value);
              setTraineeId('');
              setCompetencyId('');
            }}
          >
            <option value="">Choose a course…</option>
            {(courses.data?.items ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </SelectField>
          <SelectField label="Trainee" required value={traineeId} disabled={!courseId} onChange={(event) => setTraineeId(event.target.value)}>
            <option value="">{courseId ? 'Choose a trainee…' : 'Choose a course first'}</option>
            {learnersOfCourse.map((row) => (
              <option key={row.learner.id} value={row.learner.id}>
                {row.learner.name}
              </option>
            ))}
          </SelectField>
          <SelectField label="Competency (optional)" value={competencyId} disabled={!courseId} hint="Leave empty to apply the evaluation to every competency this course develops." onChange={(event) => setCompetencyId(event.target.value)}>
            <option value="">All competencies of the course</option>
            {(course.data?.competencies ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </SelectField>
          <SelectField label="Type" value={type} onChange={(event) => setType(event.target.value as 'EVALUATION' | 'PRACTICAL')}>
            <option value="EVALUATION">Trainer evaluation</option>
            <option value="PRACTICAL">Practical assessment</option>
          </SelectField>
        </div>

        <div className="space-y-3">
          {criteria.map((criterion) => (
            <RatingScale key={criterion.key} label={criterion.label} weight={criterion.weight} value={ratings[criterion.key]} onChange={(value) => setRatings((current) => ({ ...current, [criterion.key]: value }))} />
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-mist px-5 py-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Weighted score</p>
            <p className="font-display text-3xl font-bold text-navy">{weighted !== null ? `${weighted}%` : '-'}</p>
          </div>
          <p className="max-w-md text-xs leading-5 text-slate-600">Each rating (1-5) is converted to a percentage and combined using the weights shown above. This is the number sent to the competency engine.</p>
        </div>

        <TextAreaField label="Comments" rows={3} maxLength={1500} placeholder="What did the trainee do well? What should they work on?" value={comments} onChange={(event) => setComments(event.target.value)} />
        {user.role === 'TRAINER' && courses.data?.items.length === 0 && <InlineAlert tone="info">You do not own any course yet, so there is nobody to evaluate.</InlineAlert>}
        <Button type="submit" loading={save.isPending} disabled={!complete || !traineeId || !courseId}>
          Save evaluation
        </Button>
      </form>
    </Card>
  );
}

function History() {
  const user = useCurrentUser();
  const [page, setPage] = useState(1);
  const query = useQuery({ queryKey: keys.evaluations({ page }), queryFn: () => fetchEvaluations({ page }), placeholderData: keepPreviousData });
  return (
    <Card title="Evaluations you have recorded" padded={false}>
      {!query.data || query.data.items.length === 0 ? (
        <div className="p-5">
          <EmptyState title="No evaluations yet" description="Evaluations you record appear here and in each trainee’s Competency Passport." />
        </div>
      ) : (
        <>
          <DataTable caption="Evaluations">
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Trainee</Th>
                <Th>Course / competency</Th>
                <Th>Type</Th>
                <Th align="right">Score</Th>
              </tr>
            </thead>
            <tbody>
              {query.data.items.map((item) => (
                <tr key={item.id}>
                  <Td className="whitespace-nowrap text-xs">{formatDateTime(item.createdAt)}</Td>
                  <Td>
                    {item.trainee ? (
                      <Link to={paths.employee(user.role, item.trainee.id)} className="font-semibold text-navy hover:text-sky-deep">
                        {item.trainee.name}
                      </Link>
                    ) : (
                      '-'
                    )}
                    {item.comments && <p className="max-w-xs truncate text-xs text-slate-500" title={item.comments}>“{item.comments}”</p>}
                  </Td>
                  <Td>
                    {item.course?.title ?? '-'}
                    {item.competency && <p className="text-xs text-slate-500">{item.competency.name}</p>}
                  </Td>
                  <Td>
                    <Badge tone={item.type === 'PRACTICAL' ? 'purple' : 'info'}>{item.type === 'PRACTICAL' ? 'Practical' : 'Evaluation'}</Badge>
                  </Td>
                  <Td align="right">
                    <strong className="text-navy">{item.weightedScore}%</strong>
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
          <Pagination meta={query.data.meta} onPage={setPage} label="Evaluation pages" />
        </>
      )}
    </Card>
  );
}

export default function EvaluationsPage() {
  usePageTitle('Evaluations');
  return (
    <div className="animate-fade-in">
      <PageHeader eyebrow="Trainer workspace" title="Evaluations" description="Rate a trainee against a weighted rubric. Evaluations and practical assessments feed the competency engine alongside assessment scores." />
      <div className="space-y-8">
        <div className="max-w-4xl">
          <RecordForm />
        </div>
        <History />
      </div>
    </div>
  );
}
