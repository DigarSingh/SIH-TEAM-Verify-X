import type { ErrorRequestHandler, RequestHandler } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { logger } from '../config/logger';
import { AppError } from '../lib/errors';

interface HttpLikeError extends Error {
  status?: number;
  statusCode?: number;
  type?: string;
  expose?: boolean;
}

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError(404, 'ROUTE_NOT_FOUND', `Route ${req.method} ${req.originalUrl.split('?')[0]} not found`));
};

function fieldList(target: unknown): string {
  if (Array.isArray(target)) return target.join(', ');
  if (typeof target === 'string') return target;
  return 'value';
}

/** Translates any thrown error into the consistent `{ success:false, message, code }` envelope. */
export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, _next) => {
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'An unexpected error occurred. Please try again later.';
  let details: unknown;

  if (err instanceof AppError) {
    status = err.status;
    code = err.code;
    message = err.message;
    details = err.details;
  } else if (err instanceof ZodError) {
    status = 400;
    code = 'VALIDATION_ERROR';
    message = 'Validation failed';
    details = err.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message }));
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002':
        status = 409;
        code = 'DUPLICATE_ENTRY';
        message = `A record with the same ${fieldList(err.meta?.['target'])} already exists`;
        break;
      case 'P2025':
        status = 404;
        code = 'RECORD_NOT_FOUND';
        message = 'The requested record was not found';
        break;
      case 'P2003':
        status = 409;
        code = 'REFERENCE_CONSTRAINT';
        message = 'The operation conflicts with related records';
        break;
      case 'P2004':
        status = 422;
        code = 'CONSTRAINT_VIOLATION';
        message = 'The data violates a database integrity rule';
        break;
      case 'P2034':
        status = 409;
        code = 'WRITE_CONFLICT';
        message = 'The operation conflicted with a concurrent change. Please retry.';
        break;
      default:
        break;
    }
  } else if (err instanceof multer.MulterError) {
    status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    code = err.code === 'LIMIT_FILE_SIZE' ? 'FILE_TOO_LARGE' : 'UPLOAD_ERROR';
    message = err.code === 'LIMIT_FILE_SIZE' ? 'The uploaded file is too large' : `Upload failed: ${err.message}`;
  } else if (err instanceof Error) {
    const httpError = err as HttpLikeError;
    // body-parser and similar middleware attach a 4xx status for client mistakes.
    if (httpError.type === 'entity.parse.failed') {
      status = 400;
      code = 'INVALID_JSON';
      message = 'Request body is not valid JSON';
    } else if (httpError.type === 'entity.too.large') {
      status = 413;
      code = 'PAYLOAD_TOO_LARGE';
      message = 'Request body is too large';
    } else if ((httpError.status ?? httpError.statusCode ?? 500) < 500 && httpError.expose) {
      status = httpError.status ?? httpError.statusCode ?? 400;
      code = 'BAD_REQUEST';
      message = httpError.message;
    }
  }

  if (status >= 500) {
    logger.error({ err, requestId: req.requestId, method: req.method, url: req.originalUrl }, 'Unhandled error');
  }

  res.status(status).json({
    success: false,
    message,
    code,
    ...(details !== undefined ? { details } : {}),
    ...(status >= 500 ? { requestId: req.requestId } : {}),
  });
};
