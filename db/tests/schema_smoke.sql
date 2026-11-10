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

do $$
begin
  update public.requests
  set status = 'archived'
  where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  raise exception 'FAIL: unknown status stored';
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
  'unknown status does not stick'
);

do $$
declare
  statuses text[] := array['pending', 'in_progress', 'issued', 'recorded'];
  origin text;
  dest text;
  changes_before int;
  changes_after int;
begin
  select count(*) into changes_before
  from public.messages
  where request_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    and kind = 'status_change';

  update public.requests
  set status = 'pending'
  where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  select count(*) into changes_after
  from public.messages
  where request_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    and kind = 'status_change';

  if changes_after <> changes_before then
    raise exception 'FAIL: setting the current status wrote a timeline row';
  end if;

  foreach origin in array statuses loop
    foreach dest in array statuses loop
      if origin = dest then
        continue;
      end if;
      update public.requests
      set status = origin
      where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
      update public.requests
      set status = dest
      where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    end loop;
  end loop;

  update public.requests
  set status = 'pending'
  where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  update public.requests
  set status = 'recorded'
  where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
end $$;

select pg_temp.expect(
  (select status = 'recorded' from public.requests where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  'admin can set the status to any of the four values'
);
select pg_temp.expect(
  (select count(*) = 12
   from (
     select distinct status_from, status_to
     from public.messages
     where request_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
       and kind = 'status_change'
   ) pairs),
  'every status can be reached from every other status'
);
select pg_temp.expect(
  (select client_unread from public.requests where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  'status change is unread for the client'
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
    '11111111-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.pdf',
    '報價.pdf',
    'application/pdf',
    1200
  );
end $$;

select pg_temp.expect(
  (select count(*) = 1 from public.attachments where request_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  'a real attachment is stored before delete'
);
select pg_temp.expect(
  (select count(*) > 0 from public.messages where request_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  'the request has messages before delete'
);
select pg_temp.expect(
  (select count(*) > 0 from public.notification_events where request_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  'the request has notifications before delete'
);

delete from public.requests where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

select pg_temp.expect(
  (select count(*) = 0 from public.requests where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  'admin delete removes the request'
);
select pg_temp.expect(
  (select count(*) = 0 from public.messages where request_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  'admin delete removes messages'
);
select pg_temp.expect(
  (select count(*) = 0 from public.attachments where request_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  'admin delete removes attachments'
);
select pg_temp.expect(
  (select count(*) = 0 from public.notification_events where request_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  'admin delete removes notifications'
);
select pg_temp.expect(
  (select count(*) = 2 from public.clients),
  'deleting a request does not remove the client'
);

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

insert into public.requests (id, client_id, topic, work_location)
values (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  '11111111-1111-4111-8111-111111111111',
  'quote',
  '九龍灣地盤'
);

insert into public.requests (id, client_id, topic)
values (
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  '11111111-1111-4111-8111-111111111111',
  'invoice'
);

insert into public.requests (id, client_id, topic, work_location)
values (
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  '11111111-1111-4111-8111-111111111111',
  'receipt',
  repeat('地', 120)
);

select pg_temp.expect(
  (select work_location = '九龍灣地盤'
   from public.requests
   where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
  'a request stores the work location'
);
select pg_temp.expect(
  (select work_location is null
   from public.requests
   where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
  'a request with no work location still loads'
);
select pg_temp.expect(
  (select char_length(work_location) = 120
   from public.requests
   where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),
  'a work location may be 120 characters'
);
select pg_temp.expect(
  (select work_location = '九龍灣地盤'
   from public.request_inbox
   where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
  'the admin inbox can read the work location'
);
select pg_temp.expect(
  (select work_location is null
   from public.request_inbox
   where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
  'the admin inbox still loads a request with no work location'
);

do $$
begin
  insert into public.requests (client_id, topic, work_location)
  values ('11111111-1111-4111-8111-111111111111', 'other', '   ');
  raise exception 'FAIL: blank work location stored';
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
  insert into public.requests (client_id, topic, work_location)
  values ('11111111-1111-4111-8111-111111111111', 'other', repeat('地', 121));
  raise exception 'FAIL: overlong work location stored';
exception
  when check_violation then
    null;
  when others then
    if sqlerrm like 'FAIL:%' then
      raise;
    end if;
end $$;

rollback;
