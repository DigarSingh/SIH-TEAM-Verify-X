import { useAuth } from '../../hooks/useAuth';
import { usePageTitle } from '../../hooks/misc';
import { ButtonLink } from '../../components/ui';
import { HOME_PATH } from '../../utils/constants';

export default function NotFoundPage() {
  usePageTitle('Page not found');
  const { user } = useAuth();
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 py-24 text-center">
      <p className="font-display text-7xl font-bold text-navy/15">404</p>
      <h1 className="mt-2 font-display text-2xl font-bold text-navy">We could not find that page</h1>
      <p className="mt-2 max-w-md text-sm text-slate-500">The address may be mistyped, or the page may have moved.</p>
      <ButtonLink to={user ? HOME_PATH[user.role] : '/login'} className="mt-6">
        {user ? 'Go to my dashboard' : 'Go to sign in'}
      </ButtonLink>
    </div>
  );
}
