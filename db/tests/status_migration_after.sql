-- Checks the rows seeded by status_migration_before.sql, then removes them
-- so the schema smoke test starts from an empty public schema.

do $$
begin
  if (select status from public.requests where id = 'e1e1e1e1-e1e1-41e1-81e1-e1e1e1e1e1e1') <> 'pending' then
    raise exception 'FAIL: in_progress did not become pending';
  end if;
  if (select stage from public.requests where id = 'e1e1e1e1-e1e1-41e1-81e1-e1e1e1e1e1e1') <> 'quote' then
    raise exception 'FAIL: migrating status changed the stage';
  end if;
  if (select status from public.requests where id = 'e2e2e2e2-e2e2-42e2-82e2-e2e2e2e2e2e2') <> 'completed' then
    raise exception 'FAIL: issued did not become completed';
  end if;
  if (select status from public.requests where id = 'e3e3e3e3-e3e3-43e3-83e3-e3e3e3e3e3e3') <> 'pending' then
    raise exception 'FAIL: pending was rewritten';
  end if;
  if (select status from public.requests where id = 'e4e4e4e4-e4e4-44e4-84e4-e4e4e4e4e4e4') <> 'recorded' then
    raise exception 'FAIL: recorded was rewritten';
  end if;

  if (select body from public.messages where id = 'e5e5e5e5-e5e5-45e5-85e5-e5e5e5e5e5e5') <> '請保留這句' then
    raise exception 'FAIL: a message body was rewritten';
  end if;
  if (select body from public.messages where id = 'e6e6e6e6-e6e6-46e6-86e6-e6e6e6e6e6e6') <> '狀態由處理中改為已出單'
     or (select status_from from public.messages where id = 'e6e6e6e6-e6e6-46e6-86e6-e6e6e6e6e6e6') <> 'pending'
     or (select status_to from public.messages where id = 'e6e6e6e6-e6e6-46e6-86e6-e6e6e6e6e6e6') <> 'completed' then
    raise exception 'FAIL: historical status row was not moved without rewriting its body';
  end if;
  if (select count(*) from public.messages
      where request_id = 'e1e1e1e1-e1e1-41e1-81e1-e1e1e1e1e1e1' and kind = 'status_change') <> 1 then
    raise exception 'FAIL: status migration wrote an extra timeline row';
  end if;
  if (select body from public.messages where id = 'e7e7e7e7-e7e7-47e7-87e7-e7e7e7e7e7e7') <> '狀態由已入機改為待處理'
     or (select status_from from public.messages where id = 'e7e7e7e7-e7e7-47e7-87e7-e7e7e7e7e7e7') <> 'recorded'
     or (select status_to from public.messages where id = 'e7e7e7e7-e7e7-47e7-87e7-e7e7e7e7e7e7') <> 'pending' then
    raise exception 'FAIL: a pending or recorded timeline id was rewritten';
  end if;

  if (select payload->>'status' from public.notification_events where message_id = 'e5e5e5e5-e5e5-45e5-85e5-e5e5e5e5e5e5') <> 'pending' then
    raise exception 'FAIL: in_progress notification was not moved to pending';
  end if;
  if (select payload->>'status' from public.notification_events where message_id = 'e6e6e6e6-e6e6-46e6-86e6-e6e6e6e6e6e6') <> 'completed' then
    raise exception 'FAIL: issued notification was not moved to completed';
  end if;

  if exists (select 1 from public.requests where status in ('in_progress', 'issued'))
     or exists (
       select 1 from public.messages
       where status_from in ('in_progress', 'issued')
          or status_to in ('in_progress', 'issued')
     )
     or exists (
       select 1 from public.notification_events
       where payload->>'status' in ('in_progress', 'issued')
     ) then
    raise exception 'FAIL: an old status id is still stored';
  end if;
end $$;

delete from public.clients where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
