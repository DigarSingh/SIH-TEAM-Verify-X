import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { keys } from '../../api/keys';
import { ARResult } from '../../components/domain/ARResult';
import { QueryBoundary } from '../../components/domain/QueryBoundary';
import { usePageTitle } from '../../hooks/misc';
import { fetchARAttempt } from '../../services/ar';

/** One finished AR practical, reopened from the attempt history or by a trainer. */
export default function ARAttemptPage() {
  const { moduleKey = '', attemptId = '' } = useParams();
  const query = useQuery({ queryKey: keys.arAttempt(attemptId), queryFn: () => fetchARAttempt(attemptId), enabled: Boolean(attemptId) });
  usePageTitle(query.data?.module.title ?? 'AR practical result');

  return (
    <div className="animate-fade-in space-y-6">
      <Link to={moduleKey ? `/trainee/ar-lab/${moduleKey}` : '/trainee/ar-lab'} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-sky-deep">
        <ArrowLeft size={14} aria-hidden /> Back to the lab
      </Link>
      <QueryBoundary query={query}>{(result) => <ARResult result={result} moduleKey={result.module.key} />}</QueryBoundary>
    </div>
  );
}
