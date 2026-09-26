import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { authRouter } from './modules/auth/auth.routes.js';

export const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
app.use(express.json({ limit: '200kb' }));
app.use(cookieParser());

app.get('/api/health', (_request, response) => response.json({ data: { status: 'ok' } }));
app.use('/api/auth', authRouter);

app.use(notFoundHandler);
app.use(errorHandler);

