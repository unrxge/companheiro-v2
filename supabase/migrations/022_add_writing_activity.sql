-- Table 10: writing_activity
-- Per-day accumulated active time in the Write module, keyed by the client's
-- own local calendar date (not server date) so it lines up with how the
-- Inner Weather strip buckets days on the client. Lets the widget recognise a
-- day the person wrote on even when they never explicitly checked in.
create table writing_activity (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  date date not null,
  seconds integer not null default 0,
  updated_at timestamptz default now(),
  unique (user_id, date)
);
alter table writing_activity enable row level security;
create policy "Users can only access their own writing_activity"
  on writing_activity for all using (auth.uid() = user_id);

-- Atomic increment so concurrent heartbeats from the same session never
-- clobber each other via a read-modify-write race.
create or replace function increment_writing_activity(p_user_id uuid, p_date date, p_seconds integer)
returns void
language sql
as $$
  insert into writing_activity (user_id, date, seconds, updated_at)
  values (p_user_id, p_date, p_seconds, now())
  on conflict (user_id, date)
  do update set seconds = writing_activity.seconds + excluded.seconds, updated_at = now();
$$;
