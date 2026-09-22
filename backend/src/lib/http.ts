import type { Request, Response } from 'express';
import { z } from 'zod';
import { badRequest } from './errors';

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Standard success envelope: `{ success: true, data, meta? }`. */
export function ok<T>(res: Response, data: T, meta?: Record<string, unknown>): void {
  res.status(200).json(meta ? { success: true, data, meta } : { success: true, data });
}

export function created<T>(res: Response, data: T): void {
  res.status(201).json({ success: true, data });
}

export function paginated<T>(res: Response, items: T[], page: number, pageSize: number, total: number, extraMeta: Record<string, unknown> = {}): void {
  const meta: PageMeta & Record<string, unknown> = {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    ...extraMeta,
  };
  res.status(200).json({ success: true, data: items, meta });
}

/** Shared pagination query parameters (`?page=1&pageSize=20`). */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type Pagination = z.infer<typeof paginationSchema>;

export const skipTake = ({ page, pageSize }: Pagination) => ({ skip: (page - 1) * pageSize, take: pageSize });

/** `?flag=true|false` query booleans. */
export const queryBool = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1')
  .optional();

export const idParamSchema = z.object({ id: z.string().uuid('Invalid id') });

/** Reads a required, validated route parameter (e.g. `:id`). */
export function uuidParam(req: Request, name: string): string {
  const raw = req.params[name];
  const parsed = z.string().uuid().safeParse(raw);
  if (!parsed.success) throw badRequest('INVALID_ID', `Invalid ${name}`);
  return parsed.data;
}

/** Client IP and user agent for audit logging. */
export function clientInfo(req: Request): { ip: string | null; userAgent: string | null } {
  return { ip: req.ip ?? null, userAgent: (req.get('user-agent') ?? '').slice(0, 300) || null };
}
