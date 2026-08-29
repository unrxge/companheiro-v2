-- Per-user territory configuration for the Idea Lab.
-- Stores up to 4 territory slots as jsonb — each slot is either a predefined
-- key string, a custom territory object, or null (empty slot).
-- New users get no row here; the API returns the default 4 predefined territories.
create table user_territory_config (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  slots     jsonb not null default '[]'::jsonb,
  updated_at timestamptz default now()
);

alter table user_territory_config enable row level security;
create policy "Users can only access their own territory config"
  on user_territory_config for all using (auth.uid() = user_id);
