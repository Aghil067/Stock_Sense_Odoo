import { z } from 'zod';

export const createProductSchema = z.object({
  name: z.string().trim().min(2).max(120),
  sku: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{1,39}$/, 'Use letters, numbers, hyphens, or underscores.'),
  description: z.string().trim().max(500).optional(),
  categoryId: z.string().cuid(),
  unitId: z.string().cuid(),
  initialStock: z.coerce.number().nonnegative().max(999999999).default(0),
  initialLocationId: z.string().cuid().optional(),
  reorderLevel: z.coerce.number().nonnegative().max(999999999).optional(),
}).refine((value) => value.initialStock === 0 || Boolean(value.initialLocationId), {
  path: ['initialLocationId'], message: 'Choose a location for the opening stock.',
});

export const updateProductSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  sku: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{1,39}$/).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  categoryId: z.string().cuid().optional(),
  unitId: z.string().cuid().optional(),
  isActive: z.boolean().optional(),
});

export const reorderRuleSchema = z.object({
  locationId: z.string().cuid(),
  minimumQty: z.coerce.number().nonnegative().max(999999999),
});

export const categorySchema = z.object({ name: z.string().trim().min(2).max(80) });
export const unitSchema = z.object({ name: z.string().trim().min(2).max(60), symbol: z.string().trim().min(1).max(12) });
export const warehouseSchema = z.object({ name: z.string().trim().min(2).max(100), code: z.string().trim().toUpperCase().min(2).max(12), address: z.string().trim().max(240).optional() });
export const locationSchema = z.object({ name: z.string().trim().min(2).max(100), code: z.string().trim().toUpperCase().min(1).max(20), warehouseId: z.string().cuid() });
