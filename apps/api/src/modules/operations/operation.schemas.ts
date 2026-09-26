import { OperationStatus, OperationType } from '@prisma/client';
import { z } from 'zod';

const quantity = z.coerce.number().positive().max(999999999);

export const createOperationSchema = z.object({
  type: z.nativeEnum(OperationType),
  partnerName: z.string().trim().min(2).max(120).optional(),
  reason: z.string().trim().min(2).max(240).optional(),
  sourceLocationId: z.string().cuid().optional(),
  destinationLocationId: z.string().cuid().optional(),
  scheduledAt: z.coerce.date().optional(),
  lines: z.array(z.object({
    productId: z.string().cuid(),
    quantity,
    countedQuantity: z.coerce.number().nonnegative().max(999999999).optional(),
  })).min(1, 'Add at least one product line.'),
}).superRefine((value, context) => {
  if (new Set(value.lines.map((line) => line.productId)).size !== value.lines.length) {
    context.addIssue({ code: 'custom', path: ['lines'], message: 'Each product can appear only once.' });
  }
  if (value.type === OperationType.RECEIPT && !value.destinationLocationId) {
    context.addIssue({ code: 'custom', path: ['destinationLocationId'], message: 'A destination location is required.' });
  }
  if ((value.type === OperationType.DELIVERY || value.type === OperationType.ADJUSTMENT) && !value.sourceLocationId) {
    context.addIssue({ code: 'custom', path: ['sourceLocationId'], message: 'A source location is required.' });
  }
  if (value.type === OperationType.INTERNAL_TRANSFER) {
    if (!value.sourceLocationId || !value.destinationLocationId) {
      context.addIssue({ code: 'custom', path: ['sourceLocationId'], message: 'Source and destination are required.' });
    } else if (value.sourceLocationId === value.destinationLocationId) {
      context.addIssue({ code: 'custom', path: ['destinationLocationId'], message: 'Destination must differ from source.' });
    }
  }
  if (value.type === OperationType.ADJUSTMENT && value.lines.some((line) => line.countedQuantity === undefined)) {
    context.addIssue({ code: 'custom', path: ['lines'], message: 'Physical count is required for adjustments.' });
  }
});

export const operationFiltersSchema = z.object({
  type: z.nativeEnum(OperationType).optional(),
  status: z.nativeEnum(OperationStatus).optional(),
  locationId: z.string().cuid().optional(),
  search: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

