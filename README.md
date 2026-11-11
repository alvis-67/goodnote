# 好事筆記 Goodnote

A small web app for an admin who handles quotes, invoices, and receipts for engineering-company clients. The admin and each client sign in with a password. Each request has one shared timeline of messages and files. The current status and stage stay on the request page. Changes to them are still stored, and are not shown on the timeline.

The interface is Traditional Chinese (Hong Kong).

## What the first version does

- A client signs in with a login name and password set by the admin, and sees only that company's requests. The login name does not have to be an email. Email on the client record is optional. After a new request is submitted, 「我的請求」 on that screen returns to the list. Signing in again is not required.
- A new request has a topic (出報價單 / 出發票 / 出收據 / 搵管理處 / 買保險 / 其他), a work location (工作地點), text, and files, and starts at 待處理. Requests created before the location column still open. The topic is the document the request started as and does not change. The same order is used on the new-request form, the client 「我的請求」 事項 filter, and the admin desk filter.
- A quotation stays one request. Its title moves 出報價單, then 出發票, then 已收錢，請出收據. 出發票 is its own stage. The client asks for the invoice after their customer accepts the quotation, and the request becomes 已收錢，請出收據 only after that client confirms payment. A request that starts as 出發票 can move only to 已收錢，請出收據. A request that starts as 出收據 is titled 已收錢，請出收據. 出收據, 搵管理處, 買保險, and 其他 do not move on, and a quotation cannot jump straight to the receipt. The client or the admin advances it from the request page; there is no second form. Messages, files, and the work location stay on that request. Each step is stored and the page title changes. The status returns to 待處理, and the admin can still set 待處理, 已入機, or 已完成 at every step. It cannot skip a step or move backward. While the request is 出發票, the admin is asked to issue the invoice. The admin is asked to issue the receipt only after the request is 已收錢，請出收據.
- Requests already linked as a separate invoice or receipt stay in the list and can still be opened. New work does not create another linked request.
- The request page shows one timeline of messages and files. Photos in that timeline are shown on the page. The file name opens or downloads the file for the signed-in client who owns the request, and for any signed-in admin. The current status and the current stage title stay on the page. Status changes and stage changes are still stored, and are not shown on the timeline. A client does not add a follow-up or more files from that page. The admin still replies there, and can attach a finished quotation, invoice, or receipt. Above the reply box, a dropdown can fill it with 攪掂, a previously saved preset, or a new preset saved from that page. Saved presets are shared by every admin and stored in `reply_presets`. The reply box and its file attachments stay free text.
- Only an allowlisted admin can sign in, see every request, reply, attach files, and set the status at any time to 待處理, 已入機, or 已完成. The admin can delete a request from the desk. Deleting it removes the messages, attachments, and notifications as well. The admin can also delete a client from the clients page after a confirmation step. That ends the client's sessions immediately, and removes that client's requests, messages, and uploaded files. It cannot be undone. A client cannot delete an account.
- New requests are marked and sorted first on the admin desk.
- The admin creates a client account and can later reset that client's password. Resetting a password ends that account's existing sessions.
- Both desks show 登出. Signing out ends only that browser's session. A session stays valid until logout or a password change. It does not expire because of age or idle time.
- Notifications in this version are in-app only. The `notification_events` table is the place to add email or WhatsApp later.

## Stack

- Next.js (App Router) and TypeScript, intended for Vercel
- Neon Postgres, queried from server code with `@neondatabase/serverless`
- App-owned passwords (scrypt hashes) and long-lived HttpOnly session cookies
- Private Neon Object Storage bucket `request-files` for attachments

The browser never talks to Postgres. Admin pages require a session whose email is in `admin_allowlist` and whose password hash is set. Client pages require a session for that client. Old `/c/{token}` links redirect to the client login page and do not load requests or messages.

Neon Auth remains enabled on the existing project, and this repo still does not migrate the `neon_auth` schema. The app does not call it. `NEON_AUTH_BASE_URL` and `NEON_AUTH_COOKIE_SECRET` are not read.

## Existing Neon project

