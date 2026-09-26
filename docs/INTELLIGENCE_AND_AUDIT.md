# StockSense intelligence and audit handoff

## Architecture

The existing React/Vite frontend calls the Express REST API. Prisma models PostgreSQL records. `StockBalance` is the current-stock source of truth, `StockOperation` and its lines are pending workflows, and `StockLedgerEntry` is append-only finalized history. Manager and staff routes remain role-protected in both React and Express.

## Analytics

The manager dashboard now reads `/api/dashboard/analytics` for real finalized ledger movements, current stock health, and distinct stocked products per warehouse. Movement charts keep units separate, zero-fill the selected 7/30 UTC-day window, and show receipt/delivery reversal series separately. Health uses the same balance-versus-reorder-rule logic as the dashboard and catalog. Warehouse distribution counts products, never incompatible UOM quantities.

## AI

`apps/api/src/modules/ai` contains a provider boundary, a server-only OpenAI Responses API adapter, constrained Zod tool arguments, and read-only Prisma inventory tools. The model receives no credentials, SQL, code execution, filesystem, password, OTP, or unrestricted user access. Every question retrieves fresh database evidence in a repeatable-read transaction; tool results are capped and structured. Stock risk uses the last 30 days of delivery ledger, excludes reversal effects from consumption, and reports insufficient history instead of inventing a forecast. Transfer recommendations reserve pending outgoing stock and each source minimum; a manager-confirmed action re-checks the recommendation and creates an ordinary DRAFT transfer only.

Set `AI_API_KEY` and `AI_MODEL` in `apps/api/.env` to enable it. Missing configuration returns a clean unavailable state. The key is never exposed to Vite.

## Recovery / audit

The additive migration `20260926090000_inventory_recovery` adds unique `reversalOfId` links to operations and ledger entries. A manager can preview and reverse a completed receipt, delivery, internal transfer, or adjustment. The backend derives all compensating effects from authoritative original ledger before/after values, checks current balances, and records a new DONE operation and linked ledger lines in one serializable transaction. Original records are not deleted or edited. Duplicate reversal attempts, reversal-of-reversal attempts, pending/canceled records, and negative outcomes are rejected. Reason, notes, manager identity, and timestamps remain queryable.

Apply the migration to the real local PostgreSQL database before demo runtime:

`npx prisma migrate deploy --schema apps/api/prisma/schema.prisma`

Do not reset or seed the database. The replacement seed script only provisions a newly named manager when explicit `BOOTSTRAP_MANAGER_*` variables are supplied; it generates no products or inventory.

## Static audit and limitations

Pagination is preserved for ledger, replenishment, and operation lists. Search/location filters are combined instead of overwriting one another. Authentication re-reads current role state, products with inventory history cannot silently change units, and all mutation success paths invalidate live queries. Existing staff queues read real pending operations. Legacy databases may still contain old sample records; this code does not delete them.

The OpenAI provider, local PostgreSQL migration, email/SMS OTP delivery, and browser UI are not runtime-verified in this pass. The API build and frontend bundle are compilation checks only.

Runtime tests: NOT PERFORMED
Browser tests: NOT PERFORMED
E2E tests: NOT PERFORMED
