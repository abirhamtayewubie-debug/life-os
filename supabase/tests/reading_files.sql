-- Reading: pages and files on learning items, page ranges on study sessions,
-- and the private storage bucket's per-owner folders. Run with: npm run test:db
\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('00000000-0000-0000-0000-0000000000ab', 'alice11@test.local', '{"display_name":"Alice"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000bb', 'bob11@test.local',   '{"display_name":"Bob"}',   'authenticated', 'authenticated');

do $$ begin
  if not exists (select 1 from storage.buckets where id = 'reading' and not public) then raise exception 'FAIL: reading bucket missing or public'; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ab","role":"authenticated"}', true);

insert into public.learning_items (id, user_id, kind, title, total_pages, current_page, file_path, file_name, file_size, file_type) values
  ('4b000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000ab', 'book', 'Deep Work', 300, 40,
   '00000000-0000-0000-0000-0000000000ab/4b000000-0000-0000-0000-000000000001/deep-work.pdf', 'Deep Work.pdf', 1048576, 'application/pdf');
insert into public.study_sessions (user_id, studied_on, minutes, learning_item_id, page_from, page_to) values
  ('00000000-0000-0000-0000-0000000000ab', current_date, 30, '4b000000-0000-0000-0000-000000000001', 41, 60);
insert into storage.objects (bucket_id, name) values ('reading', '00000000-0000-0000-0000-0000000000ab/4b000000-0000-0000-0000-000000000001/deep-work.pdf');

do $$ begin
  begin
    update public.learning_items set current_page = 301 where id = '4b000000-0000-0000-0000-000000000001';
    raise exception 'FAIL: page past the end accepted';
  exception when check_violation then null;
  end;
  begin
    update public.learning_items set file_path = '00000000-0000-0000-0000-0000000000bb/4b000000-0000-0000-0000-000000000001/x.pdf' where id = '4b000000-0000-0000-0000-000000000001';
    raise exception 'FAIL: file path outside the owner folder accepted';
  exception when check_violation then null;
  end;
  begin
    update public.learning_items set file_name = null where id = '4b000000-0000-0000-0000-000000000001';
    raise exception 'FAIL: file path without a name accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.study_sessions (user_id, studied_on, minutes, page_from, page_to) values ('00000000-0000-0000-0000-0000000000ab', current_date, 5, 60, 41);
    raise exception 'FAIL: backwards page range accepted';
  exception when check_violation then null;
  end;
  begin
    insert into storage.objects (bucket_id, name) values ('reading', '00000000-0000-0000-0000-0000000000bb/x/planted.pdf');
    raise exception 'FAIL: Alice uploaded into Bob''s folder';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Bob sees none of Alice's books, sessions or files, and can't change or delete them.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000bb","role":"authenticated"}', true);
do $$ begin
  if (select count(*) from public.learning_items) + (select count(*) from public.study_sessions) <> 0 then raise exception 'FAIL: Bob sees Alice''s reading'; end if;
  if (select count(*) from storage.objects where bucket_id = 'reading') <> 0 then raise exception 'FAIL: Bob sees Alice''s files'; end if;
  delete from storage.objects where bucket_id = 'reading';
  update storage.objects set name = '00000000-0000-0000-0000-0000000000bb/stolen.pdf' where bucket_id = 'reading';
  begin
    insert into storage.objects (bucket_id, name) values ('reading', '00000000-0000-0000-0000-0000000000ab/4b000000-0000-0000-0000-000000000001/evil.pdf');
    raise exception 'FAIL: Bob uploaded into Alice''s folder';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ab","role":"authenticated"}', true);
do $$ begin
  if (select count(*) from storage.objects where bucket_id = 'reading') <> 1 then raise exception 'FAIL: Bob changed Alice''s files'; end if;
  delete from storage.objects where bucket_id = 'reading';
  if (select count(*) from storage.objects where bucket_id = 'reading') <> 0 then raise exception 'FAIL: Alice can''t delete her own file'; end if;
end $$;

rollback;
\echo 'reading_files: ok'
