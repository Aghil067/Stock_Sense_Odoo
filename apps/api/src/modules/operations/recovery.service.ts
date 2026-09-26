import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../lib/api-error.js';

export const recoverySchema = z.object({
  reason: z.enum(['Wrong quantity', 'Wrong product', 'Wrong location', 'Duplicate operation', 'Other']),
  notes: z.string().trim().min(5).max(1000),
}).strict();

async function planRecovery(tx: Prisma.TransactionClient, id: string) {
  const original = await tx.stockOperation.findUnique({ where: { id }, include: {
    reversal: { select: { reference: true } },
    lines: { include: { ledgerEntry: true, product: { include: { unit: true } } } },
  } });
  if (!original) throw new ApiError(404, 'NOT_FOUND', 'Operation not found.');
  if (original.status !== 'DONE') throw new ApiError(409, 'NOT_COMPLETED', 'Only completed operations can be reversed. Cancel pending operations instead.');
  if (original.reversalOfId) throw new ApiError(409, 'REVERSAL_OF_REVERSAL', 'A reversal cannot itself be reversed. Create a new inventory operation instead.');
  if (original.reversal) throw new ApiError(409, 'ALREADY_REVERSED', `Already reversed by ${original.reversal.reference}.`);
  const locations = await tx.location.findMany({ where: { id: { in: [original.sourceLocationId, original.destinationLocationId].filter((id): id is string => Boolean(id)) } }, include: { warehouse: true } });
  const balances = await tx.stockBalance.findMany({ where: {
    productId: { in: original.lines.map(line => line.productId) },
    locationId: { in: [original.sourceLocationId, original.destinationLocationId].filter((id): id is string => Boolean(id)) },
  } });
  const lines = original.lines.flatMap(line => {
    const entry = line.ledgerEntry;
    // Older no-change counts have no ledger entry. They have nothing to compensate.
    if (!entry) {
      if (original.type === 'ADJUSTMENT') return [];
      throw new ApiError(409, 'INCOMPLETE_AUDIT', 'This operation has incomplete movement history and cannot be safely reversed.');
    }
    const effects = [
      { side: 'source' as const, locationId: entry.sourceLocationId, before: entry.sourceBefore, after: entry.sourceAfter },
      { side: 'destination' as const, locationId: entry.destinationLocationId, before: entry.destinationBefore, after: entry.destinationAfter },
    ].flatMap(effect => {
      if (!effect.locationId || effect.before === null || effect.after === null) return [];
      const delta = effect.before.sub(effect.after);
      if (delta.isZero()) return [];
      const current = balances.find(b => b.productId === line.productId && b.locationId === effect.locationId)?.quantity ?? new Prisma.Decimal(0);
      const location = locations.find(l => l.id === effect.locationId);
      return [{ side: effect.side, locationId: effect.locationId, locationName: location ? `${location.warehouse.name} / ${location.name}` : effect.locationId, delta, before: current, after: current.add(delta) }];
    });
    if (!effects.length) return [];
    return [{ originalLineId: line.id, originalEntryId: entry.id, productId: line.productId,
      product: { id: line.product.id, name: line.product.name, sku: line.product.sku, unit: line.product.unit.symbol }, effects }];
  });
  if (!lines.length) throw new ApiError(409, 'NO_STOCK_EFFECT', 'This operation made no stock change to reverse.');
  return { original, lines, canReverse: lines.every(line => line.effects.every(effect => effect.after.gte(0))) };
}

export async function previewRecovery(id: string) {
  return prisma.$transaction(async tx => {
    const plan = await planRecovery(tx, id);
    return { operationId: id, reference: plan.original.reference, type: plan.original.type,
      canReverse: plan.canReverse, lines: plan.lines,
      warning: plan.canReverse ? 'Preview only. Stock is checked again when you confirm.' : 'Reversal would make stock negative. Resolve the stock shortage first.' };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export async function reverseOperation(id: string, userId: string, input: z.infer<typeof recoverySchema>) {
  return prisma.$transaction(async tx => {
    const { original, lines, canReverse } = await planRecovery(tx, id);
    if (!canReverse) throw new ApiError(409, 'INSUFFICIENT_STOCK', 'Reversal would make stock negative. Refresh the preview and resolve the shortage.');
    const reversal = await tx.stockOperation.create({ data: {
      reference: `REV-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`,
      type: original.type, status: 'DONE', completedAt: new Date(), createdById: userId,
      sourceLocationId: original.sourceLocationId, destinationLocationId: original.destinationLocationId,
      reversalOfId: original.id, reason: input.reason, reversalNotes: input.notes,
    } });
    for (const line of lines) {
      for (const effect of line.effects) {
        if (effect.delta.isNegative()) {
          const changed = await tx.stockBalance.updateMany({
            where: { productId: line.productId, locationId: effect.locationId, quantity: { gte: effect.delta.abs() } },
            data: { quantity: { increment: effect.delta } },
          });
          if (changed.count !== 1) throw new ApiError(409, 'INSUFFICIENT_STOCK', 'Stock changed. Refresh the recovery preview.');
        } else {
          await tx.stockBalance.upsert({
            where: { productId_locationId: { productId: line.productId, locationId: effect.locationId } },
            create: { productId: line.productId, locationId: effect.locationId, quantity: effect.delta },
            update: { quantity: { increment: effect.delta } },
          });
        }
      }
      const source = line.effects.find(e => e.side === 'source');
      const destination = line.effects.find(e => e.side === 'destination');
      const firstEffect = line.effects[0];
      if (!firstEffect) throw new ApiError(409, 'NO_STOCK_EFFECT', 'No compensating stock effect was found.');
      const quantity = original.type === 'INTERNAL_TRANSFER' ? firstEffect.delta.abs()
        : line.effects.reduce((sum, effect) => sum.add(effect.delta), new Prisma.Decimal(0));
      await tx.stockOperationLine.create({ data: {
        operationId: reversal.id, productId: line.productId, quantity: quantity.abs(),
        countedQuantity: original.type === 'ADJUSTMENT' ? source?.after : undefined,
        ledgerEntry: { create: {
          reference: reversal.reference, movementType: original.type, quantity,
          sourceBefore: source?.before, sourceAfter: source?.after,
          destinationBefore: destination?.before, destinationAfter: destination?.after,
          sourceLocationId: original.sourceLocationId, destinationLocationId: original.destinationLocationId,
          productId: line.productId, createdById: userId, reversalOfId: line.originalEntryId,
          reason: `${input.reason}: ${input.notes}`,
        } },
      } });
    }
    return { id: reversal.id, reference: reversal.reference, originalReference: original.reference };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
