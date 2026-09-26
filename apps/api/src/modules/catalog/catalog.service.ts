import { OperationType, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { ApiError } from '../../lib/api-error.js';
import { createOperation, validateOperation } from '../operations/operation.service.js';

const productInclude = {
  category: true,
  unit: true,
  balances: { include: { location: { include: { warehouse: true } } } },
  reorderRules: { include: { location: { include: { warehouse: true } } } },
} satisfies Prisma.ProductInclude;

function serializeProduct<T extends Prisma.ProductGetPayload<{ include: typeof productInclude }>>(product: T) {
  const totalStock = product.balances.reduce((sum, balance) => sum.add(balance.quantity), new Prisma.Decimal(0));
  const isLow = product.reorderRules.some((rule) => {
    const balance = product.balances.find((item) => item.locationId === rule.locationId)?.quantity ?? new Prisma.Decimal(0);
    return balance.lte(rule.minimumQty);
  });
  return { ...product, totalStock, stockStatus: totalStock.lte(0) ? 'OUT_OF_STOCK' : isLow ? 'LOW_STOCK' : 'HEALTHY' };
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
        include: { sourceLocation: { include: { warehouse: true } }, destinationLocation: { include: { warehouse: true } }, createdBy: { select: { name: true } } },
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

export async function updateProduct(id: string, input: Prisma.ProductUpdateInput) {
  await prisma.product.update({ where: { id }, data: input });
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
export const createUnit = (data: { name: string; symbol: string }) => prisma.unitOfMeasure.create({ data });
export const createWarehouse = (data: { name: string; code: string; address?: string }) => prisma.warehouse.create({ data });
export const createLocation = (data: { name: string; code: string; warehouseId: string }) => prisma.location.create({ data, include: { warehouse: true } });
