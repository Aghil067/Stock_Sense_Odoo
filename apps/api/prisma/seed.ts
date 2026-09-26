import bcrypt from 'bcryptjs';
import { OperationType, Prisma, PrismaClient, Role } from '@prisma/client';
import { advanceDelivery, createOperation, validateOperation } from '../src/modules/operations/operation.service.js';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('Demo@12345', 12);
  const manager = await prisma.user.upsert({
    where: { email: 'manager@stocksense.local' },
    update: {},
    create: { name: 'Aarav Mehta', email: 'manager@stocksense.local', passwordHash, role: Role.MANAGER },
  });
  await prisma.user.upsert({
    where: { email: 'staff@stocksense.local' },
    update: {},
    create: { name: 'Maya Singh', email: 'staff@stocksense.local', passwordHash, role: Role.STAFF },
  });

  const [rawMaterials, finishedGoods, safety, kg, units] = await Promise.all([
    prisma.category.upsert({ where: { name: 'Raw Materials' }, update: {}, create: { name: 'Raw Materials' } }),
    prisma.category.upsert({ where: { name: 'Finished Goods' }, update: {}, create: { name: 'Finished Goods' } }),
    prisma.category.upsert({ where: { name: 'Safety Equipment' }, update: {}, create: { name: 'Safety Equipment' } }),
    prisma.unitOfMeasure.upsert({ where: { symbol: 'kg' }, update: {}, create: { name: 'Kilograms', symbol: 'kg' } }),
    prisma.unitOfMeasure.upsert({ where: { symbol: 'pcs' }, update: {}, create: { name: 'Pieces', symbol: 'pcs' } }),
  ]);

  const mainWarehouse = await prisma.warehouse.upsert({
    where: { code: 'WH-MAIN' }, update: {}, create: { name: 'Main Warehouse', code: 'WH-MAIN', address: 'Ahmedabad Operations Hub' },
  });
  const cityWarehouse = await prisma.warehouse.upsert({
    where: { code: 'WH-CITY' }, update: {}, create: { name: 'City Fulfilment Center', code: 'WH-CITY', address: 'Central Dispatch Zone' },
  });
  const mainStock = await prisma.location.upsert({
    where: { warehouseId_code: { warehouseId: mainWarehouse.id, code: 'STOCK' } }, update: {},
    create: { name: 'Main Stock', code: 'STOCK', warehouseId: mainWarehouse.id },
  });
  const production = await prisma.location.upsert({
    where: { warehouseId_code: { warehouseId: mainWarehouse.id, code: 'PROD' } }, update: {},
    create: { name: 'Production Rack', code: 'PROD', warehouseId: mainWarehouse.id },
  });
  const dispatch = await prisma.location.upsert({
    where: { warehouseId_code: { warehouseId: cityWarehouse.id, code: 'DISPATCH' } }, update: {},
    create: { name: 'Dispatch Floor', code: 'DISPATCH', warehouseId: cityWarehouse.id },
  });

  const steel = await prisma.product.upsert({
    where: { sku: 'RM-STEEL-01' }, update: {},
    create: { name: 'Steel Rods', sku: 'RM-STEEL-01', description: 'Structural steel rods for production', categoryId: rawMaterials.id, unitId: kg.id },
  });
  const chair = await prisma.product.upsert({
    where: { sku: 'FG-CHAIR-01' }, update: {},
    create: { name: 'Ergo Chair', sku: 'FG-CHAIR-01', description: 'Finished ergonomic office chair', categoryId: finishedGoods.id, unitId: units.id },
  });
  const gloves = await prisma.product.upsert({
    where: { sku: 'SAFE-GLOVE-01' }, update: {},
    create: { name: 'Safety Gloves', sku: 'SAFE-GLOVE-01', description: 'Cut-resistant warehouse gloves', categoryId: safety.id, unitId: units.id },
  });
  const helmets = await prisma.product.upsert({
    where: { sku: 'SAFE-HELMET-01' }, update: {},
    create: { name: 'Safety Helmets', sku: 'SAFE-HELMET-01', description: 'Industrial impact protection helmets', categoryId: safety.id, unitId: units.id },
  });

  await Promise.all([
    prisma.reorderRule.upsert({ where: { productId_locationId: { productId: steel.id, locationId: mainStock.id } }, update: { minimumQty: 40 }, create: { productId: steel.id, locationId: mainStock.id, minimumQty: 40 } }),
    prisma.reorderRule.upsert({ where: { productId_locationId: { productId: chair.id, locationId: dispatch.id } }, update: { minimumQty: 12 }, create: { productId: chair.id, locationId: dispatch.id, minimumQty: 12 } }),
    prisma.reorderRule.upsert({ where: { productId_locationId: { productId: gloves.id, locationId: mainStock.id } }, update: { minimumQty: 20 }, create: { productId: gloves.id, locationId: mainStock.id, minimumQty: 20 } }),
    prisma.reorderRule.upsert({ where: { productId_locationId: { productId: helmets.id, locationId: mainStock.id } }, update: { minimumQty: 10 }, create: { productId: helmets.id, locationId: mainStock.id, minimumQty: 10 } }),
  ]);

  if (await prisma.stockOperation.count() === 0) {
    const receipt = await createOperation({
      type: OperationType.RECEIPT, partnerName: 'Western Metals Pvt Ltd', destinationLocationId: mainStock.id,
      lines: [{ productId: steel.id, quantity: 100 }],
    }, manager.id);
    await validateOperation(receipt.id, manager.id);

    const finishedReceipt = await createOperation({
      type: OperationType.RECEIPT, partnerName: 'StockSense Assembly', destinationLocationId: dispatch.id,
      lines: [{ productId: chair.id, quantity: 40 }],
    }, manager.id);
    await validateOperation(finishedReceipt.id, manager.id);

    const safetyReceipt = await createOperation({
      type: OperationType.RECEIPT, partnerName: 'SafeWork Supplies', destinationLocationId: mainStock.id,
      lines: [{ productId: gloves.id, quantity: 12 }],
    }, manager.id);
    await validateOperation(safetyReceipt.id, manager.id);

    const transfer = await createOperation({
      type: OperationType.INTERNAL_TRANSFER, sourceLocationId: mainStock.id, destinationLocationId: production.id,
      reason: 'Production allocation', lines: [{ productId: steel.id, quantity: 25 }],
    }, manager.id);
    await validateOperation(transfer.id, manager.id);

    const delivery = await createOperation({
      type: OperationType.DELIVERY, partnerName: 'Orbit Offices', sourceLocationId: dispatch.id,
      lines: [{ productId: chair.id, quantity: 10 }],
    }, manager.id);
    await advanceDelivery(delivery.id, 'pick');
    await advanceDelivery(delivery.id, 'pack');
    await validateOperation(delivery.id, manager.id);

    const adjustment = await createOperation({
      type: OperationType.ADJUSTMENT, sourceLocationId: production.id, reason: 'Physical cycle count',
      lines: [{ productId: steel.id, quantity: 22, countedQuantity: 22 }],
    }, manager.id);
    await validateOperation(adjustment.id, manager.id);

    await createOperation({
      type: OperationType.RECEIPT, partnerName: 'SafeWork Supplies', destinationLocationId: mainStock.id,
      scheduledAt: new Date(Date.now() + 86400000), lines: [{ productId: helmets.id, quantity: 30 }],
    }, manager.id);
  }

  const balanceCount = await prisma.stockBalance.count();
  const ledgerCount = await prisma.stockLedgerEntry.count();
  console.log(`Seeded StockSense: ${balanceCount} stock balances and ${ledgerCount} ledger entries.`);
  console.log('Demo login: manager@stocksense.local / Demo@12345');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
