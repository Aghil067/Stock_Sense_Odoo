import { OperationStatus, OperationType, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { stockHealth } from '../../lib/stock-health.js';

type Filters = {
  type?: OperationType;
  status?: OperationStatus;
  warehouseId?: string;
  locationId?: string;
  categoryId?: string;
};

const pendingStatuses = [OperationStatus.DRAFT, OperationStatus.WAITING, OperationStatus.READY];

export async function getDashboard(filters: Filters, db: Prisma.TransactionClient = prisma) {
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
    db.product.findMany({
      where: { isActive: true, categoryId: filters.categoryId },
      include: {
        balances: stockScope ? { where: stockScope } : true,
        reorderRules: ruleScope ? { where: ruleScope } : true,
      },
    }),
    db.stockOperation.groupBy({ by: ['type'], where: pendingWhere, _count: { _all: true } }),
    filters.type && filters.type !== OperationType.INTERNAL_TRANSFER ? Promise.resolve(0) : db.stockOperation.count({
      where: { ...pendingWhere, type: OperationType.INTERNAL_TRANSFER },
    }),
    db.stockOperation.findMany({
      where: operationWhere,
      take: 8,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, reference: true, type: true, status: true, createdAt: true,
        partnerName: true, scheduledAt: true, _count: { select: { lines: true } },
      },
    }),
    filters.status && filters.status !== OperationStatus.DONE ? Promise.resolve([]) : db.stockLedgerEntry.findMany({
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
    if (stockHealth(product) === 'OUT_OF_STOCK') {
      outOfStock += 1;
      actions.push({ severity: 'HIGH', message: `${product.name} is out of stock.`, href: `/products/${product.id}` });
    } else if (stockHealth(product) === 'LOW_STOCK') {
      lowStock += 1;
      actions.push({ severity: 'MEDIUM', message: `${product.name} is below its reorder level.`, href: `/products/${product.id}` });
    }
  }
  const pending = Object.fromEntries(Object.values(OperationType).map((type) =>
    [type, pendingOperations.find((item) => item.type === type)?._count._all ?? 0]));
  if (pending.RECEIPT) actions.push({ severity: 'OPERATIONS', message: `${pending.RECEIPT} receipt(s) waiting for completion.`, href: '/operations/receipts' });
  if (pending.DELIVERY) actions.push({ severity: 'OPERATIONS', message: `${pending.DELIVERY} delivery order(s) pending.`, href: '/operations/deliveries' });
  if (pending.INTERNAL_TRANSFER) actions.push({ severity: 'OPERATIONS', message: `${pending.INTERNAL_TRANSFER} internal transfer(s) scheduled.`, href: '/operations/transfers' });
  if (pending.ADJUSTMENT) actions.push({ severity: 'OPERATIONS', message: `${pending.ADJUSTMENT} inventory adjustment(s) pending.`, href: '/operations/adjustments' });

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
