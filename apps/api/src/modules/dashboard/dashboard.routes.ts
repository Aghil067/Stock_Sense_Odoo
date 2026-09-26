import { OperationStatus, OperationType } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { getDashboard } from './dashboard.service.js';

const filtersSchema = z.object({
  type: z.nativeEnum(OperationType).optional(),
  status: z.nativeEnum(OperationStatus).optional(),
  warehouseId: z.string().cuid().optional(),
  locationId: z.string().cuid().optional(),
  categoryId: z.string().cuid().optional(),
});

export const dashboardRouter = Router();
dashboardRouter.get('/', requireAuth, async (request, response) => {
  const filters = filtersSchema.parse(request.query);
  response.json({ data: await getDashboard(filters) });
});
