import { Router } from 'express';
import { OperationStatus, OperationType, Prisma } from '@prisma/client';
import { requireAuth } from '../../middleware/auth.js';
import { prisma } from '../../lib/prisma.js';

export const dashboardRouter = Router();
dashboardRouter.get('/', requireAuth, async (_request, response) => {
  const [products, pendingOperations, recentMovements] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true },
      include: { balances: true, reorderRules: true },
    }),
    prisma.stockOperation.groupBy({
      by: ['type'],
      where: { status: { in: [OperationStatus.DRAFT, OperationStatus.WAITING, OperationStatus.READY] } },
      _count: { _all: true },
    }),
    prisma.stockLedgerEntry.findMany({
      take: 8, orderBy: { createdAt: 'desc' },
      include: { product: { include: { unit: true } }, sourceLocation: true, destinationLocation: true, createdBy: { select: { name: true } } },
    }),
  ]);

  let totalProductsInStock = 0;
  let lowStock = 0;
  let outOfStock = 0;
  const actions: Array<{ severity: 'HIGH' | 'MEDIUM' | 'OPERATIONS'; message: string; href: string }> = [];

  for (const product of products) {
    const total = product.balances.reduce((sum, balance) => sum.add(balance.quantity), new Prisma.Decimal(0));
    if (total.gt(0)) totalProductsInStock += 1;
    if (total.lte(0)) {
      outOfStock += 1;
      actions.push({ severity: 'HIGH', message: `${product.name} is out of stock.`, href: `/products/${product.id}` });
    } else if (product.reorderRules.some((rule) => (product.balances.find((balance) => balance.locationId === rule.locationId)?.quantity ?? new Prisma.Decimal(0)).lte(rule.minimumQty))) {
      lowStock += 1;
      actions.push({ severity: 'MEDIUM', message: `${product.name} is below its reorder level.`, href: `/products/${product.id}` });
    }
  }

  const pending = Object.fromEntries(Object.values(OperationType).map((type) => [type, pendingOperations.find((item) => item.type === type)?._count._all ?? 0]));
  if (pending.RECEIPT) actions.push({ severity: 'OPERATIONS', message: `${pending.RECEIPT} receipt${pending.RECEIPT === 1 ? '' : 's'} waiting for completion.`, href: '/operations/receipts' });
  if (pending.DELIVERY) actions.push({ severity: 'OPERATIONS', message: `${pending.DELIVERY} delivery order${pending.DELIVERY === 1 ? '' : 's'} pending.`, href: '/operations/deliveries' });

  response.json({
    data: {
      kpis: { totalProductsInStock, lowStock, outOfStock, pendingReceipts: pending.RECEIPT, pendingDeliveries: pending.DELIVERY, scheduledTransfers: pending.INTERNAL_TRANSFER },
      actions: actions.slice(0, 8),
      recentMovements,
    },
  });
});

