import { CloudOff, Database, FileWarning, HardDriveDownload, RefreshCw, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listPacks, removePack, type PackSummary } from '../../offline/content';
import { discardMutation } from '../../offline/queue';
import { useSyncStatus } from '../../offline/useOffline';
import { hasIndexedDb } from '../../offline/db';
import { Badge, Button, Card, EmptyState, InlineAlert, PageHeader, SectionLabel, useConfirm, useToast } from '../../components/ui';
import { usePageTitle } from '../../hooks/misc';
import { formatDateTime, formatFileSize, timeAgo } from '../../utils/format';

/**
 * What this device is holding: the courses saved for offline use and any work
 * still waiting to reach the server. Both are the learner's to manage, so both
 * can be removed from here.
 */
export default function OfflineLibraryPage() {
  usePageTitle('Offline library');
  const toast = useToast();
  const confirm = useConfirm();
  const { state, pending, lastSyncedAt, syncNow } = useSyncStatus();
  const [packs, setPacks] = useState<PackSummary[] | null>(null);
  const [usedBytes, setUsedBytes] = useState<number | null>(null);

  const reload = () => {
    void listPacks().then(setPacks);
    void navigator.storage?.estimate?.().then((estimate) => setUsedBytes(estimate.usage ?? null));
  };
  useEffect(reload, []);

  const remove = async (pack: PackSummary) => {
    if (!(await confirm({ title: 'Remove this saved course?', message: `${pack.title} will no longer be readable offline. It stays available online.`, confirmLabel: 'Remove', tone: 'danger' }))) return;
    await removePack(pack.courseId);
    toast.info('Removed from this device.');
    reload();
  };

  const discard = async (id: string, label: string) => {
    if (!(await confirm({ title: 'Discard this change?', message: `"${label}" will not be sent. This cannot be undone.`, confirmLabel: 'Discard', tone: 'danger' }))) return;
    await discardMutation(id);
    toast.info('Change discarded.');
  };

  const waiting = pending.filter((entry) => !entry.failed);
  const failed = pending.filter((entry) => entry.failed);
  const totalBytes = (packs ?? []).reduce((total, pack) => total + pack.bytes, 0);

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        eyebrow="Works without a connection"
        title="Offline library"
        description="Courses saved on this device, and any progress still waiting to reach the server."
        actions={
          <Button variant="secondary" onClick={syncNow} disabled={state === 'SYNCING' || waiting.length === 0} leftIcon={<RefreshCw size={15} />}>
            Sync now
          </Button>
        }
      />

      {!hasIndexedDb() && <InlineAlert tone="warning">This browser cannot store courses offline. Private browsing windows usually block offline storage.</InlineAlert>}

      {state === 'OFFLINE' && (
        <InlineAlert tone="warning">
          <span className="flex items-center gap-2">
            <CloudOff size={15} aria-hidden /> You are offline. Saved courses below are fully readable.
          </span>
        </InlineAlert>
      )}

      <Card
        title="Waiting to sync"
        description={waiting.length === 0 && failed.length === 0 ? 'Nothing is waiting: everything on this device has reached the server.' : `${waiting.length} change${waiting.length === 1 ? '' : 's'} queued`}
        action={lastSyncedAt ? <span className="text-[11px] text-slate-500">Last synced {timeAgo(lastSyncedAt)}</span> : null}
      >
        {pending.length === 0 ? (
          <p className="text-sm text-slate-500">Work done offline appears here until it is sent. Nothing is lost if you close the app.</p>
        ) : (
          <ul className="space-y-2">
            {pending.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-navy">{entry.label}</p>
                  <p className="text-xs text-slate-500">
                    {formatDateTime(entry.createdAt)}
                    {entry.attempts > 0 && ` · ${entry.attempts} attempt${entry.attempts === 1 ? '' : 's'}`}
                    {entry.lastError && ` · ${entry.lastError}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {entry.failed ? (
                    <Badge tone="danger">
                      <FileWarning size={12} aria-hidden /> Not sent
                    </Badge>
                  ) : (
                    <Badge tone="info">Queued</Badge>
                  )}
                  {entry.failed && (
                    <Button size="sm" variant="ghost" onClick={() => discard(entry.id, entry.label)} leftIcon={<Trash2 size={13} />}>
                      Discard
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div>
        <SectionLabel
          action={
            <span className="flex items-center gap-2 text-[11px] text-slate-500">
              <Database size={13} aria-hidden />
              {/* `formatFileSize` is empty for zero by design, so say it in words instead. */}
              {totalBytes > 0 ? `${formatFileSize(totalBytes)} in saved files` : 'no files saved'}
              {usedBytes !== null && usedBytes > 0 && ` · ${formatFileSize(usedBytes)} total on this device`}
            </span>
          }
        >
          Saved courses
        </SectionLabel>

        {packs === null ? (
          <p className="text-sm text-slate-500">Reading this device…</p>
        ) : packs.length === 0 ? (
          <EmptyState
            title="No courses saved yet"
            description="Open a course you are enrolled in and choose 'Save for offline' to keep its modules, documents and videos on this device."
            icon={<HardDriveDownload size={18} />}
            action={
              <Link to="/trainee/my-courses" className="text-sm font-semibold text-sky-deep hover:text-navy">
                Go to my courses →
              </Link>
            }
          />
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {packs.map((pack) => (
              <li key={pack.courseId}>
                <Card>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link to={`/trainee/learn/${pack.courseId}`} className="font-display text-base font-bold text-navy hover:text-sky-deep">
                        {pack.title}
                      </Link>
                      <p className="mt-1 text-xs text-slate-500">
                        {pack.moduleCount} module{pack.moduleCount === 1 ? '' : 's'} · {pack.materialCount} material{pack.materialCount === 1 ? '' : 's'}
                        {pack.bytes > 0 ? ` · ${formatFileSize(pack.bytes)}` : ' · text only'}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-400">Saved {timeAgo(pack.savedAt)}</p>
                      {pack.skipped.length > 0 && <p className="mt-2 text-[11px] text-amber-700">Left online (too large): {pack.skipped.join(', ')}</p>}
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => remove(pack)} leftIcon={<Trash2 size={13} />}>
                      Remove
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Card title="What works offline" description="Deliberately limited to what can be trusted without a connection">
        <ul className="space-y-2 text-sm text-slate-600">
          <li>• Saved courses: modules, readings and downloaded documents and videos.</li>
          <li>• Marking modules complete, and course feedback: queued and sent when you reconnect.</li>
          <li>• Submitting an assessment you have already started: queued with a key that stops it being counted twice.</li>
          <li className="text-slate-500">• Starting a new assessment, certificates and workforce dashboards need a connection.</li>
        </ul>
        <p className="mt-4 text-xs text-slate-500">Everything saved here is removed from this device when you sign out.</p>
      </Card>
    </div>
  );
}
