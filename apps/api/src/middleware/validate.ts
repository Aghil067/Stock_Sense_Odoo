import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';
import { ApiError } from '../lib/api-error.js';

export function validateBody(schema: ZodType) {
  return (request: Request, _response: Response, next: NextFunction) => {
    const parsed = schema.safeParse(request.body);

    if (!parsed.success) {
      next(new ApiError(422, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', parsed.error.flatten()));
      return;
    }

    request.body = parsed.data;
    next();
  };
}

