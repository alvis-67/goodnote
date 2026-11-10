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

- Next.js (App Router) and TypeScript, intended for Vercel
- Neon Postgres, queried from server code with `@neondatabase/serverless`
- Neon Managed Better Auth (`@neon/auth`) for admin email OTP and magic link
- Private Neon Object Storage bucket `request-files` for attachments

The browser never talks to Postgres. Client pages are authorized by the unguessable `/c/{token}` link. Admin pages require a session whose email is in `admin_allowlist`.

## Existing Neon project

Use the project that is already created. Do not create another one.

- Name: goodnote
- Project id: `shiny-heart-58021805`
- Default branch: main (`br-tiny-sky-aouhyj4x`)
- Region: `aws-ap-southeast-1`
- Auth base URL: `https://ep-spring-credit-aoilfu24.neonauth.c-2.ap-southeast-1.aws.neon.tech/neondb/auth`
- Auth schema: `neon_auth` (leave it alone; this repo does not migrate it)
- Private bucket: `request-files` (already created; do not make it public)

`neon.ts` declares `auth: true` and that private bucket. It does not enable the Data API or the AI Gateway. Auth and the bucket are already on the branch, so you do not need to run `neon deploy` to start. If you do run it later, review `neon config plan` first: deploy reconciles the branch and writes secrets into a local env file. Do not commit that file.

## Local setup

1. Copy `.env.example` to `.env.local`. Fill in the pooled `DATABASE_URL`, the direct `DATABASE_URL_UNPOOLED`, the auth URL above, a cookie secret (`openssl rand -base64 32`), and the object-storage `AWS_*` values for the main branch. Do not commit `.env.local`.
2. Apply the schema with the **direct** connection. This does not touch `neon_auth`:

```bash
psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f db/migrations/0001_init.sql
```

3. Allow the first admin. The address must be lowercase:

```sql
insert into public.admin_allowlist (email) values ('you@example.com');
```

4. In the Neon console, open the project → Auth:
   - Keep email sign-in available so a one-time code can be sent. Shared Neon SMTP (`auth@mail.myneon.app`) is enough for now.
   - Turn on Magic Link if you want the email link as well as the 6-digit code. The app still works when Magic Link is off: the code is the login that sets the session.
   - Add `http://localhost:3000` if localhost is not already allowed. Production and preview origins must be added before anyone uses them (`neon neon-auth domain add https://YOUR_DOMAIN`).
5. Allow the browser to upload straight to the private bucket (presigned PUT). With the storage env vars loaded:

```bash
node scripts/configure-storage-cors.mjs
```

   The default origin is `http://localhost:3000`. Set `STORAGE_CORS_ORIGINS` to a comma-separated list before running it for production.
6. Install and run:

```bash
npm install
npm run dev
```

Open `http://localhost:3000/admin/login`, enter the allowlisted email, and use the code (or the link, when Magic Link is enabled). The first successful code creates the Neon Auth user for that address. Create a client, copy the link, and open it in a private window to try the client flow.

Anyone not on `admin_allowlist` is refused by the app, even if Neon Auth would otherwise let them create a user. There is no public sign-up screen, and the app's `/api/auth` proxy rejects sign-up and password sign-in. After a session exists, the desk checks the allowlist again and signs the person out when they are not listed.

To revoke a client link, replace that row's `access_token` with a new 43+ character URL-safe random string. The old URL stops working.

The session cookie is marked `Secure`. `http://localhost` is a secure context in current Chromium and Firefox. If a browser drops the cookie, run `npm run dev -- --experimental-https` and open the https URL, and add that origin to the auth trusted domains.

## Deploy on Vercel

1. Import this repository. Framework preset: Next.js.
2. Set these environment variables for Production and Preview. None of the secrets use the `NEXT_PUBLIC_` prefix.
   - `DATABASE_URL` — pooled
   - `NEON_AUTH_BASE_URL`
   - `NEON_AUTH_COOKIE_SECRET`
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
   - `AWS_ENDPOINT_URL_S3`
   - `AWS_REGION`
3. Add the Vercel origin to the Neon Auth trusted domains (`https://YOUR_DOMAIN`, with no path). Magic-link clicks return to `/auth/confirm` on that origin.
4. Run `scripts/configure-storage-cors.mjs` with `STORAGE_CORS_ORIGINS` set to the production origin (and preview origins, if uploads should work there).
5. Deploy. File bytes upload from the browser to the private bucket with a short-lived presigned URL, so phone photos are not limited by the platform request-body size. Downloads use a separate signed URL that expires after two hours.

## Access model

- Clients are anonymous. The server reads the token from `/c/{token}` and every client query filters on that token. Internal notes and the token column are not selected for client pages.
- Admins are Neon Auth users whose email is in `admin_allowlist`. The check uses the session email, then the table. It does not trust editable profile fields as a permission.
- The database role can read every row. Only server code holds `DATABASE_URL`. Status transitions, the timeline, attachment scope, and in-app notification rows are still enforced by triggers.
- Object storage credentials stay on the server. The bucket is private. Upload URLs last 10 minutes and are limited to one object key. The server checks size (20MB) and MIME type again before it stores the attachment row.

Client pages send `Referrer-Policy: no-referrer` so the token is not attached to outbound requests.

## Checks

```bash
npm test
npm run lint
npm run test:schema
npm run build
```

`npm run test:schema` applies [`db/migrations/0001_init.sql`](db/migrations/0001_init.sql) to a throwaway Postgres and checks the status machine, the timeline, notifications, and attachment scope. It starts a temporary cluster when `DATABASE_URL` is unset. Do not point it at the hosted Neon project.

## Later notifications

`private.on_message_created()` currently inserts `channel = 'in_app'` with `delivered_at` set. A commented insert beside it shows where to add an `email` or `whatsapp` row with `delivered_at` left null. A worker can then deliver `where delivered_at is null` without changing the request flow.
