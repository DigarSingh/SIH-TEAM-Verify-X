/**
 * Application error type. Every error that should reach the client with a
 * specific status/code is thrown as an AppError; anything else is treated as an
 * unexpected 500 by the error handler (details are logged, never returned).
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (code: string, message: string, details?: unknown) => new AppError(400, code, message, details);
export const unauthorized = (code = 'UNAUTHENTICATED', message = 'Authentication required') => new AppError(401, code, message);
export const forbidden = (code = 'FORBIDDEN', message = 'You do not have permission to perform this action') =>
  new AppError(403, code, message);
export const notFound = (code: string, message: string) => new AppError(404, code, message);
export const conflict = (code: string, message: string, details?: unknown) => new AppError(409, code, message, details);
export const unprocessable = (code: string, message: string, details?: unknown) => new AppError(422, code, message, details);
