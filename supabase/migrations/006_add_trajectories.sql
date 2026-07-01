-- Table: trajectories
-- Holds the history of agreed content trajectories from the Idea Lab "zoom out" flow.
-- Only one row per user may have superseded_at IS NULL (the current active trajectory).
create table trajectories (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamptz default now(),
  statement text not null,
  born_project text,
  superseded_at timestamptz
);

alter table trajectories enable row level security;
create policy "Users can only access their own trajectories"
  on trajectories for all using (auth.uid() = user_id);

-- Enforce one active trajectory per user at the database level
create unique index trajectories_one_active_per_user
  on trajectories (user_id)
  where superseded_at is null;

-- Atomically supersede the current trajectory and insert the new one.
-- Runs as invoker so RLS applies normally to the calling user.
create or replace function commit_trajectory(p_statement text, p_born_project text default null)
returns trajectories
language plpgsql
security invoker
as $$
declare
  new_row trajectories;
begin
  update trajectories
    set superseded_at = now()
    where user_id = auth.uid() and superseded_at is null;

  insert into trajectories (user_id, statement, born_project)
    values (auth.uid(), p_statement, p_born_project)
    returning * into new_row;

  return new_row;
end;
$$;
