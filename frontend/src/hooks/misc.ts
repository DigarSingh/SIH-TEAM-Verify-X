import { useMutation, useQuery, useQueryClient, type QueryKey, type UseMutationOptions } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { errorMessage } from '../api/client';
import { keys } from '../api/keys';
import { useToast } from '../components/ui';
import { fetchRegistrationOptions } from '../services/meta';

export function useDebounce<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

const useOptions = () => useQuery({ queryKey: keys.options, queryFn: fetchRegistrationOptions, staleTime: 5 * 60_000 });

/** Whether this deployment has the optional AI features switched on (the server has an AI key configured). */
export function useAiEnabled(): boolean {
  return useOptions().data?.features.ai ?? false;
}

/** Who receives the text the AI features send (OpenAI, Anthropic or the configured service), for the notice next to each feature. */
export function useAiProvider(): string {
  return useOptions().data?.features.aiProvider ?? 'the AI service';
}

/** Sets the browser tab title for the current page. */
export function usePageTitle(title: string): void {
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} | Capacity Connect`;
    return () => {
      document.title = previous;
    };
  }, [title]);
}

interface ApiMutationOptions<TData, TVariables> extends Omit<UseMutationOptions<TData, Error, TVariables>, 'onError'> {
  /** Message shown as a toast when the mutation succeeds. */
  successMessage?: string | ((data: TData, variables: TVariables) => string);
  /** Query keys refreshed after success. */
  invalidate?: QueryKey[];
  /** Custom error handler; when omitted a toast shows the server's message. */
  onError?: (error: Error) => void;
}

/**
 * `useMutation` with the app's conventions: success toast, precise cache invalidation
 * and a visible error message (nothing ever fails silently).
 */
export function useApiMutation<TData = unknown, TVariables = void>({ successMessage, invalidate, onError, onSuccess, ...options }: ApiMutationOptions<TData, TVariables>) {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation<TData, Error, TVariables>({
    ...options,
    onSuccess: async (data, variables, context) => {
      if (invalidate) await Promise.all(invalidate.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      if (successMessage) toast.success(typeof successMessage === 'function' ? successMessage(data, variables) : successMessage);
      // @ts-expect-error - forwards TanStack's positional arguments unchanged
      await onSuccess?.(data, variables, context);
    },
    onError: (error) => {
      if (onError) onError(error);
      else toast.error(errorMessage(error));
    },
  });
}
