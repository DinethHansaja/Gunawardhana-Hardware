# User guide

## Access

Employees sign in with a username and password. Contact email is optional and is not a login identifier; users with a contact email can still request an email password reset, and an Admin can reset any user's password from User Management. The `inventory_manager` role is shown as Inventory Staff. Admins create accounts, assign username/password, role, and branch, edit account details, reset passwords, activate/deactivate accounts, and remove sign-in access. The predefined role permissions are Admin (all current system areas), Inventory Staff (catalog and stock operations), and Cashier (POS operations). User changes are checked on the server and in database policies/functions.

## Catalog

Inventory Managers and Admins can add or update products, variants, SKU/barcode, units, category, supplier, tax, reorder level, and master cost/marked/default selling prices. Changes to master prices create history and audit records. Product images use private storage with signed access.

## Stock

The Inventory screen displays the first 100 search results and flags active variants at or below their reorder level. Use Post stock to record opening balances or positive adjustments. For damage and loss, enter positive quantities to deduct. Quantities follow the selected unit precision; negative balances are rejected. Opening stock can only be recorded once per branch and variant. Posted lines appear in Movement History and cannot be edited or deleted.

## POS

Cashiers search by product details, SKU, or barcode, build a cart, and record split payments or eligible credit. A negotiated price is limited to that sale line. The server rechecks price rules, stock, credit eligibility, and payment totals inside an idempotent transaction. Print produces an 80 mm receipt from the saved sale response. Sale history and receipt reprint are not implemented.

## Not available yet

Deleting an account disables its Auth identity, removes its role and branch grants, and anonymizes its profile while retaining linked business/audit records. Passwords are sent to Supabase Auth and stored there as salted bcrypt hashes; the app does not persist password values.

Purchase orders/receiving, supplier payments, return processing, customer credit collections, expense entry, management reports, and workbook import are not implemented. Dashboard summary metrics remain unconnected. The software is not production-ready until migrations are applied to a test project and PostgreSQL role, transaction, image, and browser flows are tested there.
