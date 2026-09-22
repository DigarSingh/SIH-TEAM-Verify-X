import { CheckCircle2, CloudOff, Download, HardDriveDownload, RefreshCw, Trash2, Wifi, WifiOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { errorMessage } from '../../api/client';
import { removePack, savePack, type PackSummary } from '../../offline/content';
import type { SyncState } from '../../offline/queue';
import { useSyncStatus } from '../../offline/useOffline';
import { Badge, Button, InlineAlert, Spinner, useToast } from '../ui';
import { cn } from '../../utils/cn';
import { formatFileSize, timeAgo } from '../../utils/format';

/**
 * The offline interface: the connection indicator in the header, the notice
 * shown when a page is a saved copy, and the button that downloads a course.
 *
 * All of it reads from the mutation queue, which is the one place that knows
 * whether work is waiting to reach the server.
 */

const STATE_STYLE: Record<SyncState, { tone: string; icon: typeof Wifi; label: string }> = {
  ONLINE: { tone: 'bg-emerald-50 text-emerald-700', icon: Wifi, label: 'Online' },
  OFFLINE: { tone: 'bg-amber-50 text-amber-700', icon: WifiOff, label: 'Offline' },
  SYNCING: { tone: 'bg-sky/10 text-sky-deep', icon: RefreshCw, label: 'Syncing' },
  'SYNC COMPLETE': { tone: 'bg-emerald-50 text-emerald-700', icon: CheckCircle2, label: 'Sync complete' },
};

/**
 * Connection status for the application header.
 *
 * Online with nothing pending is the normal state and says so quietly; anything
 * else is worth a learner's attention, so it stays visible and expands into the
 * list of changes still waiting.
 */
export function SyncStatusChip({ className }: { className?: string }) {
  const { state, pending, lastSyncedAt, syncNow } = useSyncStatus();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const waiting = pending.filter((entry) => !entry.failed).length;
  const failed = pending.filter((entry) => entry.failed).length;
  const style = STATE_STYLE[state];
  const Icon = style.icon;
  const quiet = state === 'ONLINE' && pending.length === 0;

  useEffect(() => {
    if (!open) return undefined;
    const close = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={`Connection: ${style.label}${pending.length > 0 ? `, ${pending.length} change${pending.length === 1 ? '' : 's'} waiting` : ''}`}
        className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-bold transition hover:opacity-80', style.tone, quiet && 'md:px-2')}
      >
        <Icon size={14} className={state === 'SYNCING' ? 'animate-spin' : undefined} aria-hidden />
        <span className={cn(quiet && 'sr-only md:not-sr-only')}>{state}</span>
        {pending.length > 0 && <span className="rounded-full bg-white/70 px-1.5 text-[10px]">{pending.length}</span>}
      </button>

      {open && (
        <div role="dialog" aria-label="Offline sync" className="absolute right-0 z-40 mt-2 w-80 rounded-2xl border border-slate-100 bg-white p-4 shadow-xl">
          <p className="font-display text-sm font-bold text-navy">{style.label}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {state === 'OFFLINE'
              ? 'You are working offline. Saved courses stay readable and your progress is kept on this device until the network returns.'
              : waiting > 0
                ? 'Changes made offline are being sent.'
                : 'Everything on this device has reached the server.'}
          </p>
          {lastSyncedAt && <p className="mt-1 text-[11px] text-slate-400">Last synced {timeAgo(lastSyncedAt)}</p>}

          {pending.length > 0 && (
            <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto">
              {pending.map((entry) => (
                <li key={entry.id} className="rounded-xl bg-slate-50 px-3 py-2">
                  <p className="text-xs font-semibold text-navy">{entry.label}</p>
                  <p className="text-[11px] text-slate-500">
                    {entry.failed ? 'Could not be sent' : 'Waiting to sync'} · {timeAgo(entry.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={syncNow} disabled={state === 'SYNCING' || waiting === 0} leftIcon={<RefreshCw size={13} />}>
              Sync now
            </Button>
            {failed > 0 && (
              <a href="/offline-library" className="text-xs font-semibold text-sky-deep hover:text-navy">
                Review {failed} problem{failed === 1 ? '' : 's'}
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Shown above content that may be a saved copy rather than the live version. */
export function OfflineNotice({ className }: { className?: string }) {
  const { state } = useSyncStatus();
  if (state !== 'OFFLINE') return null;
  return (
    <InlineAlert tone="warning" className={className}>
      <span className="flex items-center gap-2">
        <CloudOff size={15} aria-hidden />
        You are offline. This is the copy saved on this device, and anything you do now will sync when you reconnect.
      </span>
    </InlineAlert>
  );
}

/**
 * Downloads a course for offline use, or removes it again.
 *
 * The count of downloaded files is shown while it runs, because on a slow
 * connection a silent button looks broken.
 */
export function SaveOfflineButton({ courseId, saved, onChange, size = 'sm' }: { courseId: string; saved: PackSummary | null; onChange: () => void; size?: 'sm' | 'md' }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const { state } = useSyncStatus();

  const save = async () => {
    setBusy(true);
    setProgress(null);
    try {
      const pack = await savePack(courseId, (done, total) => setProgress({ done, total }));
      toast.success(pack.skipped.length > 0 ? `Saved for offline use. ${pack.skipped.length} large file(s) were left online.` : 'Saved for offline use.');
      onChange();
    } catch (error) {
      toast.error(errorMessage(error, 'Could not save this course for offline use.'));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await removePack(courseId);
      toast.info('Removed from this device.');
      onChange();
    } finally {
      setBusy(false);
    }
  };

  if (saved) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="success">
          <HardDriveDownload size={12} aria-hidden /> Saved offline
        </Badge>
        <span className="text-[11px] text-slate-500">
          {saved.bytes > 0 ? `${formatFileSize(saved.bytes)} · ` : ''}
          {timeAgo(saved.savedAt)}
        </span>
        <Button size="sm" variant="ghost" loading={busy} onClick={remove} leftIcon={<Trash2 size={13} />}>
          Remove
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size={size} variant="secondary" loading={busy} disabled={state === 'OFFLINE'} onClick={save} leftIcon={<Download size={14} />}>
        {busy ? 'Saving…' : 'Save for offline'}
      </Button>
      {progress && progress.total > 0 && (
        <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
          <Spinner label="" className="[&>span:last-child]:sr-only" /> {progress.done} of {progress.total} files
        </span>
      )}
      {state === 'OFFLINE' && <span className="text-[11px] text-slate-500">Reconnect to download this course.</span>}
    </div>
  );
}
