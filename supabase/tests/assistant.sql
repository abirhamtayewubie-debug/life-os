-- Phase 6 database rules: assistant settings, conversations, suggestions,
-- usage, briefings and report write-ups, isolated between people; journal
-- sharing can't make an entry both private and readable by the assistant.
-- Run with: npm run test:db
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('00000000-0000-0000-0000-0000000000a6', 'alice6@test.local', '{"display_name":"Alice"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b6', 'bob6@test.local',   '{"display_name":"Bob"}',   'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a6","role":"authenticated"}', true);

-- Settings: off by default, Haiku by default, only known models and modules.
insert into public.ai_settings (user_id) values ('00000000-0000-0000-0000-0000000000a6');
do $$ begin
  if (select enabled from public.ai_settings) then raise exception 'FAIL: assistant on by default'; end if;
  if (select model from public.ai_settings) <> 'claude-haiku-5-5' then raise exception 'FAIL: default model'; end if;
  if (select allowed_modules from public.ai_settings) <> '{}' then raise exception 'FAIL: modules shared by default'; end if;
  if (select include_health or include_finance or include_private_journal from public.ai_settings) then raise exception 'FAIL: sensitive area shared by default'; end if;
  begin
    update public.ai_settings set model = 'gpt-5';
    raise exception 'FAIL: unknown model accepted';
  exception when check_violation then null;
  end;
  begin
    update public.ai_settings set allowed_modules = array['tasks', 'finance'];
    raise exception 'FAIL: finance accepted as a plain module (it has its own switch)';
  exception when check_violation then null;
  end;
  begin
    update public.ai_settings set monthly_budget_usd = -1;
    raise exception 'FAIL: negative budget accepted';
  exception when check_violation then null;
  end;
end $$;
update public.ai_settings set enabled = true, allowed_modules = array['tasks', 'calendar'];

-- A conversation, a message, a pending suggestion, usage, a briefing.
insert into public.ai_conversations (id, user_id, title) values ('76000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a6', 'Plan my week');
insert into public.ai_messages (id, user_id, conversation_id, role, content, model, input_tokens, output_tokens, cache_read_tokens)
values ('76000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a6', '76000000-0000-0000-0000-000000000001', 'assistant', '[{"type":"text","text":"Hi"}]', 'claude-haiku-5-5', 120, 30, 0);
insert into public.ai_tool_calls (id, user_id, conversation_id, message_id, tool_name, input, status, requires_confirmation, result_summary)
values ('76000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000a6', '76000000-0000-0000-0000-000000000001', '76000000-0000-0000-0000-000000000002', 'propose_task', '{"title":"Call Abebe"}', 'pending_confirmation', true, 'Add task “Call Abebe”');
insert into public.ai_usage (user_id, purpose, model, input_tokens, output_tokens) values ('00000000-0000-0000-0000-0000000000a6', 'chat', 'claude-haiku-5-5', 120, 30);
insert into public.ai_briefings (user_id, briefing_date, content, facts, model) values ('00000000-0000-0000-0000-0000000000a6', '2026-10-21', 'Two tasks due.', '{"today":"2026-10-21"}', 'claude-haiku-5-5');

do $$ begin
  -- A suggestion that needs confirmation can't be stored as simply "completed".
  begin
    insert into public.ai_tool_calls (user_id, conversation_id, tool_name, input, status, requires_confirmation)
    values ('00000000-0000-0000-0000-0000000000a6', '76000000-0000-0000-0000-000000000001', 'propose_task', '{}', 'completed', true);
    raise exception 'FAIL: suggestion marked completed without confirmation';
  exception when check_violation then null;
  end;
  begin
    insert into public.ai_usage (user_id, purpose, model, input_tokens) values ('00000000-0000-0000-0000-0000000000a6', 'chat', 'x', -5);
    raise exception 'FAIL: negative tokens accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.ai_usage (user_id, purpose, model) values ('00000000-0000-0000-0000-0000000000a6', 'mining', 'x');
    raise exception 'FAIL: unknown usage purpose accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.ai_briefings (user_id, briefing_date, content, facts, model) values ('00000000-0000-0000-0000-0000000000a6', '2026-10-21', 'Again', '{}', 'm');
    raise exception 'FAIL: two briefings for one day';
  exception when unique_violation then null;
  end;
  begin
    insert into public.ai_briefings (user_id, briefing_date, content, facts, model) values ('00000000-0000-0000-0000-0000000000a6', '2026-10-22', 'x', '[]', 'm');
    raise exception 'FAIL: briefing facts must be an object';
  exception when check_violation then null;
  end;
  if (select source from public.ai_briefings limit 1) <> 'ai_suggested' then raise exception 'FAIL: briefing not marked as AI-written'; end if;
