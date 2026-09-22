import { CheckCircle2, Info, TriangleAlert, X, XCircle } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../utils/cn';
import { Button } from './Button';
import { IconButton } from './Button';

// ---------------------------------------------------------------------------------------------
// Focus trap shared by Modal and Drawer
// ---------------------------------------------------------------------------------------------

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function useDialogBehaviour(open: boolean, onClose: () => void, dismissible: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const node = ref.current;
    const focusables = () => (node ? Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)) : []);
    (focusables()[0] ?? node)?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dismissible) {
        event.stopPropagation();
        onClose();
      }
      if (event.key === 'Tab') {
        const items = focusables();
        if (items.length === 0) return;
        const first = items[0] as HTMLElement;
        const last = items[items.length - 1] as HTMLElement;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      previous?.focus?.();
    };
  }, [open, onClose, dismissible]);
  return ref;
}

interface ModalProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  dismissible?: boolean;
}

export function Modal({ open, title, description, onClose, children, footer, size = 'md', dismissible = true }: ModalProps) {
  const ref = useDialogBehaviour(open, onClose, dismissible);
  if (!open) return null;
  const widths = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-3xl', xl: 'max-w-5xl' };
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/50 p-4 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && dismissible && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className={cn('flex max-h-[90vh] w-full animate-fade-in flex-col rounded-2xl bg-white shadow-2xl outline-none', widths[size])}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="font-display text-lg font-bold text-navy">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
          </div>
          {dismissible && (
            <IconButton label="Close dialog" onClick={onClose}>
              <X size={18} />
            </IconButton>
          )}
        </div>
        <div className="overflow-y-auto p-6">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Drawer({ open, title, description, onClose, children, width = 'max-w-xl' }: { open: boolean; title: string; description?: string; onClose: () => void; children: ReactNode; width?: string }) {
  const ref = useDialogBehaviour(open, onClose, true);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end bg-navy/40 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside ref={ref} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className={cn('flex h-full w-full animate-slide-in flex-col bg-white shadow-2xl outline-none', width)}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div>
            <h2 className="font-display text-lg font-bold text-navy">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
          </div>
          <IconButton label="Close panel" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
      </aside>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------------------------
// Confirmation dialogs (promise based)
// ---------------------------------------------------------------------------------------------

export interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;
const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ options: ConfirmOptions; resolve: (value: boolean) => void } | null>(null);
  const confirm = useCallback<ConfirmFn>((options) => new Promise<boolean>((resolve) => setState({ options, resolve })), []);
  const close = (value: boolean) => {
    state?.resolve(value);
    setState(null);
  };
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={state !== null}
        title={state?.options.title ?? ''}
        size="sm"
        onClose={() => close(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => close(false)}>
              {state?.options.cancelLabel ?? 'Cancel'}
            </Button>
            <Button variant={state?.options.tone === 'danger' ? 'danger' : 'primary'} className={state?.options.tone === 'danger' ? '!bg-red-600 !text-white hover:!bg-red-700' : ''} onClick={() => close(true)}>
              {state?.options.confirmLabel ?? 'Confirm'}
            </Button>
          </>
        }
      >
        <div className="text-sm leading-6 text-slate-600">{state?.options.message}</div>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return confirm;
}

// ---------------------------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------------------------

type ToastTone = 'success' | 'error' | 'info' | 'warning';
interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}
interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  warning: (message: string) => void;
}
const ToastContext = createContext<ToastApi | null>(null);

const TOAST_ICON = { success: CheckCircle2, error: XCircle, info: Info, warning: TriangleAlert };
const TOAST_STYLE = {
  success: 'border-emerald-200 bg-white text-emerald-700',
  error: 'border-red-200 bg-white text-red-700',
  info: 'border-sky/30 bg-white text-sky-deep',
  warning: 'border-amber-200 bg-white text-amber-700',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counter = useRef(0);
  const dismiss = useCallback((id: number) => setToasts((current) => current.filter((toast) => toast.id !== id)), []);
  const push = useCallback(
    (tone: ToastTone, message: string) => {
      counter.current += 1;
      const id = counter.current;
      setToasts((current) => [...current.slice(-3), { id, tone, message }]);
      window.setTimeout(() => dismiss(id), tone === 'error' ? 8000 : 5000);
    },
    [dismiss],
  );
  const api = useMemo<ToastApi>(
    () => ({ success: (m) => push('success', m), error: (m) => push('error', m), info: (m) => push('info', m), warning: (m) => push('warning', m) }),
    [push],
  );
  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div aria-live="polite" aria-atomic="false" className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
          {toasts.map((toast) => {
            const Icon = TOAST_ICON[toast.tone];
            return (
              <div key={toast.id} role={toast.tone === 'error' ? 'alert' : 'status'} className={cn('pointer-events-auto flex animate-fade-in items-start gap-3 rounded-xl border px-4 py-3 shadow-lift', TOAST_STYLE[toast.tone])}>
                <Icon size={18} className="mt-0.5 shrink-0" aria-hidden />
                <p className="flex-1 text-sm font-semibold text-navy">{toast.message}</p>
                <button type="button" aria-label="Dismiss notification" onClick={() => dismiss(toast.id)} className="text-slate-500 hover:text-navy">
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const toast = useContext(ToastContext);
  if (!toast) throw new Error('useToast must be used inside <ToastProvider>');
  return toast;
}
