-- Sign-up no longer waits on a confirmation email: a new account goes
-- straight in, and the email is confirmed in the background. Until it is,
-- the free month's companion allowance is a small one (lib/billing/fair-use.ts).
-- This column is when the address was shown to be theirs; null is "not yet".
-- Written only by the service role (/api/auth/verify-email, /api/auth/callback).
alter table subscriptions add column if not exists email_verified_at timestamptz;

-- Everyone who already has an account got in through an emailed link or
-- Google, so their address is already proven.
update subscriptions set email_verified_at = now() where email_verified_at is null;
