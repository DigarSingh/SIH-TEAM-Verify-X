import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { isApiError } from '../api/client';

/**
 * Copies field-level validation errors returned by the API (400 VALIDATION_ERROR)
 * onto the matching form fields. Returns true when at least one field was mapped,
 * so the caller can fall back to a general message otherwise.
 */
export function applyServerErrors<T extends FieldValues>(error: unknown, setError: UseFormSetError<T>, fields: readonly string[]): boolean {
  if (!isApiError(error) || error.fieldErrors.length === 0) return false;
  let mapped = false;
  for (const item of error.fieldErrors) {
    const root = item.field.split('.')[0] ?? '';
    if (fields.includes(root)) {
      setError(root as Path<T>, { type: 'server', message: item.message });
      mapped = true;
    }
  }
  return mapped;
}

/** Password policy shared by registration and password-change forms (mirrors the server). */
export const PASSWORD_RULES = [
  { id: 'length', label: 'At least 10 characters', test: (value: string) => value.length >= 10 },
  { id: 'lower', label: 'A lower-case letter', test: (value: string) => /[a-z]/.test(value) },
  { id: 'upper', label: 'An upper-case letter', test: (value: string) => /[A-Z]/.test(value) },
  { id: 'digit', label: 'A digit', test: (value: string) => /\d/.test(value) },
  { id: 'symbol', label: 'A symbol (for example ! @ # $)', test: (value: string) => /[^A-Za-z0-9]/.test(value) },
] as const;

export const passwordIsValid = (value: string): boolean => PASSWORD_RULES.every((rule) => rule.test(value));
