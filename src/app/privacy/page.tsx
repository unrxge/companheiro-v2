import type { Metadata } from 'next'
import { LegalPage, H2, H3, UL, A, Email, Identity } from '@/components/legal/legal-page'
import { LEGAL } from '@/lib/legal'
import { CRISIS_DIRECTORY_URL } from '@/lib/crisis-resources'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'What Companheiro collects, why, who processes it, how long it is kept, and your rights.',
  alternates: { canonical: '/privacy' },
}

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" current="/privacy">
      <p>
        Companheiro is a place for private creative work and reflection. What you write here can be personal, so this policy tries to be plain about exactly
        what happens to it. The short version: we collect what the app needs to work, we never sell it, we never use it for advertising, and nothing you write
        is used to train AI models.
      </p>

      <H2 id="who">Who is responsible for your data</H2>
      <p>The data controller is the operator of Companheiro:</p>
      <Identity />
      <p>
        Contact for anything privacy-related: <Email />.
        {LEGAL.icoNumber && <> Registered with the UK Information Commissioner&rsquo;s Office, registration number {LEGAL.icoNumber}.</>}
      </p>

      <H2 id="what">What we collect</H2>
      <H3>Account details</H3>
      <UL>
        <li>Your email address and a password (stored only as a one-way hash by our authentication provider; we never see it).</li>
        <li>
          If you sign in with Google, the email address (and, if Google shares it, your name) that Google passes to us. We never receive your Google
          password.
        </li>
        <li>Settings you choose, such as theme, dictation language and whether the weekly letter is on.</li>
        <li>Which version of our Terms and this policy you agreed to when you created your account, and when.</li>
        <li>
          Optionally, how you heard about us, and any campaign tag in the link you arrived from (for example <code>utm_source</code>). This is carried in
          the page address, not in a cookie.
        </li>
      </UL>
      <H3>What you create</H3>
      <UL>
        <li>Check-ins, captures, ideas, projects, drafts, notes, tasks, reflections and conversations with the companion.</li>
        <li>Images and recordings you add to a project. These are stored for you; the AI never sees the files, only any text you write about them.</li>
        <li>Links you save. Our server fetches a short preview of the linked page (title, description, thumbnail) so the companion can understand it.</li>
      </UL>
      <H3>What the app works out from it</H3>
      <p>
        To respond well, the app derives signals from what you write: for example your energy, the &ldquo;weather&rdquo; of a check-in, recurring
        themes, and patterns it notices over time (your Portrait). This is a kind of profiling. It exists only to shape how the companion talks to you. It is
        never used to make decisions with legal or similarly significant effects on you, never shared, and you can see and delete it.
      </p>
      <H3 id="sensitive">Information about your wellbeing</H3>
      <p>
        Check-ins and reflections can reveal how you are feeling, and sometimes things about your mental or physical health. The law treats this as
        special-category data. We process it on the basis of your consent, which you give when you create your account and agree to our{' '}
        <A href="/terms#wellbeing">Terms</A>, and only to provide the companion to you. You can withdraw that consent at any time by deleting the entries
        concerned or your whole account, or simply by not writing about your health. Companheiro is not a medical or therapeutic
        service (see <A href="/terms#not-therapy">our Terms</A>).
      </p>
      <H3>Billing and usage</H3>
      <UL>
        <li>Your plan, trial dates and subscription status, and the Stripe customer reference that links your account to your payments.</li>
        <li>
          How much AI processing your account uses (model, size of the request in characters and tokens, cost, time taken). We record the size and shape of
          requests, not their content. This is how we keep prices fair and enforce fair-use limits.
        </li>
        <li>
          A one-way hash of your email address, to stop the free month being claimed more than once. It cannot be turned back into your address, and it is
          kept after an account is deleted for that reason only.
        </li>
      </UL>
      <H3>Technical data</H3>
      <p>
        Our hosting provider records standard server logs (IP address, browser type, the page requested, time, errors) to keep the service running and
        secure. We run no analytics, advertising or tracking scripts.
      </p>

      <H2 id="why">Why we use it, and our legal basis</H2>
      <UL>
        <li>
          <strong>To provide the service you signed up for</strong> (contract): storing your work, running the companion, sending account emails such as
          sign-in links.
        </li>
        <li>
          <strong>To process information about your wellbeing</strong> (your consent, UK/EU GDPR article 9(2)(a)), given when you create your account.
        </li>
        <li>
          <strong>To keep the service secure, fair and affordable</strong> (legitimate interests): preventing abuse and repeated free trials, fair-use limits,
          fixing faults, understanding which channels bring people here.
        </li>
        <li>
          <strong>To meet legal obligations</strong>: for example keeping records, or responding to a lawful request.
        </li>
      </UL>
      <p>We do not sell your data, share it for advertising, or use it to train AI models.</p>

      <H2 id="processors">Who processes it for us</H2>
      <p>We use a small number of service providers. Each only processes your data on our instructions, under a data processing agreement.</p>
      <UL>
        <li>
          <strong>Supabase</strong> — database, sign-in and file storage.
        </li>
        <li>
          <strong>Vercel</strong> — hosting and running the app.
        </li>
        <li>
          <strong>Anthropic</strong> — the AI model (Claude) that reads what you write in a conversation or check-in and writes the companion&rsquo;s
          replies. Under Anthropic&rsquo;s commercial terms, API inputs and outputs are not used to train its models and are kept only for a limited period
          for safety and abuse monitoring.
        </li>
        <li>
          <strong>Resend</strong> — delivers operational alerts to us (for example a failed payment sync), which can include your account reference.
          Sign-in emails to you are sent by Supabase.
        </li>
      </UL>
      <H3>Sign in with Google</H3>
      <p>
        If you choose to, Google confirms who you are and passes us your email address. Google acts as an independent controller under{' '}
        <A href="https://policies.google.com/privacy">its own privacy policy</A> and learns that you signed in to Companheiro. We share nothing else with them.
      </p>
      <H3>Payments</H3>
      <p>
        Subscriptions are sold through <strong>Stripe Managed Payments</strong>. Stripe acts as the reseller (merchant of record): it takes your payment
        details, handles tax and receipts, and is an independent controller of that information under{' '}
        <A href="https://stripe.com/privacy">Stripe&rsquo;s privacy policy</A>. We never see or store your card number.
      </p>
      <H3>Voice dictation</H3>
      <p>
        When you use the microphone, speech is turned into text by your browser&rsquo;s built-in speech recognition, not by us. Depending on your browser this
        may be done on your device or by the browser maker (for example Google in Chrome, Apple in Safari) under their own privacy terms. We only receive the
        resulting text, and never store audio. If you prefer, you can always type instead.
      </p>
      <H3>Link previews</H3>
      <p>
        When you save a link, our server (not your browser) requests the page, and for some platforms their public preview service (YouTube, Vimeo, TikTok,
        X). Those sites see a request from our server, not from you.
      </p>

      <H2 id="transfers">International transfers</H2>
      <p>
        Some providers above are based in, or use infrastructure in, the United States. Where data leaves the UK or European Economic Area, it is protected by
        the safeguards the law requires: an adequacy decision (including the UK Extension to the EU–US Data Privacy Framework, where the provider is
        certified) or the standard contractual clauses and UK International Data Transfer Addendum.
      </p>

      <H2 id="retention">How long we keep it</H2>
      <UL>
        <li>Your account and everything you create: until you delete it, or delete your account.</li>
        <li>
          When you delete your account, your data is removed from the live database and file storage straight away. Encrypted backups expire on a rolling
          schedule, normally within 30 days.
        </li>
        <li>
          AI usage and billing event records are kept for accounting and fraud prevention, with the link to your account removed when you delete it.
        </li>
        <li>The email hash described above is kept to prevent repeat trials.</li>
        <li>Stripe keeps payment and tax records for as long as the law requires it to.</li>
        <li>Server logs are kept for a short period by our hosting provider, normally no more than 30 days.</li>
      </UL>

      <H2 id="rights">Your rights</H2>
      <p>You can, at any time and for free:</p>
      <UL>
        <li>
          <strong>Get a copy</strong> of your data: Settings → Your data → Export gives you everything as one file.
        </li>
        <li>
          <strong>Delete</strong> your account and everything in it: Settings → Delete account.
        </li>
        <li>
          <strong>Correct</strong> anything, by editing it in the app or asking us.
        </li>
        <li>
          <strong>Withdraw consent</strong>, object to processing based on legitimate interests, or ask us to restrict processing.
        </li>
        <li>
          <strong>Complain</strong> to a data protection authority. In the UK that is the{' '}
          <A href="https://ico.org.uk/make-a-complaint/">Information Commissioner&rsquo;s Office</A>; in the EU, the authority in your country (in Portugal,
          the <A href="https://www.cnpd.pt">CNPD</A>). We would appreciate the chance to put things right first: <Email />.
        </li>
      </UL>
      <p>We reply to requests within one month.</p>

      <H2 id="age">Age</H2>
      <p>Companheiro is for adults. You must be 18 or over to create an account, and we do not knowingly collect data from anyone younger.</p>

      <H2 id="security">Security</H2>
      <p>
        Data is encrypted in transit and at rest. Every row in the database is locked to its owner by row-level security, so one account cannot read
        another&rsquo;s. Uploaded files are private and only reachable through short-lived signed links. No system is perfectly secure; if a breach ever
        affects you, we will tell you and the regulator as the law requires.
      </p>

      <H2 id="crisis">If you are struggling</H2>
      <p>
        If something you write suggests you may be in danger, the companion may point you to people who can help, such as{' '}
        <A href={CRISIS_DIRECTORY_URL}>findahelpline.com</A>. It does not contact anyone on your behalf.
      </p>

      <H2 id="changes">Changes</H2>
      <p>
        If we change this policy in a way that matters, we will tell you in the app or by email before the change takes effect. The date at the top shows the
        latest version.
      </p>
    </LegalPage>
  )
}
