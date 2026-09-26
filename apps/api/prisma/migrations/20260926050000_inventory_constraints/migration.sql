ALTER TABLE "StockBalance"
ADD CONSTRAINT "StockBalance_quantity_nonnegative" CHECK ("quantity" >= 0);

ALTER TABLE "ReorderRule"
ADD CONSTRAINT "ReorderRule_minimumQty_nonnegative" CHECK ("minimumQty" >= 0);

ALTER TABLE "StockOperationLine"
ADD CONSTRAINT "StockOperationLine_quantity_positive" CHECK ("quantity" > 0),
ADD CONSTRAINT "StockOperationLine_countedQuantity_nonnegative" CHECK ("countedQuantity" IS NULL OR "countedQuantity" >= 0);
