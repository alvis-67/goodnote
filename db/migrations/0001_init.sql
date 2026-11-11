-- Goodnote schema for Neon (Lakebase Postgres).
-- Apply once with a direct (non-pooled) connection:
--   psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f db/migrations/0001_init.sql
--
-- Does not create or alter the neon_auth schema. Admin identity lives in
-- Neon Auth; public.admin_allowlist is the app's authorization list.
-- File bytes live in the private Neon Object Storage bucket `request-files`,
-- not in this database. The app server is the only database client, so
-- authorization is enforced in the server, not with browser-facing RLS.

create schema if not exists private;
revoke all on schema private from public;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.admin_allowlist (
  email text primary key,
  created_at timestamptz not null default now(),
  constraint admin_allowlist_email_lowercase check (email = lower(email)),
  constraint admin_allowlist_email_shape check (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
);

comment on table public.admin_allowlist is
  'Emails allowed to open the admin desk. Insert a lowercase row before that person requests a login code. A Neon Auth user who is not listed here is signed out.';

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  contact_name text,
  phone text,
  notes text,
  access_token text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clients_company_name_length check (char_length(btrim(company_name)) between 1 and 120),
  constraint clients_contact_name_length check (contact_name is null or char_length(contact_name) <= 80),
  constraint clients_phone_length check (phone is null or char_length(phone) <= 40),
  constraint clients_notes_length check (notes is null or char_length(notes) <= 2000),
  constraint clients_access_token_shape check (access_token ~ '^[A-Za-z0-9_-]{43,128}$')
);

comment on column public.clients.access_token is
  'Unguessable capability for /c/{token}. Possession of the token is the client credential.';
comment on column public.clients.notes is
  'Internal admin notes. Client queries must not select this column.';

create unique index clients_access_token_key on public.clients (access_token);

create table public.requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  topic text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  admin_unread boolean not null default true,
  admin_last_read_at timestamptz,
  client_unread boolean not null default false,
  client_last_read_at timestamptz,
  constraint requests_topic_check check (topic in ('quote', 'invoice', 'receipt', 'other')),
  constraint requests_status_check check (status in ('pending', 'recorded', 'completed'))
);

comment on column public.requests.admin_unread is
  'True for a new request until an admin opens it, and again after each later client message.';
comment on column public.requests.client_unread is
  'True after an admin reply or a status change until the client opens the request.';

create index requests_admin_queue_idx on public.requests (admin_unread desc, last_activity_at desc);
create index requests_client_activity_idx on public.requests (client_id, last_activity_at desc);
create index requests_status_idx on public.requests (status);
create index requests_topic_idx on public.requests (topic);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id) on delete cascade,
  author_role text not null,
  kind text not null default 'message',
  body text,
  status_from text,
  status_to text,
  created_at timestamptz not null default now(),
  constraint messages_author_role_check check (author_role in ('client', 'admin', 'system')),
  constraint messages_kind_check check (kind in ('message', 'status_change')),
  constraint messages_body_length check (body is null or char_length(body) <= 4000),
  constraint messages_status_from_check check (
    status_from is null or status_from in ('pending', 'recorded', 'completed')
  ),
  constraint messages_status_to_check check (
    status_to is null or status_to in ('pending', 'recorded', 'completed')
  ),
  constraint messages_shape_check check (
    (
      kind = 'message'
      and author_role in ('client', 'admin')
      and status_from is null
      and status_to is null
    )
    or (
      kind = 'status_change'
      and author_role = 'system'
      and status_from is not null
      and status_to is not null
    )
  )
);

