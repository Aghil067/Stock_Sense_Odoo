import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { operationRouter } from './modules/operations/operation.routes.js';
import { masterDataRouter, productRouter } from './modules/catalog/catalog.routes.js';
import { ledgerRouter } from './modules/ledger/ledger.routes.js';
import { dashboardRouter } from './modules/dashboard/dashboard.routes.js';
import { replenishmentRouter } from './modules/replenishment/replenishment.routes.js';
import { staffRouter } from './modules/staff/staff.routes.js';
import { aiRouter } from './modules/ai/ai.routes.js';

export const app = express();

app.disable('x-powered-by');
app.use(helmet());
const allowedOrigins = [env.WEB_ORIGIN, 'http://localhost:5173', 'http://localhost:5175', 'http://127.0.0.1:5173', 'http://127.0.0.1:5175'];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1):517[0-9]$/.test(origin)) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  credentials: true,
}));
app.use(express.json({ limit: '200kb' }));
app.use(cookieParser());

app.get('/api/health', (_request, response) => response.json({ data: { status: 'ok' } }));
app.use('/api/auth', authRouter);
app.use('/api/operations', operationRouter);
app.use('/api/products', productRouter);
app.use('/api/master-data', masterDataRouter);
app.use('/api/ledger', ledgerRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/replenishment', replenishmentRouter);
app.use('/api/staff', staffRouter);
app.use('/api/ai', aiRouter);

app.use(notFoundHandler);
app.use(errorHandler);
