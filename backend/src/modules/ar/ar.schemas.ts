import { z } from 'zod';
import { uuid } from '../../lib/schemas';

/**
 * What the browser is allowed to send about an AR practical.
 *
 * Note what is absent: no score, no "correct", no competency. The client sends
 * which component the trainee tapped and how long they took; everything that
 * decides an outcome is worked out on the server from the database.
 */

export const startAttemptSchema = z.strictObject({
  /** Optional: a refresher started from a recommendation records where it came from. */
  source: z.enum(['LAB', 'REFRESHER_RECOMMENDATION']).optional(),
});

export const submitAttemptSchema = z.strictObject({
  attemptId: uuid,
  responses: z
    .array(
      z.strictObject({
        taskId: uuid,
        /** Null when the trainee skipped the task; it then scores zero. */
        selectedComponentId: uuid.nullable(),
        /** How long this task took, for the "hardest tasks" analysis. Advisory only. */
        timeMs: z.number().int().min(0).max(3_600_000).optional(),
      }),
    )
    .max(50),
  /** How many hints were opened during guided training. Reported, never scored. */
  hintsUsed: z.number().int().min(0).max(200).optional(),
  /**
   * Client-generated key that makes submission safe to retry. A phone that
   * loses the network mid-submit sends the same key again and gets the original
   * result back rather than a second attempt and a second competency update.
   */
  idempotencyKey: z.string().trim().min(8).max(100).optional(),
});

export type SubmitAttemptInput = z.infer<typeof submitAttemptSchema>;

export const moduleListQuery = z.object({
  competencyId: uuid.optional(),
  kind: z.enum(['FULL_LAB', 'REFRESHER']).optional(),
  includeUnpublished: z.coerce.boolean().optional(),
});

export const attemptListQuery = z.object({
  arModuleId: uuid.optional(),
  userId: uuid.optional(),
});
