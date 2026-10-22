-- Life OS · 0012 · AI assistant
-- The assistant is off until the person turns it on. It reads only through
-- the person's own RLS-scoped client, and every change it suggests waits in
-- ai_tool_calls for their confirmation.

-- Which model answers, and a monthly spending ceiling enforced by the app
-- (an estimate from token counts; the provider's own limit is the hard stop).
alter table public.ai_settings
  add column model text not null default 'claude-haiku-5-5'
    check (model in ('claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5')),
  add column monthly_budget_usd numeric(8, 2) not null default 5
    check (monthly_budget_usd between 0 and 1000),
  add constraint ai_settings_known_modules check (
    allowed_modules <@ array['tasks', 'calendar', 'habits', 'goals', 'work', 'learning', 'relationships', 'admin', 'knowledge', 'reports', 'wheel', 'spirit']::text[]
  );

-- Cached input is billed differently, so it's counted separately.
alter table public.ai_messages
  add column cache_read_tokens integer check (cache_read_tokens >= 0),
  add column cache_write_tokens integer check (cache_write_tokens >= 0),
  add constraint ai_messages_tokens_check check (coalesce(input_tokens, 0) >= 0 and coalesce(output_tokens, 0) >= 0);

create index ai_messages_user_created_idx on public.ai_messages (user_id, created_at desc);

-- A proposal can be confirmed once; record what it created.
alter table public.ai_tool_calls
  add column result_record_id uuid,
  add column tool_use_id text check (char_length(tool_use_id) <= 100);

-- Briefings: one written summary per local day, kept apart from the facts
-- it was written from (stored alongside for transparency).
create table public.ai_briefings (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  briefing_date  date not null,
  content        text not null check (char_length(content) between 1 and 20000),
  facts          jsonb not null check (jsonb_typeof(facts) = 'object'),
  model          text not null check (char_length(model) <= 80),
  input_tokens   integer check (input_tokens >= 0),
  output_tokens  integer check (output_tokens >= 0),
  source         public.data_source not null default 'ai_suggested',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (user_id, briefing_date)
);
select private.apply_owner_policies('public.ai_briefings');

-- Report write-ups: who wrote the interpretation and when.
alter table public.reports
  add column interpretation_model text check (char_length(interpretation_model) <= 80),
  add column interpreted_at timestamptz,
  add constraint reports_interpretation_meta check ((interpretation is null) = (interpreted_at is null));

-- Every model call is metered here (chat, briefings, report write-ups), so the
-- monthly budget and the usage shown in Settings come from one place.
create table public.ai_usage (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  purpose            text not null check (purpose in ('chat', 'briefing', 'report')),
  model              text not null check (char_length(model) <= 80),
  input_tokens       integer not null default 0 check (input_tokens >= 0),
  output_tokens      integer not null default 0 check (output_tokens >= 0),
  cache_read_tokens  integer not null default 0 check (cache_read_tokens >= 0),
  cache_write_tokens integer not null default 0 check (cache_write_tokens >= 0),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index ai_usage_user_created_idx on public.ai_usage (user_id, created_at desc);
select private.apply_owner_policies('public.ai_usage');
