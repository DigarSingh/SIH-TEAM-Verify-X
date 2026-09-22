import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Star } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { keys } from '../../api/keys';
import { PassportView } from '../../components/domain/PassportView';
import { QueryBoundary } from '../../components/domain/QueryBoundary';
import { ButtonLink } from '../../components/ui';
import { usePageTitle } from '../../hooks/misc';
import { fetchEmployeePassport } from '../../services/learner';

/** A trainee's Competency Passport as seen by a trainer who teaches them. */
export default function EmployeePassportPage() {
  const { userId = '' } = useParams();
  const query = useQuery({ queryKey: keys.employeePassport(userId), queryFn: () => fetchEmployeePassport(userId), enabled: Boolean(userId) });
  usePageTitle(query.data ? `${query.data.employee.name} - passport` : 'Trainee passport');
  return (
    <>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link to="/trainer/trainees" className="inline-flex items-center gap-1.5 text-xs font-bold text-sky-deep hover:text-navy">
          <ArrowLeft size={13} aria-hidden /> All trainees
        </Link>
        <ButtonLink to={`/trainer/evaluations?traineeId=${userId}`} variant="secondary" size="sm" leftIcon={<Star size={14} />}>
          Record an evaluation
        </ButtonLink>
      </div>
      <QueryBoundary query={query}>{(passport) => <PassportView passport={passport} viewer="other" />}</QueryBoundary>
    </>
  );
}
