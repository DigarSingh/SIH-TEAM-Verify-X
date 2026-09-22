import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronDown, ScrollText } from 'lucide-react';
import { Fragment, useState } from 'react';
import { keys } from '../../api/keys';
import { RoleBadge } from '../../components/domain/badges';
import { Card, DataTable, EmptyState, ErrorState, PageHeader, Pagination, SearchInput, SelectField, Skeleton, Td, TextField, Th } from '../../components/ui';
import { useDebounce, usePageTitle } from '../../hooks/misc';
import { fetchAuditLogs } from '../../services/admin';
import type { AuditLogEntry } from '../../types';
import { cn } from '../../utils/cn';
import { humanizeAction } from '../../utils/constants';
import { formatDateTime } from '../../utils/format';

function Row({ entry }: { entry: AuditLogEntry }) {
  const [open, setOpen] = useState(false);
  const hasDetails = entry.metadata !== null && Object.keys(entry.metadata).length > 0;
  return (
    <Fragment>
      <tr className="hover:bg-slate-50/60">
        <Td className="whitespace-nowrap text-xs">{formatDateTime(entry.createdAt)}</Td>
        <Td>
          {entry.user ? (
            <>
              <span className="font-semibold text-navy">{entry.user.name}</span>
              <span className="ml-2 align-middle">
                <RoleBadge role={entry.user.role} />
              </span>
              <p className="text-xs text-slate-500">{entry.user.email}</p>
            </>
          ) : (
            <span className="text-slate-500">System</span>
          )}
        </Td>
        <Td className="font-semibold text-navy">{humanizeAction(entry.action)}</Td>
        <Td>
          {entry.entityType}
          {entry.entityId && <p className="max-w-[160px] truncate font-mono text-[11px] text-slate-500" title={entry.entityId}>{entry.entityId}</p>}
        </Td>
        <Td className="whitespace-nowrap font-mono text-xs">{entry.ipAddress ?? '-'}</Td>
        <Td align="right">
          {hasDetails && (
            <button type="button" aria-expanded={open} aria-label={`${open ? 'Hide' : 'Show'} details of ${humanizeAction(entry.action)}`} onClick={() => setOpen((value) => !value)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-navy">
              <ChevronDown size={16} className={cn('transition', open && 'rotate-180')} />
            </button>
          )}
        </Td>
      </tr>
      {open && hasDetails && (
        <tr className="bg-slate-50/70">
          <td colSpan={6} className="px-6 py-4">
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-white p-4 text-xs leading-5 text-slate-600 ring-1 ring-slate-100">{JSON.stringify(entry.metadata, null, 2)}</pre>
            {entry.userAgent && <p className="mt-2 text-[11px] text-slate-500">Client: {entry.userAgent}</p>}
          </td>
        </tr>
      )}
    </Fragment>
  );
}

export default function AuditLogsPage() {
  usePageTitle('Audit logs');
  const [search, setSearch] = useState('');
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const debounced = useDebounce(search, 350);

  // The end date is inclusive: include the whole day.
  const filters = { q: debounced, action, entityType, from, to: to ? `${to}T23:59:59` : '', page };
  const query = useQuery({ queryKey: keys.auditLogs(filters), queryFn: () => fetchAuditLogs(filters), placeholderData: keepPreviousData });
  const reset = () => setPage(1);

  return (
    <div className="animate-fade-in">
      <PageHeader eyebrow="Administration" title="Audit logs" description="A record of who did what and when: sign-ins, approvals, role changes, publishing, certificates and configuration. The application provides no way to edit or delete an entry." />
      <Card className="mb-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          <SearchInput className="xl:col-span-1" label="Search the audit log" placeholder="Action, person, entity…" value={search} onChange={(value) => { setSearch(value); reset(); }} />
          <SelectField label="Action" value={action} onChange={(event) => { setAction(event.target.value); reset(); }}>
            <option value="">All actions</option>
            {(query.data?.meta.actions ?? []).map((item) => (
              <option key={item} value={item}>
                {humanizeAction(item)}
              </option>
            ))}
          </SelectField>
          <SelectField label="Entity" value={entityType} onChange={(event) => { setEntityType(event.target.value); reset(); }}>
            <option value="">All entities</option>
            {(query.data?.meta.entityTypes ?? []).map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </SelectField>
          <TextField label="From" type="date" value={from} onChange={(event) => { setFrom(event.target.value); reset(); }} />
          <TextField label="To" type="date" value={to} onChange={(event) => { setTo(event.target.value); reset(); }} />
        </div>
      </Card>

      {query.isLoading ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data && query.data.items.length === 0 ? (
        <EmptyState title="No entries match" icon={<ScrollText size={18} />} />
      ) : query.data ? (
        <Card padded={false}>
          <DataTable caption="Audit log">
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Who</Th>
                <Th>Action</Th>
                <Th>Entity</Th>
                <Th>IP address</Th>
                <Th align="right">
                  <span className="sr-only">Details</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {query.data.items.map((entry) => (
                <Row key={entry.id} entry={entry} />
              ))}
            </tbody>
          </DataTable>
          <Pagination meta={query.data.meta} onPage={setPage} label="Audit log pages" />
        </Card>
      ) : null}
    </div>
  );
}
