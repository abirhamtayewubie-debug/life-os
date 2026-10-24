-- Reading: pages and an uploaded file on books you already track in Learning,
-- page ranges on study sessions, and a private Storage bucket for the files.
-- Additive; no existing row changes. The reading list is learning_items (no
-- second list of books), and reading time is study_sessions (no second log).

alter table public.learning_items
  add column total_pages   integer check (total_pages between 1 and 20000),
  add column current_page  integer check (current_page between 0 and 20000),
  add column file_path     text check (char_length(file_path) <= 1024),
  add column file_name     text check (char_length(file_name) between 1 and 255),
  add column file_size     bigint check (file_size between 1 and 52428800),
  add column file_type     text check (char_length(file_type) <= 100),
  add constraint learning_items_page_in_book check (current_page is null or total_pages is null or current_page <= total_pages),
  -- A file always lives under the owner's own folder: <user_id>/<item_id>/<name>.
  add constraint learning_items_file_owner check (file_path is null or file_path like user_id::text || '/' || id::text || '/%'),
  add constraint learning_items_file_complete check ((file_path is null) = (file_name is null));

alter table public.study_sessions
  add column page_from integer check (page_from between 1 and 20000),
  add column page_to   integer check (page_to between 1 and 20000),
  add constraint study_sessions_pages check (page_to is null or page_from is null or page_to >= page_from);

-- Private bucket: 50 MB per file, documents and images only. Nothing is public;
-- files are opened through short-lived signed links.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reading', 'reading', false, 52428800,
        array['application/pdf', 'application/epub+zip', 'text/plain', 'text/markdown', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Each person can only touch objects in their own top-level folder.
drop policy if exists "reading: owner can read" on storage.objects;
drop policy if exists "reading: owner can upload" on storage.objects;
drop policy if exists "reading: owner can update" on storage.objects;
drop policy if exists "reading: owner can delete" on storage.objects;
create policy "reading: owner can read" on storage.objects for select to authenticated
  using (bucket_id = 'reading' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "reading: owner can upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'reading' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "reading: owner can update" on storage.objects for update to authenticated
  using (bucket_id = 'reading' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'reading' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "reading: owner can delete" on storage.objects for delete to authenticated
  using (bucket_id = 'reading' and (storage.foldername(name))[1] = (select auth.uid())::text);
