import { z } from 'zod';
import { emailSchema, optionalText, uuid } from '../../lib/schemas';
import { passwordSchema } from './password';

export const registerSchema = z.strictObject({
  name: z.string({ error: 'Name is required' }).trim().min(2, 'Name must be at least 2 characters').max(100),
  email: emailSchema,
  password: passwordSchema,
  employeeId: optionalText(30),
  phone: optionalText(20),
  designation: optionalText(100),
  location: optionalText(100),
  departmentId: uuid.optional(),
  jobRoleId: uuid.optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.strictObject({
  email: emailSchema,
  // Do not apply the password policy at login: only verify what was stored.
  password: z.string({ error: 'Password is required' }).min(1, 'Password is required').max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z
  .strictObject({
    currentPassword: z.string({ error: 'Current password is required' }).min(1, 'Current password is required'),
    newPassword: passwordSchema,
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    path: ['newPassword'],
    message: 'New password must be different from the current password',
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
