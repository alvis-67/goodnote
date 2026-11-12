-- Store shared phrases that choose a topic on a new request.
-- Apply once with a direct (non-pooled) connection, after 0009_topics_and_reply_presets.sql:
--   psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f db/migrations/0010_topic_rules.sql
--
-- After merge, apply this file to the Goodnote Neon database only.
-- Do not apply it to any other project, and do not apply it from the app.
--
-- Each row is one phrase and one topic. A longer phrase wins when both
-- match, so 已收錢 stays receipt and is not read as 收錢. The phrases below
-- are the starting list. An admin can add or delete rows later.
-- 搵 is U+6435, the same character already used for 搵管理處.
-- Saved requests, topics, and stages are left as they are.
-- It does not create or alter the neon_auth schema.

begin;

create table public.topic_rules (
  id uuid primary key default gen_random_uuid(),
  phrase text not null,
  topic text not null,
  created_at timestamptz not null default now(),
  constraint topic_rules_phrase_check check (
    char_length(phrase) between 1 and 80
    and phrase = btrim(phrase)
  ),
  constraint topic_rules_topic_check check (
    topic in ('quote', 'invoice', 'receipt', 'management', 'insurance', 'other')
  ),
  constraint topic_rules_phrase_key unique (phrase)
);

comment on table public.topic_rules is
  'Shared phrases that choose a topic while a client writes a new request. Every admin edits the same rows.';

create index topic_rules_created_idx on public.topic_rules (created_at, id);

insert into public.topic_rules (phrase, topic, created_at)
values
  ('出報價單', 'quote', timestamptz '2026-01-01 00:00:01+00'),
  ('報價單', 'quote', timestamptz '2026-01-01 00:00:02+00'),
  ('出報價', 'quote', timestamptz '2026-01-01 00:00:03+00'),
  ('出收據', 'receipt', timestamptz '2026-01-01 00:00:04+00'),
  ('請出收據', 'receipt', timestamptz '2026-01-01 00:00:05+00'),
  ('已收錢', 'receipt', timestamptz '2026-01-01 00:00:06+00'),
  ('已收妥', 'receipt', timestamptz '2026-01-01 00:00:07+00'),
  ('已付款', 'receipt', timestamptz '2026-01-01 00:00:08+00'),
  ('出發票', 'invoice', timestamptz '2026-01-01 00:00:09+00'),
  ('開發票', 'invoice', timestamptz '2026-01-01 00:00:10+00'),
  ('出單收錢', 'invoice', timestamptz '2026-01-01 00:00:11+00'),
  ('出單收款', 'invoice', timestamptz '2026-01-01 00:00:12+00'),
  ('收錢', 'invoice', timestamptz '2026-01-01 00:00:13+00'),
  ('搵管理處', 'management', timestamptz '2026-01-01 00:00:14+00'),
  ('找管理處', 'management', timestamptz '2026-01-01 00:00:15+00'),
  ('聯絡管理處', 'management', timestamptz '2026-01-01 00:00:16+00'),
  ('買保險', 'insurance', timestamptz '2026-01-01 00:00:17+00'),
  ('購買保險', 'insurance', timestamptz '2026-01-01 00:00:18+00'),
  ('投保', 'insurance', timestamptz '2026-01-01 00:00:19+00');

commit;
