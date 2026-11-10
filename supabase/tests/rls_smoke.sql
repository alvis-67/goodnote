-- RLS smoke test for a throwaway database. The whole script rolls back.
begin;

create function pg_temp.expect(cond boolean, message text)
returns void
language plpgsql
as $$
begin
  if coalesce(cond, false) is not true then
    raise exception 'FAIL: %', message;
  end if;
end;
$$;

insert into public.admin_allowlist (email) values ('alvis@example.com');

insert into public.clients (id, company_name, contact_name, notes, access_token)
values
  ('11111111-1111-4111-8111-111111111111', '甲工程公司', '陳生', '內部備註', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
  ('22222222-2222-4222-8222-222222222222', '乙工程公司', '李生', '另一備註', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');

select set_config(
  'request.headers',
  '{"x-client-token":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}',
  true
);
select set_config('request.jwt.claims', '{}', true);
set local role anon;

select pg_temp.expect(
  (select count(*) = 1 from public.clients),
  'client token should see only its own company'
);
select pg_temp.expect(
  (select company_name = '甲工程公司' from public.clients),
  'client token should read its company name'
);

do $$
begin
  perform notes from public.clients;
  raise exception 'FAIL: client can read internal notes';
exception
  when insufficient_privilege then
    null;
  when others then
    if sqlerrm like 'FAIL:%' then
      raise;
    end if;
end $$;

insert into public.requests (id, client_id, topic)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'quote');

insert into public.messages (id, request_id, author_role, kind, body)
values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'client',
  'message',
  '請出報價'
);

do $$
begin
  insert into public.requests (client_id, topic)
  values ('22222222-2222-4222-8222-222222222222', 'invoice');
  raise exception 'FAIL: client inserted another company request';
exception
  when insufficient_privilege then
    null;
  when others then
    if sqlerrm like 'FAIL:%' then
      raise;
    end if;
end $$;

do $$
begin
  insert into public.messages (request_id, author_role, kind, body)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'admin', 'message', '不該成功');
  raise exception 'FAIL: client inserted an admin message';
exception
  when insufficient_privilege then
    null;
  when others then
    if sqlerrm like 'FAIL:%' then
      raise;
    end if;
end $$;

do $$
begin
  insert into public.messages (request_id, author_role, kind, status_from, status_to)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'system', 'status_change', 'pending', 'in_progress');
  raise exception 'FAIL: client inserted a status event';
exception
  when insufficient_privilege then
    null;
  when others then
    if sqlerrm like 'FAIL:%' then
      raise;
    end if;
end $$;

do $$
begin
  update public.requests
  set status = 'in_progress'
  where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
exception
  when insufficient_privilege then
    null;
end $$;

update public.requests
set client_unread = false,
    client_last_read_at = now()
where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

select pg_temp.expect(
  (select status = 'pending' and admin_unread and client_unread = false
   from public.requests
   where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  'client message flags its request unread for admin and cannot change status'
);

select pg_temp.expect(
  (select count(*) = 1 from public.request_inbox),
  'inbox view should stay inside the client token'
);

insert into storage.objects (bucket_id, name)
values ('request-files', '11111111-1111-4111-8111-111111111111/note.txt');

do $$
begin
  insert into storage.objects (bucket_id, name)
  values ('request-files', '22222222-2222-4222-8222-222222222222/secret.txt');
  raise exception 'FAIL: client wrote another company file';
exception
  when insufficient_privilege then
    null;
  when others then
    if sqlerrm like 'FAIL:%' then
      raise;
    end if;
end $$;

reset role;
select set_config('request.headers', '{"x-client-token":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}', true);
set local role anon;

select pg_temp.expect((select count(*) = 0 from public.requests), 'other client cannot read the request');
select pg_temp.expect((select count(*) = 0 from public.messages), 'other client cannot read the thread');
select pg_temp.expect((select count(*) = 0 from public.request_inbox), 'other client cannot read the inbox row');
select pg_temp.expect(
  (select count(*) = 0 from storage.objects where name like '11111111%'),
  'other client cannot read the file row'
);

reset role;
select set_config('request.headers', '{}', true);
set local role anon;
select pg_temp.expect((select count(*) = 0 from public.clients), 'missing token sees no clients');

reset role;
select set_config(
  'request.jwt.claims',
  '{"email":"other@example.com","role":"authenticated","sub":"33333333-3333-4333-8333-333333333333"}',
  true
);
set local role authenticated;
select pg_temp.expect((select count(*) = 0 from public.requests), 'authenticated non-admin sees no requests');
select pg_temp.expect((select count(*) = 0 from public.admin_allowlist), 'authenticated non-admin cannot read the allowlist');

reset role;
select set_config(
  'request.jwt.claims',
  '{"email":"alvis@example.com","role":"authenticated","sub":"44444444-4444-4444-8444-444444444444"}',
  true
);
set local role authenticated;

select pg_temp.expect((select count(*) = 2 from public.clients), 'admin sees every client');
select pg_temp.expect((select notes = '內部備註' from public.clients where id = '11111111-1111-4111-8111-111111111111'), 'admin can read notes');

update public.requests
set status = 'in_progress'
where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

select pg_temp.expect(
  (select status = 'in_progress' from public.requests where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  'admin can move pending to in progress'
);
select pg_temp.expect(
  (select count(*) = 1
   from public.messages
   where request_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
     and kind = 'status_change'
     and status_from = 'pending'
     and status_to = 'in_progress'),
  'status change is written onto the timeline'
);
select pg_temp.expect(
  (select client_unread from public.requests where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  'status change is unread for the client'
);

do $$
begin
  update public.requests
  set status = 'recorded'
  where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  raise exception 'FAIL: status skipped ahead';
exception
  when check_violation then
    null;
  when others then
    if sqlerrm like 'FAIL:%' then
      raise;
    end if;
end $$;

select pg_temp.expect(
  (select status = 'in_progress' from public.requests where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  'skipped status does not stick'
);

update public.requests set status = 'issued' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
update public.requests set status = 'recorded' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

select pg_temp.expect(
  (select status = 'recorded' from public.requests where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  'admin can finish the status flow'
);
select pg_temp.expect(
  (select count(*) = 3
   from public.messages
   where request_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
     and kind = 'status_change'),
  'each status step is on the timeline'
);

select pg_temp.expect(
  (select event_type = 'request_created' and channel = 'in_app' and delivered_at is not null
   from public.notification_events
   where message_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  'first client message records an in-app notification'
);

insert into public.messages (request_id, author_role, kind, body)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'admin', 'message', '報價在附件');

select pg_temp.expect(
  (select count(*) = 1
   from public.notification_events
   where event_type = 'admin_message' and recipient_role = 'client' and channel = 'in_app'),
  'admin reply records an in-app notification for the client'
);

reset role;

do $$
begin
  insert into auth.users (email) values ('stranger@example.com');
  raise exception 'FAIL: stranger became a user';
exception
  when insufficient_privilege then
    null;
  when others then
    if sqlerrm like 'FAIL:%' then
      raise;
    end if;
end $$;

insert into auth.users (email) values ('Alvis@Example.com');
select pg_temp.expect(
  (select email = 'alvis@example.com' from auth.users where lower(email) = 'alvis@example.com'),
  'allowlisted signup is stored in lowercase'
);

rollback;
