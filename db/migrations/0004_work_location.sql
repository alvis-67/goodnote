-- Work location written by the client on a new request.
-- Apply once with a direct (non-pooled) connection, after 0003_request_status.sql:
--   psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f db/migrations/0004_work_location.sql
--
-- Does not insert rows, passwords, or connection strings.
-- Does not create or alter the neon_auth schema.
-- Existing requests stay null and still load. The app requires a location on create.

alter table public.requests
  add column work_location text;

alter table public.requests
  add constraint requests_work_location_length check (
    work_location is null
    or char_length(btrim(work_location)) between 1 and 120
  );

comment on column public.requests.work_location is
  'Site or place for this request, written by the client. Null on requests created before this column existed.';

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
  r.work_location
from public.requests r
join public.clients c on c.id = r.client_id;
