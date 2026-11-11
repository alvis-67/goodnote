-- Throwaway fixture for db/migrations/0008_request_statuses.sql.
-- Runs after 0007 and before 0008 on the schema test database only.
-- Restores the previous status checks, stores the old ids, and lets 0008
-- move them. This file is not a hosted migration.

alter table public.requests drop constraint requests_status_check;
alter table public.messages drop constraint messages_status_from_check;
alter table public.messages drop constraint messages_status_to_check;

insert into public.clients (id, company_name)
values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '狀態遷移');

insert into public.requests (id, client_id, topic, status)
values
  ('e1e1e1e1-e1e1-41e1-81e1-e1e1e1e1e1e1', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'quote', 'in_progress'),
  ('e2e2e2e2-e2e2-42e2-82e2-e2e2e2e2e2e2', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'invoice', 'issued'),
  ('e3e3e3e3-e3e3-43e3-83e3-e3e3e3e3e3e3', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'other', 'pending'),
  ('e4e4e4e4-e4e4-44e4-84e4-e4e4e4e4e4e4', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'receipt', 'recorded');

insert into public.messages (id, request_id, author_role, kind, body)
values (
  'e5e5e5e5-e5e5-45e5-85e5-e5e5e5e5e5e5',
  'e1e1e1e1-e1e1-41e1-81e1-e1e1e1e1e1e1',
  'client',
  'message',
  '請保留這句'
);

insert into public.messages (id, request_id, author_role, kind, body, status_from, status_to)
values (
  'e6e6e6e6-e6e6-46e6-86e6-e6e6e6e6e6e6',
  'e1e1e1e1-e1e1-41e1-81e1-e1e1e1e1e1e1',
  'system',
  'status_change',
  '狀態由處理中改為已出單',
  'in_progress',
  'issued'
);

insert into public.messages (id, request_id, author_role, kind, body, status_from, status_to)
values (
  'e7e7e7e7-e7e7-47e7-87e7-e7e7e7e7e7e7',
  'e4e4e4e4-e4e4-44e4-84e4-e4e4e4e4e4e4',
  'system',
  'status_change',
  '狀態由已入機改為待處理',
  'recorded',
  'pending'
);

alter table public.requests
  add constraint requests_status_check check (status in ('pending', 'in_progress', 'issued', 'recorded'));

alter table public.messages
  add constraint messages_status_from_check check (
    status_from is null or status_from in ('pending', 'in_progress', 'issued', 'recorded')
  );

alter table public.messages
  add constraint messages_status_to_check check (
    status_to is null or status_to in ('pending', 'in_progress', 'issued', 'recorded')
  );
