import { KeyRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ChangePasswordForm } from '../../components/domain/ChangePasswordForm';
import { InlineAlert } from '../../components/ui';
import { usePageTitle } from '../../hooks/misc';
import { useAuth, useCurrentUser } from '../../hooks/useAuth';
import { AuthLayout } from '../../layouts/AuthLayout';
import { HOME_PATH } from '../../utils/constants';

/** Shown when an administrator issued a temporary password: nothing else is reachable until it is changed. */
export default function ChangePasswordPage() {
  usePageTitle('Change your password');
  const user = useCurrentUser();
  const { refreshUser, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <AuthLayout>
      <div className="rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-700" aria-hidden>
          <KeyRound size={22} />
        </div>
        <h1 className="mt-4 font-display text-2xl font-bold text-navy">Choose a new password</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          You are signed in with a temporary password. Set a password only you know to continue.
        </p>
        <InlineAlert tone="warning" className="mt-4">
          Use a password you have not used elsewhere. You will stay signed in on this device.
        </InlineAlert>
        <div className="mt-5">
          <ChangePasswordForm
            onChanged={async () => {
              await refreshUser();
              navigate(HOME_PATH[user.role], { replace: true });
            }}
          />
        </div>
        <button
          type="button"
          onClick={async () => {
            await logout();
            navigate('/login', { replace: true });
          }}
          className="mt-5 w-full text-center text-xs font-bold text-slate-500 hover:text-navy"
        >
          Sign out instead
        </button>
      </div>
    </AuthLayout>
  );
}
