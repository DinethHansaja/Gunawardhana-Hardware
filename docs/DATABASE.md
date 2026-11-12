# Database design notes

Supabase PostgreSQL is the single source of truth. The target model separates catalog products and sellable variants from branch inventory, immutable stock movements, purchase and sale documents, payment allocations, customer credit ledger, and owner finance records.

Financial fields use `NUMERIC`, timestamps use `TIMESTAMPTZ`, and operational data is branch scoped. Critical checkout and stock posting must be PostgreSQL transactions with row locks and idempotency keys. Cashier search uses a dedicated projection/function that never returns cost or margin.

The migrations create the normalized core entities and enable RLS across exposed business tables. They separate master prices from catalog details and grant the cashier only safe sale-item columns; weighted average cost is omitted from the browser-readable stock projection. The POS migration adds cashier-safe search and atomic, idempotent checkout with stock locks, server price checks, payment recording, credit-limit validation, and audit records. Further migrations provide Admin-only employee provisioning, secure catalog/category writes and private product-image policies, plus idempotent stock opening/adjustment posting with quantity precision, negative-stock checks, and weighted-average-cost updates for receipts.

These migrations have not been applied to a Supabase project or executed by PostgreSQL in this environment. Purchasing and supplier settlements, returns, customer credit settlements, secure financial reports, and database-level transaction/RLS tests remain outstanding. Static review is not a substitute for running the SQL and testing role isolation in the target project. Do not enter live business data until that work is complete.
