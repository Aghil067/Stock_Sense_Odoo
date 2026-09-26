import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { stockHealth } from '../../lib/stock-health.js';
import { ApiError } from '../../lib/api-error.js';

export async function getAnalytics(filters: { warehouseId?: string; locationId?: string; categoryId?: string; days: number }) {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - filters.days + 1));
  const location = { id: filters.locationId, warehouseId: filters.warehouseId };
  return prisma.$transaction(async tx => {
    const [products, movements, warehouses] = await Promise.all([
      tx.product.findMany({ where: { isActive: true, categoryId: filters.categoryId }, select: {
        balances: { where: { location }, select: { locationId: true, quantity: true, location: { select: { warehouseId: true } } } },
        reorderRules: { where: { location }, select: { locationId: true, minimumQty: true } },
      } }),
      tx.stockLedgerEntry.findMany({ where: {
        createdAt: { gte: start, lte: now }, movementType: { in: ['RECEIPT', 'DELIVERY'] }, product: { categoryId: filters.categoryId },
        ...(filters.locationId || filters.warehouseId ? { OR: [{ sourceLocation: location }, { destinationLocation: location }] } : {}),
      }, select: { createdAt: true, movementType: true, quantity: true, reversalOfId: true,
        product: { select: { unit: { select: { id: true, symbol: true } } } } }, take: 10001 }),
      tx.warehouse.findMany({ where: { id: filters.warehouseId, ...(filters.locationId ? { locations: { some: { id: filters.locationId } } } : {}) }, select: { id: true, name: true } }),
    ]);
    if (movements.length > 10000) throw new ApiError(422, 'ANALYTICS_SCOPE_TOO_LARGE', 'Narrow the location, category or period to analyze fewer than 10,000 movements.');
    const health = { HEALTHY: 0, LOW_STOCK: 0, OUT_OF_STOCK: 0 };
    products.forEach(product => { health[stockHealth(product)] += 1; });
    const units = [...new Map(movements.map(m => [m.product.unit.id, m.product.unit])).values()];
    const series = units.map(unit => ({ ...unit, points: Array.from({ length: filters.days }, (_, i) => {
      const date = new Date(start.getTime() + i * 86400000).toISOString().slice(0, 10);
      const totals = { receipts: new Prisma.Decimal(0), deliveries: new Prisma.Decimal(0), receiptReversals: new Prisma.Decimal(0), deliveryReversals: new Prisma.Decimal(0) };
      for (const movement of movements) {
        if (movement.product.unit.id !== unit.id || movement.createdAt.toISOString().slice(0, 10) !== date) continue;
        const key = movement.movementType === 'RECEIPT' ? movement.reversalOfId ? 'receiptReversals' : 'receipts' : movement.reversalOfId ? 'deliveryReversals' : 'deliveries';
        totals[key] = totals[key].add(movement.quantity.abs());
      }
      return { date, ...Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, value.toNumber()])) };
    }) }));
    return { asOf: now.toISOString(), days: filters.days, totalProducts: products.length, health,
      warehouseDistribution: warehouses.map(warehouse => ({ ...warehouse, products: products.filter(product => product.balances.some(b => b.location.warehouseId === warehouse.id && b.quantity.gt(0))).length })),
      series, movementCount: movements.length };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
