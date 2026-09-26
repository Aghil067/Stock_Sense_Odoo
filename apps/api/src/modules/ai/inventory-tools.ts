import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { stockHealth } from '../../lib/stock-health.js';
import { ApiError } from '../../lib/api-error.js';
import { getDashboard } from '../dashboard/dashboard.service.js';

export const toolNames = ['inventory_summary', 'product_stock', 'low_stock', 'out_of_stock', 'replenishment', 'transfer_opportunities', 'pending_operations', 'recent_movements', 'stock_risk', 'warehouse_availability'] as const;
export type ToolName = typeof toolNames[number];
export const toolArgs = z.object({ search: z.string().trim().max(80).nullable(), warehouseId: z.string().cuid().nullable(),
  operationType: z.enum(['RECEIPT', 'DELIVERY', 'INTERNAL_TRANSFER', 'ADJUSTMENT']).nullable(), auditOnly: z.boolean(),
  from: z.iso.datetime().nullable(), to: z.iso.datetime().nullable(),
}).strict().refine(value => !value.from || !value.to || value.from <= value.to, 'Start date must precede end date.');
export type Transfer = { productId: string; product: string; sku: string; unit: string; sourceLocationId: string; source: string; destinationLocationId: string; destination: string; quantity: string };
export type Evidence = { title: string; source: string; asOf: string; note: string; total: number; columns: string[]; rows: Record<string, string | number>[]; transfers?: Transfer[]; warehouses?: Array<{ id: string; name: string }>; metrics?: Array<{ label: string; value: string | number }> };
const zero = () => new Prisma.Decimal(0);
const positive = (value: Prisma.Decimal) => Prisma.Decimal.max(value, 0);

async function stockSnapshot(search: string | null, tx: Prisma.TransactionClient = prisma) {
  const products = await tx.product.findMany({ where: { isActive: true, ...(search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { sku: { contains: search, mode: 'insensitive' } }] } : {}) },
    include: { unit: true, balances: { include: { location: { include: { warehouse: true } } } }, reorderRules: { include: { location: { include: { warehouse: true } } } } },
    orderBy: { name: 'asc' }, take: 1001 });
  if (products.length > 1000) throw new ApiError(422, 'AI_SCOPE_TOO_LARGE', 'Narrow your question to a product name or SKU (maximum 1,000 products per analysis).');
  const pending = await tx.stockOperationLine.findMany({ where: { productId: { in: products.map(p => p.id) }, operation: { status: { in: ['DRAFT', 'WAITING', 'READY'] }, type: { in: ['RECEIPT', 'DELIVERY', 'INTERNAL_TRANSFER'] } } },
    select: { productId: true, quantity: true, operation: { select: { type: true, sourceLocationId: true, destinationLocationId: true,
      sourceLocation: { include: { warehouse: true } }, destinationLocation: { include: { warehouse: true } } } } }, take: 10001 });
  if (pending.length > 10000) throw new ApiError(422, 'AI_SCOPE_TOO_LARGE', 'Too many pending lines. Narrow your question to a product.');
  const pendingByProduct = new Map<string, typeof pending>();
  for (const line of pending) { const group = pendingByProduct.get(line.productId) ?? []; group.push(line); pendingByProduct.set(line.productId, group); }
  return products.map(product => {
    const productPending = pendingByProduct.get(product.id) ?? [];
    const plannedLocations = productPending.flatMap(line => [line.operation.sourceLocation, line.operation.destinationLocation]).filter(location => location !== null);
    const locations = [...new Map([...product.balances.map(b => [b.locationId, b.location] as const), ...product.reorderRules.map(r => [r.locationId, r.location] as const), ...plannedLocations.map(location => [location.id, location] as const)]).values()];
    const positions = locations.map(location => {
      const onHand = product.balances.find(b => b.locationId === location.id)?.quantity ?? zero();
      const minimum = product.reorderRules.find(r => r.locationId === location.id)?.minimumQty ?? zero();
      let incoming = zero(); let outgoing = zero();
      for (const line of productPending) {
        if (line.operation.destinationLocationId === location.id) incoming = incoming.add(line.quantity);
        if (line.operation.sourceLocationId === location.id) outgoing = outgoing.add(line.quantity);
      }
      const projected = onHand.add(incoming).sub(outgoing);
      // Incoming drafts are NOT transferable stock. Reserve outbound drafts and minimum stock.
      const surplus = positive(onHand.sub(outgoing).sub(minimum));
      return { location, onHand, minimum, incoming, outgoing, projected, surplus, shortage: positive(minimum.sub(projected)) };
    });
    return { product, positions };
  });
}

