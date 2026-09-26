import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomInt } from 'node:crypto';
import { Role } from '@prisma/client';
import { env } from '../../config/env.js';
import { ApiError } from '../../lib/api-error.js';
import { prisma } from '../../lib/prisma.js';

const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  createdAt: true,
} as const;

export async function register(input: { name: string; email: string; password: string }) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new ApiError(409, 'EMAIL_IN_USE', 'An account already exists for this email.');

  const passwordHash = await bcrypt.hash(input.password, 12);
  return prisma.user.create({
    data: { name: input.name, email: input.email, passwordHash, role: Role.STAFF },
    select: publicUserSelect,
  });
}

export async function login(input: { email: string; password: string }) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  const isValid = user ? await bcrypt.compare(input.password, user.passwordHash) : false;
  if (!user || !isValid) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');

  const token = jwt.sign({ role: user.role }, env.JWT_SECRET, {
    subject: user.id,
    expiresIn: '8h',
  });

  const { passwordHash: _passwordHash, ...publicUser } = user;
  return { user: publicUser, token };
}

export async function requestPasswordReset(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return { message: 'If this account exists, a reset code has been created.' };

  await prisma.passwordResetOtp.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  const otp = String(randomInt(100000, 1000000));
  const otpHash = await bcrypt.hash(otp, 10);
  await prisma.passwordResetOtp.create({
    data: { userId: user.id, otpHash, expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
  });

  return {
    message: 'If this account exists, a reset code has been created.',
    ...(env.NODE_ENV === 'development' ? { developmentOtp: otp } : {}),
  };
}

export async function resetPassword(input: { email: string; otp: string; password: string }) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) throw new ApiError(400, 'INVALID_RESET_CODE', 'The reset code is invalid or expired.');

  const candidates = await prisma.passwordResetOtp.findMany({
    where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  const matching = await Promise.all(candidates.map(async (candidate) => ({
    candidate,
    matches: await bcrypt.compare(input.otp, candidate.otpHash),
  })));
  const reset = matching.find(({ matches }) => matches)?.candidate;
  if (!reset) throw new ApiError(400, 'INVALID_RESET_CODE', 'The reset code is invalid or expired.');

  const passwordHash = await bcrypt.hash(input.password, 12);
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
    prisma.passwordResetOtp.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
  ]);

  return { message: 'Password updated. You can now sign in.' };
}

export function getCurrentUser(userId: string) {
  return prisma.user.findUniqueOrThrow({ where: { id: userId }, select: publicUserSelect });
}

