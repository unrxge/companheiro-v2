import type { Metadata } from 'next'
import { LegalPage, H2, UL, A, Email } from '@/components/legal/legal-page'

export const metadata: Metadata = {
  title: 'Refunds & Cancellation',
  description: 'How to cancel a Companheiro plan, your 14-day right to cancel, and when you get your money back.',
  alternates: { canonical: '/refunds' },
}

export default function RefundsPage() {
  return (
    <LegalPage title="Refunds & Cancellation" current="/refunds">
      <p>
        You should only pay for Companheiro if it is useful to you. That is why the first 30 days are free and need no card, and why cancelling is as easy as
        subscribing.
      </p>

      <H2 id="cancel">Cancelling</H2>
      <UL>
        <li>
          Go to <strong>Settings → Manage billing → Cancel</strong>. It takes a moment and you don&rsquo;t need to contact anyone.
        </li>
        <li>Your plan stays active until the end of the period you&rsquo;ve paid for, then doesn&rsquo;t renew. You won&rsquo;t be charged again.</li>
        <li>
          Your work is never deleted because a plan ends. You can still read, edit and export it; only the AI companion stops until you subscribe again.
        </li>
        <li>You can also manage or cancel the subscription from the Stripe Link receipt emails, or by contacting Stripe or us.</li>
      </UL>

      <H2 id="right-to-cancel">Your 14-day right to cancel</H2>
      <p>
        If you are a consumer in the UK or EU, you have a legal right to cancel a new subscription within 14 days of paying for it. We go a little further:
      </p>
      <UL>
        <li>
          <strong>First payment on any plan:</strong> if you cancel within 14 days, you get a <strong>full refund</strong>, whatever you used in that time.
        </li>
        <li>
          <strong>Yearly renewals:</strong> if you cancel within 14 days of a yearly renewal, you get a full refund of that renewal.
        </li>
        <li>
          <strong>Monthly renewals:</strong> not refunded, but you can cancel at any time and won&rsquo;t be charged again.
        </li>
      </UL>
      <p>
        To use this, cancel in Settings and write to <Email /> within the 14 days saying you&rsquo;d like the refund (a simple sentence is enough; you can also
        use the model cancellation form below). Refunds go back to the original payment method within 14 days of your request.
      </p>

      <H2 id="other">Other refunds</H2>
      <UL>
        <li>If you were charged by mistake, or charged twice, we refund it in full.</li>
        <li>
          If the service fails to work as described and we can&rsquo;t fix it within a reasonable time, you are entitled to a remedy, which may be a full or
          partial refund. This doesn&rsquo;t affect your statutory rights.
        </li>
        <li>
          If we reduce what your plan includes, or close the service, you can cancel and receive a pro-rata refund for the unused part of your period (see
          our <A href="/terms#ours">Terms</A>).
        </li>
      </UL>

      <H2 id="stripe">Who processes refunds</H2>
      <p>
        Subscriptions are sold through Stripe Managed Payments, with Stripe acting as the reseller. Refunds are issued through Stripe to your original payment
        method, and Stripe may also handle a refund request directly under its own buyer terms. Either way, you don&rsquo;t lose any of the rights above.
      </p>

      <H2 id="form">Model cancellation form</H2>
      <p>You don&rsquo;t have to use this, but you can copy it into an email:</p>
      <blockquote className="border-l-2 border-[var(--line)] pl-4 text-[var(--muted)]">
        To Companheiro: I hereby give notice that I cancel my contract for the supply of the following service: Companheiro subscription (plan: ____), paid
        for on ____. Name: ____. Email address of the account: ____. Date: ____.
      </blockquote>
    </LegalPage>
  )
}