export async function transferOpportunities(search: string | null = null, warehouseId: string | null = null, tx: Prisma.TransactionClient = prisma): Promise<Transfer[]> {
  const snapshot = await stockSnapshot(search, tx);
  const recommendations: Transfer[] = [];
  for (const { product, positions } of snapshot) {
    const remaining = new Map(positions.map(p => [p.location.id, p.surplus]));
    for (const destination of positions.filter(p => p.shortage.gt(0) && (!warehouseId || p.location.warehouseId === warehouseId))) {
      let shortage = destination.shortage;
      for (const source of positions.filter(p => p.location.id !== destination.location.id)) {
        const available = remaining.get(source.location.id)!;
        const quantity = Prisma.Decimal.min(available, shortage);
        if (quantity.lte(0)) continue;
        recommendations.push({ productId: product.id, product: product.name, sku: product.sku, unit: product.unit.symbol,
          sourceLocationId: source.location.id, source: `${source.location.warehouse.name} / ${source.location.name}`,
          destinationLocationId: destination.location.id, destination: `${destination.location.warehouse.name} / ${destination.location.name}`, quantity: quantity.toString() });
        remaining.set(source.location.id, available.sub(quantity)); shortage = shortage.sub(quantity);
      }
    }
  }
  return recommendations;
}

export async function runInventoryTool(name: ToolName, args: z.infer<typeof toolArgs>): Promise<Evidence> {
  return prisma.$transaction(tx => readInventoryTool(name, args, tx), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 10000 });
}

