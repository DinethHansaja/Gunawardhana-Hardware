# Setup

## Local application

1. Install Node.js 20.9+ and npm.
2. Copy `.env.example` to `.env.local`.
3. Create a Supabase project and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from its API settings. Set `SUPABASE_SECRET_KEY` on the server only for Admin employee invitations. The legacy server-only service-role variable is accepted temporarily.
4. Run `npm install` and `npm run dev`.

Do not commit `.env.local`. Without valid credentials the login screen explains that authentication is not connected; protected routes remain unavailable.

## Supabase bootstrap

1. Apply the SQL files in `supabase/migrations/` in filename order using the Supabase CLI or SQL editor after review. Migration execution and RLS testing have not been performed in this workspace.
2. Configure Auth email templates and allowed redirect URLs for `http://localhost:3000/auth/confirm` and the production `/auth/confirm` URL. For Invite and Reset Password templates, use a link to `/auth/confirm?token_hash={{ .TokenHash }}&type=invite` or `type=recovery`; when an explicit redirect URL is used, use `{{ .RedirectTo }}` as the link origin instead of `{{ .SiteURL }}`. Set `NEXT_PUBLIC_SITE_URL` to the application origin.
3. Disable public sign-ups. Create/invite the initial owner from Supabase Auth, then use the SQL editor as the project database owner to seed the first Admin profile and grants. Replace the placeholders with that Auth user's UUID and confirmed email:

```sql
insert into public.profiles (id, email, display_name)
values ('<auth-user-uuid>', lower('<owner-email>'), '<owner-name>');

insert into public.user_roles (user_id, role_id)
values ('<auth-user-uuid>', 'admin');

insert into public.user_branch_access (user_id, branch_id)
select '<auth-user-uuid>', id from public.branches where code = 'MAIN';
```

4. Sign in as that owner. Admin invitations use Supabase Auth's server-side Admin API; subsequent employees are assigned through the audited `provision_employee` function.
5. Migration `202611120005_product_images.sql` creates the private product image bucket and policies. Test uploads and signed access with each role in a non-production project before launch.

## Workbook migration

Use the supplied workbook as a reference for column mapping. Do not import its examples. Initial physical stock and historical receipts must use a cutover choice that prevents counting the same stock twice.
