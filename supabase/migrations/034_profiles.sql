-- Who someone is, in one table you can open in the Table Editor: their email
-- (a copy, kept so the row reads on its own), the name and date of birth they
-- gave on their first screen, and what their practice looks like. Until now
-- the name and date of birth lived only in the auth user's metadata, which the
-- dashboard's Users screen does not show.
--
-- Rows are created for every account when it is made (so the table lists
-- everyone, even those who left before the questions), and filled in by
-- PUT /api/onboarding. Only added: nothing existing is changed.
create table if not exists profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text,
  birthdate date,
  practices text[] not null default '{}',
  other text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table profiles enable row level security;
drop policy if exists "Users can only access their own profile" on profiles;
create policy "Users can only access their own profile"
  on profiles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- A new table grants its own access (Supabase no longer does it by itself).
grant select, insert, update, delete on public.profiles to authenticated, service_role;

-- A row for every new account. Never able to stop a sign-up: any error is swallowed.
create or replace function handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    insert into profiles (user_id, email) values (new.id, new.email) on conflict (user_id) do nothing;
  exception when others then
    null;
  end;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function handle_new_user_profile();

-- Everyone who already has an account, and what they have already said.
insert into profiles (user_id, email)
select id, email from auth.users
on conflict (user_id) do nothing;

update profiles p
   set name = left(nullif(trim(u.raw_user_meta_data -> 'profile' ->> 'name'), ''), 24),
       birthdate = case
         when (u.raw_user_meta_data -> 'profile' ->> 'birthdate') ~ '^\d{4}-\d{2}-\d{2}$'
         then (u.raw_user_meta_data -> 'profile' ->> 'birthdate')::date end,
       practices = coalesce(array(select jsonb_array_elements_text(u.raw_user_meta_data -> 'profile' -> 'practices')), '{}'),
       other = left(nullif(trim(u.raw_user_meta_data -> 'profile' ->> 'other'), ''), 80)
  from auth.users u
 where u.id = p.user_id
   and u.raw_user_meta_data ? 'profile'
   and jsonb_typeof(u.raw_user_meta_data -> 'profile') = 'object';

-- The same, with age worked out and the newest first: the one to open to see people.
create or replace view profiles_overview with (security_invoker = true) as
select user_id, email, name, birthdate,
       date_part('year', age(birthdate))::int as age,
       practices, other, created_at, updated_at
  from profiles
 order by created_at desc;
grant select on public.profiles_overview to authenticated, service_role;
