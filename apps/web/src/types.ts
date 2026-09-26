export type Role = 'MANAGER' | 'STAFF';
export type OperationType = 'RECEIPT' | 'DELIVERY' | 'INTERNAL_TRANSFER' | 'ADJUSTMENT';
export type OperationStatus = 'DRAFT' | 'WAITING' | 'READY' | 'DONE' | 'CANCELED';

export type User = { id: string; name: string; email: string; role: Role };
export type Category = { id: string; name: string };
export type Unit = { id: string; name: string; symbol: string };
export type Warehouse = { id: string; name: string; code: string; address?: string; locations: Location[] };
export type Location = { id: string; name: string; code: string; warehouseId: string; warehouse?: Warehouse };
export type Balance = { id: string; quantity: string; locationId: string; location: Location & { warehouse: Warehouse } };
export type Product = {
  id: string; name: string; sku: string; description?: string; isActive: boolean; category: Category; unit: Unit;
  balances: Balance[]; reorderRules: Array<{ id: string; locationId: string; minimumQty: string }>;
  totalStock: string; stockStatus: 'HEALTHY' | 'LOW_STOCK' | 'OUT_OF_STOCK'; ledgerEntries?: LedgerEntry[];
};
export type OperationLine = { id: string; quantity: string; countedQuantity?: string; product: Product; ledgerEntry?: LedgerEntry };
export type Operation = {
  id: string; reference: string; type: OperationType; status: OperationStatus; partnerName?: string; reason?: string;
  scheduledAt?: string; createdAt: string; completedAt?: string; sourceLocation?: Location & { warehouse: Warehouse };
  destinationLocation?: Location & { warehouse: Warehouse }; createdBy: Pick<User, 'id' | 'name'>; lines: OperationLine[];
};
export type LedgerEntry = {
  id: string; reference: string; movementType: OperationType; quantity: string; sourceBefore?: string; sourceAfter?: string;
  destinationBefore?: string; destinationAfter?: string; reason?: string; createdAt: string; product: Product;
  sourceLocation?: Location & { warehouse: Warehouse }; destinationLocation?: Location & { warehouse: Warehouse };
  createdBy: Pick<User, 'name'>;
};

