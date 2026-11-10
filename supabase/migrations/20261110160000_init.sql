-- Goodnote first schema: clients, requests, timeline, files, and admin allowlist.
-- Run this once on a new Supabase project (SQL editor or `supabase db push`).
-- Requires Postgres 15+ (Supabase default) so the inbox view can use security_invoker.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

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
  'Emails allowed to use the admin desk. Insert the first row with the SQL editor before creating the Auth user.';

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
  'Internal admin notes. Not granted to the anon role.';

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
  constraint requests_status_check check (status in ('pending', 'in_progress', 'issued', 'recorded'))
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
    status_from is null or status_from in ('pending', 'in_progress', 'issued', 'recorded')
  ),
  constraint messages_status_to_check check (
    status_to is null or status_to in ('pending', 'in_progress', 'issued', 'recorded')
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
-- Helpers (private schema: not exposed by the Data API)
-- ---------------------------------------------------------------------------

create function private.request_header(header_name text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  raw text;
  headers json;
begin
  raw := current_setting('request.headers', true);
  if raw is null or btrim(raw) = '' then
    return null;
  end if;
  begin
    headers := raw::json;
  exception
    when others then
      return null;
  end;
  return headers ->> lower(header_name);
end;
$$;

create function private.current_client_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.clients
  where access_token = coalesce(private.request_header('x-client-token'), '')
  limit 1
$$;

comment on function private.current_client_id() is
  'Client identity for RLS. The anon key plus the x-client-token header is the client credential.';

create function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_allowlist
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
$$;

create function private.set_client_updated_at()
returns trigger
language plpgsql
set search_path = public
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
security definer
set search_path = public
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

  if not private.is_admin() then
    if new.status is distinct from old.status
       or new.admin_unread is distinct from old.admin_unread
       or new.admin_last_read_at is distinct from old.admin_last_read_at
       or new.last_activity_at is distinct from old.last_activity_at
    then
      raise exception 'Clients cannot change this request' using errcode = '42501';
    end if;
    new.updated_at := now();
    return new;
  end if;

  if new.status is distinct from old.status then
    if not (
      (old.status = 'pending' and new.status = 'in_progress')
      or (old.status = 'in_progress' and new.status = 'issued')
      or (old.status = 'issued' and new.status = 'recorded')
    ) then
      raise exception 'Invalid status transition' using errcode = '23514';
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
security definer
set search_path = public
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
security definer
set search_path = public
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
security definer
set search_path = public
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

create function private.enforce_admin_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is null or not exists (
    select 1 from public.admin_allowlist where email = lower(new.email)
  ) then
    raise exception 'Email is not on the admin allowlist' using errcode = '42501';
  end if;
  new.email := lower(new.email);
  return new;
end;
$$;

revoke all on function private.request_header(text) from public;
revoke all on function private.current_client_id() from public;
revoke all on function private.is_admin() from public;
revoke all on function private.set_client_updated_at() from public;
revoke all on function private.enforce_request_update() from public;
revoke all on function private.log_status_change() from public;
revoke all on function private.on_message_created() from public;
revoke all on function private.enforce_attachment_scope() from public;
revoke all on function private.enforce_admin_signup() from public;

grant execute on function private.request_header(text) to anon, authenticated;
grant execute on function private.current_client_id() to anon, authenticated;
grant execute on function private.is_admin() to anon, authenticated;
grant execute on function private.set_client_updated_at() to anon, authenticated;
grant execute on function private.enforce_request_update() to anon, authenticated;
grant execute on function private.log_status_change() to anon, authenticated;
grant execute on function private.on_message_created() to anon, authenticated;
grant execute on function private.enforce_attachment_scope() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Grants. RLS below is the actual authorization boundary.
-- Column grants stop a client token from reading internal notes or the token
-- column, and from updating anything except its own read marker.
-- ---------------------------------------------------------------------------

revoke all on public.admin_allowlist from anon, authenticated;
revoke all on public.clients from anon, authenticated;
revoke all on public.requests from anon, authenticated;
revoke all on public.messages from anon, authenticated;
revoke all on public.attachments from anon, authenticated;
revoke all on public.notification_events from anon, authenticated;

grant select on public.admin_allowlist to authenticated;

grant select (id, company_name, contact_name, phone, created_at) on public.clients to anon;
grant select, insert, update on public.clients to authenticated;

grant select, insert on public.requests to anon, authenticated;
grant update (client_unread, client_last_read_at) on public.requests to anon;
grant update on public.requests to authenticated;

grant select, insert on public.messages to anon, authenticated;
grant select, insert on public.attachments to anon, authenticated;
grant select on public.notification_events to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.admin_allowlist enable row level security;
alter table public.clients enable row level security;
alter table public.requests enable row level security;
alter table public.messages enable row level security;
alter table public.attachments enable row level security;
alter table public.notification_events enable row level security;

create policy admin_allowlist_select
  on public.admin_allowlist
  for select
  to authenticated
  using ((select private.is_admin()));

create policy admin_allowlist_insert
  on public.admin_allowlist
  for insert
  to authenticated
  with check ((select private.is_admin()));

create policy clients_anon_select
  on public.clients
  for select
  to anon
  using (id = (select private.current_client_id()));

create policy clients_admin_select
  on public.clients
  for select
  to authenticated
  using ((select private.is_admin()));

create policy clients_admin_insert
  on public.clients
  for insert
  to authenticated
  with check ((select private.is_admin()));

create policy clients_admin_update
  on public.clients
  for update
  to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy requests_select
  on public.requests
  for select
  to anon
  using (client_id = (select private.current_client_id()));

create policy requests_admin_select
  on public.requests
  for select
  to authenticated
  using ((select private.is_admin()));

create policy requests_insert
  on public.requests
  for insert
  to anon
  with check (
    client_id = (select private.current_client_id())
    and status = 'pending'
    and admin_unread = true
    and client_unread = false
  );

create policy requests_admin_insert
  on public.requests
  for insert
  to authenticated
  with check ((select private.is_admin()) and status = 'pending');

create policy requests_update
  on public.requests
  for update
  to anon
  using (client_id = (select private.current_client_id()))
  with check (client_id = (select private.current_client_id()));

create policy requests_admin_update
  on public.requests
  for update
  to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy messages_select
  on public.messages
  for select
  to anon
  using (
    request_id in (
      select id from public.requests
      where client_id = (select private.current_client_id())
    )
  );

create policy messages_admin_select
  on public.messages
  for select
  to authenticated
  using ((select private.is_admin()));

create policy messages_insert
  on public.messages
  for insert
  to anon
  with check (
    author_role = 'client'
    and kind = 'message'
    and request_id in (
      select id from public.requests
      where client_id = (select private.current_client_id())
    )
  );

create policy messages_admin_insert
  on public.messages
  for insert
  to authenticated
  with check (
    (select private.is_admin())
    and author_role = 'admin'
    and kind = 'message'
  );

create policy attachments_select
  on public.attachments
  for select
  to anon
  using (client_id = (select private.current_client_id()));

create policy attachments_admin_select
  on public.attachments
  for select
  to authenticated
  using ((select private.is_admin()));

create policy attachments_insert
  on public.attachments
  for insert
  to anon
  with check (
    client_id = (select private.current_client_id())
    and exists (
      select 1
      from public.messages m
      join public.requests r on r.id = m.request_id
      where m.id = message_id
        and m.request_id = attachments.request_id
        and r.client_id = (select private.current_client_id())
        and m.author_role = 'client'
        and m.kind = 'message'
    )
  );

create policy attachments_admin_insert
  on public.attachments
  for insert
  to authenticated
  with check ((select private.is_admin()));

create policy notification_events_select
  on public.notification_events
  for select
  to anon
  using (
    recipient_role = 'client'
    and client_id = (select private.current_client_id())
  );

create policy notification_events_admin_select
  on public.notification_events
  for select
  to authenticated
  using ((select private.is_admin()));

-- ---------------------------------------------------------------------------
-- Inbox view. security_invoker keeps the underlying RLS in force.
-- ---------------------------------------------------------------------------

create view public.request_inbox
with (security_invoker = true) as
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
    order by m.created_at desc
    limit 1
  ) as latest_body
from public.requests r
join public.clients c on c.id = r.client_id;

grant select on public.request_inbox to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Private storage bucket. Signed URLs are minted only after RLS allows the
-- caller to see the request. Direct anon access also requires the client token
-- header and a path prefixed with that client's id. Admins use their session.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'request-files',
  'request-files',
  false,
  20971520,
  array[
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
  ]
);

