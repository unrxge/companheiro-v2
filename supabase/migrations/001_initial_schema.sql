-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Enums
create type arc_type as enum ('Breakaway', 'Beginning', 'Expansion', 'Integration');
create type thematic_territory as enum ('creativity_devotion_curiosity', 'healthy_masculinity_emotional_regulation', 'inner_child_tending_expression', 'slow_living_life_in_service');
create type energy_level as enum ('low', 'medium', 'high');
create type capture_status as enum ('captured', 'developed', 'activated', 'archived');
create type idea_status as enum ('developing', 'ready', 'active', 'complete', 'archived');
create type project_status as enum ('active', 'complete', 'archived');
create type piece_format as enum ('substack', 'short_form', 'both');
create type piece_stage as enum ('conceptualising', 'writing', 'translating', 'executing', 'posted');
create type pattern_type as enum ('energy', 'arc', 'creative');
create type action_taken as enum ('none', 'board_adjusted', 'library_suggested');
create type library_type as enum ('music', 'writing', 'prompt', 'reminder');

-- Table 1: check_ins
create table check_ins (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamptz default now(),
  raw_entry text not null,
  energy energy_level not null,
  inner_weather text not null,
  creative_readiness boolean default false,
  creative_seed text,
  arc_texture arc_type
);
alter table check_ins enable row level security;
create policy "Users can only access their own check_ins"
  on check_ins for all using (auth.uid() = user_id);

-- Table 2: drought_observations
create table drought_observations (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamptz default now(),
  observation text not null,
  pattern_type pattern_type not null,
  confirmed_by_user boolean default false,
  user_response text,
  action_taken action_taken default 'none'
);
alter table drought_observations enable row level security;
create policy "Users can only access their own drought_observations"
  on drought_observations for all using (auth.uid() = user_id);

-- Table 3: captures
create table captures (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamptz default now(),
  raw_input text not null,
  unpacked text,
  arc arc_type,
  thematic_territory thematic_territory,
  status capture_status default 'captured'
);
alter table captures enable row level security;
create policy "Users can only access their own captures"
  on captures for all using (auth.uid() = user_id);

-- Table 4: ideas
create table ideas (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamptz default now(),
  capture_id uuid references captures(id) on delete set null,
  title text not null,
  one_sentence text not null,
  arc arc_type,
  thematic_territory thematic_territory,
  is_project boolean default false,
  status idea_status default 'developing',
  conceptualisation_log jsonb
);
alter table ideas enable row level security;
create policy "Users can only access their own ideas"
  on ideas for all using (auth.uid() = user_id);

-- Table 5: projects
create table projects (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamptz default now(),
  idea_id uuid references ideas(id) on delete set null,
  title text not null,
  vision text,
  status project_status default 'active',
  piece_count integer default 0
);
alter table projects enable row level security;
create policy "Users can only access their own projects"
  on projects for all using (auth.uid() = user_id);

-- Table 6: pieces
create table pieces (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamptz default now(),
  idea_id uuid references ideas(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  title text not null,
  arc arc_type,
  thematic_territory thematic_territory,
  format piece_format not null,
  stage piece_stage default 'conceptualising',
  conviction_statement text,
  emotional_journey text,
  core_truth text,
  substack_goals text,
  short_form_goals text,
  open_threads text[],
  substack_draft text,
  short_form_script text,
  next_action text,
  posted_at timestamptz
);
alter table pieces enable row level security;
create policy "Users can only access their own pieces"
  on pieces for all using (auth.uid() = user_id);

-- Table 7: session_logs
create table session_logs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamptz default now(),
  piece_id uuid references pieces(id) on delete cascade not null,
  what_was_done text not null,
  next_step text not null,
  duration_minutes integer
);
alter table session_logs enable row level security;
create policy "Users can only access their own session_logs"
  on session_logs for all using (auth.uid() = user_id);

-- Table 8: post_publication_logs
create table post_publication_logs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamptz default now(),
  piece_id uuid references pieces(id) on delete cascade not null,
  thread text,
  what_it_opened text,
  unresolved text,
  natural_continuations text[]
);
alter table post_publication_logs enable row level security;
create policy "Users can only access their own post_publication_logs"
  on post_publication_logs for all using (auth.uid() = user_id);

-- Table 9: re_ignition_library
create table re_ignition_library (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamptz default now(),
  type library_type not null,
  title text not null,
  content text,
  notes text
);
alter table re_ignition_library enable row level security;
create policy "Users can only access their own re_ignition_library"
  on re_ignition_library for all using (auth.uid() = user_id);
