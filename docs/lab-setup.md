# Setting up the lab

The code side is done. These are the parts only you can do, because they live in
your Supabase, Vercel and Stripe accounts. About 30 minutes. Menu names may differ
slightly from what is written here; the destination is what matters.

The lab's address will be:

    https://companheiro-v2-git-lab-frgzbc6fhd-1706s-projects.vercel.app

It sits behind your Vercel sign-in, so only you can open it.

---

## 1. Supabase: create the lab database

1. supabase.com → **New project**. Name it `companheiro-lab`. Region: **West EU (Ireland)**,
   the same as the live one. Choose any database password and keep it somewhere.
2. When it is ready, open **SQL Editor** → **New query**.
3. Open the file `supabase/lab-schema.sql` in this folder, select all, copy, paste into the
   editor, press **Run**. It is long (about 2,800 lines) and takes a few seconds.
   It should end with **Success**. If it shows an error instead, stop and send me the message.
4. **Authentication → URL Configuration**:
   - Site URL: the lab address above
   - Redirect URLs → Add: the lab address above followed by `/**`
5. **Authentication → Sign In / Providers → Email**: open the same screen in the live
   project in another tab and set the lab's switches the same way.
6. **Project Settings → API**. Three values are needed from this page:
   Project URL, the `anon` key, and the `service_role` key.

Then open the file `.env.lab` in this folder and paste the **Project URL** and the
**service_role key** after the two `=` signs. Save.

---

## 2. Vercel: give the lab its own values

Vercel → the **companheiro-v2** project → **Settings → Environment Variables**.

Each of the variables below needs **two entries**: the one that exists today, limited to
**Production**, and a new one for **Preview** holding the lab's value.

For each: open the existing entry → Edit → untick **Preview** (leave Production ticked) → Save.
Then **Add New** with the same name, the lab value, and only **Preview** ticked.

| Name | Lab value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | lab Project URL (step 1.6) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | lab `anon` key |
| `SUPABASE_SERVICE_ROLE_KEY` | lab `service_role` key |
| `STRIPE_SECRET_KEY` | Stripe **test mode** secret key (starts `sk_test_`) |
| `STRIPE_PRICE_PRACTICE_MONTHLY` | test-mode price id |
| `STRIPE_PRICE_PRACTICE_YEARLY` | test-mode price id |
| `STRIPE_PRICE_DIRECTION_MONTHLY` | test-mode price id |
| `STRIPE_PRICE_DIRECTION_YEARLY` | test-mode price id |
| `STRIPE_WEBHOOK_SECRET` | from step 3 below |

The Stripe test-mode key and the four price ids are the ones already in `.env.local` on
this machine.

Everything else (Anthropic, OpenAI, Resend, the legal details) can stay as it is.

---

## 3. Stripe: a test webhook for the lab

1. Vercel → **Settings → Deployment Protection → Protection Bypass for Automation** →
   create a secret and copy it. (Stripe cannot sign in to Vercel, so it needs this to get through.)
2. Stripe, in **test mode** → **Developers → Webhooks → Add endpoint**. The URL is the lab
   address, then `/api/billing/webhook?x-vercel-protection-bypass=`, then the secret from 3.1:

       https://companheiro-v2-git-lab-frgzbc6fhd-1706s-projects.vercel.app/api/billing/webhook?x-vercel-protection-bypass=PASTE_SECRET_HERE

3. Events to send: `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `invoice.payment_failed`.
4. Copy the endpoint's **Signing secret** (starts `whsec_`) into Vercel as the Preview value
   of `STRIPE_WEBHOOK_SECRET` (step 2).

This step can wait if you only want to try the lab without paying inside it.

---

## 4. Tell me

Say it is done. I will rebuild the lab, check it comes up on its own database, compare the two
databases, and from then on new work goes to the lab first.

---

## Good to know

- **The lab starts empty.** You sign up in it like a new person. Nothing from your real account is there.
- **A red "failed" deployment for the `lab` branch before step 2 is done is the safety check
  working**: the lab refuses to build while it is pointed at the live database.
- **A free Supabase project pauses after about a week unused.** If the lab stops answering,
  open it in Supabase and press Restore.
- **To see `/admin` in the lab**, your lab account's id has to be the Preview value of
  `ADMIN_USER_IDS`. I can find it for you once you have signed up there.