grant usage on schema storage to anon, authenticated;
grant select, insert on storage.objects to anon;
grant select, insert, update on storage.objects to authenticated;

alter table storage.objects enable row level security;

create policy request_files_admin_select
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'request-files' and (select private.is_admin()));

create policy request_files_admin_insert
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'request-files' and (select private.is_admin()));

create policy request_files_admin_update
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'request-files' and (select private.is_admin()))
  with check (bucket_id = 'request-files' and (select private.is_admin()));

create policy request_files_client_select
  on storage.objects
  for select
  to anon
  using (
    bucket_id = 'request-files'
    and (storage.foldername(name))[1] = (select private.current_client_id())::text
  );

create policy request_files_client_insert
  on storage.objects
  for insert
  to anon
  with check (
    bucket_id = 'request-files'
    and (storage.foldername(name))[1] = (select private.current_client_id())::text
  );

-- Block Auth signups that are not on the allowlist. If the migration role
-- cannot touch auth.users, the app still refuses them via shouldCreateUser
-- and the is_admin() policies. Disable public signups in the dashboard too.
do $$
begin
  if to_regclass('auth.users') is not null then
    execute 'drop trigger if exists enforce_admin_signup on auth.users';
    execute 'create trigger enforce_admin_signup before insert on auth.users for each row execute function private.enforce_admin_signup()';
  end if;
exception
  when insufficient_privilege or undefined_table or undefined_object then
    raise warning 'Skipped auth.users allowlist trigger (%). Disable public signups in the Supabase dashboard.', sqlerrm;
end $$;

notify pgrst, 'reload schema';
