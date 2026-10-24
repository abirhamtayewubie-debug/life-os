-- Meditation library and log, and monthly reviews: ownership, checks, and
-- what survives a delete. Run with: npm run test:db
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('00000000-0000-0000-0000-0000000000aa', 'alice10@test.local', '{"display_name":"Alice"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000ba', 'bob10@test.local',   '{"display_name":"Bob"}',   'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);

insert into public.meditation_links (id, user_id, title, url, minutes, category) values
  ('4a000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000aa', 'Body scan', 'https://www.youtube.com/watch?v=abcdefghijk', 10, 'Sleep');
insert into public.meditation_sessions (user_id, practiced_on, minutes, link_id) values
  ('00000000-0000-0000-0000-0000000000aa', current_date, 10, '4a000000-0000-0000-0000-000000000001');
insert into public.daily_reviews (user_id, review_date, kind, achievements) values
  ('00000000-0000-0000-0000-0000000000aa', date_trunc('month', current_date)::date, 'monthly', 'Shipped the site');

do $$ begin
  begin
    insert into public.meditation_links (user_id, title, url) values ('00000000-0000-0000-0000-0000000000aa', 'Bad', 'javascript:alert(1)');
    raise exception 'FAIL: non-https link accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.meditation_sessions (user_id, practiced_on, minutes) values ('00000000-0000-0000-0000-0000000000aa', current_date, 0);
    raise exception 'FAIL: zero-minute session accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.daily_reviews (user_id, review_date, kind) values ('00000000-0000-0000-0000-0000000000aa', date_trunc('month', current_date)::date, 'monthly');
    raise exception 'FAIL: two monthly reviews for one month';
  exception when unique_violation then null;
  end;
end $$;

-- Bob can't see or link to any of it.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ba","role":"authenticated"}', true);
do $$ begin
  if (select count(*) from public.meditation_links) + (select count(*) from public.meditation_sessions) + (select count(*) from public.daily_reviews) <> 0 then
    raise exception 'FAIL: Bob sees Alice''s meditation or reviews';
  end if;
  begin
    insert into public.meditation_sessions (user_id, practiced_on, minutes, link_id) values
      ('00000000-0000-0000-0000-0000000000ba', current_date, 5, '4a000000-0000-0000-0000-000000000001');
    raise exception 'FAIL: Bob logged against Alice''s meditation';
  exception when foreign_key_violation then null;
  end;
  update public.meditation_links set title = 'Hijacked';
  delete from public.meditation_sessions;
end $$;

-- Deleting a meditation keeps the practice log.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
do $$ begin
  if (select title from public.meditation_links where id = '4a000000-0000-0000-0000-000000000001') <> 'Body scan' then raise exception 'FAIL: Bob changed Alice''s link'; end if;
  delete from public.meditation_links where id = '4a000000-0000-0000-0000-000000000001';
  if (select count(*) from public.meditation_sessions where link_id is null) <> 1 then raise exception 'FAIL: session lost with its link'; end if;
end $$;

rollback;
\echo 'meditation_reviews: ok'
