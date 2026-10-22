-- Phase 8: a person can delete their own account and everything in it.
-- Every user-owned table references auth.users with ON DELETE CASCADE, so
-- removing the auth row removes all of their data in one transaction.

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  delete from auth.users where id = me;
end;
$$;

comment on function public.delete_my_account() is
  'Deletes the calling user and, by cascade, every row they own. Only ever acts on auth.uid().';

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
