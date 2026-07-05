-- The living portrait: confirmed, decaying observations about how the user
-- processes, what recurs, and what kind of companioning actually works on
-- them. Fed by check-ins, Idea Lab/conceptualise, and Zoom Out — never by
-- Collector captures (see memory: collector-standalone). Nothing here is
-- silent: entries start 'pending' and only count once the user confirms.
create type portrait_entry_kind as enum (
  'processing_pattern',
  'recurring_theme',
  'creative_pattern',
  'guidance_note'
);
create type portrait_entry_status as enum ('pending', 'active', 'rejected', 'dormant');
create type portrait_source as enum ('check_in', 'conceptualise', 'zoom_out');

create table portrait_entries (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamptz default now(),
  kind portrait_entry_kind not null,
  statement text not null,
  source portrait_source not null,
  status portrait_entry_status default 'pending',
  reinforcement_count integer default 1,
  last_reinforced_at timestamptz default now(),
  rejection_note text
);

alter table portrait_entries enable row level security;
create policy "Users can only access their own portrait_entries"
  on portrait_entries for all using (auth.uid() = user_id);

-- Atomically bumps reinforcement_count and last_reinforced_at when new
-- material reconfirms an existing entry. Runs as invoker so RLS applies.
create or replace function reinforce_portrait_entry(p_entry_id uuid)
returns void
language sql
security invoker
as $$
  update portrait_entries
    set reinforcement_count = reinforcement_count + 1,
        last_reinforced_at = now()
    where id = p_entry_id and user_id = auth.uid();
$$;
