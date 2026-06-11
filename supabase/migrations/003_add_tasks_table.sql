-- Add task type and status enums
create type task_type as enum ('creation', 'execution');
create type task_status as enum ('pending', 'complete');

-- Table: tasks
create table tasks (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  piece_id uuid references pieces(id) on delete cascade not null,
  title text not null,
  type task_type not null,
  status task_status default 'pending',
  "order" integer not null default 0,
  created_at timestamptz default now()
);

alter table tasks enable row level security;
create policy "Users can only access their own tasks"
  on tasks for all using (auth.uid() = user_id);
