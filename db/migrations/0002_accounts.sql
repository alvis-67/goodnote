-- App-owned passwords and sessions for admins and clients.
-- Apply once with a direct (non-pooled) connection, after 0001_init.sql:
--   psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f db/migrations/0002_accounts.sql
--
-- Does not insert allowlist rows, passwords, or password hashes.
-- Does not create or alter the neon_auth schema. The app no longer uses it to sign in.
-- Existing /c/{token} links stop working because clients.access_token is removed.

alter table public.admin_allowlist
  add column password_hash text,
  add column password_changed_at timestamptz;

alter table public.admin_allowlist
  add constraint admin_allowlist_password_hash_shape check (
    password_hash is null
    or (
      char_length(password_hash) between 20 and 200
      and password_hash ~ '^scrypt\$[0-9]+\$[0-9]+\$[0-9]+\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$'
    )
  );

alter table public.admin_allowlist
  add constraint admin_allowlist_password_pair check (
    (password_hash is null and password_changed_at is null)
    or (password_hash is not null and password_changed_at is not null)
  );

comment on table public.admin_allowlist is
  'Emails allowed to use the admin password login. A listed email cannot sign in until password_hash is set out of band. There is no public sign-up.';

comment on column public.admin_allowlist.password_hash is
  'scrypt password hash. Never store a plaintext password.';

alter table public.clients
  add column login_name text,
  add column email text,
  add column password_hash text,
  add column password_changed_at timestamptz;

alter table public.clients
  drop column access_token;

alter table public.clients
  add constraint clients_login_name_shape check (
    login_name is null
    or (
      login_name = lower(login_name)
      and char_length(login_name) between 2 and 40
      and login_name !~ '[[:space:]]'
      and login_name !~ '[[:cntrl:]]'
    )
  );

alter table public.clients
  add constraint clients_email_shape check (
    email is null
    or (
      email = lower(email)
      and char_length(email) <= 200
      and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    )
  );

alter table public.clients
  add constraint clients_password_hash_shape check (
    password_hash is null
    or (
      char_length(password_hash) between 20 and 200
      and password_hash ~ '^scrypt\$[0-9]+\$[0-9]+\$[0-9]+\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$'
    )
  );

alter table public.clients
  add constraint clients_login_credentials_pair check (
    (login_name is null and password_hash is null and password_changed_at is null)
    or (login_name is not null and password_hash is not null and password_changed_at is not null)
  );

create unique index clients_login_name_key on public.clients (login_name) where login_name is not null;

comment on column public.clients.login_name is
  'Unique login name. It does not have to be an email. Null until an admin sets credentials.';

comment on column public.clients.email is
  'Optional contact email. It is not a login name and is not required.';

comment on column public.clients.password_hash is
  'scrypt password hash set by an admin. Never store a plaintext password.';

-- No expires_at and no last-seen column. A row stays valid until logout or a
-- password change sets revoked_at, or until credential_at no longer matches
-- the account password_changed_at.
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null,
  account_type text not null,
  admin_email text,
  client_id uuid,
  created_at timestamptz not null default now(),
  credential_at timestamptz not null,
  revoked_at timestamptz,
  constraint sessions_token_hash_shape check (token_hash ~ '^[a-f0-9]{64}$'),
  constraint sessions_account_type_check check (account_type in ('admin', 'client')),
  constraint sessions_subject_check check (
    (account_type = 'admin' and admin_email is not null and client_id is null)
    or (account_type = 'client' and client_id is not null and admin_email is null)
  ),
  constraint sessions_admin_email_fk foreign key (admin_email)
    references public.admin_allowlist (email) on delete cascade,
  constraint sessions_client_fk foreign key (client_id)
    references public.clients (id) on delete cascade
);

create unique index sessions_token_hash_key on public.sessions (token_hash);
create index sessions_admin_open_idx on public.sessions (admin_email)
  where revoked_at is null and account_type = 'admin';
create index sessions_client_open_idx on public.sessions (client_id)
  where revoked_at is null and account_type = 'client';

comment on table public.sessions is
  'Long-lived app sessions. The server does not expire them for age or idle time. Logout or a password change sets revoked_at. credential_at must equal the account password_changed_at. token_hash is an HMAC of the cookie value; the raw token is never stored.';

comment on column public.sessions.token_hash is
  'HMAC-SHA256 of the cookie token. Not the token itself.';
