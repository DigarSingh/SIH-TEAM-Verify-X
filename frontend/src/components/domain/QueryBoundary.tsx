import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ErrorState, PageLoading } from '../ui';

interface QueryBoundaryProps<T> {
  query: UseQueryResult<T>;
  children: (data: T) => ReactNode;
  /** Custom placeholder while loading (defaults to skeleton cards). */
  loading?: ReactNode;
  errorTitle?: string;
}

/**
 * Renders the loading, error and success states of a query in one place, so no
 * page can forget one of them. Background refetches keep showing the current data.
 */
export function QueryBoundary<T>({ query, children, loading, errorTitle }: QueryBoundaryProps<T>) {
  if (query.isLoading) return <>{loading ?? <PageLoading />}</>;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} title={errorTitle ?? 'We could not load this'} />;
  if (query.data === undefined) return null;
  return <>{children(query.data)}</>;
}
