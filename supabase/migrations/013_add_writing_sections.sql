-- The sectioned Writing Studio. During drafting, a piece's prose lives as
-- ordered, individually-lockable sections derived from its emotional journey.
-- pieces.substack_draft is kept in sync as the flattened concatenation so all
-- existing consumers (translate, chat, word count, Test) stay section-unaware.

create table piece_sections (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  piece_id uuid references pieces(id) on delete cascade not null,
  position integer not null default 0,
  label text,
  intended_emotion text,
  content text default '',
  is_locked boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table piece_sections enable row level security;
create policy "Users can only access their own piece_sections"
  on piece_sections for all using (auth.uid() = user_id);
create index piece_sections_piece_idx on piece_sections (piece_id, position);

-- Anchor lines: precious one-liners added mid-writing, optionally attached to
-- a section (AI places them). section_id nulls out if the section is deleted.
create table anchor_lines (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  piece_id uuid references pieces(id) on delete cascade not null,
  section_id uuid references piece_sections(id) on delete set null,
  text text not null,
  created_at timestamptz default now()
);
alter table anchor_lines enable row level security;
create policy "Users can only access their own anchor_lines"
  on anchor_lines for all using (auth.uid() = user_id);
create index anchor_lines_piece_idx on anchor_lines (piece_id);

-- Gather: the ethos/bullets the writer arrives with, seeded from Core Concept.
alter table pieces add column writing_ethos text;
