import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** When this value changes (for example the route), the boundary tries to render its children again. */
  resetKey?: string;
  /** Full-page presentation for the outermost boundary. */
  fullPage?: boolean;
}
interface State {
  error: Error | null;
}

/**
 * A render error in one page must never leave the user with a blank screen.
 * It shows what happened (without technical noise) and lets the user retry or reload.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled UI error:', error, info.componentStack);
  }

  override componentDidUpdate(previous: Props): void {
    if (this.state.error && previous.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className={this.props.fullPage ? 'flex min-h-screen items-center justify-center bg-cloud p-6' : 'py-16'}>
        <div className="mx-auto flex max-w-lg flex-col items-center text-center">
          <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600" aria-hidden>
            <AlertTriangle size={22} />
          </span>
          <h1 className="font-display text-2xl font-bold text-navy">This page hit a problem</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Something unexpected happened while showing this page. Your data is safe. You can try again, or reload the application. If it keeps happening, please tell the support team what you were doing.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button type="button" onClick={() => this.setState({ error: null })} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-navy hover:border-sky hover:text-sky-deep">
              <RefreshCw size={15} aria-hidden /> Try again
            </button>
            <button type="button" onClick={() => window.location.assign('/')} className="rounded-xl bg-navy px-4 py-2.5 text-sm font-semibold text-white hover:bg-ink">
              Go to my dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }
}
