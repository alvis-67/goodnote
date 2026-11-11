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

do $$
begin
  update public.requests
  set status = 'in_progress'
  where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  raise exception 'FAIL: removed status in_progress stored';
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
  update public.requests
  set status = 'issued'
  where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  raise exception 'FAIL: removed status issued stored';
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
  'removed statuses do not stick'
);

select pg_temp.expect(
  (select pg_get_constraintdef(oid) like '%pending%'
      and pg_get_constraintdef(oid) like '%recorded%'
      and pg_get_constraintdef(oid) like '%completed%'
      and pg_get_constraintdef(oid) not like '%in_progress%'
      and pg_get_constraintdef(oid) not like '%issued%'
   from pg_constraint
   where conname = 'requests_status_check'
     and conrelid = 'public.requests'::regclass),
  'request status is limited to pending, recorded, and completed'
);

do $$
declare
  statuses text[] := array['pending', 'recorded', 'completed'];
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
  'admin can set the status to any of the three values'
);
select pg_temp.expect(
  (select count(*) = 6
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

select pg_temp.expect(
  (select parent_request_id is null
   from public.requests
   where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
  'a request created without a parent has no parent'
);
select pg_temp.expect(
  (select parent_request_id is null
   from public.request_inbox
   where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
  'the admin inbox still loads a request with no parent'
);

insert into public.requests (id, client_id, topic, work_location, parent_request_id)
values (
  'c0c0c0c0-c0c0-40c0-80c0-c0c0c0c0c0c0',
  '11111111-1111-4111-8111-111111111111',
  'invoice',
  '九龍灣地盤',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
);

insert into public.requests (id, client_id, topic, work_location, parent_request_id)
values (
  'd0d0d0d0-d0d0-40d0-80d0-d0d0d0d0d0d0',
  '11111111-1111-4111-8111-111111111111',
  'receipt',
  '九龍灣地盤',
  'c0c0c0c0-c0c0-40c0-80c0-c0c0c0c0c0c0'
);

select pg_temp.expect(
  (select topic = 'quote'
      and stage = 'quote'
      and status = 'pending'
      and work_location = '九龍灣地盤'
      and parent_request_id is null
      and (
        select count(*)
        from public.messages
        where request_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
      ) = 0
   from public.requests
   where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
  'opening an invoice does not change the quotation'
);
select pg_temp.expect(
  (select topic = 'invoice'
      and stage = 'invoice'
      and parent_request_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
      and work_location = '九龍灣地盤'
   from public.requests
   where id = 'c0c0c0c0-c0c0-40c0-80c0-c0c0c0c0c0c0'),
  'an invoice can follow a quotation and keep the work location'
);
select pg_temp.expect(
  (select topic = 'receipt'
      and parent_request_id = 'c0c0c0c0-c0c0-40c0-80c0-c0c0c0c0c0c0'
   from public.requests
   where id = 'd0d0d0d0-d0d0-40d0-80d0-d0d0d0d0d0d0'),
  'a receipt can follow an invoice'
);
select pg_temp.expect(
  (select child_request_id = 'c0c0c0c0-c0c0-40c0-80c0-c0c0c0c0c0c0'
      and child_topic = 'invoice'
      and parent_request_id is null
      and count(*) = 1
   from public.request_inbox
   where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
   group by child_request_id, child_topic, parent_request_id),
  'the admin inbox shows the invoice opened from a quotation as one row'
);
select pg_temp.expect(
  (select parent_request_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
      and parent_topic = 'quote'
      and child_request_id = 'd0d0d0d0-d0d0-40d0-80d0-d0d0d0d0d0d0'
      and child_topic = 'receipt'
   from public.request_inbox
   where id = 'c0c0c0c0-c0c0-40c0-80c0-c0c0c0c0c0c0'),
  'the admin inbox shows both the source quotation and the later receipt'
);

do $$
begin
  insert into public.requests (client_id, topic, parent_request_id)
  values (
    '11111111-1111-4111-8111-111111111111',
    'receipt',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  );
  raise exception 'FAIL: quotation opened a receipt directly';
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
  insert into public.requests (client_id, topic, parent_request_id)
  values (
    '11111111-1111-4111-8111-111111111111',
    'invoice',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  );
  raise exception 'FAIL: quotation opened a second invoice';
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
  insert into public.requests (client_id, topic, parent_request_id)
  values (
    '22222222-2222-4222-8222-222222222222',
    'invoice',
    'e0e0e0e0-e0e0-40e0-80e0-e0e0e0e0e0e0'
  );
  raise exception 'FAIL: another client followed a missing quotation';
exception
  when foreign_key_violation then
    null;
  when others then
    if sqlerrm like 'FAIL:%' then
      raise;
    end if;
end $$;

insert into public.requests (id, client_id, topic)
values (
  'e0e0e0e0-e0e0-40e0-80e0-e0e0e0e0e0e0',
  '11111111-1111-4111-8111-111111111111',
  'quote'
);

do $$
begin
  insert into public.requests (client_id, topic, parent_request_id)
  values (
    '22222222-2222-4222-8222-222222222222',
    'invoice',
    'e0e0e0e0-e0e0-40e0-80e0-e0e0e0e0e0e0'
  );
  raise exception 'FAIL: invoice followed another client''s quotation';
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
  insert into public.requests (client_id, topic, parent_request_id)
  values (
    '11111111-1111-4111-8111-111111111111',
    'other',
    'e0e0e0e0-e0e0-40e0-80e0-e0e0e0e0e0e0'
  );
  raise exception 'FAIL: other followed a quotation';
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
  update public.requests
  set parent_request_id = 'e0e0e0e0-e0e0-40e0-80e0-e0e0e0e0e0e0'
  where id = 'c0c0c0c0-c0c0-40c0-80c0-c0c0c0c0c0c0';
  raise exception 'FAIL: invoice was linked to a different quotation';
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
  set topic = 'invoice'
  where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  raise exception 'FAIL: quotation topic changed';
exception
  when insufficient_privilege then
    null;
  when others then
    if sqlerrm like 'FAIL:%' then
      raise;
    end if;
end $$;

insert into public.requests (id, client_id, topic, work_location)
values (
  'f0f0f0f0-f0f0-40f0-80f0-f0f0f0f0f0f0',
  '11111111-1111-4111-8111-111111111111',
  'quote',
  '觀塘地盤'
);

insert into public.requests (id, client_id, topic, work_location, parent_request_id)
values (
  '0a0a0a0a-0a0a-40a0-80a0-0a0a0a0a0a0a',
  '11111111-1111-4111-8111-111111111111',
  'invoice',
  '觀塘地盤',
  'f0f0f0f0-f0f0-40f0-80f0-f0f0f0f0f0f0'
);

insert into public.messages (request_id, author_role, kind, body)
values (
  '0a0a0a0a-0a0a-40a0-80a0-0a0a0a0a0a0a',
  'client',
  'message',
  '客人已同意，可以開工'
);

delete from public.requests
where id = 'f0f0f0f0-f0f0-40f0-80f0-f0f0f0f0f0f0';

select pg_temp.expect(
  (select topic = 'invoice'
      and parent_request_id is null
      and work_location = '觀塘地盤'
      and (
        select body
        from public.messages
        where request_id = '0a0a0a0a-0a0a-40a0-80a0-0a0a0a0a0a0a'
          and kind = 'message'
      ) = '客人已同意，可以開工'
   from public.requests
   where id = '0a0a0a0a-0a0a-40a0-80a0-0a0a0a0a0a0a'),
  'deleting a quotation keeps the invoice and its message'
);

insert into public.requests (id, client_id, topic, work_location)
values (
  '10101010-1010-4010-8010-101010101010',
  '11111111-1111-4111-8111-111111111111',
  'quote',
  '九龍灣地盤'
);

insert into public.messages (id, request_id, author_role, kind, body)
values (
  '12121212-1212-4121-8121-121212121212',
  '10101010-1010-4010-8010-101010101010',
  'client',
  'message',
  '請報價泥水工程'
);

insert into public.attachments (
  message_id, request_id, client_id, storage_path, file_name, mime_type, size_bytes
) values (
  '12121212-1212-4121-8121-121212121212',
  '10101010-1010-4010-8010-101010101010',
  '11111111-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111/10101010-1010-4010-8010-101010101010/12121212-1212-4121-8121-121212121212/quote.pdf',
  '報價.pdf',
  'application/pdf',
  1200
);

update public.requests
set status = 'completed',
    admin_unread = false
where id = '10101010-1010-4010-8010-101010101010';

select pg_temp.expect(
  (select private.request_stage_title('quote', 'quote') = '出報價單'
      and private.request_stage_title('quote', 'invoice') = '出發票'
      and private.request_stage_title('invoice', 'invoice') = '出發票'
      and private.request_stage_title('quote', 'receipt') = '已收錢，請出收據'
      and private.request_stage_title('invoice', 'receipt') = '已收錢，請出收據'
      and private.request_stage_title('receipt', 'receipt') = '已收錢，請出收據'
      and private.request_stage_title('management', 'management') = '搵管理處'
      and private.request_stage_title('insurance', 'insurance') = '買保險'
      and private.request_stage_title('other', 'other') = '其他'
      and private.request_stage_title('quote', 'other') is null
      and private.request_stage_title('management', 'insurance') is null
      and private.request_stage_title('receipt', 'invoice') is null),
  'request_stage_title keeps the invoice and the paid receipt apart'
);

do $$
declare
  requests_before int;
begin
  select count(*) into requests_before from public.requests;
  update public.requests
  set stage = 'invoice'
  where id = '10101010-1010-4010-8010-101010101010'
    and stage = 'quote';
  if (select count(*) from public.requests) <> requests_before then
    raise exception 'FAIL: advancing a quotation created another request';
  end if;
end $$;

select pg_temp.expect(
  (select id = '10101010-1010-4010-8010-101010101010'
      and topic = 'quote'
      and stage = 'invoice'
      and status = 'pending'
      and work_location = '九龍灣地盤'
      and admin_unread
      and parent_request_id is null
      and (
        select count(*)
        from public.requests child
        where child.parent_request_id = '10101010-1010-4010-8010-101010101010'
      ) = 0
      and (
        select body
        from public.messages
        where id = '12121212-1212-4121-8121-121212121212'
      ) = '請報價泥水工程'
      and (
        select count(*)
        from public.attachments
        where request_id = '10101010-1010-4010-8010-101010101010'
          and file_name = '報價.pdf'
      ) = 1
   from public.requests
   where id = '10101010-1010-4010-8010-101010101010'),
  'advancing a quotation keeps the same request, files, and work location'
);

select pg_temp.expect(
  (select body = '階段由出報價單改為出發票'
      and stage_from = 'quote'
      and stage_to = 'invoice'
   from public.messages
   where request_id = '10101010-1010-4010-8010-101010101010'
     and kind = 'stage_change'),
  'the quotation stage change is written on that request timeline'
);

update public.messages
set body = '舊時間線原文'
where request_id = '10101010-1010-4010-8010-101010101010'
  and kind = 'stage_change'
  and stage_from = 'quote'
  and stage_to = 'invoice';

select pg_temp.expect(
  (select count(*) = 1
   from public.messages
   where request_id = '10101010-1010-4010-8010-101010101010'
     and kind = 'status_change'
     and status_from = 'completed'
     and status_to = 'pending'),
  'advancing a quotation returns its status to pending'
);

select pg_temp.expect(
  (select event_type = 'stage_changed' and recipient_role = 'admin'
   from public.notification_events
   where request_id = '10101010-1010-4010-8010-101010101010'
     and event_type = 'stage_changed'),
  'a stage change tells the admin there is new work'
);

select pg_temp.expect(
  (select topic = 'quote' and stage = 'invoice' and status = 'pending'
   from public.request_inbox
   where id = '10101010-1010-4010-8010-101010101010'),
  'the admin desk shows the same quotation row at the invoice stage'
);

do $$
declare
  stage_message uuid;
begin
  select id into stage_message
  from public.messages
  where request_id = '10101010-1010-4010-8010-101010101010'
    and kind = 'stage_change'
  limit 1;

  insert into public.attachments (
    message_id, request_id, client_id, storage_path, file_name, mime_type, size_bytes
  ) values (
    stage_message,
    '10101010-1010-4010-8010-101010101010',
    '11111111-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111111/10101010-1010-4010-8010-101010101010/stage.pdf',
    '階段.pdf',
    'application/pdf',
    1200
  );
  raise exception 'FAIL: file attached to a stage event';
exception
  when insufficient_privilege then
    null;
  when others then
    if sqlerrm like 'FAIL:%' then
      raise;
    end if;
end $$;

update public.requests
set status = 'recorded'
where id = '10101010-1010-4010-8010-101010101010';

update public.requests
set stage = 'receipt',
    status = 'completed'
where id = '10101010-1010-4010-8010-101010101010'
  and stage = 'invoice';

select pg_temp.expect(
  (select topic = 'quote'
      and stage = 'receipt'
      and status = 'pending'
      and (
        select body
        from public.messages
        where request_id = '10101010-1010-4010-8010-101010101010'
          and kind = 'stage_change'
          and stage_from = 'invoice'
          and stage_to = 'receipt'
      ) = '階段由出發票改為已收錢，請出收據'
   from public.requests
   where id = '10101010-1010-4010-8010-101010101010'),
  'a quotation can then ask for a receipt without skipping or keeping the old status'
);

select pg_temp.expect(
  (select body = '舊時間線原文'
   from public.messages
   where request_id = '10101010-1010-4010-8010-101010101010'
     and kind = 'stage_change'
     and stage_from = 'quote'
     and stage_to = 'invoice'),
  'an earlier stage_change body stays as it was stored'
);

do $$
begin
  update public.requests
  set stage = 'invoice'
  where id = '10101010-1010-4010-8010-101010101010';
  raise exception 'FAIL: receipt stage moved backward';
exception
  when check_violation then
    null;
  when others then
    if sqlerrm like 'FAIL:%' then
      raise;
    end if;
end $$;

update public.requests
set status = 'recorded'
where id = '10101010-1010-4010-8010-101010101010';

update public.requests
set status = 'completed'
where id = '10101010-1010-4010-8010-101010101010';

update public.requests
set status = 'pending'
where id = '10101010-1010-4010-8010-101010101010';

select pg_temp.expect(
  (select stage = 'receipt' and status = 'pending'
   from public.requests
   where id = '10101010-1010-4010-8010-101010101010'),
  'the three statuses can still move in any direction at the receipt stage'
);

insert into public.requests (id, client_id, topic, work_location)
values (
  '50505050-5050-4050-8050-505050505050',
  '11111111-1111-4111-8111-111111111111',
  'quote',
  '觀塘地盤'
);

do $$
begin
  update public.requests
  set stage = 'receipt'
  where id = '50505050-5050-4050-8050-505050505050';
  raise exception 'FAIL: quotation skipped the invoice stage';
exception
  when check_violation then
    null;
  when others then
    if sqlerrm like 'FAIL:%' then
      raise;
    end if;
end $$;

select pg_temp.expect(
  (select stage = 'quote'
   from public.requests
   where id = '50505050-5050-4050-8050-505050505050'),
  'a skipped stage does not stick'
);

insert into public.requests (id, client_id, topic)
values (
  '20202020-2020-4020-8020-202020202020',
  '11111111-1111-4111-8111-111111111111',
  'invoice'
);

do $$
declare
  changes_before int;
  changes_after int;
begin
  select count(*) into changes_before
  from public.messages
  where request_id = '20202020-2020-4020-8020-202020202020'
    and kind = 'status_change';

  update public.requests
  set stage = 'receipt'
  where id = '20202020-2020-4020-8020-202020202020'
    and stage = 'invoice';

  select count(*) into changes_after
  from public.messages
  where request_id = '20202020-2020-4020-8020-202020202020'
    and kind = 'status_change';

  if changes_after <> changes_before then
    raise exception 'FAIL: advancing an already pending invoice wrote a status row';
  end if;
end $$;

select pg_temp.expect(
  (select topic = 'invoice'
      and stage = 'receipt'
      and status = 'pending'
      and (
        select body
        from public.messages
        where request_id = '20202020-2020-4020-8020-202020202020'
          and kind = 'stage_change'
      ) = '階段由出發票改為已收錢，請出收據'
   from public.requests
   where id = '20202020-2020-4020-8020-202020202020'),
  'an invoice request advances to the receipt stage on the same row'
);

insert into public.requests (id, client_id, topic)
values (
  '30303030-3030-4030-8030-303030303030',
  '11111111-1111-4111-8111-111111111111',
  'receipt'
);

insert into public.requests (id, client_id, topic)
values (
  '40404040-4040-4040-8040-404040404040',
  '11111111-1111-4111-8111-111111111111',
  'other'
);

do $$
begin
  update public.requests
  set stage = 'invoice'
  where id = '30303030-3030-4030-8030-303030303030';
  raise exception 'FAIL: a receipt request advanced';
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
  update public.requests
  set stage = 'invoice'
  where id = '40404040-4040-4040-8040-404040404040';
  raise exception 'FAIL: an other request advanced';
exception
  when check_violation then
    null;
  when others then
    if sqlerrm like 'FAIL:%' then
      raise;
    end if;
end $$;

select pg_temp.expect(
  (select stage = 'receipt'
   from public.requests
   where id = '30303030-3030-4030-8030-303030303030'),
  'a receipt request stays a receipt'
);
select pg_temp.expect(
  (select stage = 'other'
   from public.requests
   where id = '40404040-4040-4040-8040-404040404040'),
  'an other request stays other'
);

insert into public.requests (id, client_id, topic)
values (
  '51515151-5151-4151-8151-515151515151',
  '11111111-1111-4111-8111-111111111111',
  'management'
);

insert into public.requests (id, client_id, topic)
values (
  '61616161-6161-4161-8161-616161616161',
  '11111111-1111-4111-8111-111111111111',
  'insurance'
);

select pg_temp.expect(
  (select topic = 'management'
      and stage = 'management'
      and private.request_stage_title(topic, stage) = '搵管理處'
   from public.requests
   where id = '51515151-5151-4151-8151-515151515151'),
  'a management request starts as 搵管理處'
);

select pg_temp.expect(
  (select topic = 'insurance'
      and stage = 'insurance'
      and private.request_stage_title(topic, stage) = '買保險'
   from public.requests
   where id = '61616161-6161-4161-8161-616161616161'),
  'an insurance request starts as 買保險'
);

do $$
begin
  update public.requests
  set stage = 'invoice'
  where id = '51515151-5151-4151-8151-515151515151';
  raise exception 'FAIL: a management request advanced';
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
  update public.requests
  set stage = 'receipt'
  where id = '61616161-6161-4161-8161-616161616161';
  raise exception 'FAIL: an insurance request advanced';
exception
  when check_violation then
    null;
  when others then
    if sqlerrm like 'FAIL:%' then
      raise;
    end if;
end $$;

select pg_temp.expect(
  (select stage = 'management'
   from public.requests
   where id = '51515151-5151-4151-8151-515151515151')
  and (
    select stage = 'insurance'
    from public.requests
    where id = '61616161-6161-4161-8161-616161616161'
  ),
  'management and insurance requests stay on their own stage'
);

do $$
begin
  insert into public.requests (client_id, topic, stage)
  values (
    '11111111-1111-4111-8111-111111111111',
    'management',
    'insurance'
  );
  raise exception 'FAIL: a management request started at another stage';
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
  insert into public.requests (client_id, topic)
  values ('11111111-1111-4111-8111-111111111111', 'search');
  raise exception 'FAIL: unknown topic stored';
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
  insert into public.requests (client_id, topic, stage)
  values (
    '11111111-1111-4111-8111-111111111111',
    'quote',
    'receipt'
  );
  raise exception 'FAIL: a new quotation started at the receipt stage';
exception
  when check_violation then
    null;
  when others then
    if sqlerrm like 'FAIL:%' then
      raise;
    end if;
end $$;

do $$
declare
  children_before int;
begin
  select count(*) into children_before
  from public.requests
  where parent_request_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

  update public.requests
  set stage = 'invoice'
  where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    and stage = 'quote';

  if (
    select count(*)
    from public.requests
    where parent_request_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  ) <> children_before then
    raise exception 'FAIL: moving an old quotation changed its linked child';
  end if;
end $$;

select pg_temp.expect(
  (select stage = 'invoice'
      and topic = 'quote'
   from public.requests
   where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc')
  and (
    select topic = 'invoice'
        and stage = 'invoice'
        and parent_request_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    from public.requests
    where id = 'c0c0c0c0-c0c0-40c0-80c0-c0c0c0c0c0c0'
  ),
  'an old linked invoice stays a separate request when its quotation moves stage'
);

insert into public.requests (id, client_id, topic, work_location)
values (
  'abababab-abab-4bab-8bab-abababababab',
  '22222222-2222-4222-8222-222222222222',
  'other',
  '沙田地盤'
);

insert into public.messages (id, request_id, author_role, kind, body)
values (
  'b1b1b1b1-b1b1-41b1-81b1-b1b1b1b1b1b1',
  'd0d0d0d0-d0d0-40d0-80d0-d0d0d0d0d0d0',
  'client',
  'message',
  '請連同報價和發票一起刪除'
);

insert into public.attachments (
  message_id, request_id, client_id, storage_path, file_name, mime_type, size_bytes
) values (
  'b1b1b1b1-b1b1-41b1-81b1-b1b1b1b1b1b1',
  'd0d0d0d0-d0d0-40d0-80d0-d0d0d0d0d0d0',
  '11111111-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111/d0d0d0d0-d0d0-40d0-80d0-d0d0d0d0d0d0/b1b1b1b1-b1b1-41b1-81b1-b1b1b1b1b1b1/c1c1c1c1-c1c1-41c1-81c1-c1c1c1c1c1c1.pdf',
  '地盤相片.pdf',
  'application/pdf',
  2048
);

update public.clients
set login_name = 'kap-co',
    password_hash = 'scrypt$16384$8$1$aaaaaaaaaaaaaaaaaaaaaa$bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    password_changed_at = now()
where id = '11111111-1111-4111-8111-111111111111';

insert into public.sessions (token_hash, account_type, client_id, credential_at)
select
  'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
  'client',
  id,
  password_changed_at
from public.clients
where id = '11111111-1111-4111-8111-111111111111';

insert into public.sessions (token_hash, account_type, admin_email, credential_at)
values (
  'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
  'admin',
  'alvis@example.com',
  now()
);

select pg_temp.expect(
  (select count(*) = 1
   from public.sessions
   where client_id = '11111111-1111-4111-8111-111111111111'
     and revoked_at is null),
  'the client has a live session before delete'
);

insert into public.reply_presets (id, body)
values ('50505050-5050-4050-8050-505050505050', '請看附件');

do $$
begin
  insert into public.reply_presets (body) values ('請看附件');
  raise exception 'FAIL: duplicate reply preset stored';
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
  insert into public.reply_presets (body) values ('   ');
  raise exception 'FAIL: blank reply preset stored';
exception
  when check_violation then
    null;
  when others then
    if sqlerrm like 'FAIL:%' then
      raise;
    end if;
end $$;

delete from public.clients
where id = '11111111-1111-4111-8111-111111111111';

select pg_temp.expect(
  (select count(*) = 0 from public.clients where id = '11111111-1111-4111-8111-111111111111'),
  'deleting a client removes the account'
);
select pg_temp.expect(
  (select count(*) = 0 from public.clients where login_name = 'kap-co'),
  'a deleted client can no longer be found by login name'
);
select pg_temp.expect(
  (select count(*) = 0 from public.sessions where client_id = '11111111-1111-4111-8111-111111111111'),
  'deleting a client removes that client''s sessions'
);
select pg_temp.expect(
  (select count(*) = 0 from public.requests where client_id = '11111111-1111-4111-8111-111111111111'),
  'deleting a client removes that client''s requests, including a document chain'
);
select pg_temp.expect(
  (select count(*) = 0
   from public.messages
   where request_id in (
     'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
     'c0c0c0c0-c0c0-40c0-80c0-c0c0c0c0c0c0',
     'd0d0d0d0-d0d0-40d0-80d0-d0d0d0d0d0d0',
     '0a0a0a0a-0a0a-40a0-80a0-0a0a0a0a0a0a'
   )),
  'deleting a client removes that client''s messages'
);
select pg_temp.expect(
  (select count(*) = 0 from public.attachments where client_id = '11111111-1111-4111-8111-111111111111'),
  'deleting a client removes that client''s attachment rows'
);
select pg_temp.expect(
  (select count(*) = 0 from public.notification_events where client_id = '11111111-1111-4111-8111-111111111111'),
  'deleting a client removes that client''s notifications'
);
select pg_temp.expect(
  (select count(*) = 1
   from public.requests
   where id = 'abababab-abab-4bab-8bab-abababababab'
     and client_id = '22222222-2222-4222-8222-222222222222'),
  'deleting a client leaves another client''s request in place'
);
select pg_temp.expect(
  (select count(*) = 1 from public.clients where login_name = 'chan-co'),
  'deleting a client leaves other client accounts in place'
);
select pg_temp.expect(
  (select count(*) = 1
   from public.sessions
   where token_hash = 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd'
     and account_type = 'admin'),
  'deleting a client does not remove an admin session'
);
select pg_temp.expect(
  (select count(*) = 1
   from public.reply_presets
   where id = '50505050-5050-4050-8050-505050505050'
     and body = '請看附件'),
  'deleting a client leaves shared reply presets in place'
);

delete from public.clients
where id = '99999999-9999-4999-8999-999999999999';

select pg_temp.expect(
  (select count(*) = 1 from public.clients where id = '22222222-2222-4222-8222-222222222222'),
  'deleting a missing client leaves the remaining clients in place'
);
select pg_temp.expect(
  (select count(*) = 1 from public.requests where id = 'abababab-abab-4bab-8bab-abababababab'),
  'deleting a missing client does not remove requests'
);

rollback;
