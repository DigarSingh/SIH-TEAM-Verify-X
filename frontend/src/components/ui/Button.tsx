import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { cn } from '../../utils/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'light' | 'success';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-navy text-white shadow-lg shadow-navy/15 hover:bg-ink',
  secondary: 'border border-slate-200 bg-white text-navy hover:border-sky hover:text-sky-deep',
  ghost: 'text-slate-500 hover:bg-mist hover:text-navy',
  danger: 'bg-red-50 text-red-700 hover:bg-red-100',
  light: 'bg-mist text-sky-deep hover:bg-sky/10',
  success: 'bg-emerald-700 text-white shadow-lg shadow-emerald-700/15 hover:bg-emerald-800',
};
const SIZES: Record<ButtonSize, string> = { sm: 'px-3 py-2 text-xs', md: 'px-4 py-2.5 text-sm', lg: 'px-5 py-3 text-sm' };

const base = 'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition disabled:cursor-not-allowed disabled:opacity-50';

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

interface ButtonProps extends CommonProps, Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  loading?: boolean;
  className?: string;
}

export function Button({ variant = 'primary', size = 'md', leftIcon, rightIcon, loading = false, className, disabled, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} disabled={disabled || loading} aria-busy={loading || undefined} className={cn(base, VARIANTS[variant], SIZES[size], className)} {...rest}>
      {loading ? <Loader2 size={16} className="animate-spin" aria-hidden /> : leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  );
}

interface ButtonLinkProps extends CommonProps, Omit<LinkProps, 'className'> {
  className?: string;
}

/** A React Router link that looks like a button (navigation, not an action). */
export function ButtonLink({ variant = 'primary', size = 'md', leftIcon, rightIcon, className, children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={cn(base, VARIANTS[variant], SIZES[size], className)} {...rest}>
      {leftIcon}
      {children}
      {rightIcon}
    </Link>
  );
}

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  label: string;
  className?: string;
  tone?: 'default' | 'danger';
}

/** Icon-only button: the accessible name is mandatory. */
export function IconButton({ label, className, tone = 'default', children, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn('inline-flex h-9 w-9 items-center justify-center rounded-lg transition disabled:opacity-50', tone === 'danger' ? 'text-red-500 hover:bg-red-50' : 'text-slate-500 hover:bg-slate-100 hover:text-navy', className)}
      {...rest}
    >
      {children}
    </button>
  );
}
