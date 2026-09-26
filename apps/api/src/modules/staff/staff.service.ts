import { OperationStatus, OperationType, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';

const pendingStatuses = [OperationStatus.DRAFT, OperationStatus.WAITING, OperationStatus.READY];

const operationInclude = {
  sourceLocation: { include: { warehouse: true } },
  destinationLocation: { include: { warehouse: true } },
  createdBy: { select: { id: true, name: true } },
  lines: { include: { product: { include: { unit: true, category: true } } } },
} satisfies Prisma.StockOperationInclude;

export async function getStaffWorkspace() {
  const [
    picking, pickingCount,
    packing, packingCount,
    receiving, receivingCount,
    transfers, transfersCount,
    counting, countingCount,
  ] = await Promise.all([
    prisma.stockOperation.findMany({
      where: { type: OperationType.DELIVERY, status: OperationStatus.DRAFT },
      include: operationInclude,
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    prisma.stockOperation.count({ where: { type: OperationType.DELIVERY, status: OperationStatus.DRAFT } }),

    prisma.stockOperation.findMany({
      where: { type: OperationType.DELIVERY, status: OperationStatus.WAITING },
      include: operationInclude,
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    prisma.stockOperation.count({ where: { type: OperationType.DELIVERY, status: OperationStatus.WAITING } }),

    prisma.stockOperation.findMany({
      where: { type: OperationType.RECEIPT, status: { in: pendingStatuses } },
      include: operationInclude,
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    prisma.stockOperation.count({ where: { type: OperationType.RECEIPT, status: { in: pendingStatuses } } }),

    prisma.stockOperation.findMany({
      where: { type: OperationType.INTERNAL_TRANSFER, status: { in: pendingStatuses } },
      include: operationInclude,
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    prisma.stockOperation.count({ where: { type: OperationType.INTERNAL_TRANSFER, status: { in: pendingStatuses } } }),

    prisma.stockOperation.findMany({
      where: { type: OperationType.ADJUSTMENT, status: { in: pendingStatuses } },
      include: operationInclude,
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    prisma.stockOperation.count({ where: { type: OperationType.ADJUSTMENT, status: { in: pendingStatuses } } }),
  ]);

  return {
    summary: {
      pickingCount,
      packingCount,
      receivingCount,
      transfersCount,
      countingCount,
    },
    picking,
    packing,
    receiving,
    transfers,
    counting,
  };
}
