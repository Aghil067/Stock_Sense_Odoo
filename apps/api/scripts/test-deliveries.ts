import 'dotenv/config';
import { OperationStatus, OperationType, PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { advanceDelivery, cancelOperation, createOperation, validateOperation } from '../src/modules/operations/operation.service.js';

const prisma = new PrismaClient();

async function main() {
  console.log('=============== STARTING DELIVERY SUITE TESTS ===============');

  // Setup manager user
  const passwordHash = await bcrypt.hash('Demo@12345', 10);
  const manager = await prisma.user.upsert({
    where: { email: 'manager@stocksense.local' },
    update: {},
    create: { name: 'Aarav Mehta', email: 'manager@stocksense.local', passwordHash, role: Role.MANAGER },
  });

  // Get locations and products
  const mainStock = await prisma.location.findFirstOrThrow({ where: { code: 'STOCK' } });
  const steel = await prisma.product.findFirstOrThrow({ where: { sku: 'RM-STEEL-01' } });
  const gloves = await prisma.product.findFirstOrThrow({ where: { sku: 'SAFE-GLOVE-01' } });

  // Record initial stock for steel
  const initialSteelBalance = await prisma.stockBalance.findUnique({
    where: { productId_locationId: { productId: steel.id, locationId: mainStock.id } },
  });
  const initialSteelQty = Number(initialSteelBalance?.quantity ?? 0);
  console.log(`Initial Steel Rod stock at Main Stock: ${initialSteelQty} kg`);

  // ----------------------------------------------------
  // TEST A: DRAFT DELIVERY
  // ----------------------------------------------------
  console.log('\n--- TEST A: DRAFT DELIVERY ---');
  const deliveryA = await createOperation({
    type: OperationType.DELIVERY,
    partnerName: 'ABC Customer',
    sourceLocationId: mainStock.id,
    lines: [{ productId: steel.id, quantity: 10 }],
  }, manager.id);

  console.log(`Created delivery A: ${deliveryA.reference}, status: ${deliveryA.status}`);
  if (deliveryA.status !== OperationStatus.DRAFT) throw new Error('TEST A FAILED: Expected status DRAFT');

  const stockAfterDraft = await prisma.stockBalance.findUnique({
    where: { productId_locationId: { productId: steel.id, locationId: mainStock.id } },
  });
  if (Number(stockAfterDraft?.quantity) !== initialSteelQty) throw new Error('TEST A FAILED: Stock should not change on DRAFT');

  const ledgerDraftCount = await prisma.stockLedgerEntry.count({
    where: { reference: deliveryA.reference },
  });
  if (ledgerDraftCount !== 0) throw new Error('TEST A FAILED: No ledger entry should exist for DRAFT');
  console.log('✓ TEST A PASSED: DRAFT delivery created without modifying stock or creating ledger entries.');

  // ----------------------------------------------------
  // TEST B: PICK
  // ----------------------------------------------------
  console.log('\n--- TEST B: PICK DELIVERY ---');
  const deliveryB = await advanceDelivery(deliveryA.id, 'pick');
  console.log(`Advanced delivery A to PICK, status: ${deliveryB.status}`);
  if (deliveryB.status !== OperationStatus.WAITING) throw new Error('TEST B FAILED: Expected status WAITING after pick');

  const stockAfterPick = await prisma.stockBalance.findUnique({
    where: { productId_locationId: { productId: steel.id, locationId: mainStock.id } },
  });
  if (Number(stockAfterPick?.quantity) !== initialSteelQty) throw new Error('TEST B FAILED: Stock should not change on PICK');
  console.log('✓ TEST B PASSED: Pick transition succeeded (DRAFT -> WAITING).');

  // ----------------------------------------------------
  // TEST C: PACK
  // ----------------------------------------------------
  console.log('\n--- TEST C: PACK DELIVERY ---');
  const deliveryC = await advanceDelivery(deliveryA.id, 'pack');
  console.log(`Advanced delivery A to PACK, status: ${deliveryC.status}`);
  if (deliveryC.status !== OperationStatus.READY) throw new Error('TEST C FAILED: Expected status READY after pack');

  const stockAfterPack = await prisma.stockBalance.findUnique({
    where: { productId_locationId: { productId: steel.id, locationId: mainStock.id } },
  });
  if (Number(stockAfterPack?.quantity) !== initialSteelQty) throw new Error('TEST C FAILED: Stock should not change on PACK');
  console.log('✓ TEST C PASSED: Pack transition succeeded (WAITING -> READY).');

  // ----------------------------------------------------
  // TEST D: VALIDATE
  // ----------------------------------------------------
  console.log('\n--- TEST D: VALIDATE DELIVERY ---');
  const deliveryD = await validateOperation(deliveryA.id, manager.id);
  console.log(`Validated delivery A, status: ${deliveryD.status}`);
  if (deliveryD.status !== OperationStatus.DONE) throw new Error('TEST D FAILED: Expected status DONE');

  const stockAfterValidate = await prisma.stockBalance.findUnique({
    where: { productId_locationId: { productId: steel.id, locationId: mainStock.id } },
  });
  const expectedQtyAfterValidate = initialSteelQty - 10;
  if (Number(stockAfterValidate?.quantity) !== expectedQtyAfterValidate) {
    throw new Error(`TEST D FAILED: Expected stock ${expectedQtyAfterValidate}, got ${stockAfterValidate?.quantity}`);
  }

  const ledgerEntryD = await prisma.stockLedgerEntry.findFirstOrThrow({
    where: { reference: deliveryA.reference },
  });
  console.log(`Ledger entry quantity: ${ledgerEntryD.quantity.toString()}`);
  if (Number(ledgerEntryD.quantity) !== -10) throw new Error('TEST D FAILED: Expected ledger quantity -10');
  console.log('✓ TEST D PASSED: Delivery validated. Stock decreased by 10, negative ledger entry created.');

  // ----------------------------------------------------
  // TEST E: INSUFFICIENT STOCK
  // ----------------------------------------------------
  console.log('\n--- TEST E: INSUFFICIENT STOCK ---');
  const currentSteelQty = Number(stockAfterValidate?.quantity);
  const requestedExcessiveQty = currentSteelQty + 500;

  const deliveryE = await createOperation({
    type: OperationType.DELIVERY,
    partnerName: 'Overdemanding Client',
    sourceLocationId: mainStock.id,
    lines: [{ productId: steel.id, quantity: requestedExcessiveQty }],
  }, manager.id);

  await advanceDelivery(deliveryE.id, 'pick');
  await advanceDelivery(deliveryE.id, 'pack');

  let failedE = false;
  try {
    await validateOperation(deliveryE.id, manager.id);
  } catch (err: any) {
    failedE = true;
    console.log(`Validation correctly failed with error: ${err.message}`);
    if (err.code !== 'INSUFFICIENT_STOCK') throw new Error(`TEST E FAILED: Expected INSUFFICIENT_STOCK error code, got ${err.code}`);
  }
  if (!failedE) throw new Error('TEST E FAILED: Excessive delivery validation should have failed');

  const stockAfterFailedE = await prisma.stockBalance.findUnique({
    where: { productId_locationId: { productId: steel.id, locationId: mainStock.id } },
  });
  if (Number(stockAfterFailedE?.quantity) !== currentSteelQty) throw new Error('TEST E FAILED: Stock modified after failed validation');
  console.log('✓ TEST E PASSED: Insufficient stock validation rejected without modifying inventory.');

  // ----------------------------------------------------
  // TEST F: MULTI-LINE ATOMIC FAILURE
  // ----------------------------------------------------
  console.log('\n--- TEST F: MULTI-LINE ATOMIC FAILURE ---');
  const initialGlovesBalance = await prisma.stockBalance.findUnique({
    where: { productId_locationId: { productId: gloves.id, locationId: mainStock.id } },
  });
  const initialGlovesQty = Number(initialGlovesBalance?.quantity ?? 0);

  const deliveryF = await createOperation({
    type: OperationType.DELIVERY,
    partnerName: 'Mixed Order Client',
    sourceLocationId: mainStock.id,
    lines: [
      { productId: steel.id, quantity: 5 }, // Valid quantity
      { productId: gloves.id, quantity: initialGlovesQty + 999 }, // Excessive quantity
    ],
  }, manager.id);

  await advanceDelivery(deliveryF.id, 'pick');
  await advanceDelivery(deliveryF.id, 'pack');

  let failedF = false;
  try {
    await validateOperation(deliveryF.id, manager.id);
  } catch (err: any) {
    failedF = true;
    console.log(`Multi-line validation correctly failed: ${err.message}`);
  }
  if (!failedF) throw new Error('TEST F FAILED: Multi-line validation should have failed');

  const steelAfterF = await prisma.stockBalance.findUnique({
    where: { productId_locationId: { productId: steel.id, locationId: mainStock.id } },
  });
  const glovesAfterF = await prisma.stockBalance.findUnique({
    where: { productId_locationId: { productId: gloves.id, locationId: mainStock.id } },
  });

  if (Number(steelAfterF?.quantity) !== currentSteelQty || Number(glovesAfterF?.quantity) !== initialGlovesQty) {
    throw new Error('TEST F FAILED: Atomic rollback failed! Stock changed for one of the products.');
  }
  console.log('✓ TEST F PASSED: Multi-line atomic rollback verified. Neither product stock was modified.');

  // ----------------------------------------------------
  // TEST G: DOUBLE VALIDATION PROTECTION
  // ----------------------------------------------------
  console.log('\n--- TEST G: DOUBLE VALIDATION PROTECTION ---');
  let failedG = false;
  try {
    await validateOperation(deliveryA.id, manager.id);
  } catch (err: any) {
    failedG = true;
    console.log(`Double validation correctly rejected: ${err.message}`);
    if (err.code !== 'ALREADY_COMPLETED') throw new Error(`TEST G FAILED: Expected ALREADY_COMPLETED, got ${err.code}`);
  }
  if (!failedG) throw new Error('TEST G FAILED: Re-validating DONE delivery should have failed');

  const stockAfterG = await prisma.stockBalance.findUnique({
    where: { productId_locationId: { productId: steel.id, locationId: mainStock.id } },
  });
  if (Number(stockAfterG?.quantity) !== expectedQtyAfterValidate) throw new Error('TEST G FAILED: Stock changed on double validation attempt');
  console.log('✓ TEST G PASSED: Double validation rejected.');

  // ----------------------------------------------------
  // TEST H: CANCEL DELIVERY
  // ----------------------------------------------------
  console.log('\n--- TEST H: CANCEL DELIVERY ---');
  const deliveryH = await createOperation({
    type: OperationType.DELIVERY,
    partnerName: 'Canceled Customer',
    sourceLocationId: mainStock.id,
    lines: [{ productId: steel.id, quantity: 15 }],
  }, manager.id);

  const canceledH = await cancelOperation(deliveryH.id);
  console.log(`Canceled delivery H status: ${canceledH.status}`);
  if (canceledH.status !== OperationStatus.CANCELED) throw new Error('TEST H FAILED: Expected status CANCELED');

  const stockAfterH = await prisma.stockBalance.findUnique({
    where: { productId_locationId: { productId: steel.id, locationId: mainStock.id } },
  });
  if (Number(stockAfterH?.quantity) !== expectedQtyAfterValidate) throw new Error('TEST H FAILED: Stock changed after cancel');

  const ledgerHCount = await prisma.stockLedgerEntry.count({
    where: { reference: deliveryH.reference },
  });
  if (ledgerHCount !== 0) throw new Error('TEST H FAILED: No ledger entry should exist for CANCELED delivery');
  console.log('✓ TEST H PASSED: Delivery canceled without inventory reduction or ledger entry.');

  // ----------------------------------------------------
  // REGRESSION TEST: RECEIPT -> DELIVERY LIFECYCLE
  // ----------------------------------------------------
  console.log('\n--- REGRESSION TEST: RECEIPT -> DELIVERY LIFECYCLE ---');
  const startRegStock = Number(stockAfterH?.quantity);

  // 1. Receipt + 50 kg
  const regReceipt = await createOperation({
    type: OperationType.RECEIPT,
    partnerName: 'Regression Supplier',
    destinationLocationId: mainStock.id,
    lines: [{ productId: steel.id, quantity: 50 }],
  }, manager.id);
  await validateOperation(regReceipt.id, manager.id);

  const stockAfterRegReceipt = await prisma.stockBalance.findUnique({
    where: { productId_locationId: { productId: steel.id, locationId: mainStock.id } },
  });
  console.log(`Stock after Receipt +50 kg: ${stockAfterRegReceipt?.quantity.toString()} kg (expected ${startRegStock + 50})`);
  if (Number(stockAfterRegReceipt?.quantity) !== startRegStock + 50) throw new Error('REGRESSION FAILED: Receipt did not increase stock');

  // 2. Delivery - 20 kg
  const regDelivery = await createOperation({
    type: OperationType.DELIVERY,
    partnerName: 'Regression Customer',
    sourceLocationId: mainStock.id,
    lines: [{ productId: steel.id, quantity: 20 }],
  }, manager.id);
  await advanceDelivery(regDelivery.id, 'pick');
  await advanceDelivery(regDelivery.id, 'pack');
  await validateOperation(regDelivery.id, manager.id);

  const stockAfterRegDelivery = await prisma.stockBalance.findUnique({
    where: { productId_locationId: { productId: steel.id, locationId: mainStock.id } },
  });
  const finalRegStock = startRegStock + 50 - 20;
  console.log(`Stock after Delivery -20 kg: ${stockAfterRegDelivery?.quantity.toString()} kg (expected ${finalRegStock})`);
  if (Number(stockAfterRegDelivery?.quantity) !== finalRegStock) throw new Error('REGRESSION FAILED: Delivery did not decrease stock');

  console.log('✓ REGRESSION TEST PASSED: Receipt (+50) then Delivery (-20) verified.');
  console.log('\n=============== ALL DELIVERY SUITE TESTS PASSED 100% ===============');
}

main()
  .catch((err) => {
    console.error('FATAL TEST ERROR:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
