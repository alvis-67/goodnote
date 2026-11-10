-- Separate issuing an invoice from asking for a receipt after payment.
-- Apply once with a direct (non-pooled) connection, after 0006_request_stage.sql:
--   psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f db/migrations/0007_stage_titles.sql
--
-- After merge, apply this file to the Goodnote Neon database only.
-- Do not apply it to any other project, and do not apply it from the app.
--
-- Replaces private.request_stage_title only. A quotation at the invoice
-- stage is titled 出發票. The title 已收錢，請出收據 is used only at the
-- receipt stage, including a request that started as a receipt.
-- Stored stage_change message bodies are left as written.
-- This does not insert or delete requests, and it does not change topic
-- or stage values already stored.
-- Does not create or alter the neon_auth schema.

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
    when topic = 'other' and stage = 'other' then '其他'
    else null
  end;
$$;

revoke all on function private.request_stage_title(text, text) from public;
