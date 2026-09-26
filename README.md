# StockSense

StockSense is a local-first inventory management app for inventory managers and warehouse staff. Product, warehouse, operation, balance, and ledger records live in PostgreSQL; the React interface reads and writes them through the project's own Express REST API. No cloud backend or external inventory API is needed for the core workflow.

## Run on this Windows laptop

1. Install Node.js, then run `npm ci` from the repository root.
2. Copy `.env.example` to `apps/api/.env`. Replace both example secrets with long random values before using the app.
3. Run `npm run db:start`, `npm run db:generate`, `npm run db:migrate`, and `npm run db:seed`.
4. Run `npm run dev`. Open `http://localhost:5173`. The API runs on port 4000 and PostgreSQL binds to `127.0.0.1:5432`.

The bundled PostgreSQL runtime stores its data in the ignored `.local/postgres` directory. Restarting the app does not erase inventory. `npm run db:stop` stops the local database. Seeding is for a first-run demo; it is not a live data feed.

Demo sign-ins after seeding:

| Role | Email | Password |
| --- | --- | --- |
| Inventory manager | `manager@stocksense.local` | `Demo@12345` |
| Warehouse staff | `staff@stocksense.local` | `Demo@12345` |

Change these credentials outside a local demonstration. Public signup creates a staff account; manager permissions are not selectable on the login form.

## Manager walkthrough

1. Sign in as the manager and open **Inventory setup**. Create a category, unit, warehouse, and stock location. These forms call the manager-protected `/api/master-data/*` endpoints.
2. Create a product with an SKU, category, unit, location, optional opening stock, and reorder level. Opening stock is recorded through a completed adjustment and appears in the stock ledger.
3. Create a receipt with supplier and product lines. Preview and validate it; the location balance increases.
4. Create a delivery with customer and product lines. Pick, pack, preview, then validate it; stock decreases. Insufficient stock is rejected.
5. Transfer stock between locations or enter a physical count adjustment. Preview the before/after result, validate, and inspect the ledger. A transfer changes location balances without changing the company total.
6. Filter the dashboard by document type, status, warehouse/location, or product category. Stock KPIs always represent current balances in the selected stock scope; document KPIs/lists additionally follow type and status.
7. Open **Replenishment** to see the projected stock calculation for every reorder rule: on-hand + pending incoming − pending outgoing. A suggestion creates a receipt draft for manager review, never an automatic stock change.

The manager can change catalog and setup records. Staff can read them and perform stock operations. Authorization is enforced by the API as well as reflected in the interface.

## Design notes

- API code is divided into authentication, catalog, operations, dashboard, ledger, and replenishment modules.
- Stock validation and ledger writes are performed in PostgreSQL transactions. Balances cannot be decremented below zero by a completed operation.
- Inputs are validated at the API boundary with Zod and at the form boundary with HTML constraints and task-specific checks.
- The local demo displays password-reset OTPs in the development response so an offline demo can complete the reset flow. This delivery mode is **not suitable for deployment**: production needs a private email/SMS delivery channel before password reset should be enabled.
- Seeded records are example data. New records and dashboard changes made during a demo come from live database transactions, not static frontend JSON.

## Team Git practice

Both teammates should use their own GitHub account and Git-linked author email, commit substantive slices they actually worked on, and push regularly. Short feature branches or separate clones on the same laptop avoid mixing identities and uncommitted work. Do not commit `apps/api/.env`, `.local/`, `node_modules/`, or build output.
