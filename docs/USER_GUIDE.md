# User guide

## Access

An Admin account must be provisioned first. Admins invite employees and assign their branch and role from Employee Access. The Admin can then manage employees; Inventory Managers maintain products and stock; Cashiers use the POS. All accounts require an active profile and role.

## Catalog

Inventory Managers and Admins can add or update products, variants, SKU/barcode, units, category, supplier, tax, reorder level, and master cost/marked/default selling prices. Changes to master prices create history and audit records. Product images use private storage with signed access.

## Stock

The Inventory screen displays the first 100 search results and flags active variants at or below their reorder level. Use Post stock to record opening balances or positive adjustments. For damage and loss, enter positive quantities to deduct. Quantities follow the selected unit precision; negative balances are rejected. Opening stock can only be recorded once per branch and variant. Posted lines appear in Movement History and cannot be edited or deleted.

## POS

Cashiers search by product details, SKU, or barcode, build a cart, and record split payments or eligible credit. A negotiated price is limited to that sale line. The server rechecks price rules, stock, credit eligibility, and payment totals inside an idempotent transaction. Print produces an 80 mm receipt from the saved sale response. Sale history and receipt reprint are not implemented.

## Not available yet

Purchase orders/receiving, supplier payments, return processing, customer credit collections, expense entry, management reports, and workbook import are not implemented. Dashboard summary metrics remain unconnected. The software is not production-ready until migrations are applied to a test project and PostgreSQL role, transaction, image, and browser flows are tested there.
