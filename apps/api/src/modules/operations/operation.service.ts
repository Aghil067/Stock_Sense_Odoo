import { randomBytes } from 'node:crypto';
import { OperationStatus, OperationType, Prisma } from '@prisma/client';
import { ApiError } from '../../lib/api-error.js';
import { prisma } from '../../lib/prisma.js';

type CreateOperationInput = {
  type: OperationType;
  partnerName?: string;
  reason?: string;
  sourceLocationId?: string;
  destinationLocationId?: string;
  scheduledAt?: Date;
  lines: Array<{ productId: string; quantity: number; countedQuantity?: number }>;
};

const operationInclude = {
  sourceLocation: { include: { warehouse: true } },
  destinationLocation: { include: { warehouse: true } },
  createdBy: { select: { id: true, name: true } },
  lines: { include: { product: { include: { unit: true, category: true } }, ledgerEntry: true } },
} satisfies Prisma.StockOperationInclude;

function createReference(type: OperationType) {
  const prefixes: Record<OperationType, string> = {
    RECEIPT: 'REC', DELIVERY: 'DEL', INTERNAL_TRANSFER: 'TRF', ADJUSTMENT: 'ADJ',
  };
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  return `${prefixes[type]}-${date}-${randomBytes(2).toString('hex').toUpperCase()}`;
}

export async function createOperation(input: CreateOperationInput, userId: string) {
  const locationIds = [input.sourceLocationId, input.destinationLocationId].filter(Boolean) as string[];
  const [locations, products] = await Promise.all([
    prisma.location.count({ where: { id: { in: locationIds } } }),
    prisma.product.count({ where: { id: { in: input.lines.map((line) => line.productId) }, isActive: true } }),
  ]);
  if (locations !== new Set(locationIds).size) throw new ApiError(422, 'INVALID_LOCATION', 'One or more locations are invalid.');
  if (products !== input.lines.length) throw new ApiError(422, 'INVALID_PRODUCT', 'One or more products are invalid.');

  return prisma.stockOperation.create({
    data: {
      reference: createReference(input.type),
      type: input.type,
      partnerName: input.partnerName,
      reason: input.reason,
      sourceLocationId: input.sourceLocationId,
      destinationLocationId: input.destinationLocationId,
      scheduledAt: input.scheduledAt,
      createdById: userId,
      lines: {
        create: input.lines.map((line) => ({
          productId: line.productId,
          quantity: new Prisma.Decimal(line.quantity),
          countedQuantity: line.countedQuantity === undefined ? undefined : new Prisma.Decimal(line.countedQuantity),
        })),
      },
    },
    include: operationInclude,
  });
}

export async function listOperations(filters: {
  type?: OperationType; status?: OperationStatus; locationId?: string; search?: string; page: number; pageSize: number;
}) {
  const where: Prisma.StockOperationWhereInput = {
    type: filters.type,
    status: filters.status,
    ...(filters.locationId ? { OR: [{ sourceLocationId: filters.locationId }, { destinationLocationId: filters.locationId }] } : {}),
    ...(filters.search ? {
      OR: [
        { reference: { contains: filters.search, mode: 'insensitive' } },
        { partnerName: { contains: filters.search, mode: 'insensitive' } },
        { lines: { some: { product: { OR: [
          { name: { contains: filters.search, mode: 'insensitive' } },
          { sku: { contains: filters.search, mode: 'insensitive' } },
        ] } } } },
      ],
    } : {}),
  };
  const [data, totalItems] = await prisma.$transaction([
    prisma.stockOperation.findMany({
      where, include: operationInclude, orderBy: { createdAt: 'desc' },
      skip: (filters.page - 1) * filters.pageSize, take: filters.pageSize,
    }),
    prisma.stockOperation.count({ where }),
  ]);
  return { data, pagination: { page: filters.page, pageSize: filters.pageSize, totalItems, totalPages: Math.ceil(totalItems / filters.pageSize) } };
}

export function getOperation(id: string) {
  return prisma.stockOperation.findUniqueOrThrow({ where: { id }, include: operationInclude });
}

export async function advanceDelivery(id: string, action: 'pick' | 'pack') {
  const expected = action === 'pick' ? OperationStatus.DRAFT : OperationStatus.WAITING;
  const next = action === 'pick' ? OperationStatus.WAITING : OperationStatus.READY;
  const result = await prisma.stockOperation.updateMany({
    where: { id, type: OperationType.DELIVERY, status: expected }, data: { status: next },
  });
  if (!result.count) throw new ApiError(409, 'INVALID_STATUS_TRANSITION', `This delivery cannot be ${action === 'pick' ? 'picked' : 'packed'} in its current status.`);
  return getOperation(id);
}

export async function cancelOperation(id: string) {
  const result = await prisma.stockOperation.updateMany({
    where: { id, status: { in: [OperationStatus.DRAFT, OperationStatus.WAITING, OperationStatus.READY] } },
    data: { status: OperationStatus.CANCELED, canceledAt: new Date() },
  });
  if (!result.count) throw new ApiError(409, 'INVALID_STATUS_TRANSITION', 'Only pending operations can be canceled.');
  return getOperation(id);
}

