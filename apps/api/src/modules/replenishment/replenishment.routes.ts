import { Role } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { getReplenishmentWorklist } from './replenishment.service.js';

const filtersSchema = z.object({
  search: z.string().trim().max(80).optional(),
  warehouseId: z.string().cuid().optional(),
  locationId: z.string().cuid().optional(),
  categoryId: z.string().cuid().optional(),
  status: z.enum(['ALL', 'ATTENTION', 'OUT_OF_STOCK', 'REORDER', 'LOW_STOCK', 'COVERED', 'HEALTHY']).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
});

export const replenishmentRouter = Router();

replenishmentRouter.get('/', requireAuth, requireRole(Role.MANAGER), async (request, response) => {
  const filters = filtersSchema.parse(request.query);
  const result = await getReplenishmentWorklist(filters);
  response.json(result);
});

