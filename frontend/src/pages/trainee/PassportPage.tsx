import { useQuery } from '@tanstack/react-query';
import { keys } from '../../api/keys';
import { QueryBoundary } from '../../components/domain/QueryBoundary';
import { PassportView } from '../../components/domain/PassportView';
import { usePageTitle } from '../../hooks/misc';
import { fetchPassport } from '../../services/learner';

export default function PassportPage() {
  usePageTitle('Competency Passport');
  const query = useQuery({ queryKey: keys.passport, queryFn: fetchPassport });
  return <QueryBoundary query={query}>{(passport) => <PassportView passport={passport} viewer="self" />}</QueryBoundary>;
}
