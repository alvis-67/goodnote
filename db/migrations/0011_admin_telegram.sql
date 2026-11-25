-- Store the admin Telegram chat that receives a note when a client creates a request.
-- Apply once with a direct (non-pooled) connection, after 0010_topic_rules.sql:
--   psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f db/migrations/0011_admin_telegram.sql
--
-- After merge, apply this file to the Goodnote Neon database only.
-- Do not apply it to any other project, and do not apply it from the app.
--
-- The bot token is not stored here. The app reads it from TELEGRAM_BOT_TOKEN.
-- An admin connects the chat from the 通知 page: open the bot, tap Start, then
-- confirm. This file does not change requests, topics, stages, or statuses.
-- It does not create or alter the neon_auth schema.
-- The database does not call Telegram.

begin;

create table public.admin_telegram (
  id integer primary key default 1,
  chat_id text,
  connected_at timestamptz,
  pairing_code_hash text,
  pairing_expires_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint admin_telegram_singleton check (id = 1),
  constraint admin_telegram_chat_id_check check (
    chat_id is null or chat_id ~ '^[1-9][0-9]{0,14}$'
  ),
  constraint admin_telegram_connected_check check (
    (chat_id is null and connected_at is null)
    or (chat_id is not null and connected_at is not null)
  ),
  constraint admin_telegram_pairing_check check (
    (pairing_code_hash is null and pairing_expires_at is null)
    or (
      pairing_code_hash ~ '^[0-9a-f]{64}$'
      and pairing_expires_at is not null
    )
  )
);

comment on table public.admin_telegram is
  'One shared Telegram chat for new-request notices. The bot token is not stored in the database.';

insert into public.admin_telegram (id) values (1);

alter table public.notification_events drop constraint notification_events_channel_check;

alter table public.notification_events
  add constraint notification_events_channel_check check (
    channel in ('in_app', 'email', 'whatsapp', 'telegram')
  );

comment on table public.notification_events is
  'Delivery log. The database writes in-app rows. The app writes a telegram row only after a new-request message is sent.';

commit;