end $$;

-- Report write-ups carry who wrote them and when.
insert into public.reports (id, user_id, period, period_start, period_end, measured)
values ('76000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000a6', 'weekly', '2026-10-19', '2026-10-25', '{"days":3}');
do $$ begin
  begin
    update public.reports set interpretation = 'Good week.' where id = '76000000-0000-0000-0000-000000000004';
    raise exception 'FAIL: write-up without a time accepted';
  exception when check_violation then null;
  end;
end $$;
update public.reports set interpretation = 'Good week.', interpretation_model = 'claude-haiku-5-5', interpreted_at = now() where id = '76000000-0000-0000-0000-000000000004';

-- Journal: private by default; sharing flips privacy off; never both.
insert into public.journal_entries (id, user_id, entry_date, body) values ('76000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000a6', '2026-10-20', 'Thoughts');
do $$ begin
  if not (select is_private and not ai_access_allowed from public.journal_entries where id = '76000000-0000-0000-0000-000000000005') then raise exception 'FAIL: journal not private by default'; end if;
  begin
    update public.journal_entries set ai_access_allowed = true where id = '76000000-0000-0000-0000-000000000005';
    raise exception 'FAIL: private entry made readable by the assistant';
  exception when check_violation then null;
  end;
end $$;
update public.journal_entries set is_private = false, ai_access_allowed = true where id = '76000000-0000-0000-0000-000000000005';

-- Bob sees and changes none of it, and can't confirm Alice's suggestion.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b6","role":"authenticated"}', true);
do $$ begin
  if exists (select 1 from public.ai_settings) then raise exception 'FAIL: Bob sees assistant settings'; end if;
  if exists (select 1 from public.ai_conversations) or exists (select 1 from public.ai_messages) then raise exception 'FAIL: Bob sees conversations'; end if;
  if exists (select 1 from public.ai_tool_calls) then raise exception 'FAIL: Bob sees suggestions'; end if;
  if exists (select 1 from public.ai_usage) then raise exception 'FAIL: Bob sees usage'; end if;
  if exists (select 1 from public.ai_briefings) then raise exception 'FAIL: Bob sees briefings'; end if;
  if exists (select 1 from public.journal_entries) then raise exception 'FAIL: Bob sees a shared journal entry'; end if;
  update public.ai_tool_calls set status = 'confirmed', decided_at = now();
  update public.ai_settings set include_finance = true;
  delete from public.ai_usage;
  begin
    insert into public.ai_messages (user_id, conversation_id, role, content)
    values ('00000000-0000-0000-0000-0000000000b6', '76000000-0000-0000-0000-000000000001', 'user', '[]');
    raise exception 'FAIL: Bob wrote into Alice''s conversation';
  exception when foreign_key_violation or insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a6","role":"authenticated"}', true);
do $$ begin
  if (select status from public.ai_tool_calls where id = '76000000-0000-0000-0000-000000000003') <> 'pending_confirmation' then raise exception 'FAIL: Bob decided Alice''s suggestion'; end if;
  if (select include_finance from public.ai_settings) then raise exception 'FAIL: Bob changed Alice''s sharing'; end if;
  if not exists (select 1 from public.ai_usage) then raise exception 'FAIL: Bob deleted Alice''s usage'; end if;
  -- Deleting a conversation removes its messages and suggestions.
  delete from public.ai_conversations where id = '76000000-0000-0000-0000-000000000001';
  if exists (select 1 from public.ai_messages) or exists (select 1 from public.ai_tool_calls) then raise exception 'FAIL: conversation children outlived it'; end if;
end $$;

reset role;
select 'Phase 6 database tests passed' as result;
rollback;
