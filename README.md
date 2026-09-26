# StockSense — Modern Intelligent Inventory Management

StockSense is a high-performance, local-first inventory management application designed for **Inventory Managers** and **Warehouse Staff**. Built with React, TypeScript, Express, Prisma, and PostgreSQL, it provides real-time stock control, automated reordering, full ledger auditability, warehouse operations workflows, and AI-assisted inventory intelligence.

---

## 🚀 Quick Start Guide (Clone & Run)

Follow these steps to clone and run the project locally on your machine.

### Prerequisites

- **Node.js**: v18.0.0 or higher ([Download Node.js](https://nodejs.org/))
- **npm**: v9.0.0 or higher (bundled with Node.js)
- **PostgreSQL**: Running locally or via Docker on port `5432` (or use the built-in embedded database runner)

---

### Step 1: Clone the Repository

```bash
git clone https://github.com/Aghil067/Stock_Sense_Odoo.git
cd Stock_Sense_Odoo
```

---

### Step 2: Install Dependencies

Install all workspace dependencies across the client and server:

```bash
npm install
```

---

### Step 3: Configure Environment Variables

Copy the example environment configuration into the API package:

**On Linux / macOS:**
```bash
cp .env.example apps/api/.env
```

**On Windows (PowerShell):**
```powershell
Copy-Item .env.example apps/api/.env
```

**On Windows (CMD):**
```cmd
copy .env.example apps\api\.env
```

> **Note:** The default `.env.example` comes pre-configured with local development credentials and secrets ready to use. If your local PostgreSQL uses a different password or port, update `DATABASE_URL` in `apps/api/.env`.

---

### Step 4: Initialize the Database & Prisma

1. **Start the database** (if using the embedded runner or start your local PostgreSQL service):
   ```bash
   npm run db:start
   ```

2. **Generate the Prisma Client**:
   ```bash
   npm run db:generate
   ```

3. **Push the schema to your database**:
   ```bash
   npx prisma db push --schema apps/api/prisma/schema.prisma
   ```

4. **(Optional) Bootstrap the Manager Account**:
   ```bash
   npm run db:seed
   ```

---

### Step 5: Start Development Servers

Run both the API backend and React frontend concurrently:

```bash
npm run dev
```

Once running, access the application in your browser:

- **Web Application**: [http://localhost:5173](http://localhost:5173)
- **API Server**: [http://localhost:4000](http://localhost:4000)
- **API Health Check**: [http://localhost:4000/api/health](http://localhost:4000/api/health)

---

## 👥 User Roles & Access

| Role | Portal / Landing | Capabilities |
| :--- | :--- | :--- |
| **Inventory Manager** | `/dashboard` (Control Center) | Master data setup (categories, units, warehouses, locations), catalog management, replenishment rules, operation approvals, stock reversal & audit ledger, AI assistant. |
| **Warehouse Staff** | `/staff` (Staff Workspace) | Dedicated operational task queues: Picking, Packing & Dispatch, Receiving & Shelving, Internal Transfers, Physical Inventory Counting. |

### Default Credentials
- **Manager**: `manager@stocksense.local` / `ManagerPassword123!` (or credentials configured in `apps/api/.env`)
- **Staff**: Register via the signup form on `/login` or use provisioned staff accounts.

---

## 🛠️ Project Structure & Monorepo Workspaces

```text
Stock_Sense_Odoo/
├── apps/
│   ├── api/                  # Express REST API with Prisma ORM
│   │   ├── prisma/           # Database schema, seeders & migrations
│   │   ├── src/
│   │   │   ├── modules/      # Domain modules (auth, catalog, operations, ledger, ai, staff)
│   │   │   ├── middleware/   # Auth, RBAC & error handling
│   │   │   └── server.ts     # Express server entry point
│   │   └── package.json
│   │
│   └── web/                  # React 19 + Vite frontend
│       ├── src/
│       │   ├── components/   # AppShell, dialogs, badges, navigation
│       │   ├── pages/        # Manager portal & Staff workspace pages
│       │   ├── lib/          # API client & formatting utilities
│       │   └── App.tsx       # Routing and role-based guards
│       └── package.json
│
├── .env.example              # Pre-configured environment template
├── package.json              # Workspace root scripts
└── README.md
```

---

## 📜 Key Workspace Scripts

From the repository root:

- `npm run dev`: Starts the local database, API server (`:4000`), and Vite frontend (`:5173`).
- `npm run build`: Typechecks and compiles production bundles for both `@stocksense/api` and `@stocksense/web`.
- `npm run typecheck`: Runs strict TypeScript validation across the entire workspace.
- `npm run db:generate`: Generates the Prisma Client.
- `npm run db:start`: Starts the local PostgreSQL database service.
- `npm run db:stop`: Stops the local database service.
- `npm run db:seed`: Seeds the bootstrap manager account without modifying existing business data.

---

## 🧪 System Health & Verification

To verify that your installation is running cleanly:

```bash
npm run typecheck
npm run build
```

Both commands should complete with **0 errors**.
