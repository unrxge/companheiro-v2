-- Add an emotional tone classification to trajectories, used to color the
-- Project Board banner. Nullable and additive — safe for existing rows.
alter table trajectories
  add column tone text;

-- Replace commit_trajectory to also accept and store the tone.
-- Drop first: adding a parameter changes the function's signature, and the
-- old two-argument overload would otherwise remain and create ambiguity.
drop function if exists commit_trajectory(text, text);

create or replace function commit_trajectory(
  p_statement text,
  p_born_project text default null,
  p_tone text default null
)
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

  insert into trajectories (user_id, statement, born_project, tone)
    values (auth.uid(), p_statement, p_born_project, p_tone)
    returning * into new_row;

  return new_row;
end;
$$;
