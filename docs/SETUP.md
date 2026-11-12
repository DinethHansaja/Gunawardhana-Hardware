# Setup

## Local application

1. Install Node.js 20.9+ and npm.
2. Copy `.env.example` to `.env.local`.
3. Create a Supabase project and set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and server-only `SUPABASE_SECRET_KEY`. Username lookup and administrator account management require the server secret. The legacy server-only service-role variable is accepted temporarily.
4. Run `npm install` and `npm run dev`.

Do not commit `.env.local`. Without valid credentials the login screen explains that authentication is not connected; protected routes remain unavailable.

## Supabase bootstrap

1. Apply all SQL files in `supabase/migrations/` in filename order to a new/test project first. The latest migration adds usernames, administrator-managed accounts, password reset auditing, and first-Admin bootstrap. SQL execution and RLS testing have not been performed from this workspace.
2. Disable public sign-ups in Supabase Auth. Login uses username and password; employee contact email is optional and is not used as the login identifier.
3. Set the project URL and server-only Supabase secret in local `.env.local`, then run `npm run admin:bootstrap` from an interactive PowerShell terminal. Enter the initial Admin password at the hidden prompt. The script creates or resets the `gunawardhana` Admin identity through Supabase Auth, which stores a bcrypt hash; the password is never written to source, migrations, or application tables.
4. Add the same project URL, publishable key, and server-only secret to Vercel environment settings. Redeploy after changing environment variables. Configure Supabase Auth Site URL and allowed redirects for the deployed app and local development.
5. Migration `202611120005_product_images.sql` creates the private product image bucket and policies. Test uploads and signed access with each role in a non-production project before launch.

## Workbook migration

Use the supplied workbook as a reference for column mapping. Do not import its examples. Initial physical stock and historical receipts must use a cutover choice that prevents counting the same stock twice.
