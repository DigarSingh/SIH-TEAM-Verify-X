import { hash, verify } from '@node-rs/argon2';
import { z } from 'zod';
import { env } from '../../config/env';

/**
 * Password policy shared by registration, password change and admin-created accounts.
 * Length matters more than composition, but government deployments usually also
 * require mixed character classes, so both are enforced.
 */
export const passwordSchema = z
  .string({ error: 'Password is required' })
  .min(10, 'Password must be at least 10 characters')
  .max(128, 'Password must be at most 128 characters')
  .refine((value) => /[a-z]/.test(value), 'Password must contain a lower-case letter')
  .refine((value) => /[A-Z]/.test(value), 'Password must contain an upper-case letter')
  .refine((value) => /\d/.test(value), 'Password must contain a digit')
  .refine((value) => /[^A-Za-z0-9]/.test(value), 'Password must contain a symbol');

const argon2Options = { memoryCost: env.ARGON2_MEMORY_KIB, timeCost: env.ARGON2_TIME_COST };

/** Argon2id hash (PHC string, includes salt and parameters). */
export const hashPassword = (password: string): Promise<string> => hash(password, argon2Options);

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    // A malformed stored hash must never authenticate anyone.
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * Burns roughly the same CPU time as a real verification. Used when the account
 * does not exist so response timing does not reveal which e-mails are registered.
 */
export async function verifyAgainstDummy(password: string): Promise<void> {
  dummyHash ??= hashPassword('capacity-connect-timing-equaliser');
  await verifyPassword(await dummyHash, password);
}
