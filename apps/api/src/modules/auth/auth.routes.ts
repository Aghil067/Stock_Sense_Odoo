import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import * as controller from './auth.controller.js';
import { loginSchema, registerSchema, requestResetSchema, resetPasswordSchema } from './auth.schemas.js';

export const authRouter = Router();
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false });

authRouter.post('/register', authLimiter, validateBody(registerSchema), controller.register);
authRouter.post('/login', authLimiter, validateBody(loginSchema), controller.login);
authRouter.post('/logout', controller.logout);
authRouter.post('/request-reset', authLimiter, validateBody(requestResetSchema), controller.requestReset);
authRouter.post('/reset-password', authLimiter, validateBody(resetPasswordSchema), controller.resetPassword);
authRouter.get('/me', requireAuth, controller.me);

