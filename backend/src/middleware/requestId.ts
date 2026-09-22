import crypto from 'node:crypto';
import type { RequestHandler } from 'express';

const SAFE_ID = /^[A-Za-z0-9._-]{8,64}$/;

/** Assigns every request a correlation id (honouring a well-formed inbound `X-Request-Id`). */
export const requestId: RequestHandler = (req, res, next) => {
  const inbound = req.get('x-request-id');
  req.requestId = inbound && SAFE_ID.test(inbound) ? inbound : crypto.randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
};
