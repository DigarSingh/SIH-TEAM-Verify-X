import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, CheckCircle2, ShieldCheck, UserRound } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { errorMessage, isApiError } from '../../api/client';
import { Button, InlineAlert, PasswordField, TextField } from '../../components/ui';
import { usePageTitle } from '../../hooks/misc';
import { useAuth } from '../../hooks/useAuth';
import { AuthLayout } from '../../layouts/AuthLayout';
import { HOME_PATH } from '../../utils/constants';
import { isInternalPath } from '../../utils/links';

const schema = z.object({
  email: z.string().trim().min(1, 'Enter your email address').email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});
type FormValues = z.infer<typeof schema>;

/** Demo shortcuts are shown in development, or when a deployment opts in with VITE_SHOW_DEMO_ACCOUNTS=true. */
const SHOW_DEMO = import.meta.env.DEV || import.meta.env['VITE_SHOW_DEMO_ACCOUNTS'] === 'true';
const DEMO_PASSWORD = (import.meta.env['VITE_DEMO_PASSWORD'] as string | undefined) ?? '';
const DEMO_ACCOUNTS = [
  { role: 'Trainee', email: 'trainee@imd.gov.in', icon: UserRound, tone: 'bg-sky/10 text-sky-deep' },
  { role: 'Trainer', email: 'trainer@imd.gov.in', icon: CheckCircle2, tone: 'bg-teal/10 text-teal-deep' },
  { role: 'Admin', email: 'admin@imd.gov.in', icon: ShieldCheck, tone: 'bg-violet-100 text-violet-700' },
];

export default function LoginPage() {
  usePageTitle('Sign in');
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [problem, setProblem] = useState<{ tone: 'warning' | 'danger' | 'info'; message: string } | null>(null);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } });

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setProblem(null);
    try {
      const user = await login(email, password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && isInternalPath(from) && from.startsWith(HOME_PATH[user.role]) ? from : HOME_PATH[user.role], { replace: true });
    } catch (error) {
      const code = isApiError(error) ? error.code : '';
      const tone = code === 'ACCOUNT_PENDING' ? 'info' : code.startsWith('ACCOUNT_') ? 'warning' : 'danger';
      setProblem({ tone, message: errorMessage(error, 'We could not sign you in. Please try again.') });
    }
  });

  const fillDemoAccount = (email: string) => {
    setValue('email', email, { shouldValidate: true });
    if (DEMO_PASSWORD) setValue('password', DEMO_PASSWORD, { shouldValidate: true });
    setProblem(null);
  };

  return (
    <AuthLayout>
      <div className="rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-deep">Welcome back</p>
        <h1 className="mt-2 font-display text-3xl font-bold text-navy">Sign in to Capacity Connect</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">Continue your journey from course completion to competency development.</p>

        <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
          <TextField label="Email" type="email" autoComplete="username" placeholder="you@imd.gov.in" error={errors.email?.message} {...register('email')} />
          <PasswordField label="Password" autoComplete="current-password" placeholder="••••••••••" error={errors.password?.message} {...register('password')} />
          {problem && <InlineAlert tone={problem.tone}>{problem.message}</InlineAlert>}
          <Button type="submit" size="lg" className="w-full" loading={isSubmitting} rightIcon={<ArrowRight size={17} />}>
            Sign in
          </Button>
          <p className="text-center text-xs text-slate-500">Forgotten your password? Ask your capacity building administrator to issue a temporary one.</p>
        </form>

        <p className="mt-5 text-center text-sm text-slate-500">
          New to the platform?{' '}
          <Link to="/register" className="font-bold text-sky-deep hover:text-navy">
            Request an account
          </Link>
        </p>

        {SHOW_DEMO && (
          <div className="mt-6 border-t border-slate-100 pt-5">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Demo access</p>
            <div className="space-y-2">
              {DEMO_ACCOUNTS.map(({ role, email, icon: Icon, tone }) => (
                <button key={email} type="button" onClick={() => fillDemoAccount(email)} className="flex w-full items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5 text-left hover:bg-mist">
                  <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${tone}`}>
                    <Icon size={15} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-bold text-navy">Use the {role.toLowerCase()} demo account</span>
                    <span className="block truncate text-[11px] text-slate-500">{email}</span>
                  </span>
                  <ArrowRight size={14} className="text-slate-500" aria-hidden />
                </button>
              ))}
            </div>
            {!DEMO_PASSWORD && <p className="mt-3 text-[11px] text-slate-500">Password: the SEED_DEMO_PASSWORD value from your .env file.</p>}
          </div>
        )}
      </div>
    </AuthLayout>
  );
}
