-- Link a later document to the request it follows.
-- Apply once with a direct (non-pooled) connection, after 0004_work_location.sql:
--   psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f db/migrations/0005_document_chain.sql
--
-- A quotation may have one invoice. That invoice may have one receipt.
-- parent_request_id stays null on requests that were not opened from another one.
-- Does not insert rows or connection strings.
-- Does not create or alter the neon_auth schema.

alter table public.requests
  add column parent_request_id uuid;

alter table public.requests
  add constraint requests_parent_request_id_fkey
  foreign key (parent_request_id) references public.requests (id) on delete set null;

alter table public.requests
  add constraint requests_parent_not_self check (
    parent_request_id is null or parent_request_id <> id
  );

comment on column public.requests.parent_request_id is
  'Earlier document this request follows. Null when the request was not opened from another one. At most one invoice follows a quotation, and at most one receipt follows that invoice.';

create unique index requests_one_child_idx
  on public.requests (parent_request_id)
  where parent_request_id is not null;

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

create function private.enforce_request_parent()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  parent public.requests%rowtype;
begin
  if new.parent_request_id is null then
    return new;
  end if;

  select * into parent from public.requests where id = new.parent_request_id;
  if parent.id is null then
    raise exception 'Parent request is missing' using errcode = '23503';
  end if;

  if parent.client_id <> new.client_id then
    raise exception 'Parent request belongs to another client' using errcode = '42501';
  end if;

  if not (
    (parent.topic = 'quote' and new.topic = 'invoice')
    or (parent.topic = 'invoice' and new.topic = 'receipt')
  ) then
    raise exception 'This document cannot follow that request' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger requests_enforce_parent
  before insert or update of parent_request_id, topic, client_id
  on public.requests
  for each row
  execute function private.enforce_request_parent();

revoke all on function private.enforce_request_parent() from public;

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
  child.topic as child_topic
from public.requests r
join public.clients c on c.id = r.client_id
left join public.requests parent on parent.id = r.parent_request_id
left join public.requests child on child.parent_request_id = r.id;
