import { Router } from 'express';
import { OperationType, Prisma } from '@prisma/client';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { prisma } from '../../lib/prisma.js';

const filtersSchema = z.object({
  search: z.string().trim().max(80).optional(),
  audit: z.enum(['original', 'reversed', 'reversal']).optional(),
  movementType: z.nativeEnum(OperationType).optional(),
  productId: z.string().cuid().optional(),
  locationId: z.string().cuid().optional(),
  from: z.coerce.date().optional(),
  to: z.preprocess(value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T23:59:59.999Z` : value, z.coerce.date()).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
}).refine(value => !value.from || !value.to || value.from <= value.to, { path: ['to'], message: 'End date must be on or after the start date.' });

export const ledgerRouter = Router();
ledgerRouter.get('/', requireAuth, async (request, response) => {
  const filters = filtersSchema.parse(request.query);
  const where: Prisma.StockLedgerEntryWhereInput = {
    movementType: filters.movementType,
    productId: filters.productId,
    ...(filters.audit === 'reversal' ? { reversalOfId: { not: null } } : filters.audit === 'reversed' ? { reversal: { isNot: null } } : filters.audit === 'original' ? { reversalOfId: null } : {}),
    ...(filters.locationId ? { AND: [{ OR: [{ sourceLocationId: filters.locationId }, { destinationLocationId: filters.locationId }] }] } : {}),
    ...(filters.from || filters.to ? { createdAt: { gte: filters.from, lte: filters.to } } : {}),
    ...(filters.search ? { OR: [
      { reference: { contains: filters.search, mode: 'insensitive' } },
      { product: { name: { contains: filters.search, mode: 'insensitive' } } },
      { product: { sku: { contains: filters.search, mode: 'insensitive' } } },
    ] } : {}),
  };
  const [data, totalItems] = await prisma.$transaction([
    prisma.stockLedgerEntry.findMany({
      where,
      include: { product: { include: { unit: true } }, sourceLocation: { include: { warehouse: true } }, destinationLocation: { include: { warehouse: true } }, createdBy: { select: { name: true } },
        reversalOf: { select: { id: true, reference: true } },
        reversal: { select: { id: true, reference: true, reason: true, createdAt: true, createdBy: { select: { name: true } } } },
        operationLine: { select: { operationId: true, operation: { select: { reversalNotes: true, _count: { select: { lines: true } } } } } },
      },
      orderBy: { createdAt: 'desc' }, skip: (filters.page - 1) * filters.pageSize, take: filters.pageSize,
    }),
    prisma.stockLedgerEntry.count({ where }),
  ]);
  response.json({ data, pagination: { page: filters.page, pageSize: filters.pageSize, totalItems, totalPages: Math.ceil(totalItems / filters.pageSize) } });
});

