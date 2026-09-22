import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus, UsersRound } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keys } from '../../api/keys';
import { RoleBadge, USER_STATUS_LABEL, UserStatusBadge } from '../../components/domain/badges';
import { ApproveDialog, CreateUserDialog, RejectDialog, TemporaryPasswordDialog } from '../../components/domain/UserDialogs';
import { Button, Card, DataTable, EmptyState, ErrorState, PageHeader, Pagination, SearchInput, SelectField, Skeleton, Td, Th } from '../../components/ui';
import { useDebounce, usePageTitle } from '../../hooks/misc';
import { fetchDepartments, fetchRoles, fetchUsers } from '../../services/admin';
import type { Role, User, UserStatus } from '../../types';
import { cn } from '../../utils/cn';
import { timeAgo } from '../../utils/format';

const STATUSES: UserStatus[] = ['ACTIVE', 'PENDING', 'SUSPENDED', 'REJECTED'];

export default function UsersPage() {
  usePageTitle('Users');
  const [params] = useSearchParams();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<Role | ''>('');
  const [status, setStatus] = useState<UserStatus | ''>((params.get('status') as UserStatus | null) ?? '');
  const [departmentId, setDepartmentId] = useState('');
  const [jobRoleId, setJobRoleId] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [approving, setApproving] = useState<User | null>(null);
  const [rejecting, setRejecting] = useState<User | null>(null);
  const [issued, setIssued] = useState<{ user: User; temporaryPassword: string } | null>(null);
  const debounced = useDebounce(search, 350);

  const filters = { q: debounced, role, status, departmentId, jobRoleId, page, pageSize: 15 };
  const query = useQuery({ queryKey: keys.users(filters), queryFn: () => fetchUsers(filters), placeholderData: keepPreviousData });
  const departments = useQuery({ queryKey: keys.departments(true), queryFn: () => fetchDepartments(true), staleTime: 5 * 60_000 });
  const roles = useQuery({ queryKey: keys.roles(true), queryFn: () => fetchRoles(true), staleTime: 5 * 60_000 });
  const counts = query.data?.meta.statusCounts;

  const reset = () => setPage(1);

  return (
    <div className="animate-fade-in">
      <PageHeader
        eyebrow="Administration"
        title="Users"
        description="Approve registrations, assign departments and job roles, and manage access. Every change is recorded in the audit log."
        actions={
          <Button onClick={() => setCreating(true)} leftIcon={<Plus size={16} />}>
            Add user
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="Filter by status">
        <button type="button" aria-pressed={status === ''} onClick={() => { setStatus(''); reset(); }} className={cn('rounded-full px-3.5 py-1.5 text-xs font-bold transition', status === '' ? 'bg-navy text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
          All {counts ? <span className="font-medium">{Object.values(counts).reduce((sum, value) => sum + value, 0)}</span> : null}
        </button>
        {STATUSES.map((item) => (
          <button key={item} type="button" aria-pressed={status === item} onClick={() => { setStatus(item); reset(); }} className={cn('rounded-full px-3.5 py-1.5 text-xs font-bold transition', status === item ? 'bg-navy text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
            {USER_STATUS_LABEL(item)} <span className="font-medium">{counts?.[item] ?? 0}</span>
          </button>
        ))}
      </div>

      <Card className="mb-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SearchInput className="xl:col-span-1" label="Search users" placeholder="Name, email or employee ID" value={search} onChange={(value) => { setSearch(value); reset(); }} />
          <SelectField label="Access role" value={role} onChange={(event) => { setRole(event.target.value as Role | ''); reset(); }}>
            <option value="">All roles</option>
            <option value="TRAINEE">Trainee</option>
            <option value="TRAINER">Trainer</option>
            <option value="ADMIN">Administrator</option>
          </SelectField>
          <SelectField label="Department" value={departmentId} onChange={(event) => { setDepartmentId(event.target.value); reset(); }}>
            <option value="">All departments</option>
            {(departments.data ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </SelectField>
          <SelectField label="Job role" value={jobRoleId} onChange={(event) => { setJobRoleId(event.target.value); reset(); }}>
            <option value="">All job roles</option>
            {(roles.data ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </SelectField>
        </div>
      </Card>

      {query.isLoading ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data && query.data.items.length === 0 ? (
        <EmptyState title="No users match" description="Try removing a filter." icon={<UsersRound size={18} />} />
      ) : query.data ? (
        <Card padded={false}>
          <DataTable caption="Users">
            <thead>
              <tr>
                <Th>User</Th>
                <Th>Role</Th>
                <Th>Status</Th>
                <Th>Department</Th>
                <Th>Job role</Th>
                <Th>Last sign-in</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {query.data.items.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50/60">
                  <Td>
                    <Link to={`/admin/users/${user.id}`} className="font-semibold text-navy hover:text-sky-deep">
                      {user.name}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {user.email}
                      {user.employeeId ? ` · ${user.employeeId}` : ''}
                    </p>
                  </Td>
                  <Td>
                    <RoleBadge role={user.role} />
                  </Td>
                  <Td>
                    <UserStatusBadge status={user.status} />
                  </Td>
                  <Td>{user.department?.name ?? <span className="text-slate-500">-</span>}</Td>
                  <Td>{user.jobRole?.name ?? <span className="text-slate-500">-</span>}</Td>
                  <Td className="whitespace-nowrap text-xs">{user.lastLoginAt ? timeAgo(user.lastLoginAt) : 'Never'}</Td>
                  <Td align="right">
                    {user.status === 'PENDING' ? (
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="success" onClick={() => setApproving(user)}>
                          Approve
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => setRejecting(user)}>
                          Reject
                        </Button>
                      </div>
                    ) : (
                      <Link to={`/admin/users/${user.id}`} className="text-xs font-bold text-sky-deep hover:text-navy">
                        Manage
                      </Link>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
          <Pagination meta={query.data.meta} onPage={setPage} label="User pages" />
        </Card>
      ) : null}

      {creating && <CreateUserDialog onClose={() => setCreating(false)} onCreated={(result) => result.temporaryPassword && setIssued({ user: result.user, temporaryPassword: result.temporaryPassword })} />}
      {approving && <ApproveDialog user={approving} onClose={() => setApproving(null)} />}
      {rejecting && <RejectDialog user={rejecting} onClose={() => setRejecting(null)} />}
      {issued && <TemporaryPasswordDialog name={issued.user.name} email={issued.user.email} password={issued.temporaryPassword} onClose={() => setIssued(null)} />}
    </div>
  );
}
