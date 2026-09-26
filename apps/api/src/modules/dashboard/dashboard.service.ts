import { OperationStatus, OperationType, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';

type Filters = {
  type?: OperationType;
  status?: OperationStatus;
  warehouseId?: string;
  locationId?: string;
  categoryId?: string;
};

const pendingStatuses = [OperationStatus.DRAFT, OperationStatus.WAITING, OperationStatus.READY];

export async function getDashboard(filters: Filters) {
  const stockScope: Prisma.StockBalanceWhereInput | undefined = filters.locationId
    ? { locationId: filters.locationId }
    : filters.warehouseId ? { location: { warehouseId: filters.warehouseId } } : undefined;
  const ruleScope: Prisma.ReorderRuleWhereInput | undefined = filters.locationId
    ? { locationId: filters.locationId }
    : filters.warehouseId ? { location: { warehouseId: filters.warehouseId } } : undefined;
  const operationLocation: Prisma.StockOperationWhereInput = filters.locationId
    ? { OR: [{ sourceLocationId: filters.locationId }, { destinationLocationId: filters.locationId }] }
    : filters.warehouseId ? { OR: [
      { sourceLocation: { warehouseId: filters.warehouseId } },
      { destinationLocation: { warehouseId: filters.warehouseId } },
    ] } : {};
  const operationWhere: Prisma.StockOperationWhereInput = {
    ...operationLocation,
    type: filters.type,
    status: filters.status,
    ...(filters.categoryId ? { lines: { some: { product: { categoryId: filters.categoryId } } } } : {}),
  };
  const pendingWhere: Prisma.StockOperationWhereInput = {
    ...operationWhere,
    status: { in: filters.status ? pendingStatuses.filter((status) => status === filters.status) : pendingStatuses },
  };
  const ledgerWhere: Prisma.StockLedgerEntryWhereInput = {
    movementType: filters.type,
    ...(filters.locationId ? { OR: [{ sourceLocationId: filters.locationId }, { destinationLocationId: filters.locationId }] }
      : filters.warehouseId ? { OR: [
        { sourceLocation: { warehouseId: filters.warehouseId } },
        { destinationLocation: { warehouseId: filters.warehouseId } },
      ] } : {}),
    ...(filters.categoryId ? { product: { categoryId: filters.categoryId } } : {}),
  };

  const [products, pendingOperations, scheduledTransfers, matchingDocuments, recentMovements] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true, categoryId: filters.categoryId },
      include: {
        balances: stockScope ? { where: stockScope } : true,
        reorderRules: ruleScope ? { where: ruleScope } : true,
      },
    }),
    prisma.stockOperation.groupBy({ by: ['type'], where: pendingWhere, _count: { _all: true } }),
    filters.type && filters.type !== OperationType.INTERNAL_TRANSFER ? Promise.resolve(0) : prisma.stockOperation.count({
      where: { ...pendingWhere, type: OperationType.INTERNAL_TRANSFER, scheduledAt: { not: null } },
    }),
    prisma.stockOperation.findMany({
      where: operationWhere,
      take: 8,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, reference: true, type: true, status: true, createdAt: true,
        partnerName: true, scheduledAt: true, _count: { select: { lines: true } },
      },
    }),
    filters.status && filters.status !== OperationStatus.DONE ? Promise.resolve([]) : prisma.stockLedgerEntry.findMany({
      where: ledgerWhere,
      take: 8,
      orderBy: { createdAt: 'desc' },
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
    } else if (product.reorderRules.some((rule) =>
      (product.balances.find((balance) => balance.locationId === rule.locationId)?.quantity ?? new Prisma.Decimal(0)).lte(rule.minimumQty))) {
      lowStock += 1;
      actions.push({ severity: 'MEDIUM', message: `${product.name} is below its reorder level.`, href: `/products/${product.id}` });
    }
  }
  const pending = Object.fromEntries(Object.values(OperationType).map((type) =>
    [type, pendingOperations.find((item) => item.type === type)?._count._all ?? 0]));
  if (pending.RECEIPT) actions.push({ severity: 'OPERATIONS', message: `${pending.RECEIPT} receipt(s) waiting for completion.`, href: '/operations/receipts' });
  if (pending.DELIVERY) actions.push({ severity: 'OPERATIONS', message: `${pending.DELIVERY} delivery order(s) pending.`, href: '/operations/deliveries' });

  return {
    kpis: {
      totalProductsInStock, lowStock, outOfStock,
      pendingReceipts: pending.RECEIPT,
      pendingDeliveries: pending.DELIVERY,
      scheduledTransfers,
    },
    actions: actions.slice(0, 8),
    matchingDocuments,
    recentMovements,
  };
}
