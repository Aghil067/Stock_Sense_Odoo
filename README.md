# StockSense

StockSense is a local-first inventory management app for inventory managers and warehouse staff. Product, warehouse, operation, balance, and ledger records live in PostgreSQL; the React interface reads and writes them through the project's own Express REST API. No cloud backend or external inventory API is needed for the core workflow.

## Run on this Windows laptop

1. Install Node.js, then run `npm ci` from the repository root.
2. Copy `.env.example` to `apps/api/.env`. Replace both example secrets with long random values before using the app.
3. Run `npm run db:start`, `npm run db:generate`, and `npm run db:migrate`. Stop the API before generating Prisma on Windows if its engine DLL is locked. For an existing database use `npx prisma migrate deploy --schema apps/api/prisma/schema.prisma` with the backend environment loaded; never reset the database.
4. Run `npm run dev`. Open `http://localhost:5173`. The API runs on port 4000 and PostgreSQL binds to `127.0.0.1:5432`.

The bundled PostgreSQL runtime stores its data in the ignored `.local/postgres` directory. Restarting the app does not erase inventory. `npm run db:stop` stops the local database. No synthetic inventory is generated.

Use existing team credentials. To provision a **new real manager**, set `BOOTSTRAP_MANAGER_NAME`, `BOOTSTRAP_MANAGER_EMAIL`, and `BOOTSTRAP_MANAGER_PASSWORD` (12–72 characters) in the backend environment, then explicitly run `npm run db:seed`. This command only creates that account; it refuses to modify an existing one and never creates inventory. Remove bootstrap credentials from the environment afterwards. Public signup creates staff accounts.

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
- Legacy databases may still contain old sample records; replacing the seeder does not erase them. Database-backed does not mean independently verified real-world inventory. Enter actual products and physical counts through the application.

## Intelligence and recovery upgrade

See [the implementation and static-audit report](docs/INTELLIGENCE_AND_AUDIT.md) for formulas, API boundaries, migration steps, limitations and the manual runtime checklist. Apply the additive recovery migration before running the upgraded API.

The manager dashboard adds 7/30-day movement trends, stock health and warehouse distribution. `/ai` uses the OpenAI Responses API with server-only `AI_API_KEY` and `AI_MODEL` variables. Set a function-calling-capable model available to your API project. No key/model means a clear unavailable state, not a fake response. Selected inventory facts are sent to OpenAI only when a question is submitted; the core app stays local-first.

In Stock Ledger, open a movement detail and choose **Reverse entire operation**. Review all current before/after balances, enter a reason and audit notes, and confirm. A separate linked reversal preserves original history. AI cannot execute reversals.

## Team Git practice

Both teammates should use their own GitHub account and Git-linked author email, commit substantive slices they actually worked on, and push regularly. Short feature branches or separate clones on the same laptop avoid mixing identities and uncommitted work. Do not commit `apps/api/.env`, `.local/`, `node_modules/`, or build output.
