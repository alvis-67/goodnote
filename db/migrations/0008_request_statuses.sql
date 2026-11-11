-- Keep three request statuses: 待處理, 已入機, 已完成.
-- Apply once with a direct (non-pooled) connection, after 0007_stage_titles.sql:
--   psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f db/migrations/0008_request_statuses.sql
--
-- After merge, apply this file to the Goodnote Neon database only.
-- Do not apply it to any other project, and do not apply it from the app.
--
-- 處理中 (in_progress) becomes 待處理 (pending).
-- 已出單 (issued) becomes 已完成 (completed). The issued id is retired.
-- pending and recorded stay as they are.
-- Status ids stored on timeline rows and in-app notification payloads move
-- with those same rules. Message bodies, including historical status_change
-- bodies, are left as stored. Stage titles, stage values, and the stage
-- path are not changed.
-- Does not create or alter the neon_auth schema.

begin;

alter table public.requests disable trigger requests_enforce_update;
alter table public.requests disable trigger requests_log_status_change;

alter table public.requests drop constraint requests_status_check;
alter table public.messages drop constraint messages_status_from_check;
alter table public.messages drop constraint messages_status_to_check;

update public.requests
set status = 'pending'
where status = 'in_progress';

update public.requests
set status = 'completed'
where status = 'issued';

update public.messages
set status_from = 'pending'
where status_from = 'in_progress';

update public.messages
set status_from = 'completed'
where status_from = 'issued';

update public.messages
set status_to = 'pending'
where status_to = 'in_progress';

update public.messages
set status_to = 'completed'
where status_to = 'issued';

update public.notification_events
set payload = jsonb_set(payload, '{status}', '"pending"'::jsonb, false)
where payload->>'status' = 'in_progress';

update public.notification_events
set payload = jsonb_set(payload, '{status}', '"completed"'::jsonb, false)
where payload->>'status' = 'issued';

alter table public.requests
  add constraint requests_status_check check (status in ('pending', 'recorded', 'completed'));

alter table public.messages
  add constraint messages_status_from_check check (
    status_from is null or status_from in ('pending', 'recorded', 'completed')
  );

alter table public.messages
  add constraint messages_status_to_check check (
    status_to is null or status_to in ('pending', 'recorded', 'completed')
  );

-- Same stage rules as 0006. Only the allowed status set changes.
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

alter table public.requests enable trigger requests_enforce_update;
alter table public.requests enable trigger requests_log_status_change;

commit;
