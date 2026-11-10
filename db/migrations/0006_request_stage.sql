-- Keep a quotation, its invoice, and its receipt on one request.
-- Apply once with a direct (non-pooled) connection, after 0005_document_chain.sql:
--   psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f db/migrations/0006_request_stage.sql
--
-- topic stays the document the request started as. stage is the current step
-- on that same request. A quotation moves quote -> invoice -> receipt.
-- An invoice moves invoice -> receipt. A receipt or other request does not move.
-- Moving forward returns status to pending and writes a timeline row.
-- The four statuses can still be set at every stage.
-- Existing parent_request_id links are left in place. This does not insert
-- requests, rewrite those links, or change messages and files already stored.
-- Does not create or alter the neon_auth schema.

alter table public.requests
  add column stage text;

alter table public.requests disable trigger requests_enforce_update;

update public.requests
set stage = topic
where stage is null;

alter table public.requests enable trigger requests_enforce_update;

alter table public.requests
  alter column stage set not null;

alter table public.requests
  add constraint requests_stage_check check (
    stage in ('quote', 'invoice', 'receipt', 'other')
  );

alter table public.requests
  add constraint requests_stage_path_check check (
    (topic = 'quote' and stage in ('quote', 'invoice', 'receipt'))
    or (topic = 'invoice' and stage in ('invoice', 'receipt'))
    or (topic = 'receipt' and stage = 'receipt')
    or (topic = 'other' and stage = 'other')
  );

comment on column public.requests.stage is
  'Current step on this same request. topic remains the step it started as. Existing rows are set to their topic, so a linked invoice or receipt keeps the title it already had.';

create or replace function private.enforce_request_update()
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

  -- The link is chosen when the later document is created. Clearing it is
  -- only how a deleted parent unlinks the later document.
  if new.parent_request_id is distinct from old.parent_request_id
     and new.parent_request_id is not null
  then
    raise exception 'These request fields are immutable' using errcode = '42501';
  end if;

  if new.stage is distinct from old.stage then
    if not (
      (old.topic = 'quote' and old.stage = 'quote' and new.stage = 'invoice')
      or (old.topic = 'quote' and old.stage = 'invoice' and new.stage = 'receipt')
      or (old.topic = 'invoice' and old.stage = 'invoice' and new.stage = 'receipt')
    ) then
      raise exception 'This request cannot move to that stage' using errcode = '23514';
    end if;
    new.status := 'pending';
    new.admin_unread := true;
    new.last_activity_at := now();
  end if;

  if internal then
    return new;
  end if;

  if new.status is distinct from old.status then
    if new.status not in ('pending', 'in_progress', 'issued', 'recorded') then
      raise exception 'Invalid status' using errcode = '23514';
    end if;
    new.client_unread := true;
    new.last_activity_at := now();
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.enforce_request_update() from public;

create function private.set_request_stage()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.stage is null then
    new.stage := new.topic;
  elsif new.stage is distinct from new.topic then
    raise exception 'A new request starts at its own topic' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger requests_set_stage
  before insert on public.requests
  for each row
  execute function private.set_request_stage();

revoke all on function private.set_request_stage() from public;

create function private.request_stage_title(topic text, stage text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when topic = 'quote' and stage = 'quote' then '出報價單'
    when topic = 'quote' and stage = 'invoice' then '出發票'
    when topic = 'invoice' and stage = 'invoice' then '出發票'
    when topic = 'quote' and stage = 'receipt' then '已收錢，請出收據'
    when topic = 'invoice' and stage = 'receipt' then '已收錢，請出收據'
    when topic = 'receipt' and stage = 'receipt' then '已收錢，請出收據'
    when topic = 'other' and stage = 'other' then '其他'
    else null
  end;
$$;

revoke all on function private.request_stage_title(text, text) from public;

alter table public.messages
  add column stage_from text,
  add column stage_to text;

alter table public.messages
  add constraint messages_stage_from_check check (
    stage_from is null or stage_from in ('quote', 'invoice', 'receipt', 'other')
  );

alter table public.messages
  add constraint messages_stage_to_check check (
    stage_to is null or stage_to in ('quote', 'invoice', 'receipt', 'other')
  );

alter table public.messages drop constraint messages_kind_check;

alter table public.messages
  add constraint messages_kind_check check (kind in ('message', 'status_change', 'stage_change'));

alter table public.messages drop constraint messages_shape_check;

alter table public.messages
  add constraint messages_shape_check check (
    (
      kind = 'message'
      and author_role in ('client', 'admin')
      and status_from is null
      and status_to is null
      and stage_from is null
      and stage_to is null
    )
    or (
      kind = 'status_change'
      and author_role = 'system'
      and status_from is not null
      and status_to is not null
      and stage_from is null
      and stage_to is null
    )
    or (
      kind = 'stage_change'
      and author_role = 'system'
      and status_from is null
      and status_to is null
      and stage_from is not null
      and stage_to is not null
      and body is not null
    )
  );

create function private.log_stage_change()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  line text;
begin
  if new.stage is distinct from old.stage then
    line := '階段由'
      || private.request_stage_title(old.topic, old.stage)
      || '改為'
      || private.request_stage_title(new.topic, new.stage);
    if line is null then
      raise exception 'Missing stage title' using errcode = '23514';
    end if;
    insert into public.messages (request_id, author_role, kind, body, stage_from, stage_to)
    values (new.id, 'system', 'stage_change', line, old.stage, new.stage);
  end if;
  return new;
end;
$$;

create trigger requests_log_stage_change
  after update on public.requests
  for each row
  execute function private.log_stage_change();

revoke all on function private.log_stage_change() from public;

alter table public.notification_events drop constraint notification_events_type_check;

alter table public.notification_events
  add constraint notification_events_type_check check (
    event_type in (
      'request_created',
      'client_message',
      'admin_message',
      'status_changed',
      'stage_changed'
    )
  );

create or replace function private.on_message_created()
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

  if new.kind = 'stage_change' then
    perform set_config('app.internal_write', '1', true);
    update public.requests
      set admin_unread = true,
          last_activity_at = now(),
          updated_at = now()
      where id = new.request_id;
    perform set_config('app.internal_write', '', true);
    recipient := 'admin';
    event_type := 'stage_changed';
  else
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
      'stage', req.stage,
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

revoke all on function private.on_message_created() from public;

create or replace view public.request_inbox as
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
  ) as latest_body,
  r.work_location,
  r.parent_request_id,
  parent.topic as parent_topic,
  child.id as child_request_id,
  child.topic as child_topic,
  r.stage
from public.requests r
join public.clients c on c.id = r.client_id
left join public.requests parent on parent.id = r.parent_request_id
left join public.requests child on child.parent_request_id = r.id;
