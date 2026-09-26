-- Additive audit links: existing operations, balances and history are preserved.
ALTER TABLE "StockOperation" ADD COLUMN "reversalOfId" TEXT, ADD COLUMN "reversalNotes" TEXT;
ALTER TABLE "StockLedgerEntry" ADD COLUMN "reversalOfId" TEXT;
CREATE UNIQUE INDEX "StockOperation_reversalOfId_key" ON "StockOperation"("reversalOfId");
CREATE UNIQUE INDEX "StockLedgerEntry_reversalOfId_key" ON "StockLedgerEntry"("reversalOfId");
ALTER TABLE "StockOperation" ADD CONSTRAINT "StockOperation_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "StockOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockLedgerEntry" ADD CONSTRAINT "StockLedgerEntry_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "StockLedgerEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockOperation" ADD CONSTRAINT "StockOperation_no_self_reversal" CHECK ("reversalOfId" IS NULL OR "reversalOfId" <> "id");
ALTER TABLE "StockLedgerEntry" ADD CONSTRAINT "StockLedgerEntry_no_self_reversal" CHECK ("reversalOfId" IS NULL OR "reversalOfId" <> "id");
