import { OperationStatus, OperationType, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';

const pendingStatuses = [OperationStatus.DRAFT, OperationStatus.WAITING, OperationStatus.READY];

export type ReplenishmentFilters = {
  search?: string;
  warehouseId?: string;
  locationId?: string;
  categoryId?: string;
  status?: 'ALL' | 'ATTENTION' | 'OUT_OF_STOCK' | 'REORDER' | 'LOW_STOCK' | 'COVERED' | 'HEALTHY';
  page: number;
  pageSize: number;
};

export async function getReplenishmentWorklist(filters: ReplenishmentFilters) {
  const where: Prisma.ReorderRuleWhereInput = {
    ...(filters.warehouseId ? { location: { warehouseId: filters.warehouseId } } : {}),
    ...(filters.locationId ? { locationId: filters.locationId } : {}),
    product: { isActive: true, categoryId: filters.categoryId,
      ...(filters.search ? {
        OR: [
          { name: { contains: filters.search, mode: 'insensitive' } },
          { sku: { contains: filters.search, mode: 'insensitive' } },
        ],
      } : {}),
    },
  };

  const [rules, pendingLines] = await Promise.all([
    prisma.reorderRule.findMany({
      where,
      include: {
        product: {
          include: {
            unit: true,
            category: true,
            reorderRules: true,
            balances: {
              include: { location: { include: { warehouse: true } } },
            },
          },
        },
        location: { include: { warehouse: true } },
      },
      orderBy: [{ product: { name: 'asc' } }, { location: { name: 'asc' } }],
    }),
    prisma.stockOperationLine.findMany({
      where: {
        operation: {
          status: { in: pendingStatuses },
          type: { in: [OperationType.RECEIPT, OperationType.DELIVERY, OperationType.INTERNAL_TRANSFER] },
        },
      },
      select: {
        productId: true,
        quantity: true,
        operation: { select: { type: true, sourceLocationId: true, destinationLocationId: true } },
      },
    }),
  ]);

  const pending = new Map<string, { incoming: Prisma.Decimal; outgoing: Prisma.Decimal }>();
  function add(productId: string, locationId: string | null, direction: 'incoming' | 'outgoing', quantity: Prisma.Decimal) {
    if (!locationId) return;
    const key = `${productId}:${locationId}`;
    const amounts = pending.get(key) ?? { incoming: new Prisma.Decimal(0), outgoing: new Prisma.Decimal(0) };
    amounts[direction] = amounts[direction].add(quantity);
    pending.set(key, amounts);
  }

  for (const line of pendingLines) {
    if (line.operation.type === OperationType.RECEIPT || line.operation.type === OperationType.INTERNAL_TRANSFER) {
      add(line.productId, line.operation.destinationLocationId, 'incoming', line.quantity);
    }
    if (line.operation.type === OperationType.DELIVERY || line.operation.type === OperationType.INTERNAL_TRANSFER) {
      add(line.productId, line.operation.sourceLocationId, 'outgoing', line.quantity);
    }
  }

  const allItems = rules.map((rule) => {
    const onHand = rule.product.balances.find((balance) => balance.locationId === rule.locationId)?.quantity ?? new Prisma.Decimal(0);
    const planned = pending.get(`${rule.productId}:${rule.locationId}`) ?? { incoming: new Prisma.Decimal(0), outgoing: new Prisma.Decimal(0) };
    const projected = onHand.add(planned.incoming).sub(planned.outgoing);
    const shortage = Prisma.Decimal.max(rule.minimumQty.sub(projected), new Prisma.Decimal(0));

    let status: 'OUT_OF_STOCK' | 'LOW_STOCK' | 'HEALTHY';
    if (onHand.lte(0) && (shortage.gt(0) || rule.minimumQty.gt(0))) {
      status = 'OUT_OF_STOCK';
    } else if (projected.lte(rule.minimumQty) || shortage.gt(0)) {
      status = 'LOW_STOCK';
    } else {
      status = 'HEALTHY';
    }

    const internalAvailable = rule.product.balances
      .filter((b) => b.locationId !== rule.locationId && b.quantity.gt(0))
      .map((b) => ({
        locationId: b.locationId,
        locationName: b.location.name,
        warehouseName: b.location.warehouse.name,
        availableQty: Prisma.Decimal.max(0, b.quantity
          .sub(pending.get(`${rule.productId}:${b.locationId}`)?.outgoing ?? 0)
          .sub(rule.product.reorderRules.find(sourceRule => sourceRule.locationId === b.locationId)?.minimumQty ?? 0)),
      })).filter(source => source.availableQty.gt(0));

    return {
      product: {
        id: rule.product.id,
        name: rule.product.name,
        sku: rule.product.sku,
        unit: rule.product.unit,
        category: rule.product.category,
      },
      location: {
        id: rule.location.id,
        name: rule.location.name,
        warehouse: { id: rule.location.warehouse.id, name: rule.location.warehouse.name },
      },
      minimumQty: rule.minimumQty,
      onHand,
      pendingIncoming: planned.incoming,
      pendingOutgoing: planned.outgoing,
      projected,
      suggestedQuantity: shortage,
      status,
      internalAvailable,
    };
  });

  const filtered = allItems.filter((item) => {
    if (!filters.status || filters.status === 'ALL') return true;
    if (filters.status === 'ATTENTION') return item.status === 'OUT_OF_STOCK' || item.status === 'LOW_STOCK';
    if (filters.status === 'OUT_OF_STOCK') return item.status === 'OUT_OF_STOCK';
    if (filters.status === 'REORDER' || filters.status === 'LOW_STOCK') return item.status === 'LOW_STOCK';
    if (filters.status === 'COVERED' || filters.status === 'HEALTHY') return item.status === 'HEALTHY';
    return true;
  });

  const priority = { OUT_OF_STOCK: 0, LOW_STOCK: 1, HEALTHY: 2 };
  filtered.sort((a, b) => {
    const diff = priority[a.status] - priority[b.status];
    if (diff !== 0) return diff;
    const shortageDiff = Number(b.suggestedQuantity) - Number(a.suggestedQuantity);
    if (shortageDiff !== 0) return shortageDiff;
    return a.product.name.localeCompare(b.product.name);
  });

  const totalItems = filtered.length;
  const totalPages = Math.ceil(totalItems / filters.pageSize) || 1;
  const start = (filters.page - 1) * filters.pageSize;
  const data = filtered.slice(start, start + filters.pageSize);

  return {
    data,
    pagination: {
      page: filters.page,
      pageSize: filters.pageSize,
      totalItems,
      totalPages,
    },
  };
}
