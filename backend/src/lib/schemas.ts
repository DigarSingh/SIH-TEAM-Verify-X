import { z } from 'zod';

/**
 * Reusable Zod building blocks. Every request body/query is validated with
 * strict object schemas, which also blocks mass-assignment of unexpected fields.
 */

export const uuid = z.string().uuid('Must be a valid id');

export const emailSchema = z
  .string({ error: 'Email is required' })
  .trim()
  .toLowerCase()
  .max(254, 'Email is too long')
  .email('Enter a valid email address');

/** Trimmed text; blank strings are treated as "not provided". */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be at most ${max} characters`)
    .optional()
    .transform((value) => (value ? value : undefined));

/** Like `optionalText` but the value may also be explicitly cleared with null. */
export const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be at most ${max} characters`)
    .nullable()
    .optional()
    .transform((value) => (value === undefined ? undefined : value === null || value === '' ? null : value));

export const requiredText = (min: number, max: number, label = 'Value') =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(min, `${label} must be at least ${min} character${min === 1 ? '' : 's'}`)
    .max(max, `${label} must be at most ${max} characters`);

/** Competency level or percentage, integer 0..100. */
export const level = z.number({ error: 'Must be a number' }).int('Must be a whole number').min(0, 'Minimum is 0').max(100, 'Maximum is 100');

/** Rating on a 1..5 scale. */
export const rating = z.number({ error: 'Rating is required' }).int().min(1, 'Minimum rating is 1').max(5, 'Maximum rating is 5');

/** ISO-8601 date or date-time string converted to a Date. */
export const isoDate = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Must be a valid date')
  .transform((value) => new Date(value));

export const nullableIsoDate = isoDate.nullable().optional();

/** Comma-free code such as `RADAR` used for departments, roles and competencies. */
export const codeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9_-]{1,29}$/, 'Code must be 2-30 characters: letters, digits, "_" or "-"');

export const searchQuery = z
  .string()
  .trim()
  .max(100)
  .optional()
  .transform((value) => (value ? value : undefined));