async function decrementBalance(
  tx: Prisma.TransactionClient, productId: string, locationId: string, quantity: Prisma.Decimal,
) {
  const updated = await tx.stockBalance.updateMany({
    where: { productId, locationId, quantity: { gte: quantity } },
    data: { quantity: { decrement: quantity } },
  });
  if (!updated.count) {
    const balance = await tx.stockBalance.findUnique({ where: { productId_locationId: { productId, locationId } } });
    const available = balance?.quantity ?? new Prisma.Decimal(0);
    throw new ApiError(409, 'INSUFFICIENT_STOCK', `Insufficient stock: ${available.toString()} available, ${quantity.toString()} requested.`);
  }
  const balance = await tx.stockBalance.findUniqueOrThrow({ where: { productId_locationId: { productId, locationId } } });
  return { before: balance.quantity.add(quantity), after: balance.quantity };
}

async function incrementBalance(
  tx: Prisma.TransactionClient, productId: string, locationId: string, quantity: Prisma.Decimal,
) {
  const balance = await tx.stockBalance.upsert({
    where: { productId_locationId: { productId, locationId } },
    create: { productId, locationId, quantity },
    update: { quantity: { increment: quantity } },
  });
  return { before: balance.quantity.sub(quantity), after: balance.quantity };
}

export async function previewOperation(id: string) {
  const operation = await getOperation(id);
  if (operation.status === OperationStatus.DONE || operation.status === OperationStatus.CANCELED) {
    throw new ApiError(409, 'OPERATION_FINALIZED', 'This operation is already finalized.');
  }
  const locationId = operation.sourceLocationId ?? operation.destinationLocationId!;
  const balances = await prisma.stockBalance.findMany({
    where: { productId: { in: operation.lines.map((line) => line.productId) }, locationId: { in: [locationId, operation.destinationLocationId ?? locationId] } },
  });
  return operation.lines.map((line) => {
    const source = operation.sourceLocationId ? balances.find((item) => item.productId === line.productId && item.locationId === operation.sourceLocationId)?.quantity ?? new Prisma.Decimal(0) : null;
    const destination = operation.destinationLocationId ? balances.find((item) => item.productId === line.productId && item.locationId === operation.destinationLocationId)?.quantity ?? new Prisma.Decimal(0) : null;
    const counted = line.countedQuantity;
    return {
      product: line.product,
      quantity: line.quantity,
      sourceBefore: source,
      sourceAfter: source === null ? null : operation.type === OperationType.ADJUSTMENT ? counted : source.sub(line.quantity),
      destinationBefore: destination,
      destinationAfter: destination === null ? null : destination.add(line.quantity),
    };
  });
}

export async function validateOperation(id: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const operation = await tx.stockOperation.findUnique({ where: { id }, include: operationInclude });
    if (!operation) throw new ApiError(404, 'NOT_FOUND', 'Operation not found.');
    if (operation.status === OperationStatus.DONE) throw new ApiError(409, 'ALREADY_COMPLETED', 'This operation has already been completed.');
    if (operation.status === OperationStatus.CANCELED) throw new ApiError(409, 'OPERATION_CANCELED', 'Canceled operations cannot be completed.');
    if (operation.type === OperationType.DELIVERY && operation.status !== OperationStatus.READY) {
      throw new ApiError(409, 'DELIVERY_NOT_READY', 'Pick and pack the delivery before validating it.');
    }

    for (const line of operation.lines) {
      let source: { before: Prisma.Decimal; after: Prisma.Decimal } | null = null;
      let destination: { before: Prisma.Decimal; after: Prisma.Decimal } | null = null;
      let ledgerQuantity = line.quantity;

      if (operation.type === OperationType.RECEIPT) {
        destination = await incrementBalance(tx, line.productId, operation.destinationLocationId!, line.quantity);
      } else if (operation.type === OperationType.DELIVERY) {
        source = await decrementBalance(tx, line.productId, operation.sourceLocationId!, line.quantity);
      } else if (operation.type === OperationType.INTERNAL_TRANSFER) {
        source = await decrementBalance(tx, line.productId, operation.sourceLocationId!, line.quantity);
        destination = await incrementBalance(tx, line.productId, operation.destinationLocationId!, line.quantity);
      } else {
        const counted = line.countedQuantity!;
        const existing = await tx.stockBalance.findUnique({
          where: { productId_locationId: { productId: line.productId, locationId: operation.sourceLocationId! } },
        });
        const before = existing?.quantity ?? new Prisma.Decimal(0);
        await tx.stockBalance.upsert({
          where: { productId_locationId: { productId: line.productId, locationId: operation.sourceLocationId! } },
          create: { productId: line.productId, locationId: operation.sourceLocationId!, quantity: counted },
          update: { quantity: counted },
        });
        source = { before, after: counted };
        ledgerQuantity = counted.sub(before);
      }

      await tx.stockLedgerEntry.create({
        data: {
          reference: operation.reference,
          movementType: operation.type,
          quantity: ledgerQuantity,
          sourceBefore: source?.before,
          sourceAfter: source?.after,
          destinationBefore: destination?.before,
          destinationAfter: destination?.after,
          reason: operation.reason,
          operationLineId: line.id,
          productId: line.productId,
          sourceLocationId: operation.sourceLocationId,
          destinationLocationId: operation.destinationLocationId,
          createdById: userId,
        },
      });
    }

    return tx.stockOperation.update({
      where: { id }, data: { status: OperationStatus.DONE, completedAt: new Date() }, include: operationInclude,
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