Use the project that is already created. Do not create another one.

- Name: goodnote
- Project id: `shiny-heart-58021805`
- Default branch: main (`br-tiny-sky-aouhyj4x`)
- Region: `aws-ap-southeast-1`
- Auth schema: `neon_auth` (leave it alone; this repo does not migrate it, and login does not use it)
- Private bucket: `request-files` (already created; do not make it public)

`neon.ts` records `auth: true` and that private bucket so the existing branch policy stays documented. It does not enable the Data API or the AI Gateway. You do not need to run `neon deploy` for this login change. If you do run it later, review `neon config plan` first: deploy reconciles the branch and writes secrets into a local env file. Do not commit that file.

## Local setup

1. Copy `.env.example` to `.env.local`. Fill in the pooled `DATABASE_URL`, the direct `DATABASE_URL_UNPOOLED`, a session secret (`openssl rand -base64 32`), and the object-storage `AWS_*` values for the main branch. Do not commit `.env.local` or the secret.
2. Apply the schema with the **direct** connection. This does not touch `neon_auth` and does not insert a password:

```bash
psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f db/migrations/0001_init.sql
psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f db/migrations/0002_accounts.sql
psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f db/migrations/0003_request_status.sql
psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f db/migrations/0004_work_location.sql
psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f db/migrations/0005_document_chain.sql
psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f db/migrations/0006_request_stage.sql
psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f db/migrations/0007_stage_titles.sql
psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f db/migrations/0008_request_statuses.sql
psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f db/migrations/0009_topics_and_reply_presets.sql
```

If `0001` through `0008_request_statuses` are already applied, run only `0009_topics_and_reply_presets.sql` with the direct connection. After this change is merged, apply that file to the Goodnote Neon database only. Do not apply it to any other project, and do not apply it from the app. `0009_topics_and_reply_presets.sql` adds 搵管理處 and 買保險, and the shared admin reply presets. It does not change requests already stored.

3. Allow an admin, if that email is not already listed. The address must be lowercase:

```sql
insert into public.admin_allowlist (email) values ('you@example.com');
```

The hosted database already lists `alvis@alvis.hk`. An allowlisted email cannot sign in until a password hash is stored. This repo does not seed one.

4. Set that password locally. The script reads the password from the terminal (or a pipe) and does not print it. Do not put the password in the command line, a file that is committed, or the chat log.

```bash
ADMIN_EMAIL=alvis@alvis.hk DATABASE_URL_UNPOOLED="$DATABASE_URL_UNPOOLED" node --import tsx scripts/set-admin-password.ts
```

5. Install and run:

```bash
npm install
npm run dev
```

Open `http://localhost:3000/admin/login` and sign in with the allowlisted email and the password you just set. Create a client, give them a login name and password, then open `http://localhost:3000/client/login` in a private window.

Anyone not on `admin_allowlist` is refused. There is no public sign-up screen. An allowlisted email with no password hash is also refused. After a session exists, the desk checks it again on each request.

To end a client's sessions, reset their password on the clients page, or delete that client. Deleting the client also removes the account, so that login name can no longer sign in. To end every session for the admin, use 更改密碼. 登出 ends only the session in this browser.

The session cookie is `HttpOnly`, `Secure`, and `SameSite=Lax`. The server does not expire it for age or idle time. `http://localhost` is a secure context in current Chromium and Firefox. If a browser drops the cookie, run `npm run dev -- --experimental-https` and open the https URL.

Old `/c/{token}` URLs send the visitor to `/client/login`. They do not show that client's requests or messages.

## Deploy on Vercel

1. Import this repository. Framework preset: Next.js.
2. Set these environment variables for Production and Preview. None of the secrets use the `NEXT_PUBLIC_` prefix.
   - `DATABASE_URL` — pooled
   - `SESSION_SECRET` — at least 32 characters, from `openssl rand -base64 32`. Do not commit it. Rotating it signs everyone out; password hashes stay valid.
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
   - `AWS_ENDPOINT_URL_S3`
   - `AWS_REGION`
