import { Role } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { getReplenishmentWorklist } from './replenishment.service.js';

const filtersSchema = z.object({ warehouseId: z.string().cuid().optional() });
export const replenishmentRouter = Router();
replenishmentRouter.get('/', requireAuth, requireRole(Role.MANAGER), async (request, response) => {
  const { warehouseId } = filtersSchema.parse(request.query);
  response.json({ data: await getReplenishmentWorklist(warehouseId) });
});
