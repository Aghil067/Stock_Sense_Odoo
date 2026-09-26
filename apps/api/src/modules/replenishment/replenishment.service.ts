import { OperationStatus, OperationType, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';

const pendingStatuses = [OperationStatus.DRAFT, OperationStatus.WAITING, OperationStatus.READY];

export async function getReplenishmentWorklist(warehouseId?: string) {
  const [rules, pendingLines] = await Promise.all([
    prisma.reorderRule.findMany({
      where: warehouseId ? { location: { warehouseId } } : undefined,
      include: {
        product: { include: { unit: true, category: true, balances: true } },
        location: { include: { warehouse: true } },
      },
      orderBy: [{ product: { name: 'asc' } }, { location: { name: 'asc' } }],
    }),
    prisma.stockOperationLine.findMany({
      where: { operation: { status: { in: pendingStatuses }, type: { in: [
        OperationType.RECEIPT, OperationType.DELIVERY, OperationType.INTERNAL_TRANSFER,
      ] } } },
      select: {
        productId: true, quantity: true,
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

  return rules.filter((rule) => rule.product.isActive).map((rule) => {
    const onHand = rule.product.balances.find((balance) => balance.locationId === rule.locationId)?.quantity ?? new Prisma.Decimal(0);
    const planned = pending.get(`${rule.productId}:${rule.locationId}`) ?? { incoming: new Prisma.Decimal(0), outgoing: new Prisma.Decimal(0) };
    const projected = onHand.add(planned.incoming).sub(planned.outgoing);
    const shortage = Prisma.Decimal.max(rule.minimumQty.sub(projected), new Prisma.Decimal(0));
    const status: 'OUT_OF_STOCK' | 'REORDER' | 'COVERED' = shortage.gt(0) ? (onHand.lte(0) ? 'OUT_OF_STOCK' : 'REORDER') : 'COVERED';
    return {
      product: { id: rule.product.id, name: rule.product.name, sku: rule.product.sku, unit: rule.product.unit, category: rule.product.category },
      location: { id: rule.location.id, name: rule.location.name, warehouse: { id: rule.location.warehouse.id, name: rule.location.warehouse.name } },
      minimumQty: rule.minimumQty,
      onHand,
      pendingIncoming: planned.incoming,
      pendingOutgoing: planned.outgoing,
      projected,
      suggestedQuantity: shortage,
      status,
    };
  }).sort((a, b) => {
    const priority = { OUT_OF_STOCK: 0, REORDER: 1, COVERED: 2 };
    return priority[a.status] - priority[b.status] || a.product.name.localeCompare(b.product.name);
  });
}
