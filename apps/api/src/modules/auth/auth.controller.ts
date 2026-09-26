import type { Request, Response } from 'express';
import { env } from '../../config/env.js';
import * as authService from './auth.service.js';

const cookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 8 * 60 * 60 * 1000,
  path: '/',
};

export async function register(request: Request, response: Response) {
  const user = await authService.register(request.body);
  response.status(201).json({ data: user });
}

export async function login(request: Request, response: Response) {
  const result = await authService.login(request.body);
  response.cookie('stocksense_session', result.token, cookieOptions);
  response.json({ data: result.user });
}

export function logout(_request: Request, response: Response) {
  response.clearCookie('stocksense_session', cookieOptions);
  response.status(204).send();
}

export async function requestReset(request: Request, response: Response) {
  response.json({ data: await authService.requestPasswordReset(request.body.email) });
}

export async function resetPassword(request: Request, response: Response) {
  response.json({ data: await authService.resetPassword(request.body) });
}

export async function me(request: Request, response: Response) {
  response.json({ data: await authService.getCurrentUser(request.user!.id) });
}

