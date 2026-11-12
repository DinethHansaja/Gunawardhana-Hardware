# Deployment

The app is designed for standard Next.js deployment on Vercel with Supabase for persistent database and image storage. Deployment is not yet configured or claimed as successful.

Before production, review and apply every migration, configure Supabase Auth redirect URLs and email templates for the production HTTPS origin, and add the project URL and publishable key to Vercel's Production environment. Add the Supabase secret key to server-only environment variables for employee invitations. Keep all privileged keys out of `NEXT_PUBLIC_*` variables. Add the same environment values in Preview only for a separate non-production Supabase project. Complete SQL-level role and transaction testing before entering business data.

Because this is commercial business use, Vercel's Hobby plan is restricted to personal, non-commercial use; its Fair Use Guidelines require Pro or Enterprise for commercial usage. Choose at least Pro or another host whose current terms permit this business use. Confirm the terms at launch. Configure the custom domain and HTTPS at the chosen host. See [Vercel commercial usage rules](https://vercel.com/docs/limits/fair-use-guidelines#commercial-usage) and [current plan pricing](https://vercel.com/pricing).
