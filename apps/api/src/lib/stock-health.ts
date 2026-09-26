import { Prisma } from '@prisma/client';

export function stockHealth(product: {
  balances: Array<{ locationId: string; quantity: Prisma.Decimal }>;
  reorderRules: Array<{ locationId: string; minimumQty: Prisma.Decimal }>;
}) {
  const total = product.balances.reduce((sum, b) => sum.add(b.quantity), new Prisma.Decimal(0));
  if (total.lte(0)) return 'OUT_OF_STOCK';
  return product.reorderRules.some(rule =>
    (product.balances.find(b => b.locationId === rule.locationId)?.quantity ?? new Prisma.Decimal(0)).lte(rule.minimumQty)) ? 'LOW_STOCK' : 'HEALTHY';
}
