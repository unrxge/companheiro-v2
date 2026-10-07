-- Which check-in a portrait entry was noticed in (first seen, or seen again).
-- Lets a past check-in show the patterns found in it, and the portrait show
-- where each pattern came from. Written only by portrait distillation, so a
-- pattern can never appear on a check-in without being in the portrait.
create table if not exists portrait_evidence (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  entry_id uuid references portrait_entries(id) on delete cascade not null,
  check_in_id uuid references check_ins(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique (entry_id, check_in_id)
);

create index if not exists portrait_evidence_check_in_idx on portrait_evidence (check_in_id);
create index if not exists portrait_evidence_entry_idx on portrait_evidence (entry_id);

alter table portrait_evidence enable row level security;
drop policy if exists "Users can only access their own portrait_evidence" on portrait_evidence;
create policy "Users can only access their own portrait_evidence"
  on portrait_evidence for all using (auth.uid() = user_id);
