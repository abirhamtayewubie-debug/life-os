-- Phase 7 database rules: devices and calendar links are private to their
-- owner, the calendar feed only answers to the exact token, and imports
-- can't be duplicated.
-- Run with: npm run test:db
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('00000000-0000-0000-0000-0000000000a7', 'alice7@test.local', '{"display_name":"Alice"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b7', 'bob7@test.local',   '{"display_name":"Bob"}',   'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a7","role":"authenticated"}', true);
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, label) values
  ('00000000-0000-0000-0000-0000000000a7', 'https://fcm.googleapis.com/fcm/send/alice-phone', repeat('B', 87), repeat('a', 22), 'Chrome on Android');
insert into public.calendar_feeds (user_id, token_hash) values
  ('00000000-0000-0000-0000-0000000000a7', extensions.digest('AliceToken_AliceToken_AliceToken_AliceToken', 'sha256'));
insert into public.calendar_events (user_id, title, starts_at, ends_at) values
  ('00000000-0000-0000-0000-0000000000a7', 'Alice dentist', now() + interval '1 day', now() + interval '1 day 1 hour'),
  ('00000000-0000-0000-0000-0000000000a7', 'Alice old', now() - interval '200 days', now() - interval '200 days'),
  ('00000000-0000-0000-0000-0000000000a7', 'Alice weekly', now() - interval '200 days', now() - interval '200 days'),
  ('00000000-0000-0000-0000-0000000000a7', 'Alice archived', now(), now());
update public.calendar_events set recurrence_rule = 'FREQ=WEEKLY' where title = 'Alice weekly';
update public.calendar_events set archived_at = now() where title = 'Alice archived';

-- Push endpoints must be https (or a local test service), keys a sane size.
do $$ begin
  begin
    insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ('00000000-0000-0000-0000-0000000000a7', 'http://evil.example/x', repeat('B', 87), repeat('a', 22));
    raise exception 'FAIL: plain http endpoint accepted';
  exception when check_violation then null;
  end;
end $$;

-- Imported workouts: the same outside id twice is refused; typed-in ones (no id) are not limited.
insert into public.workouts (user_id, performed_on, activity, external_id, source) values ('00000000-0000-0000-0000-0000000000a7', '2026-10-12', 'Running', 'apple-health:run:1', 'device');
insert into public.workouts (user_id, performed_on, activity) values ('00000000-0000-0000-0000-0000000000a7', '2026-10-12', 'Walk'), ('00000000-0000-0000-0000-0000000000a7', '2026-10-12', 'Walk');
do $$ begin
  begin
    insert into public.workouts (user_id, performed_on, activity, external_id, source) values ('00000000-0000-0000-0000-0000000000a7', '2026-10-12', 'Running', 'apple-health:run:1', 'device');
    raise exception 'FAIL: duplicate imported workout accepted';
  exception when unique_violation then null;
  end;
end $$;

-- Bob sees none of Alice's devices or links, and can't add a row for her.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b7","role":"authenticated"}', true);
do $$ begin
  if (select count(*) from public.push_subscriptions) <> 0 then raise exception 'FAIL: Bob sees Alice''s devices'; end if;
  if (select count(*) from public.calendar_feeds) <> 0 then raise exception 'FAIL: Bob sees Alice''s calendar link'; end if;
  begin
    insert into public.calendar_feeds (user_id, token_hash) values ('00000000-0000-0000-0000-0000000000a7', extensions.digest('x', 'sha256'));
    raise exception 'FAIL: Bob created a link for Alice';
  exception when insufficient_privilege then null;
  end;
  update public.push_subscriptions set label = 'hacked';
  delete from public.calendar_feeds;
end $$;
reset role;
do $$ begin
  if exists (select 1 from public.push_subscriptions where label = 'hacked') then raise exception 'FAIL: Bob changed Alice''s device'; end if;
  if (select count(*) from public.calendar_feeds where user_id = '00000000-0000-0000-0000-0000000000a7') <> 1 then raise exception 'FAIL: Bob removed Alice''s link'; end if;
end $$;

-- The feed, called without signing in: only the exact token works, and it
-- returns only Alice's live events (recent or repeating, not archived).
set local role anon;
do $$
declare n int; titles text;
begin
  select count(*), string_agg(title, ',' order by title) into n, titles from public.calendar_feed('AliceToken_AliceToken_AliceToken_AliceToken');
  if titles is distinct from 'Alice dentist,Alice weekly' then raise exception 'FAIL: feed returned %', titles; end if;
  if (select count(*) from public.calendar_feed('AliceToken_AliceToken_AliceToken_AliceTokeN')) <> 0 then raise exception 'FAIL: near-miss token worked'; end if;
  if (select count(*) from public.calendar_feed('short')) <> 0 then raise exception 'FAIL: malformed token worked'; end if;
  if not public.touch_calendar_feed('AliceToken_AliceToken_AliceToken_AliceToken') then raise exception 'FAIL: live link reported as off'; end if;
  if public.touch_calendar_feed('BobToken___BobToken___BobToken___BobToken__') then raise exception 'FAIL: unknown link reported as live'; end if;
  begin
    if (select count(*) from public.calendar_feeds) <> 0 then raise exception 'FAIL: anon can read calendar_feeds'; end if;
  exception when insufficient_privilege then null;
  end;
  begin
    if (select count(*) from public.push_subscriptions) <> 0 then raise exception 'FAIL: anon can read push_subscriptions'; end if;
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
do $$ begin
  if (select last_used_at from public.calendar_feeds where user_id = '00000000-0000-0000-0000-0000000000a7') is null then raise exception 'FAIL: last read not recorded'; end if;
end $$;

rollback;
\echo 'integrations.sql: all checks passed'
