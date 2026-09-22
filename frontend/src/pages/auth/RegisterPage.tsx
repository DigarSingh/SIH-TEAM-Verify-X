import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2, Clock } from 'lucide-react';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { api, errorMessage } from '../../api/client';
import { keys } from '../../api/keys';
import { PasswordChecklist } from '../../components/domain/PasswordChecklist';
import { Button, ButtonLink, InlineAlert, PasswordField, SelectField, TextField } from '../../components/ui';
import { usePageTitle } from '../../hooks/misc';
import { useAuth } from '../../hooks/useAuth';
import { AuthLayout } from '../../layouts/AuthLayout';
import type { RegistrationOptions } from '../../types';
import { HOME_PATH } from '../../utils/constants';
import { applyServerErrors, passwordIsValid } from '../../utils/forms';

const schema = z
  .object({
    name: z.string().trim().min(2, 'Enter your full name').max(100),
    email: z.string().trim().min(1, 'Enter your email address').email('Enter a valid email address'),
    password: z.string().refine(passwordIsValid, 'Password does not meet the requirements below'),
    confirmPassword: z.string().min(1, 'Confirm your password'),
    employeeId: z.string().trim().max(30).optional(),
    designation: z.string().trim().max(100).optional(),
    location: z.string().trim().max(100).optional(),
    departmentId: z.string().optional(),
    jobRoleId: z.string().optional(),
  })
  .refine((value) => value.password === value.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match' });
type FormValues = z.infer<typeof schema>;

const blank = (value: string | undefined) => (value && value.trim() ? value.trim() : undefined);

export default function RegisterPage() {
  usePageTitle('Request an account');
  const { register: registerUser } = useAuth();
  const navigate = useNavigate();
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<{ requiresApproval: boolean; email: string } | null>(null);
  const options = useQuery({ queryKey: keys.options, queryFn: async () => (await api.get<RegistrationOptions>('/meta/options')).data, staleTime: 5 * 60_000 });

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { name: '', email: '', password: '', confirmPassword: '' } });
  const password = useWatch({ control, name: 'password' }) ?? '';

  const onSubmit = handleSubmit(async (values) => {
    setGeneralError(null);
    try {
      const result = await registerUser({
        name: values.name,
        email: values.email,
        password: values.password,
        employeeId: blank(values.employeeId),
        designation: blank(values.designation),
        location: blank(values.location),
        departmentId: blank(values.departmentId),
        jobRoleId: blank(values.jobRoleId),
      });
      if (result.requiresApproval) setSubmitted({ requiresApproval: true, email: values.email });
      else navigate(HOME_PATH[result.user.role], { replace: true });
    } catch (error) {
      if (!applyServerErrors(error, setError, ['name', 'email', 'password', 'employeeId', 'designation', 'location', 'departmentId', 'jobRoleId'])) {
        setGeneralError(errorMessage(error, 'We could not create your account.'));
      }
    }
  });

  if (submitted) {
    return (
      <AuthLayout>
        <div className="rounded-3xl bg-white p-8 text-center shadow-2xl" role="status">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
            <CheckCircle2 size={28} aria-hidden />
          </div>
          <h1 className="mt-4 font-display text-2xl font-bold text-navy">Registration received</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Your account for <span className="font-semibold text-navy">{submitted.email}</span> is waiting for approval by the capacity building office.
          </p>
          <div className="mt-5 flex items-start gap-3 rounded-xl bg-amber-50 p-4 text-left text-sm text-amber-800">
            <Clock size={18} className="mt-0.5 shrink-0" aria-hidden />
            <p>You will be able to sign in as soon as an administrator approves the request. Nothing else is needed from you.</p>
          </div>
          <ButtonLink to="/login" size="lg" className="mt-6 w-full">
            Back to sign in
          </ButtonLink>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-deep">Get started</p>
        <h1 className="mt-2 font-display text-3xl font-bold text-navy">Request an account</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          {options.data?.registration.requiresApproval === false ? 'Your account will be active immediately.' : 'An administrator reviews every registration before it is activated.'}
        </p>

        <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
          <TextField label="Full name" autoComplete="name" required error={errors.name?.message} {...register('name')} />
          <TextField label="Official email" type="email" autoComplete="email" placeholder="you@imd.gov.in" required error={errors.email?.message} hint={options.data?.registration.allowedEmailDomains.length ? `Allowed domains: ${options.data.registration.allowedEmailDomains.join(', ')}` : undefined} {...register('email')} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField label="Employee ID" placeholder="IMD-TR-1234" error={errors.employeeId?.message} {...register('employeeId')} />
            <TextField label="Designation" placeholder="Scientific Assistant" error={errors.designation?.message} {...register('designation')} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SelectField label="Department" error={errors.departmentId?.message} {...register('departmentId')}>
              <option value="">Select department</option>
              {options.data?.departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </SelectField>
            <SelectField label="Job role" error={errors.jobRoleId?.message} hint="Determines your required competencies" {...register('jobRoleId')}>
              <option value="">Select role</option>
              {options.data?.roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </SelectField>
          </div>
          <TextField label="Duty station" placeholder="New Delhi" error={errors.location?.message} {...register('location')} />
          <div>
            <PasswordField label="Password" autoComplete="new-password" required error={errors.password?.message} {...register('password')} />
            <PasswordChecklist value={password} />
          </div>
          <PasswordField label="Confirm password" autoComplete="new-password" required error={errors.confirmPassword?.message} {...register('confirmPassword')} />
          {generalError && <InlineAlert tone="danger">{generalError}</InlineAlert>}
          <Button type="submit" size="lg" className="w-full" loading={isSubmitting} rightIcon={<ArrowRight size={17} />}>
            Create account
          </Button>
        </form>
        <p className="mt-5 text-center text-sm text-slate-500">
          Already have an account?{' '}
          <Link to="/login" className="font-bold text-sky-deep hover:text-navy">
            Sign in
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