create index messages_request_created_idx on public.messages (request_id, created_at);
create index messages_latest_body_idx on public.messages (request_id, created_at desc)
  where kind = 'message' and body is not null and length(btrim(body)) > 0;

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  request_id uuid not null references public.requests (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  created_at timestamptz not null default now(),
  constraint attachments_file_name_length check (char_length(file_name) between 1 and 180),
  constraint attachments_size_check check (size_bytes > 0 and size_bytes <= 20971520),
  constraint attachments_mime_check check (
    mime_type in (
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/heic',
      'image/heif',
      'application/pdf',
      'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
  ),
  constraint attachments_path_key unique (storage_path)
);

create index attachments_message_idx on public.attachments (message_id);
create index attachments_request_idx on public.attachments (request_id);

-- In-app rows are written now. Email and WhatsApp are not sent in v1.
-- To add a channel later, insert another row in private.on_message_created
-- with channel 'email' or 'whatsapp' and delivered_at null, then deliver
-- from a worker. Do not send from inside the database.
create table public.notification_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  channel text not null default 'in_app',
  recipient_role text not null,
  client_id uuid not null references public.clients (id) on delete cascade,
  request_id uuid not null references public.requests (id) on delete cascade,
  message_id uuid references public.messages (id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  delivered_at timestamptz,
  constraint notification_events_type_check check (
    event_type in ('request_created', 'client_message', 'admin_message', 'status_changed')
  ),
  constraint notification_events_channel_check check (channel in ('in_app', 'email', 'whatsapp')),
  constraint notification_events_recipient_check check (recipient_role in ('admin', 'client'))
);

comment on table public.notification_events is
  'Delivery log. v1 only inserts channel=in_app with delivered_at set. External channels stay undelivered until a worker is added.';

create index notification_events_request_idx on public.notification_events (request_id, created_at desc);
create index notification_events_pending_delivery_idx on public.notification_events (created_at)
  where delivered_at is null;

-- ---------------------------------------------------------------------------
-- Integrity triggers. The Next.js server is the only writer. These triggers
-- keep the status machine, the timeline, and attachment scope intact even
-- if an application query forgets a check.
-- ---------------------------------------------------------------------------

create function private.set_client_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger clients_set_updated_at
  before update on public.clients
  for each row
  execute function private.set_client_updated_at();

create function private.enforce_request_update()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  internal boolean := coalesce(current_setting('app.internal_write', true), '') = '1';
begin
  if new.id is distinct from old.id
     or new.topic is distinct from old.topic
     or new.client_id is distinct from old.client_id
     or new.created_at is distinct from old.created_at
  then
    raise exception 'These request fields are immutable' using errcode = '42501';
  end if;

  if internal then
    return new;
  end if;

  if new.status is distinct from old.status then
    if new.status not in ('pending', 'recorded', 'completed') then
      raise exception 'Invalid status' using errcode = '23514';
    end if;
    new.client_unread := true;
    new.last_activity_at := now();
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger requests_enforce_update
  before update on public.requests
  for each row
  execute function private.enforce_request_update();

create function private.log_status_change()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.status is distinct from old.status then
    insert into public.messages (request_id, author_role, kind, status_from, status_to)
    values (new.id, 'system', 'status_change', old.status, new.status);
  end if;
  return new;
end;
$$;

create trigger requests_log_status_change
  after update on public.requests
  for each row
  execute function private.log_status_change();

create function private.on_message_created()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  req public.requests%rowtype;
  event_type text;
  recipient text;
  is_first boolean;
begin
  select * into req from public.requests where id = new.request_id;
  if req.id is null then
    raise exception 'Request missing for message' using errcode = '23503';
  end if;

  if new.author_role = 'client' then
    perform set_config('app.internal_write', '1', true);
    update public.requests
      set admin_unread = true,
          last_activity_at = now(),
          updated_at = now()
      where id = new.request_id;
    perform set_config('app.internal_write', '', true);
    recipient := 'admin';
  else
    perform set_config('app.internal_write', '1', true);
    update public.requests
      set client_unread = true,
          last_activity_at = now(),
          updated_at = now()
      where id = new.request_id;
    perform set_config('app.internal_write', '', true);
    recipient := 'client';
  end if;

  select count(*) = 1 into is_first
  from public.messages
  where request_id = new.request_id;

  if new.kind = 'status_change' then
    event_type := 'status_changed';
  elsif new.author_role = 'client' and is_first then
    event_type := 'request_created';
  elsif new.author_role = 'client' then
    event_type := 'client_message';
  else
    event_type := 'admin_message';
  end if;

  insert into public.notification_events (
    event_type,
    channel,
    recipient_role,
    client_id,
    request_id,
    message_id,
    payload,
    delivered_at
  ) values (
    event_type,
    'in_app',
    recipient,
    req.client_id,
    req.id,
    new.id,
    jsonb_build_object(
      'topic', req.topic,
      'status', case when new.kind = 'status_change' then new.status_to else req.status end,
      'company_name', (select company_name from public.clients where id = req.client_id),
      'excerpt', left(coalesce(new.body, ''), 140)
    ),
    now()
  );

  -- Future email or WhatsApp delivery, not enabled in v1:
  -- insert into public.notification_events (
  --   event_type, channel, recipient_role, client_id, request_id, message_id, payload
  -- ) values (
  --   event_type, 'email', recipient, req.client_id, req.id, new.id, '{}'::jsonb
  -- );

  return new;
end;
$$;

create trigger messages_on_created
  after insert on public.messages
  for each row
  execute function private.on_message_created();

create function private.enforce_attachment_scope()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  req_client uuid;
  msg_request uuid;
  msg_kind text;
begin
  select client_id into req_client from public.requests where id = new.request_id;
  select request_id, kind into msg_request, msg_kind
  from public.messages
  where id = new.message_id;

  if req_client is null or msg_request is null or msg_request <> new.request_id then
    raise exception 'Attachment does not match the request' using errcode = '42501';
  end if;
  if new.client_id <> req_client then
    raise exception 'Attachment client does not match the request' using errcode = '42501';
  end if;
  if msg_kind <> 'message' then
    raise exception 'Files can only be attached to messages' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger attachments_enforce_scope
  before insert on public.attachments
  for each row
  execute function private.enforce_attachment_scope();

revoke all on function private.set_client_updated_at() from public;
revoke all on function private.enforce_request_update() from public;
revoke all on function private.log_status_change() from public;
revoke all on function private.on_message_created() from public;
revoke all on function private.enforce_attachment_scope() from public;

-- ---------------------------------------------------------------------------
-- Inbox view. The server only selects this after an admin session check.
-- ---------------------------------------------------------------------------

create view public.request_inbox as
select
  r.id,
  r.client_id,
  r.topic,
  r.status,
  r.created_at,
  r.updated_at,
  r.last_activity_at,
  r.admin_unread,
  r.admin_last_read_at,
  r.client_unread,
  r.client_last_read_at,
  c.company_name,
  c.contact_name,
  (
    select m.body
    from public.messages m
    where m.request_id = r.id
      and m.kind = 'message'
      and nullif(btrim(m.body), '') is not null
    order by m.created_at desc, m.id desc
    limit 1
  ) as latest_body
from public.requests r
join public.clients c on c.id = r.client_id;
