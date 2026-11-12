# Gunawardhana Hardware Management System

Vercel-compatible Next.js application for inventory, purchasing, POS, and store operations in Sri Lanka. Supabase PostgreSQL is the source of truth; amounts are in LKR and business dates use `Asia/Colombo`.

## Current status

Implemented application workflows include Supabase SSR authentication and Admin employee access, product/category and variant maintenance, product image handling, live catalog and stock lookup, stock opening/adjustment posting, movement history, and POS sale checkout with a printable receipt. Six PostgreSQL migrations define the associated schema, access policies, catalog, image and transaction RPCs. Dashboard reporting, purchasing/receiving, returns, credit settlement, expense management, CSV import, and reprint/history are not implemented yet. No Supabase credentials are configured, and migrations have not been applied or integration-tested against PostgreSQL. The workbook in `reference/` is a schema reference only; its example rows are not imported.

## Local development

1. Install Node.js 20.9 or later and npm.
2. Copy `.env.example` to `.env.local` and fill in the Supabase project URL and publishable key.
3. Run `npm install`, then `npm run dev` and open http://localhost:3000.

The application can render the foundation without credentials. Database features require a configured Supabase project and migrations.

## Architecture and delivery phases

- **Phase 1 — Foundation:** Next.js App Router, strict TypeScript, Tailwind, restrained shared layout, dependency and environment setup.
- **Phase 2 — Database/security:** normalized PostgreSQL schema, branch scoping, RLS, audit log, transactional stock and sale functions.
- **Phase 3 — Authentication:** Supabase SSR sessions, server verified roles, protected role layouts and admin-controlled onboarding.
- **Phase 4 — Catalog:** products, variants, prices/history, image storage, search and category management are implemented; CSV import remains.
- **Phase 5 — Inventory/purchasing:** stock ledger, opening balances, adjustments, low-stock lookup and weighted average costing are implemented; purchase orders/receiving and supplier settlements remain.
- **Phase 6 — POS:** cashier-safe search, bill-only price overrides, atomic idempotent checkout and 80mm receipt printing are implemented; history/reprint and in-browser receipt validation remain.
- **Phase 7 — Credit:** customer search, credit eligibility and sale ledger posting are implemented; payment collection and settlement screens remain.
- **Phase 8 — Finance:** schema groundwork only; expense entry and management reports remain.
- **Phase 9 — Hardening/deployment:** lint, TypeScript, unit tests and production build pass; PostgreSQL/RLS integration tests, backup/restore runbook and production deployment remain.

Key design decisions: monetary amounts use PostgreSQL `NUMERIC`; cart and report totals are recalculated server-side; the negotiated line price is saved on the sale item and never written back to catalog prices; inventory balances are changed only through ledger-backed transactions; cashier projections exclude cost fields.

## Reference workbook

The workbook `reference/hardware_store_inventory_template_v2.xlsx` includes Read_Me, Product_Entry, Categories, Products, Stock_In, Stock_Out, Suppliers, Price_History, Settings, and Apps_Script sheets. The prompt supplies the important field definitions. No example records are used as live data. Import requires an explicit preview and confirmation workflow.

## Documentation

See `docs/SETUP.md`, `docs/DATABASE.md`, `docs/DEPLOYMENT.md`, `docs/SECURITY.md`, and `docs/USER_GUIDE.md` for setup and operating procedures. These will be expanded alongside the remaining implementation phases.
