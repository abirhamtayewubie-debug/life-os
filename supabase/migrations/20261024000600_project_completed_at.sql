-- When a project was finished, so Reports can count projects completed in a
-- week, month or year. Additive: existing rows are left as they are (a
-- project finished before this change has no date and isn't counted).

alter table public.projects add column completed_at timestamptz;

create or replace function private.stamp_project_completed()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'completed' then
    if tg_op = 'INSERT' or old.status is distinct from 'completed' then
      new.completed_at := coalesce(new.completed_at, now());
    end if;
  else
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create trigger stamp_project_completed before insert or update of status, completed_at on public.projects
  for each row execute function private.stamp_project_completed();

create index projects_completed_idx on public.projects (user_id, completed_at) where completed_at is not null;