async function readInventoryTool(name: ToolName, args: z.infer<typeof toolArgs>, tx: Prisma.TransactionClient): Promise<Evidence> {
  const asOf = new Date().toISOString();
  const evidence = (title: string, source: string, rows: Evidence['rows'], columns: string[], note: string): Evidence => ({ title, source, rows: rows.slice(0, 20), columns, note, total: rows.length, asOf });
  if (name === 'inventory_summary') {
    const dashboard = await getDashboard({ warehouseId: args.warehouseId ?? undefined }, tx);
    const labels: Record<string, string> = { totalProductsInStock: 'Products in stock', lowStock: 'Low stock', outOfStock: 'Out of stock', pendingReceipts: 'Pending receipts', pendingDeliveries: 'Pending deliveries', scheduledTransfers: 'Pending transfers' };
    const metrics = Object.entries(dashboard.kpis).map(([key, value]) => ({ label: labels[key] ?? key, value: value ?? 0 }));
    return { ...evidence('Inventory overview', 'StockBalance · ReorderRule · StockOperation', [], [], 'Current stock and pending documents. Products in stock is not the total catalog count.'), total: metrics.length, metrics };
  }
  if (name === 'pending_operations') {
    const where: Prisma.StockOperationWhereInput = { status: { in: ['DRAFT', 'WAITING', 'READY'] }, type: args.operationType ?? undefined,
      ...(args.warehouseId ? { OR: [{ sourceLocation: { warehouseId: args.warehouseId } }, { destinationLocation: { warehouseId: args.warehouseId } }] } : {}),
      ...(args.search ? { lines: { some: { product: { OR: [{ name: { contains: args.search, mode: 'insensitive' } }, { sku: { contains: args.search, mode: 'insensitive' } }] } } } } : {}) };
    const [operations, total] = await Promise.all([tx.stockOperation.findMany({ where, orderBy: { createdAt: 'desc' }, take: 20, select: { reference: true, type: true, status: true, scheduledAt: true, _count: { select: { lines: true } } } }), tx.stockOperation.count({ where })]);
    return { ...evidence('Pending operations', 'StockOperation · StockOperationLine', operations.map(o => ({ Reference: o.reference, Type: o.type, Status: o.status, Lines: o._count.lines, Scheduled: o.scheduledAt?.toISOString() ?? 'Not scheduled' })), ['Reference', 'Type', 'Status', 'Lines', 'Scheduled'], 'Newest 20 matching pending documents. Drafts have no finalized stock effect.'), total };
  }
  if (name === 'recent_movements') {
    const where: Prisma.StockLedgerEntryWhereInput = { movementType: args.operationType ?? undefined,
      ...(args.from || args.to ? { createdAt: { gte: args.from ? new Date(args.from) : undefined, lte: args.to ? new Date(args.to) : undefined } } : {}),
      ...(args.auditOnly ? { OR: [{ reversalOfId: { not: null } }, { reversal: { isNot: null } }] } : {}),
      ...(args.warehouseId ? { AND: [{ OR: [{ sourceLocation: { warehouseId: args.warehouseId } }, { destinationLocation: { warehouseId: args.warehouseId } }] }] } : {}),
      ...(args.search ? { product: { OR: [{ name: { contains: args.search, mode: 'insensitive' } }, { sku: { contains: args.search, mode: 'insensitive' } }] } } : {}) };
    const [entries, total] = await Promise.all([tx.stockLedgerEntry.findMany({ where, take: 20, orderBy: { createdAt: 'desc' }, include: {
      product: { select: { name: true, unit: { select: { symbol: true } } } }, createdBy: { select: { name: true } },
      reversalOf: { select: { reference: true } }, reversal: { select: { reference: true, createdAt: true, reason: true, createdBy: { select: { name: true } } } },
    } }), tx.stockLedgerEntry.count({ where })]);
    return { ...evidence('Movement audit', 'StockLedgerEntry · User (name only)', entries.map(e => ({ Reference: e.reference, Product: e.product.name, Quantity: `${e.quantity} ${e.product.unit.symbol}`, Type: e.movementType, At: e.createdAt.toISOString(), By: e.createdBy.name, Audit: e.reversalOf ? `Reverses ${e.reversalOf.reference}` : e.reversal ? `Reversed by ${e.reversal.reference}; ${e.reversal.createdBy.name}; ${e.reversal.createdAt.toISOString()}; ${e.reversal.reason ?? ''}` : 'Original', Reason: e.reason ?? 'Not recorded' })), ['Reference', 'Product', 'Quantity', 'Type', 'At', 'By', 'Audit', 'Reason'], 'Newest 20 matches, not an exhaustive history. Transfer quantity is magnitude; its company-wide net effect is zero. Reversal location effects are compensating.'), total };
  }
  if (name === 'transfer_opportunities') {
    const transfers = await transferOpportunities(args.search, args.warehouseId, tx);
    return { ...evidence('Internal transfer opportunities', 'StockBalance · ReorderRule · pending StockOperationLine', transfers.map(t => ({ Product: `${t.product} (${t.sku})`, From: t.source, To: t.destination, Quantity: `${t.quantity} ${t.unit}` })), ['Product', 'From', 'To', 'Quantity'], 'Surplus = max(0, on hand − pending outgoing − source minimum). Demand = max(0, destination minimum − projected stock). Each source surplus is allocated once. Recommendations do not move stock.'), transfers: transfers.slice(0, 20) };
  }
  const snapshot = await stockSnapshot(args.search, tx);
  const positions = snapshot.flatMap(({ product, positions }) => positions.filter(p => !args.warehouseId || p.location.warehouseId === args.warehouseId).map(position => ({ product, ...position })));
  if (name === 'stock_risk') {
    const since = new Date(Date.now() - 30 * 86400000);
    const history = await tx.stockLedgerEntry.findMany({ where: { productId: { in: snapshot.map(s => s.product.id) }, movementType: 'DELIVERY', createdAt: { gte: since } },
      select: { productId: true, sourceLocationId: true, sourceBefore: true, sourceAfter: true, createdAt: true, reversalOfId: true }, take: 10001 });
    if (history.length > 10000) throw new ApiError(422, 'AI_SCOPE_TOO_LARGE', 'Narrow risk analysis to a product or SKU.');
    const rows = positions.map(p => {
      const entries = history.filter(e => e.productId === p.product.id && e.sourceLocationId === p.location.id);
      const days = Math.min(30, Math.max(1, Math.ceil((Date.now() - p.product.createdAt.getTime()) / 86400000)));
      const activeDays = new Set(entries.filter(e => !e.reversalOfId).map(e => e.createdAt.toISOString().slice(0, 10))).size;
      const outbound = positive(entries.reduce((sum, e) => sum.add((e.sourceBefore ?? zero()).sub(e.sourceAfter ?? zero())), zero()));
      const sufficient = days >= 7 && activeDays >= 2 && outbound.gt(0);
      const average = sufficient ? outbound.div(days) : null;
      const coverage = average ? positive(p.projected).div(average) : null;
      const risk = !coverage ? 'INSUFFICIENT HISTORY' : coverage.lte(3) ? 'CRITICAL' : coverage.lte(7) ? 'HIGH' : coverage.lte(14) ? 'MEDIUM' : 'LOW';
      return { Product: `${p.product.name} (${p.product.sku})`, Location: `${p.location.warehouse.name} / ${p.location.name}`, Current: `${p.onHand} ${p.product.unit.symbol}`, Projected: `${p.projected} ${p.product.unit.symbol}`, 'Daily outbound': average ? `${average.toFixed(3)} ${p.product.unit.symbol}` : 'Insufficient history', 'Coverage days': coverage ? coverage.toFixed(1) : 'Not estimated', Risk: risk, 'Window days': days };
    }).sort((a, b) => ['CRITICAL', 'HIGH', 'MEDIUM', 'INSUFFICIENT HISTORY', 'LOW'].indexOf(a.Risk) - ['CRITICAL', 'HIGH', 'MEDIUM', 'INSUFFICIENT HISTORY', 'LOW'].indexOf(b.Risk));
    return { ...evidence('Stock risk analysis', 'StockBalance · pending operations · 30-day delivery ledger', rows, ['Product', 'Location', 'Current', 'Projected', 'Daily outbound', 'Coverage days', 'Risk', 'Window days'], 'Directional estimate, not a demand forecast. Delivery reversals reduce outbound consumption. At least 7 observed calendar days and 2 outbound dates are required. Coverage = max(projected, 0) / average net daily outbound. Critical ≤3 days, high ≤7, medium ≤14. Without sufficient history no forecast is assigned; inspect current stock separately.'), metrics: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INSUFFICIENT HISTORY'].map(label => ({ label, value: rows.filter(row => row.Risk === label).length })) };
  }
  if (name === 'low_stock' || name === 'out_of_stock') {
    const rows = snapshot.flatMap(({ product }) => {
      const scoped = { balances: product.balances.filter(b => !args.warehouseId || b.location.warehouseId === args.warehouseId), reorderRules: product.reorderRules.filter(r => !args.warehouseId || r.location.warehouseId === args.warehouseId) };
      const status = stockHealth(scoped);
      return status === 'HEALTHY' || (name === 'out_of_stock' && status !== 'OUT_OF_STOCK') ? [] : [{ Product: product.name, SKU: product.sku, Stock: `${scoped.balances.reduce((s, b) => s.add(b.quantity), zero())} ${product.unit.symbol}`, Status: status }];
    });
    return evidence('Products needing attention', 'StockBalance · ReorderRule', rows, ['Product', 'SKU', 'Stock', 'Status'], 'Same current-stock classification as dashboard: out if total ≤0; low if any location is at/below its minimum.');
  }
  const rows = positions.filter(p => name !== 'replenishment' || p.shortage.gt(0)).map(p => ({ Product: p.product.name, SKU: p.product.sku, Warehouse: p.location.warehouse.name, Location: p.location.name, 'On hand': `${p.onHand} ${p.product.unit.symbol}`, Minimum: p.minimum.toString(), Incoming: p.incoming.toString(), Outgoing: p.outgoing.toString(), Projected: p.projected.toString(), Shortage: p.shortage.toString() }));
  // Products without a balance/rule must not vanish from a product lookup.
  if (name === 'product_stock') for (const s of snapshot.filter(s => !s.positions.length)) rows.push({ Product: s.product.name, SKU: s.product.sku, Warehouse: 'Not assigned', Location: 'No balance or rule', 'On hand': `0 ${s.product.unit.symbol}`, Minimum: '0', Incoming: '0', Outgoing: '0', Projected: '0', Shortage: '0' });
  return { ...evidence(name === 'replenishment' ? 'Replenishment requirements' : 'Stock by warehouse and location', 'StockBalance · Location · Warehouse · ReorderRule · pending lines', rows, ['Product', 'SKU', 'Warehouse', 'Location', 'On hand', 'Minimum', 'Incoming', 'Outgoing', 'Projected', 'Shortage'], `All quantities on a row use its product unit. Projected = on hand + pending incoming − pending outgoing. ${snapshot.length > 1 && args.search ? 'Multiple matching products: use the SKU to disambiguate.' : ''} No matches means no matching records, not proof of zero company-wide stock. Minimum 0 may mean no reorder rule.`),
    ...(name === 'warehouse_availability' ? { warehouses: await tx.warehouse.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 100 }) } : {}),
    ...(name === 'product_stock' && args.search ? { metrics: snapshot.slice(0, 20).map(({ product, positions: allPositions }) => ({ label: `${product.name} (${product.sku}) · total in scope`, value: `${allPositions.filter(p => !args.warehouseId || p.location.warehouseId === args.warehouseId).reduce((sum, p) => sum.add(p.onHand), zero())} ${product.unit.symbol}` })) } : {}),
  };
}
