-- Fair-use metering and one-free-month-per-address.
--
-- ai_usage: what each person's AI calls have cost us, per period. The period
-- is 'trial' for the whole free month, and 'YYYY-MM' (UTC) once subscribed,
-- so a paid budget resets on the 1st. Written only through add_ai_usage()
-- by the service role; people can read their own rows (the app shows them
-- how far into their allowance they are).
--
-- trial_claims: a sha256 of every normalised address that has ever started
-- a trial. Hashes, not addresses, and no link to the account, so it holds
-- nothing readable and survives account deletion — that survival is the
-- point: deleting an account and signing up again doesn't earn a new month.

create table if not exists ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  period text not null,
  cost_micros bigint not null default 0,
  calls integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, period)
);

alter table ai_usage enable row level security;

create policy "select own ai usage" on ai_usage
  for select using (auth.uid() = user_id);

create or replace function add_ai_usage(p_user_id uuid, p_period text, p_cost_micros bigint)
returns void
language sql
security definer
set search_path = public
as $$
  insert into ai_usage (user_id, period, cost_micros, calls)
  values (p_user_id, p_period, p_cost_micros, 1)
  on conflict (user_id, period) do update
    set cost_micros = ai_usage.cost_micros + excluded.cost_micros,
        calls = ai_usage.calls + 1,
        updated_at = now();
$$;

revoke execute on function add_ai_usage(uuid, text, bigint) from public, anon, authenticated;

create table if not exists trial_claims (
  email_hash text primary key,
  claimed_at timestamptz not null default now()
);

-- No policies: only the security-definer trigger below touches this table.
alter table trial_claims enable row level security;

-- Mirrors normaliseEmail() in src/lib/billing/email.ts — keep them in step.
-- Lowercase, drop any +tag, and for Gmail drop dots (Gmail ignores them, so
-- j.doe+x@gmail.com and jdoe@googlemail.com are the same inbox).
create or replace function normalized_email_hash(p_email text)
returns text
language plpgsql
immutable
set search_path = public, extensions
as $$
declare
  addr text := lower(trim(coalesce(p_email, '')));
  local_part text;
  domain_part text;
begin
  if position('@' in addr) = 0 then
    return null;
  end if;
  local_part := split_part(split_part(addr, '@', 1), '+', 1);
  domain_part := split_part(addr, '@', 2);
  if domain_part in ('gmail.com', 'googlemail.com') then
    local_part := replace(local_part, '.', '');
    domain_part := 'gmail.com';
  end if;
  return encode(extensions.digest(local_part || '@' || domain_part, 'sha256'), 'hex');
end;
$$;

-- Lets the expiry screen say "this address has already had its free month"
-- instead of implying the person used up a month they never had.
alter table subscriptions add column if not exists repeat_trial boolean not null default false;

-- Replaces the 024 version: a new account only gets 30 days if its
-- normalised address has never claimed a trial. Otherwise the account is
-- still created (nobody is turned away), it just starts with the trial
-- already over.
create or replace function handle_new_user_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  h text := normalized_email_hash(new.email);
  fresh boolean := true;
begin
  if h is not null then
    insert into trial_claims (email_hash) values (h) on conflict do nothing;
    fresh := found;
  end if;

  insert into subscriptions (user_id, status, trial_ends_at, repeat_trial)
  values (
    new.id,
    'trialing',
    case when fresh then now() + interval '30 days' else now() end,
    not fresh
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- Every address that already exists has had (or is having) its month.
insert into trial_claims (email_hash)
select normalized_email_hash(email) from auth.users where position('@' in coalesce(email, '')) > 0
on conflict do nothing;
