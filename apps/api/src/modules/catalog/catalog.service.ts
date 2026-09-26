import { OperationType, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../lib/api-error.js';
import { createOperation, validateOperation } from '../operations/operation.service.js';
import { stockHealth } from '../../lib/stock-health.js';

const productInclude = {
  category: true,
  unit: true,
  balances: { include: { location: { include: { warehouse: true } } } },
  reorderRules: { include: { location: { include: { warehouse: true } } } },
} satisfies Prisma.ProductInclude;

function serializeProduct<T extends Prisma.ProductGetPayload<{ include: typeof productInclude }>>(product: T) {
  const totalStock = product.balances.reduce((sum, balance) => sum.add(balance.quantity), new Prisma.Decimal(0));
  return { ...product, totalStock, stockStatus: stockHealth(product) };
}

export async function listProducts(filters: { search?: string; categoryId?: string; locationId?: string; stockStatus?: string }) {
  const products = await prisma.product.findMany({
    where: {
      ...(filters.search ? { OR: [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { sku: { contains: filters.search, mode: 'insensitive' } },
      ] } : {}),
      categoryId: filters.categoryId,
    },
    include: productInclude,
    orderBy: { name: 'asc' },
  });
  const data = products.map((product) => serializeProduct(filters.locationId ? {
    ...product,
    balances: product.balances.filter((balance) => balance.locationId === filters.locationId),
    reorderRules: product.reorderRules.filter((rule) => rule.locationId === filters.locationId),
  } : product));
  return filters.stockStatus ? data.filter((product) => product.stockStatus === filters.stockStatus) : data;
}

export async function getProduct(id: string) {
  const product = await prisma.product.findUniqueOrThrow({
    where: { id },
    include: {
      ...productInclude,
      ledgerEntries: {
        include: { sourceLocation: { include: { warehouse: true } }, destinationLocation: { include: { warehouse: true } }, createdBy: { select: { name: true } }, reversalOf: { select: { id: true, reference: true } }, reversal: { select: { id: true, reference: true } } },
        orderBy: { createdAt: 'desc' }, take: 20,
      },
    },
  });
  return serializeProduct(product);
}

export async function createProduct(input: {
  name: string; sku: string; description?: string; categoryId: string; unitId: string;
  initialStock: number; initialLocationId?: string; reorderLevel?: number;
}, userId: string) {
  if (input.initialLocationId) {
    const location = await prisma.location.findUnique({ where: { id: input.initialLocationId }, select: { id: true } });
    if (!location) throw new ApiError(422, 'INVALID_LOCATION', 'Choose an existing location for opening stock or reorder level.');
  }
  const product = await prisma.product.create({
    data: {
      name: input.name, sku: input.sku, description: input.description,
      categoryId: input.categoryId, unitId: input.unitId,
      ...(input.initialLocationId && input.reorderLevel !== undefined ? {
        reorderRules: { create: { locationId: input.initialLocationId, minimumQty: new Prisma.Decimal(input.reorderLevel) } },
      } : {}),
    },
    include: productInclude,
  });

  if (input.initialStock > 0 && input.initialLocationId) {
    const opening = await createOperation({
      type: OperationType.ADJUSTMENT,
      sourceLocationId: input.initialLocationId,
      reason: 'Opening stock balance',
      lines: [{ productId: product.id, quantity: input.initialStock, countedQuantity: input.initialStock }],
    }, userId);
    await validateOperation(opening.id, userId);
  }
  return getProduct(product.id);
}

export async function updateProduct(id: string, input: { name?: string; sku?: string; description?: string | null; categoryId?: string; unitId?: string; isActive?: boolean }) {
  await prisma.$transaction(async tx => {
    const existing = await tx.product.findUniqueOrThrow({ where: { id }, select: { unitId: true, _count: { select: { operationLines: true, balances: true, reorderRules: true } } } });
    if (input.unitId && input.unitId !== existing.unitId && (existing._count.operationLines || existing._count.balances || existing._count.reorderRules)) {
      throw new ApiError(409, 'UNIT_HAS_HISTORY', 'A product unit cannot change after stock, reorder rules or operations exist. Create a separate product for a different unit.');
    }
    await tx.product.update({ where: { id }, data: input });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return getProduct(id);
}

export async function upsertReorderRule(productId: string, input: { locationId: string; minimumQty: number }) {
  await prisma.reorderRule.upsert({
    where: { productId_locationId: { productId, locationId: input.locationId } },
    create: { productId, locationId: input.locationId, minimumQty: new Prisma.Decimal(input.minimumQty) },
    update: { minimumQty: new Prisma.Decimal(input.minimumQty) },
  });
  return getProduct(productId);
}

export function getMasterData() {
  return Promise.all([
    prisma.category.findMany({ orderBy: { name: 'asc' } }),
    prisma.unitOfMeasure.findMany({ orderBy: { name: 'asc' } }),
    prisma.warehouse.findMany({ include: { locations: { orderBy: { name: 'asc' } } }, orderBy: { name: 'asc' } }),
  ]).then(([categories, units, warehouses]) => ({ categories, units, warehouses }));
}

export const createCategory = (data: { name: string }) => prisma.category.create({ data });
export const updateCategory = (id: string, data: { name?: string }) => prisma.category.update({ where: { id }, data });
export async function deleteCategory(id: string) {
  const count = await prisma.product.count({ where: { categoryId: id } });
  if (count > 0) {
    throw new ApiError(409, 'CANNOT_DELETE', 'This category cannot be deleted because products are assigned to it.');
  }
  return prisma.category.delete({ where: { id } });
}
export const createUnit = (data: { name: string; symbol: string }) => prisma.unitOfMeasure.create({ data });
export const updateUnit = (id: string, data: { name?: string; symbol?: string }) => prisma.unitOfMeasure.update({ where: { id }, data });
export async function deleteUnit(id: string) {
  const count = await prisma.product.count({ where: { unitId: id } });
  if (count > 0) {
    throw new ApiError(409, 'CANNOT_DELETE', 'This unit of measure cannot be deleted because products are assigned to it.');
  }
  return prisma.unitOfMeasure.delete({ where: { id } });
}
export const createWarehouse = (data: { name: string; code: string; address?: string }) => prisma.warehouse.create({ data });
export const updateWarehouse = (id: string, data: { name?: string; code?: string; address?: string | null }) => prisma.warehouse.update({ where: { id }, data });
export async function deleteWarehouse(id: string) {
  const count = await prisma.location.count({ where: { warehouseId: id } });
  if (count > 0) {
    throw new ApiError(409, 'CANNOT_DELETE', 'This warehouse cannot be deleted because it contains stock locations.');
  }
  return prisma.warehouse.delete({ where: { id } });
}
export const createLocation = (data: { name: string; code: string; warehouseId: string }) => prisma.location.create({ data, include: { warehouse: true } });
export const updateLocation = (id: string, data: { name?: string; code?: string }) => prisma.location.update({ where: { id }, data, include: { warehouse: true } });
export async function deleteLocation(id: string) {
  const [balances, rules, operations, ledger] = await Promise.all([
    prisma.stockBalance.count({ where: { locationId: id } }),
    prisma.reorderRule.count({ where: { locationId: id } }),
    prisma.stockOperation.count({ where: { OR: [{ sourceLocationId: id }, { destinationLocationId: id }] } }),
    prisma.stockLedgerEntry.count({ where: { OR: [{ sourceLocationId: id }, { destinationLocationId: id }] } }),
  ]);
  if (balances > 0 || rules > 0 || operations > 0 || ledger > 0) {
    throw new ApiError(409, 'CANNOT_DELETE', 'This location cannot be deleted because inventory or movement history exists.');
  }
  return prisma.location.delete({ where: { id } });
}
