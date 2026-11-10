-- Schema smoke test for a throwaway database. The whole script rolls back.
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

do $$
begin
  insert into public.admin_allowlist (email) values ('Alvis@Example.com');
  raise exception 'FAIL: mixed-case email was stored';
exception
  when check_violation then
    null;
  when others then
    if sqlerrm like 'FAIL:%' then
      raise;
    end if;
end $$;

insert into public.clients (id, company_name, contact_name, notes)
values
  ('11111111-1111-4111-8111-111111111111', '甲工程公司', '陳生', '內部備註'),
  ('22222222-2222-4222-8222-222222222222', '乙工程公司', '李生', '另一備註');

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

select pg_temp.expect(
  (select status = 'pending' and admin_unread and client_unread = false
   from public.requests
   where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  'client message keeps the request pending and unread for the admin'
);

select pg_temp.expect(
  (select event_type = 'request_created' and channel = 'in_app' and delivered_at is not null
   from public.notification_events
   where message_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  'first client message records an in-app notification'
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
  (select status = 'pending' from public.requests where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  'skipped status does not stick'
);

do $$
begin
  update public.requests
  set client_id = '22222222-2222-4222-8222-222222222222'
  where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  raise exception 'FAIL: request changed company';
exception
  when insufficient_privilege then
    null;
  when others then
    if sqlerrm like 'FAIL:%' then
      raise;
    end if;
end $$;

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

insert into public.messages (request_id, author_role, kind, body, created_at)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'admin',
  'message',
  '報價在附件',
  now() + interval '1 second'
);

select pg_temp.expect(
  (select count(*) = 1
   from public.notification_events
   where event_type = 'admin_message' and recipient_role = 'client' and channel = 'in_app'),
  'admin reply records an in-app notification for the client'
);

select pg_temp.expect(
  (select company_name = '甲工程公司' and latest_body = '報價在附件'
   from public.request_inbox
   where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  'inbox view shows the company and the latest message'
);

do $$
declare
  message_id uuid;
begin
  select id into message_id
  from public.messages
  where request_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    and kind = 'status_change'
  limit 1;

  insert into public.attachments (
    message_id, request_id, client_id, storage_path, file_name, mime_type, size_bytes
  ) values (
    message_id,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '11111111-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/cccccccc-cccc-4ccc-8ccc-cccccccccccc.pdf',
    '報價.pdf',
    'application/pdf',
    1200
  );
  raise exception 'FAIL: file attached to a status event';
exception
  when insufficient_privilege then
    null;
  when others then
    if sqlerrm like 'FAIL:%' then
      raise;
    end if;
end $$;

do $$
declare
  message_id uuid;
begin
  select id into message_id
  from public.messages
  where request_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    and author_role = 'admin'
    and kind = 'message'
  limit 1;

  insert into public.attachments (
    message_id, request_id, client_id, storage_path, file_name, mime_type, size_bytes
  ) values (
    message_id,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '22222222-2222-4222-8222-222222222222',
    '22222222-2222-4222-8222-222222222222/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/dddddddd-dddd-4ddd-8ddd-dddddddddddd.pdf',
    '錯公司.pdf',
    'application/pdf',
    1200
  );
  raise exception 'FAIL: attachment used another company';
exception
  when insufficient_privilege then
    null;
  when others then
    if sqlerrm like 'FAIL:%' then
      raise;
    end if;
end $$;

select pg_temp.expect(
  (select count(*) = 0
   from information_schema.columns
   where table_schema = 'public'
     and table_name = 'clients'
     and column_name = 'access_token'),
  'client link tokens are no longer stored'
);

select pg_temp.expect(
  (select count(*) = 0
   from information_schema.columns
   where table_schema = 'public'
     and table_name = 'sessions'
     and column_name in ('expires_at', 'last_seen_at', 'idle_expires_at')),
  'sessions have no age or idle expiry columns'
);

insert into public.clients (company_name, login_name, email, password_hash, password_changed_at)
values (
  '丙工程公司',
  'chan-co',
  null,
  'scrypt$16384$8$1$aaaaaaaaaaaaaaaaaaaaaa$bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  now()
);

select pg_temp.expect(
  (select email is null and login_name = 'chan-co' from public.clients where login_name = 'chan-co'),
  'a client login name does not require an email'
);

do $$
begin
  insert into public.clients (company_name, login_name, password_hash, password_changed_at)
  values (
    '重複工程',
    'chan-co',
    'scrypt$16384$8$1$cccccccccccccccccccccc$ddddddddddddddddddddddddddddddddddddddddddd',
    now()
  );
  raise exception 'FAIL: duplicate login name';
exception
  when unique_violation then
    null;
  when others then
    if sqlerrm like 'FAIL:%' then
      raise;
    end if;
end $$;

do $$
begin
  insert into public.clients (company_name, login_name, password_hash, password_changed_at)
  values ('大寫工程', 'Chan-Co', 'scrypt$16384$8$1$eeeeeeeeeeeeeeeeeeeeee$fffffffffffffffffffffffffffffffffffffffffff', now());
  raise exception 'FAIL: mixed-case login name stored';
exception
  when check_violation then
    null;
  when others then
    if sqlerrm like 'FAIL:%' then
      raise;
    end if;
end $$;

do $$
begin
  update public.admin_allowlist
  set password_hash = 'plaintext-password'
  where email = 'alvis@example.com';
  raise exception 'FAIL: plaintext admin password stored';
exception
  when check_violation then
    null;
  when others then
    if sqlerrm like 'FAIL:%' then
      raise;
    end if;
end $$;

do $$
begin
  insert into public.sessions (token_hash, account_type, admin_email, client_id, credential_at)
  values (
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'admin',
    'alvis@example.com',
    '11111111-1111-4111-8111-111111111111',
    now()
  );
  raise exception 'FAIL: session had two subjects';
exception
  when check_violation then
    null;
  when others then
    if sqlerrm like 'FAIL:%' then
      raise;
    end if;
end $$;

insert into public.sessions (token_hash, account_type, client_id, credential_at)
select
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  'client',
  id,
  password_changed_at
from public.clients
where login_name = 'chan-co';

update public.sessions
set revoked_at = now()
where token_hash = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

select pg_temp.expect(
  (select revoked_at is not null
   from public.sessions
   where token_hash = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'),
  'a client session can be revoked'
);

rollback;
