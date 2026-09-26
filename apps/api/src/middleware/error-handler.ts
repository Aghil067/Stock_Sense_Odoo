import type { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { ApiError } from '../lib/api-error.js';

export const notFoundHandler: RequestHandler = (_request, _response, next) => {
  next(new ApiError(404, 'NOT_FOUND', 'The requested resource was not found.'));
};

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof ZodError) {
    response.status(422).json({ error: { code: 'INVALID_INPUT', message: 'Check the supplied fields.', details: error.flatten() } });
    return;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
    response.status(409).json({ error: { code: 'CONCURRENT_CHANGE', message: 'Inventory changed during this request. Refresh and try again.' } });
    return;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
    response.status(404).json({ error: { code: 'NOT_FOUND', message: 'The requested record no longer exists.' } });
    return;
  }
  if (error instanceof ApiError) {
    response.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    });
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    const target = Array.isArray(error.meta?.target) ? (error.meta.target as string[]).join(', ') : String(error.meta?.target || '');
    let message = 'A record with that value already exists.';
    if (target.includes('reversalOfId')) {
      message = 'This movement was already reversed. Refresh the ledger to see the linked correction.';
    } else if (target.includes('sku')) {
      message = 'A product with this SKU already exists.';
    } else if (target.includes('code') && target.includes('warehouseId')) {
      message = 'A location with this code already exists in this warehouse.';
    } else if (target.includes('code')) {
      message = 'A warehouse with this code already exists.';
    } else if (target.includes('symbol')) {
      message = 'A unit of measure with this symbol already exists.';
    } else if (target.includes('name')) {
      message = 'A master data record with this name already exists.';
    }
    response.status(409).json({
      error: { code: 'DUPLICATE_RECORD', message },
    });
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
    response.status(409).json({
      error: { code: 'REFERENCED_RECORD', message: 'This record cannot be deleted because it is referenced by existing stock, operations, or history.' },
    });
    return;
  }

  console.error('Unhandled API error', error);
  response.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' },
  });
};