3. Apply `db/migrations/0002_accounts.sql`, `db/migrations/0003_request_status.sql`, `db/migrations/0004_work_location.sql`, `db/migrations/0005_document_chain.sql`, `db/migrations/0006_request_stage.sql`, `db/migrations/0007_stage_titles.sql`, `db/migrations/0008_request_statuses.sql`, and `db/migrations/0009_topics_and_reply_presets.sql` with the direct connection if they are not applied yet. Do not apply them from the app. `0006_request_stage.sql` keeps the quotation, invoice, and receipt on one request. `0007_stage_titles.sql` is the title update for that same request. `0008_request_statuses.sql` keeps the statuses 待處理, 已入機, and 已完成. `0009_topics_and_reply_presets.sql` adds 搵管理處 and 買保險, and stores shared admin reply presets. After this change is merged, apply `0009_topics_and_reply_presets.sql` to the Goodnote Neon database only, not to any other project.
4. Set the first admin password with `scripts/set-admin-password.ts` against the hosted database, using `DATABASE_URL_UNPOOLED` and `ADMIN_EMAIL=alvis@alvis.hk`. Until that hash exists, the admin login will say the password has not been set.
5. Deploy. The browser posts each file to this app in chunks that stay under the platform request-body limit (commonly 4.5MB). The server writes the finished object to the private bucket. A file can still be 20MB, and one submission can still include 8 files. Previews and downloads are read back through this app in chunks of the same size, after the server checks the session. The browser does not fetch the storage host. Saving or opening a file does not require bucket CORS.

There is no emailed forgot-password flow. Password resets are done by someone who can already sign in as admin, or with the script above for the first admin password.

## Access model

- Clients are accounts. The server reads the session cookie, checks that the session is not revoked, and that `credential_at` still matches the client's `password_changed_at`. Every client query filters on that session's client id. Internal notes and password hashes are not selected for client pages.
- Admins are rows in `admin_allowlist` with a password hash. The session stores the email. It does not trust a profile field as a permission. Public self-signup is closed.
- Login names are unique. Email on a client is optional contact information and is not the client login.
- The database role can read every row. Only server code holds `DATABASE_URL`. Status values, stage changes, the timeline, attachment scope, and in-app notification rows are still enforced by triggers. An admin can move a request between any of the three statuses at every stage. A stage only moves one step forward, on the same request. Deleting the request cascades to its messages, attachments, and notifications, and keeps a later document that only pointed at it. Deleting a client cascades to that client's sessions, requests, messages, attachments, and notifications. No extra migration is required for client deletion.
- Object storage credentials stay on the server. The bucket is private. The browser does not upload to or download from the storage host. It posts upload chunks to `/api/uploads` with a short-lived grant for one object key, and it reads a saved file from `/api/files/{id}` with the session cookie. The server checks the session, that the client owns the request (an admin may open any of them), the size (20MB), and the MIME type. Each upload or download body stays under the platform limit. Deleting a request, or deleting the client who owns it, also deletes those objects, including unfinished chunks, from the bucket.
- Session tokens are random. The database stores only an HMAC of the token, keyed with `SESSION_SECRET`. Password columns store scrypt hashes, never plaintext.

Some browsers cap how long they keep a cookie (often about 400 days). The server still accepts a presented session after that span; it does not apply its own timeout. Visiting the app refreshes the cookie's browser lifetime without changing the session.

## Checks

```bash
npm test
npm run lint
npm run typecheck
npm run test:schema
npm run build
```

`npm run test:schema` applies every file in [`db/migrations`](db/migrations) to a throwaway Postgres and checks status changes, stage changes, deletion of a request and of a client, the timeline, notifications, attachment scope, login-name uniqueness, and that sessions have no expiry columns. It starts a temporary cluster when `DATABASE_URL` is unset. Do not point it at the hosted Neon project.

## Later notifications

`private.on_message_created()` currently inserts `channel = 'in_app'` with `delivered_at` set. A commented insert beside it shows where to add an `email` or `whatsapp` row with `delivered_at` left null. A worker can then deliver `where delivered_at is null` without changing the request flow.
