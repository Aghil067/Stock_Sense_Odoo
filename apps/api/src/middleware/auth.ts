import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { env } from '../config/env.js';
import { ApiError } from '../lib/api-error.js';
import { prisma } from '../lib/prisma.js';

type AuthToken = {
  sub: string;
  role: Role;
};

export function requireAuth(request: Request, _response: Response, next: NextFunction) {
  const token = request.cookies?.stocksense_session as string | undefined;

  if (!token) {
    next(new ApiError(401, 'AUTH_REQUIRED', 'Please sign in to continue.'));
    return;
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as AuthToken;
    if (typeof payload.sub !== 'string') throw new Error('Invalid session subject');
    // Resolve current privileges, rather than keeping a removed manager role for 8 hours.
    void prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true, role: true } }).then(user => {
      if (!user) { next(new ApiError(401, 'SESSION_EXPIRED', 'Your account is no longer available.')); return; }
      request.user = user;
      next();
    }).catch(next);
  } catch {
    next(new ApiError(401, 'SESSION_EXPIRED', 'Your session has expired. Please sign in again.'));
  }
}

export function requireRole(...allowedRoles: Role[]) {
  return (request: Request, _response: Response, next: NextFunction) => {
    if (!request.user || !allowedRoles.includes(request.user.role)) {
      next(new ApiError(403, 'FORBIDDEN', 'You do not have permission to perform this action.'));
      return;
    }
    next();
  };
}

