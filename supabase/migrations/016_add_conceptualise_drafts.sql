-- Autosaved in-progress Idea Lab conceptualise conversations, so a session
-- can be resumed later instead of being lost on refresh or tab close.
-- One draft per user (unique on user_id) - starting a new exploration
-- without resuming replaces whatever was there, matching how the feature
-- was described: "resume where I left off," not a library of drafts.
create table conceptualise_drafts (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  seed text,
  messages jsonb not null default '[]'::jsonb,
  phase integer not null default 1,
  ready_to_advance boolean not null default false
);

alter table conceptualise_drafts enable row level security;
create policy "Users can only access their own conceptualise_drafts"
  on conceptualise_drafts for all using (auth.uid() = user_id);
