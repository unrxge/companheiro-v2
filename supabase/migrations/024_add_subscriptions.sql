-- Billing state, synced only from Stripe webhooks. Trial is tracked here
-- entirely on our side (trial_ends_at) — Stripe is never involved until
-- someone actually checks out, so the free 30 days cost nothing.
create table if not exists subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  status text not null default 'trialing'
    check (status in ('trialing', 'active', 'past_due', 'canceled', 'grandfathered')),
  tier text check (tier in ('practice', 'direction')),
  trial_ends_at timestamptz,
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table subscriptions enable row level security;

create policy "select own subscription" on subscriptions
  for select using (auth.uid() = user_id);

-- Every write to this table comes from the webhook or checkout routes,
-- both running with the service-role key, so there is no insert/update
-- policy for the user's own session — only the RLS-bypassing admin client
-- may write here.

create index if not exists subscriptions_stripe_customer_id_idx
  on subscriptions (stripe_customer_id);

-- Give every account that existed before billing shipped permanent free
-- access, so this migration can't lock out early users/testers.
insert into subscriptions (user_id, status, trial_ends_at)
select id, 'grandfathered', null from auth.users
on conflict (user_id) do nothing;

-- Every account created from here on starts a 30-day trial automatically,
-- regardless of which auth flow creates the auth.users row.
create or replace function handle_new_user_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into subscriptions (user_id, status, trial_ends_at)
  values (new.id, 'trialing', now() + interval '30 days')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_subscription on auth.users;
create trigger on_auth_user_created_subscription
  after insert on auth.users
  for each row execute function handle_new_user_subscription();
