-- Add 搵管理處 and 買保險, and store shared admin reply presets.
-- Apply once with a direct (non-pooled) connection, after 0008_request_statuses.sql:
--   psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f db/migrations/0009_topics_and_reply_presets.sql
--
-- After merge, apply this file to the Goodnote Neon database only.
-- Do not apply it to any other project, and do not apply it from the app.
--
-- Topic order in the product is 出報價單, 出發票, 出收據, 搵管理處, 買保險, 其他.
-- Stored ids: quote, invoice, receipt, management, insurance, other.
-- management and insurance start at their own topic and do not move on,
-- the same as other. Quote, invoice, and receipt keep their current paths:
--   quote: quote -> invoice -> receipt
--   invoice: invoice -> receipt
--   receipt: receipt, with no further stage
-- Existing topic and stage values are not rewritten. This does not insert
-- or delete requests, and it does not change statuses.
-- Reply presets are shared by every admin. The built-in 攪掂 preset is
-- not inserted here.
-- Does not create or alter the neon_auth schema.

begin;

alter table public.requests drop constraint requests_topic_check;
alter table public.requests
  add constraint requests_topic_check check (
    topic in ('quote', 'invoice', 'receipt', 'management', 'insurance', 'other')
  );

alter table public.requests drop constraint requests_stage_check;
alter table public.requests
  add constraint requests_stage_check check (
    stage in ('quote', 'invoice', 'receipt', 'management', 'insurance', 'other')
  );

alter table public.requests drop constraint requests_stage_path_check;
alter table public.requests
  add constraint requests_stage_path_check check (
    (topic = 'quote' and stage in ('quote', 'invoice', 'receipt'))
    or (topic = 'invoice' and stage in ('invoice', 'receipt'))
    or (topic = 'receipt' and stage = 'receipt')
    or (topic = 'management' and stage = 'management')
    or (topic = 'insurance' and stage = 'insurance')
    or (topic = 'other' and stage = 'other')
  );

alter table public.messages drop constraint messages_stage_from_check;
alter table public.messages
  add constraint messages_stage_from_check check (
    stage_from is null or stage_from in ('quote', 'invoice', 'receipt', 'management', 'insurance', 'other')
  );

alter table public.messages drop constraint messages_stage_to_check;
alter table public.messages
  add constraint messages_stage_to_check check (
    stage_to is null or stage_to in ('quote', 'invoice', 'receipt', 'management', 'insurance', 'other')
  );

-- A new request still starts at its own topic, including management and insurance.
create or replace function private.set_request_stage()
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

revoke all on function private.set_request_stage() from public;

-- Status rules stay as they were in 0008. The only forward stage paths are
-- quote -> invoice, that invoice -> receipt, and invoice -> receipt.
-- management, insurance, receipt, and other cannot move.
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

revoke all on function private.enforce_request_update() from public;

create or replace function private.request_stage_title(topic text, stage text)
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
    when topic = 'management' and stage = 'management' then '搵管理處'
    when topic = 'insurance' and stage = 'insurance' then '買保險'
    when topic = 'other' and stage = 'other' then '其他'
    else null
  end;
$$;

revoke all on function private.request_stage_title(text, text) from public;

create table public.reply_presets (
  id uuid primary key default gen_random_uuid(),
  body text not null,
  created_at timestamptz not null default now(),
  constraint reply_presets_body_check check (
    char_length(body) between 1 and 4000
    and body = btrim(body)
  ),
  constraint reply_presets_body_key unique (body)
);

comment on table public.reply_presets is
  'Shared admin reply text. Every admin sees the same rows. The built-in 攪掂 preset is not stored in this table.';

create index reply_presets_created_idx on public.reply_presets (created_at, id);

commit;
