import { Eye, EyeOff, Search, X } from 'lucide-react';
import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '../../utils/cn';

const controlBase =
  'w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-navy outline-none transition placeholder:text-slate-500 focus:border-sky focus:ring-4 focus:ring-sky/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400';

interface FieldProps {
  label: string;
  htmlFor?: string;
  error?: string | undefined;
  hint?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

/** Label + control + hint/error. The error is announced to assistive technology. */
export function Field({ label, htmlFor, error, hint, required, children, className }: FieldProps) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-bold text-slate-600">
        {label}
        {required && (
          <span className="ml-0.5 text-orange-700" aria-hidden>
            *
          </span>
        )}
      </label>
      {children}
      {hint && !error && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
      {error && (
        <p role="alert" className="mt-1.5 text-xs font-semibold text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

interface ControlProps {
  label: string;
  error?: string | undefined;
  hint?: ReactNode;
  wrapperClassName?: string;
}

export const TextField = forwardRef<HTMLInputElement, ControlProps & InputHTMLAttributes<HTMLInputElement>>(function TextField(
  { label, error, hint, wrapperClassName, className, id, required, ...rest },
  ref,
) {
  const generated = useId();
  const inputId = id ?? generated;
  return (
    <Field label={label} htmlFor={inputId} error={error} hint={hint} required={required} className={wrapperClassName}>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={error ? `${inputId}-error` : undefined}
        required={required}
        className={cn(controlBase, error ? 'border-red-300' : 'border-slate-200', className)}
        {...rest}
      />
    </Field>
  );
});

export const PasswordField = forwardRef<HTMLInputElement, ControlProps & InputHTMLAttributes<HTMLInputElement>>(function PasswordField(
  { label, error, hint, wrapperClassName, className, id, required, ...rest },
  ref,
) {
  const generated = useId();
  const inputId = id ?? generated;
  const [visible, setVisible] = useState(false);
  return (
    <Field label={label} htmlFor={inputId} error={error} hint={hint} required={required} className={wrapperClassName}>
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          type={visible ? 'text' : 'password'}
          aria-invalid={Boolean(error) || undefined}
          required={required}
          className={cn(controlBase, 'pr-11', error ? 'border-red-300' : 'border-slate-200', className)}
          {...rest}
        />
        <button
          type="button"
          onClick={() => setVisible((value) => !value)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-500 hover:text-navy"
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </Field>
  );
});

export const SelectField = forwardRef<HTMLSelectElement, ControlProps & SelectHTMLAttributes<HTMLSelectElement>>(function SelectField(
  { label, error, hint, wrapperClassName, className, id, required, children, ...rest },
  ref,
) {
  const generated = useId();
  const selectId = id ?? generated;
  return (
    <Field label={label} htmlFor={selectId} error={error} hint={hint} required={required} className={wrapperClassName}>
      <select ref={ref} id={selectId} aria-invalid={Boolean(error) || undefined} required={required} className={cn(controlBase, 'appearance-none bg-[length:16px] bg-[right_0.75rem_center] bg-no-repeat pr-9', error ? 'border-red-300' : 'border-slate-200', className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }} {...rest}>
        {children}
      </select>
    </Field>
  );
});

export const TextAreaField = forwardRef<HTMLTextAreaElement, ControlProps & TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextAreaField(
  { label, error, hint, wrapperClassName, className, id, required, rows = 4, ...rest },
  ref,
) {
  const generated = useId();
  const areaId = id ?? generated;
  return (
    <Field label={label} htmlFor={areaId} error={error} hint={hint} required={required} className={wrapperClassName}>
      <textarea ref={ref} id={areaId} rows={rows} aria-invalid={Boolean(error) || undefined} required={required} className={cn(controlBase, 'resize-y leading-6', error ? 'border-red-300' : 'border-slate-200', className)} {...rest} />
    </Field>
  );
});

export const CheckboxField = forwardRef<HTMLInputElement, { label: ReactNode; description?: ReactNode } & Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>>(function CheckboxField(
  { label, description, className, id, ...rest },
  ref,
) {
  const generated = useId();
  const inputId = id ?? generated;
  return (
    <label htmlFor={inputId} className={cn('flex cursor-pointer items-start gap-3 text-sm text-slate-600', className)}>
      <input ref={ref} id={inputId} type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-deep focus:ring-sky" {...rest} />
      <span>
        <span className="font-semibold text-navy">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-slate-500">{description}</span>}
      </span>
    </label>
  );
});

/** Debounce-friendly search box with a clear button. */
export function SearchInput({ value, onChange, placeholder = 'Search', label = 'Search', className }: { value: string; onChange: (value: string) => void; placeholder?: string; label?: string; className?: string }) {
  return (
    <div className={cn('relative', className)} role="search" aria-label={label}>
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden />
      <input
        type="search"
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={cn(controlBase, 'border-slate-200 pl-9 pr-9 [&::-webkit-search-cancel-button]:hidden')}
      />
      {value && (
        <button type="button" onClick={() => onChange('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-500 hover:text-navy">
          <X size={14} />
        </button>
      )}
    </div>
  );
}

/** On/off switch with a visible label. */
export function Toggle({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (value: boolean) => void; label: string; description?: string; disabled?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-semibold text-navy">{label}</p>
        {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn('relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50', checked ? 'bg-sky' : 'bg-slate-300')}
      >
        <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', checked ? 'left-[22px]' : 'left-0.5')} />
      </button>
    </div>
  );
}
