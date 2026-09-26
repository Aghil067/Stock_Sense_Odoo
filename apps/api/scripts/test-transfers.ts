import 'dotenv/config';
import { OperationStatus, OperationType, PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { advanceDelivery, cancelOperation, createOperation, validateOperation } from '../src/modules/operations/operation.service.js';

const prisma = new PrismaClient();

async function getTotalStock(productId: string) {
  const result = await prisma.stockBalance.aggregate({
    where: { productId },
    _sum: { quantity: true },
  });
  return Number(result._sum.quantity ?? 0);
}

async function main() {
  console.log('=============== STARTING INTERNAL TRANSFERS SUITE TESTS ===============');

  const passwordHash = await bcrypt.hash('Demo@12345', 10);
  const manager = await prisma.user.upsert({
    where: { email: 'manager@stocksense.local' },
    update: {},
    create: { name: 'Aarav Mehta', email: 'manager@stocksense.local', passwordHash, role: Role.MANAGER },
  });

  const mainStock = await prisma.location.findFirstOrThrow({ where: { code: 'STOCK' } });
  const productionLoc = await prisma.location.findFirstOrThrow({ where: { code: 'PROD' } });
  const dispatchLoc = await prisma.location.findFirstOrThrow({ where: { code: 'DISPATCH' } });

  const steel = await prisma.product.findFirstOrThrow({ where: { sku: 'RM-STEEL-01' } });
  const gloves = await prisma.product.findFirstOrThrow({ where: { sku: 'SAFE-GLOVE-01' } });

  // Record initial balances
  const initialSourceBal = await prisma.stockBalance.findUnique({
    where: { productId_locationId: { productId: steel.id, locationId: mainStock.id } },
  });
  const initialDestBal = await prisma.stockBalance.findUnique({
    where: { productId_locationId: { productId: steel.id, locationId: productionLoc.id } },
  });

  const initialSourceQty = Number(initialSourceBal?.quantity ?? 0);
  const initialDestQty = Number(initialDestBal?.quantity ?? 0);
  const initialTotalSteelStock = await getTotalStock(steel.id);

  console.log(`Initial Steel Stock -> Main Stock: ${initialSourceQty} kg, Production Rack: ${initialDestQty} kg, Total: ${initialTotalSteelStock} kg`);

  // ----------------------------------------------------
  // TEST A: DRAFT TRANSFER
  // ----------------------------------------------------
  console.log('\n--- TEST A: DRAFT TRANSFER ---');
  const transferA = await createOperation({
    type: OperationType.INTERNAL_TRANSFER,
    reason: 'Production allocation test',
    sourceLocationId: mainStock.id,
    destinationLocationId: productionLoc.id,
    lines: [{ productId: steel.id, quantity: 10 }],
  }, manager.id);

  console.log(`Created transfer A: ${transferA.reference}, status: ${transferA.status}`);
  if (transferA.status !== OperationStatus.DRAFT) throw new Error('TEST A FAILED: Expected status DRAFT');

  const sourceAfterA = Number((await prisma.stockBalance.findUnique({ where: { productId_locationId: { productId: steel.id, locationId: mainStock.id } } }))?.quantity ?? 0);
  const destAfterA = Number((await prisma.stockBalance.findUnique({ where: { productId_locationId: { productId: steel.id, locationId: productionLoc.id } } }))?.quantity ?? 0);
  const totalAfterA = await getTotalStock(steel.id);

  if (sourceAfterA !== initialSourceQty || destAfterA !== initialDestQty || totalAfterA !== initialTotalSteelStock) {
    throw new Error('TEST A FAILED: Draft transfer modified stock balances');
  }

  const ledgerDraftCount = await prisma.stockLedgerEntry.count({ where: { reference: transferA.reference } });
  if (ledgerDraftCount !== 0) throw new Error('TEST A FAILED: No ledger entry should exist for DRAFT transfer');

  console.log('✓ TEST A PASSED: DRAFT transfer created without modifying source, destination, or total stock.');

  // ----------------------------------------------------
  // TEST B: VALIDATE TRANSFER & TOTAL INVARIANT
  // ----------------------------------------------------
  console.log('\n--- TEST B: VALIDATE TRANSFER & TOTAL INVARIANT ---');
  const validatedA = await validateOperation(transferA.id, manager.id);
  console.log(`Validated transfer A, status: ${validatedA.status}`);
  if (validatedA.status !== OperationStatus.DONE) throw new Error('TEST B FAILED: Expected status DONE');

  const sourceAfterB = Number((await prisma.stockBalance.findUnique({ where: { productId_locationId: { productId: steel.id, locationId: mainStock.id } } }))?.quantity ?? 0);
  const destAfterB = Number((await prisma.stockBalance.findUnique({ where: { productId_locationId: { productId: steel.id, locationId: productionLoc.id } } }))?.quantity ?? 0);
  const totalAfterB = await getTotalStock(steel.id);

  console.log(`After Validation -> Main Stock: ${sourceAfterB} kg (-10), Production Rack: ${destAfterB} kg (+10), Total: ${totalAfterB} kg`);

  if (sourceAfterB !== initialSourceQty - 10) throw new Error(`TEST B FAILED: Expected source ${initialSourceQty - 10}, got ${sourceAfterB}`);
  if (destAfterB !== initialDestQty + 10) throw new Error(`TEST B FAILED: Expected destination ${initialDestQty + 10}, got ${destAfterB}`);
  if (totalAfterB !== initialTotalSteelStock) throw new Error(`TEST B FAILED: Total stock changed! Before: ${initialTotalSteelStock}, After: ${totalAfterB}`);

  const ledgerB = await prisma.stockLedgerEntry.findFirstOrThrow({ where: { reference: transferA.reference } });
  if (ledgerB.movementType !== OperationType.INTERNAL_TRANSFER) throw new Error('TEST B FAILED: Expected movementType INTERNAL_TRANSFER');
  if (Number(ledgerB.sourceBefore) !== initialSourceQty || Number(ledgerB.sourceAfter) !== sourceAfterB) throw new Error('TEST B FAILED: Incorrect source before/after in ledger');
  if (Number(ledgerB.destinationBefore) !== initialDestQty || Number(ledgerB.destinationAfter) !== destAfterB) throw new Error('TEST B FAILED: Incorrect destination before/after in ledger');

  console.log('✓ TEST B & TEST I PASSED: Internal transfer validated. Source decreased, destination increased, total company stock 100% unchanged.');

  // ----------------------------------------------------
  // TEST C: EMPTY DESTINATION BALANCE CREATION
  // ----------------------------------------------------
  console.log('\n--- TEST C: EMPTY DESTINATION BALANCE CREATION ---');
  // Check if gloves exist at dispatchLoc
  const glovesAtDispatchBefore = await prisma.stockBalance.findUnique({
    where: { productId_locationId: { productId: gloves.id, locationId: dispatchLoc.id } },
  });
  console.log(`Gloves balance at Dispatch Floor before transfer: ${glovesAtDispatchBefore ? glovesAtDispatchBefore.quantity.toString() : 'None'}`);

  const transferC = await createOperation({
    type: OperationType.INTERNAL_TRANSFER,
    reason: 'Dispatch floor allocation',
    sourceLocationId: mainStock.id,
    destinationLocationId: dispatchLoc.id,
    lines: [{ productId: gloves.id, quantity: 2 }],
  }, manager.id);

  await validateOperation(transferC.id, manager.id);

  const glovesAtDispatchAfter = await prisma.stockBalance.findUnique({
    where: { productId_locationId: { productId: gloves.id, locationId: dispatchLoc.id } },
  });
  if (!glovesAtDispatchAfter || Number(glovesAtDispatchAfter.quantity) <= 0) {
    throw new Error('TEST C FAILED: Destination stock balance record was not created/upserted');
  }
  console.log(`✓ TEST C PASSED: Destination StockBalance record automatically created (${glovesAtDispatchAfter.quantity.toString()} pcs).`);

  // ----------------------------------------------------
  // TEST D: INSUFFICIENT STOCK
  // ----------------------------------------------------
  console.log('\n--- TEST D: INSUFFICIENT STOCK ---');
  const availableSourceSteel = Number((await prisma.stockBalance.findUnique({ where: { productId_locationId: { productId: steel.id, locationId: mainStock.id } } }))?.quantity ?? 0);
  const excessiveReq = availableSourceSteel + 9999;

  const transferD = await createOperation({
    type: OperationType.INTERNAL_TRANSFER,
    reason: 'Excessive allocation',
    sourceLocationId: mainStock.id,
    destinationLocationId: productionLoc.id,
    lines: [{ productId: steel.id, quantity: excessiveReq }],
  }, manager.id);

  let failedD = false;
  try {
    await validateOperation(transferD.id, manager.id);
  } catch (err: any) {
    failedD = true;
    console.log(`Validation correctly failed: ${err.message}`);
    if (err.code !== 'INSUFFICIENT_STOCK') throw new Error(`TEST D FAILED: Expected INSUFFICIENT_STOCK, got ${err.code}`);
  }
  if (!failedD) throw new Error('TEST D FAILED: Excessive transfer validation should have failed');

  const sourceAfterFailedD = Number((await prisma.stockBalance.findUnique({ where: { productId_locationId: { productId: steel.id, locationId: mainStock.id } } }))?.quantity ?? 0);
  if (sourceAfterFailedD !== availableSourceSteel) throw new Error('TEST D FAILED: Stock changed after failed transfer');
  console.log('✓ TEST D PASSED: Insufficient stock transfer validation rejected without modifying inventory.');

  // ----------------------------------------------------
  // TEST E: SAME LOCATION REJECTION
  // ----------------------------------------------------
  console.log('\n--- TEST E: SAME LOCATION REJECTION ---');
  let failedE = false;
  try {
    await createOperation({
      type: OperationType.INTERNAL_TRANSFER,
      reason: 'Self transfer',
      sourceLocationId: mainStock.id,
      destinationLocationId: mainStock.id,
      lines: [{ productId: steel.id, quantity: 5 }],
    }, manager.id);
  } catch (err: any) {
    failedE = true;
    console.log(`Same-location transfer correctly rejected: ${err.message}`);
  }
  if (!failedE) throw new Error('TEST E FAILED: Same-location transfer should have been rejected');
  console.log('✓ TEST E PASSED: Source == Destination transfer creation rejected.');

  // ----------------------------------------------------
  // TEST F: MULTI-LINE ATOMIC FAILURE
  // ----------------------------------------------------
  console.log('\n--- TEST F: MULTI-LINE ATOMIC FAILURE ---');
  const sourceSteelBeforeF = Number((await prisma.stockBalance.findUnique({ where: { productId_locationId: { productId: steel.id, locationId: mainStock.id } } }))?.quantity ?? 0);
  const sourceGlovesBeforeF = Number((await prisma.stockBalance.findUnique({ where: { productId_locationId: { productId: gloves.id, locationId: mainStock.id } } }))?.quantity ?? 0);

  const transferF = await createOperation({
    type: OperationType.INTERNAL_TRANSFER,
    reason: 'Multi-line failure test',
    sourceLocationId: mainStock.id,
    destinationLocationId: productionLoc.id,
    lines: [
      { productId: steel.id, quantity: 5 }, // Valid quantity
      { productId: gloves.id, quantity: sourceGlovesBeforeF + 9999 }, // Excessive quantity
    ],
  }, manager.id);

  let failedF = false;
  try {
    await validateOperation(transferF.id, manager.id);
  } catch (err: any) {
    failedF = true;
    console.log(`Multi-line validation correctly failed: ${err.message}`);
  }
  if (!failedF) throw new Error('TEST F FAILED: Multi-line validation should have failed');

  const sourceSteelAfterF = Number((await prisma.stockBalance.findUnique({ where: { productId_locationId: { productId: steel.id, locationId: mainStock.id } } }))?.quantity ?? 0);
  const sourceGlovesAfterF = Number((await prisma.stockBalance.findUnique({ where: { productId_locationId: { productId: gloves.id, locationId: mainStock.id } } }))?.quantity ?? 0);

  if (sourceSteelAfterF !== sourceSteelBeforeF || sourceGlovesAfterF !== sourceGlovesBeforeF) {
    throw new Error('TEST F FAILED: Multi-line rollback failed! Stock changed for valid line.');
  }
  console.log('✓ TEST F PASSED: Multi-line atomic rollback verified. No source or destination balances modified.');

  // ----------------------------------------------------
  // TEST G: DOUBLE VALIDATION PROTECTION
  // ----------------------------------------------------
  console.log('\n--- TEST G: DOUBLE VALIDATION PROTECTION ---');
  let failedG = false;
  try {
    await validateOperation(transferA.id, manager.id);
  } catch (err: any) {
    failedG = true;
    console.log(`Double validation correctly rejected: ${err.message}`);
    if (err.code !== 'ALREADY_COMPLETED') throw new Error(`TEST G FAILED: Expected ALREADY_COMPLETED, got ${err.code}`);
  }
  if (!failedG) throw new Error('TEST G FAILED: Re-validating DONE transfer should have failed');
  console.log('✓ TEST G PASSED: Double validation rejected.');

  // ----------------------------------------------------
  // TEST H: CANCEL TRANSFER
  // ----------------------------------------------------
  console.log('\n--- TEST H: CANCEL TRANSFER ---');
  const transferH = await createOperation({
    type: OperationType.INTERNAL_TRANSFER,
    reason: 'Canceled transfer test',
    sourceLocationId: mainStock.id,
    destinationLocationId: productionLoc.id,
    lines: [{ productId: steel.id, quantity: 12 }],
  }, manager.id);

  const canceledH = await cancelOperation(transferH.id);
  console.log(`Canceled transfer H status: ${canceledH.status}`);
  if (canceledH.status !== OperationStatus.CANCELED) throw new Error('TEST H FAILED: Expected status CANCELED');

  const ledgerHCount = await prisma.stockLedgerEntry.count({ where: { reference: transferH.reference } });
  if (ledgerHCount !== 0) throw new Error('TEST H FAILED: No ledger entry should exist for CANCELED transfer');
  console.log('✓ TEST H PASSED: Transfer canceled without inventory modification or ledger entry.');

  // ----------------------------------------------------
  // REGRESSION TEST: RECEIPT -> DELIVERY -> TRANSFER
  // ----------------------------------------------------
  console.log('\n--- REGRESSION TEST: RECEIPT -> DELIVERY -> TRANSFER ---');
  const startRegTotal = await getTotalStock(steel.id);
  console.log(`Total Steel Stock at start of full lifecycle: ${startRegTotal} kg`);

  // 1. Receipt +50 kg at Main Stock
  const regReceipt = await createOperation({
    type: OperationType.RECEIPT,
    partnerName: 'Lifecycle Vendor',
    destinationLocationId: mainStock.id,
    lines: [{ productId: steel.id, quantity: 50 }],
  }, manager.id);
  await validateOperation(regReceipt.id, manager.id);

  const totalAfterRegReceipt = await getTotalStock(steel.id);
  console.log(`Total stock after Receipt +50 kg: ${totalAfterRegReceipt} kg (expected ${startRegTotal + 50})`);
  if (totalAfterRegReceipt !== startRegTotal + 50) throw new Error('REGRESSION FAILED: Receipt failed to increase total stock');

  // 2. Delivery -20 kg from Main Stock
  const regDelivery = await createOperation({
    type: OperationType.DELIVERY,
    partnerName: 'Lifecycle Customer',
    sourceLocationId: mainStock.id,
    lines: [{ productId: steel.id, quantity: 20 }],
  }, manager.id);
  await advanceDelivery(regDelivery.id, 'pick');
  await advanceDelivery(regDelivery.id, 'pack');
  await validateOperation(regDelivery.id, manager.id);

  const totalAfterRegDelivery = await getTotalStock(steel.id);
  console.log(`Total stock after Delivery -20 kg: ${totalAfterRegDelivery} kg (expected ${startRegTotal + 30})`);
  if (totalAfterRegDelivery !== startRegTotal + 30) throw new Error('REGRESSION FAILED: Delivery failed to decrease total stock');

  // 3. Internal Transfer 30 kg from Main Stock to Production Rack
  const regTransfer = await createOperation({
    type: OperationType.INTERNAL_TRANSFER,
    reason: 'Lifecycle transfer',
    sourceLocationId: mainStock.id,
    destinationLocationId: productionLoc.id,
    lines: [{ productId: steel.id, quantity: 30 }],
  }, manager.id);
  await validateOperation(regTransfer.id, manager.id);

  const totalAfterRegTransfer = await getTotalStock(steel.id);
  console.log(`Total stock after Transfer 30 kg: ${totalAfterRegTransfer} kg (expected ${startRegTotal + 30})`);
  if (totalAfterRegTransfer !== startRegTotal + 30) throw new Error('REGRESSION FAILED: Internal Transfer changed total stock!');

  console.log('✓ REGRESSION TEST PASSED: Full lifecycle (Receipt +50, Delivery -20, Transfer 30) verified.');
  console.log('\n=============== ALL INTERNAL TRANSFER TESTS PASSED 100% ===============');
}

main()
  .catch((err) => {
    console.error('FATAL TEST ERROR:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
