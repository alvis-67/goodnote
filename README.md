# 好事筆記 Goodnote

A small web app for an admin who handles quotes, invoices, and receipts for engineering-company clients. Clients open a private link. There is no client login. Each request has one shared timeline of messages, files, and status changes.

The interface is Traditional Chinese (Hong Kong).

## What the first version does

- A client link shows only that company's requests.
- A new request has a topic (出報價單 / 出發票 / 出收據 / 其他), text, and files, and starts at 待處理.
- The request page is a two-way thread. Status changes appear on the same timeline.
- Only an allowlisted admin can sign in, see every request, reply, attach files, and move status one step at a time: 待處理 → 處理中 → 已出單 → 已入機.
- New requests and later client messages are marked and sorted first on the admin desk.
- The admin creates a client and copies that client's link.
- Notifications in this version are in-app only. The `notification_events` table is the place to add email or WhatsApp later.

## Stack

- Next.js (App Router) and TypeScript
- Supabase Postgres, Auth, and private Storage
- Row Level Security for both the admin session and the client token

## Local setup

1. Create a Supabase project.
2. In the SQL editor, run [`supabase/migrations/20261110160000_init.sql`](supabase/migrations/20261110160000_init.sql). This creates the tables, indexes, RLS policies, the private `request-files` bucket, and the signup guard. You can instead install the [Supabase CLI](https://supabase.com/docs/guides/cli), run `supabase link`, and `supabase db push`.
3. Copy `.env.example` to `.env.local` and fill in the project URL, publishable key, and secret key from **Project Settings → API Keys**. Do not commit `.env.local`.
4. Add the first admin, in this order:
   - SQL editor: `insert into public.admin_allowlist (email) values ('you@example.com');`
   - **Authentication → Users → Add user**, with that same email, and mark the email confirmed. Auto-confirm it so the first login does not wait on a second email.
5. In **Authentication → Providers → Email**, keep email auth enabled. Turn **Allow new users to sign up** off. The migration also adds a trigger that rejects `auth.users` inserts whose email is not on the allowlist. If that trigger could not be created, the dashboard warning and the app checks still apply: `shouldCreateUser` is false, and RLS only treats allowlisted emails as admins.
6. In **Authentication → URL configuration**, set Site URL to `http://localhost:3000` for local work. Add `http://localhost:3000/auth/confirm` to the redirect allow list.
7. Optional, for a 6-digit code as well as the link: open **Authentication → Email templates → Magic Link** and paste [`supabase/templates/magic_link.html`](supabase/templates/magic_link.html). The default template already sends a link, which this app accepts.
8. Install and run:

```bash
npm install
npm run dev
```

Open `http://localhost:3000/admin/login`, enter the allowlisted email, and use the link or the code. Create a client, copy the link, and open it in a private window to try the client flow.

To revoke a link, replace that row's `access_token` in the SQL editor with a new 43+ character URL-safe random string. The old URL stops working.

## Deploy on Vercel

1. Import this repository. Framework preset: Next.js.
2. Set the same three environment variables for Production and Preview. The secret key must not use the `NEXT_PUBLIC_` prefix.
3. In Supabase URL configuration, set Site URL to the Vercel domain and add `https://YOUR_DOMAIN/auth/confirm` as a redirect URL.
4. Deploy. File bytes upload directly from the browser to Supabase with a short-lived signed URL, so phone photos are not limited by the platform request-body size.

## Access model

- Clients are anonymous. The server sends their URL token in the `x-client-token` header. Policies resolve that header to one client id and only allow that client's rows and storage prefix.
- Admins are Supabase Auth users whose email is in `admin_allowlist`. `private.is_admin()` reads the email from the Auth JWT, not from editable user metadata.
- The secret key bypasses RLS. The server uses it only to read the allowlist before a session exists, and to sign storage URLs after the caller has already been allowed to see the request. Upload size (20MB) and MIME type are enforced again by the private bucket.
- Client pages send `Referrer-Policy: no-referrer` so the token is not attached to outbound requests.

## Checks

```bash
npm test
npm run lint
npm run test:rls
npm run build
```

`npm run test:rls` applies the migration to a throwaway Postgres and checks tenant isolation, status transitions, the timeline, and storage policies. It starts a temporary cluster when `DATABASE_URL` is unset. Do not point it at a hosted Supabase project.

## Later notifications

`private.on_message_created()` currently inserts `channel = 'in_app'` with `delivered_at` set. A commented insert beside it shows where to add an `email` or `whatsapp` row with `delivered_at` left null. A worker can then deliver `where delivered_at is null` without changing the request flow.
