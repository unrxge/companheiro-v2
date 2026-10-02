import type { Metadata } from 'next'
import { LegalPage, H2, UL, A, Email, Identity } from '@/components/legal/legal-page'
import { CRISIS_DIRECTORY_URL } from '@/lib/crisis-resources'

export const metadata: Metadata = {
  title: 'Terms and Conditions',
  description: 'The agreement between you and Companheiro: what the service is, what it is not, plans, payment, your work and your rights.',
  alternates: { canonical: '/terms' },
}

export default function TermsPage() {
  return (
    <LegalPage title="Terms and Conditions" current="/terms">
      <p>
        These terms are the agreement between you and the person or business behind Companheiro (&ldquo;we&rdquo;, &ldquo;us&rdquo;), named below. By
        creating an account or signing in, whether with email or Google, you agree to them and to our{' '}
        <A href="/privacy">Privacy Policy</A>. If you are a consumer, nothing here takes away rights the law of your country gives you.
      </p>
      <Identity />

      <H2 id="service">1. What Companheiro is</H2>
      <p>
        Companheiro is an online tool for creative work and reflection: you bring notes, drafts, check-ins and ideas, and an AI companion helps you see,
        hold and develop them. The companion is an AI system (a large language model), not a person. Its replies are generated automatically and can be
        wrong, incomplete or not what you meant. Use your own judgement about anything it says.
      </p>

      <H2 id="not-therapy">2. What it is not</H2>
      <p>
        Companheiro is <strong>not therapy, counselling, medical care or a crisis service</strong>, and nothing in it is professional, medical,
        psychological, legal or financial advice. It cannot assess or monitor your wellbeing and nobody watches your entries. If you are in distress or in
        danger, contact your local emergency number, someone you trust, or a helpline via <A href={CRISIS_DIRECTORY_URL}>findahelpline.com</A>.
      </p>

      <H2 id="wellbeing">3. Information about how you are</H2>
      <p>
        Check-ins, conversations and reflections often include how you are feeling, and can include information about your mental or physical health.
        By using Companheiro you agree that we process this, together with everything else you write, to provide the companion to you: it is stored in your
        account and sent to our AI provider to generate replies, as set out in the <A href="/privacy#sensitive">Privacy Policy</A>. It is never used for
        anything else, never sold and never used to train AI models. You can delete any entry, or your whole account, at any time, which withdraws that
        agreement for what you delete. If you don&rsquo;t want information about your health processed this way, please don&rsquo;t include it.
      </p>

      <H2 id="account">4. Your account</H2>
      <UL>
        <li>You must be 18 or over. By creating an account you confirm that you are.</li>
        <li>You sign in with your email address and a password, or with your Google account.</li>
        <li>One account per person. Keep your password to yourself; you are responsible for what happens under your account.</li>
        <li>Give a real email address you can receive mail at. We use it for sign-in, security and important notices about your account.</li>
      </UL>

      <H2 id="plans">5. Free trial, plans and payment</H2>
      <UL>
        <li>
          New accounts get a 30-day free trial of the companion, with everything the Direction plan includes. No payment card is needed and nothing is
          charged automatically when it ends. One free trial per person and email address.
        </li>
        <li>
          You can instead choose a paid plan straight away from our pricing section. Your plan then starts at once, in place of the free trial.
        </li>
        <li>
          After the trial you can choose a paid plan: Practice or Direction, billed monthly or yearly. The current prices and what each plan includes are
          shown on our <A href="/#pricing">pricing section</A> and at checkout; the price you see at checkout is the price you pay.
        </li>
        <li>
          <strong>Practice carries one active project at a time.</strong> Your other projects wait in your Queue, where you can read and export them.
          Switching to another project sends the one you leave to rest for 14 days before it can be made active again. New threads, images and
          recordings on a project&rsquo;s canvas, and the conversation about a whole project from its canvas, are part of Direction.
        </li>
        <li>
          If you move from Direction or the free trial to Practice, or your trial or plan ends, <strong>nothing is deleted</strong>. You choose which
          project stays active; the others wait in your Queue. Threads, images and recordings you already made stay where they are, though new ones
          cannot be added.
        </li>
        <li>
          Subscriptions are sold by <strong>Stripe</strong>, which acts as the reseller (merchant of record) through Stripe Managed Payments. Stripe takes
          payment, charges any applicable tax, issues receipts, and its buyer terms apply to the payment itself.
        </li>
        <li>
          <strong>Your subscription renews automatically</strong> at the end of each monthly or yearly period until you cancel. You can cancel at any time
          from Settings → Manage billing; the plan then stays active until the end of the period you have paid for and does not renew.
        </li>
        <li>
          If we ever change the price of your plan, we will tell you at least 30 days before it applies to you, and you can cancel before then.
        </li>
        <li>
          Cancellation, refunds and your statutory right to cancel are explained in our <A href="/refunds">Refunds &amp; cancellation policy</A>.
        </li>
      </UL>

      <H2 id="fair-use">6. Fair use</H2>
      <p>
        Every plan includes generous use of the companion for one person&rsquo;s own creative work. Because each reply has a real cost, plans have monthly
        fair-use limits. We let you know as you approach the limit; if you reach it, the companion pauses until your next billing period. <strong>Your own work is never locked</strong>: you can always read and export all of it, and keep writing in any project your plan lets you work on. Automated or scripted use, reselling
        access, or sharing an account is not fair use.
      </p>

      <H2 id="your-work">7. Your work stays yours</H2>
      <UL>
        <li>You keep all rights in everything you write, upload or make with Companheiro.</li>
        <li>
          You give us only the permission we need to run the service for you: to store your content, show it to you, and send it to our AI provider to
          generate the companion&rsquo;s replies. This permission ends when you delete the content or your account.
        </li>
        <li>We do not publish your content, share it with other users, or use it to train AI models.</li>
        <li>
          Text the companion suggests is yours to use as you like, but it is generated by AI and may resemble existing text. You are responsible for checking
          anything you publish.
        </li>
        <li>You can export everything at any time from Settings.</li>
      </UL>

      <H2 id="acceptable-use">8. Acceptable use</H2>
      <p>Please don&rsquo;t use Companheiro to:</p>
      <UL>
        <li>upload material you don&rsquo;t have the right to use, or that infringes someone else&rsquo;s copyright or privacy;</li>
        <li>store illegal content, including any sexual content involving minors;</li>
        <li>try to break, overload, probe or get around the security, limits or billing of the service;</li>
        <li>scrape, copy or resell the service, or use it to build a competing product;</li>
        <li>try to make the AI produce content that is illegal or intended to harm others.</li>
      </UL>
      <p>
        If you break these rules we may suspend or close your account. Except in serious cases, we will tell you first and give you a chance to export your
        work.
      </p>

      <H2 id="ours">9. Our part</H2>
      <p>
        The Companheiro software, design, name and logo belong to us. We will provide the service with reasonable care and skill. We aim to keep it available
        but cannot promise it will never be interrupted, and we may change or improve features over time. If we make a change that significantly reduces what
        your paid plan includes, we will tell you in advance and you may cancel and receive a pro-rata refund for the unused part of your period.
      </p>
      <p>
        We back up the database, but please keep your own copies of work that matters to you (Settings → Export).
      </p>

      <H2 id="liability">10. Liability</H2>
      <UL>
        <li>
          Nothing in these terms limits liability for death or personal injury caused by negligence, for fraud, or anything else that cannot be limited by
          law, and nothing affects your statutory rights as a consumer.
        </li>
        <li>
          We are responsible for loss you suffer that is a foreseeable result of our breaking these terms or failing to use reasonable care. We are not
          responsible for loss that was not foreseeable, for business losses (Companheiro is provided for personal use), or for decisions you make based on
          what the AI companion says.
        </li>
        <li>
          If you use Companheiro for business purposes, our total liability to you is limited to the amount you paid us in the 12 months before the claim.
        </li>
      </UL>

      <H2 id="ending">11. Ending the agreement</H2>
      <p>
        You can stop at any time by cancelling your plan and, if you want, deleting your account in Settings. We may end the service for everyone with at
        least 60 days&rsquo; notice, in which case you can export your work and will be refunded any amount paid for the period after it ends.
      </p>

      <H2 id="law">12. Law and disputes</H2>
      <p>
        These terms are governed by the law of England and Wales. If you are a consumer, you also keep the protection of the mandatory laws of the country
        where you live, and you can bring a claim in the courts there. If something goes wrong, please write to us first at <Email /> — we will try to put it
        right.
      </p>

      <H2 id="changes">13. Changes to these terms</H2>
      <p>
        We will give you at least 30 days&rsquo; notice by email or in the app before a change that affects you materially. If you don&rsquo;t agree, you can
        cancel before it takes effect.
      </p>
    </LegalPage>
  )
}
