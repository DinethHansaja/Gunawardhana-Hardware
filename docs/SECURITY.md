# Security

Never expose Supabase service-role keys in browser code or commit `.env.local`. Verify roles server-side from Supabase-backed identity and enforce them again with PostgreSQL RLS and restricted transaction functions. UI visibility is not an authorization boundary.

The initial database migrations enable RLS, separate cost fields from cashier-readable catalog data, remove broad table grants, and do not grant direct browser writes. Checkout and employee assignment use fixed-search-path, server-checked RPCs; authentication uses Supabase's cookie SSR package and verified server-side user identity. It is not yet production secured: the SQL has not run on a target project, security/RLS tests are outstanding, product image storage policies and several operational RPCs remain unimplemented, and backups/restore procedures need to be set up and tested. Supabase backup and recovery guarantees depend on the chosen project plan; configure independent backups appropriate to the business.
