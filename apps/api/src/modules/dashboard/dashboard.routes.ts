import { OperationStatus, OperationType } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { getAnalytics } from './analytics.service.js';
import { getDashboard } from './dashboard.service.js';

const filtersSchema = z.object({
  type: z.nativeEnum(OperationType).optional(),
  status: z.nativeEnum(OperationStatus).optional(),
  warehouseId: z.string().cuid().optional(),
  locationId: z.string().cuid().optional(),
  categoryId: z.string().cuid().optional(),
});

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth, requireRole('MANAGER'));
dashboardRouter.get('/analytics', async (request, response) => {
  const filters = filtersSchema.extend({ days: z.coerce.number().pipe(z.union([z.literal(7), z.literal(30)])).default(7) }).parse(request.query);
  response.json({ data: await getAnalytics(filters) });
});
dashboardRouter.get(['/', ''], requireAuth, async (request, response) => {
  const filters = filtersSchema.parse(request.query);
  response.json({ data: await getDashboard(filters) });
});
