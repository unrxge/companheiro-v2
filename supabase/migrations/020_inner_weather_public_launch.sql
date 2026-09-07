-- Inner Weather rollout + public-launch groundwork (2026-09-07).
--
-- 1. Territories become free text. The four predefined keys still work as
--    values; onboarding seeds custom_* keys per user. Every reader selects
--    thematic_territory explicitly and treats it as a string already, so this
--    is a type widening only. The enum type is kept (unused) for rollback.
alter table captures alter column thematic_territory type text using thematic_territory::text;
alter table ideas    alter column thematic_territory type text using thematic_territory::text;
alter table pieces   alter column thematic_territory type text using thematic_territory::text;

-- 2. A piece can now be in the Test step of its journey.
alter type piece_stage add value if not exists 'testing';

-- 3. Per-user settings: dictation language, Sunday letter opt-in, onboarding.
create table if not exists user_settings (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  dictation_lang text,
  sunday_letter  boolean not null default false,
  onboarded_at   timestamptz,
  updated_at     timestamptz default now()
);
alter table user_settings enable row level security;
drop policy if exists "Users can only access their own user_settings" on user_settings;
create policy "Users can only access their own user_settings"
  on user_settings for all using (auth.uid() = user_id);

-- 4. The Sunday letter: one per user per week, generated lazily on request.
create table if not exists letters (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid references auth.users(id) on delete cascade not null,
  week_start date not null,
  body       text not null,
  created_at timestamptz default now(),
  read_at    timestamptz,
  unique (user_id, week_start)
);
alter table letters enable row level security;
drop policy if exists "Users can only access their own letters" on letters;
create policy "Users can only access their own letters"
  on letters for all using (auth.uid() = user_id);
