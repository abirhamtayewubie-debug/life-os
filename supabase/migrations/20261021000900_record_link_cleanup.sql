-- record_links is polymorphic, so it can't carry foreign keys. This trigger
-- removes a record's links (in both directions) when the record is deleted,
-- so backlinks never point at something that no longer exists.
create or replace function private.drop_record_links()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  delete from public.record_links
  where user_id = old.user_id
    and ((from_type = tg_argv[0]::public.record_type and from_id = old.id)
      or (to_type = tg_argv[0]::public.record_type and to_id = old.id));
  return old;
end;
$$;

create trigger drop_record_links after delete on public.notes
  for each row execute function private.drop_record_links('note');
create trigger drop_record_links after delete on public.goals
  for each row execute function private.drop_record_links('goal');
create trigger drop_record_links after delete on public.projects
  for each row execute function private.drop_record_links('project');
create trigger drop_record_links after delete on public.tasks
  for each row execute function private.drop_record_links('task');
create trigger drop_record_links after delete on public.people
  for each row execute function private.drop_record_links('person');
create trigger drop_record_links after delete on public.journal_entries
  for each row execute function private.drop_record_links('journal_entry');

-- Folder listing for the knowledge base.
create index notes_folder_idx on public.notes (user_id, folder) where archived_at is null;
