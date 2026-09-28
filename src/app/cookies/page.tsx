import type { Metadata } from 'next'
import { LegalPage, H2, A } from '@/components/legal/legal-page'

export const metadata: Metadata = {
  title: 'Cookie Policy',
  description: 'The few cookies and browser storage Companheiro uses, all strictly necessary. No analytics, no advertising, no tracking.',
  alternates: { canonical: '/cookies' },
}

// Keep this table in step with the code: search the repo for `cookies()`,
// localStorage and sessionStorage when adding anything. A new non-essential
// cookie or tracker (analytics, ads, embeds that set cookies) would require a
// consent banner BEFORE it is set, under PECR reg 6 / ePrivacy art 5(3).
const ROWS: { name: string; kind: string; purpose: string; lasts: string }[] = [
  { name: 'sb-…-auth-token', kind: 'Cookie (first-party)', purpose: 'Keeps you signed in. Set by our sign-in provider, Supabase.', lasts: 'Until you sign out, refreshed while you use the app' },
  { name: 'companheiro-card-theme', kind: 'Local storage', purpose: 'Remembers the light or dark theme you picked.', lasts: 'Until you clear it' },
  { name: 'companheiro-dictation-lang', kind: 'Local storage', purpose: 'Remembers the language the microphone listens for.', lasts: 'Until you clear it' },
  { name: 'handover and draft keys', kind: 'Session storage', purpose: 'Carries what you just wrote from one step to the next (for example from a check-in into an idea).', lasts: 'Until you close the tab' },
  { name: 'companheiro:… notice keys', kind: 'Session storage', purpose: 'Stops the same notice showing twice in one visit.', lasts: 'Until you close the tab' },
]

export default function CookiesPage() {
  return (
    <LegalPage title="Cookie Policy" current="/cookies">
      <p>
        Companheiro uses <strong>no analytics, advertising or tracking cookies</strong>, and no third-party scripts that set them. Fonts are served from our
        own domain, and there are no embedded videos or social widgets.
      </p>
      <p>
        The only things we store in your browser are strictly necessary to sign you in or to remember a choice you made. The law (the UK Privacy and
        Electronic Communications Regulations and the EU ePrivacy Directive) does not require consent for these, which is why you don&rsquo;t see a cookie
        banner. It does require us to tell you about them:
      </p>

      <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <table className="w-full min-w-[560px] border-collapse text-left text-[14px] leading-relaxed">
          <caption className="sr-only">Cookies and browser storage used by Companheiro</caption>
          <thead>
            <tr className="border-b border-[var(--line)] text-[var(--muted)]">
              <th scope="col" className="py-2 pr-4 font-medium">Name</th>
              <th scope="col" className="py-2 pr-4 font-medium">Type</th>
              <th scope="col" className="py-2 pr-4 font-medium">Purpose</th>
              <th scope="col" className="py-2 font-medium">How long</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.name} className="border-b border-[var(--line)] align-top">
                <th scope="row" className="py-3 pr-4 font-medium">{r.name}</th>
                <td className="py-3 pr-4">{r.kind}</td>
                <td className="py-3 pr-4">{r.purpose}</td>
                <td className="py-3">{r.lasts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <H2 id="payments">Payments</H2>
      <p>
        When you choose a plan you are taken to Stripe&rsquo;s own checkout and billing pages. Stripe sets its own cookies there, for fraud prevention and to
        run the payment, under the <A href="https://stripe.com/cookie-settings">Stripe cookie policy</A>. Nothing from Stripe runs on Companheiro&rsquo;s pages.
      </p>

      <H2 id="control">Your control</H2>
      <p>
        You can clear or block cookies and site storage in your browser settings. Blocking the sign-in cookie will stop you staying signed in; clearing the
        others only resets your preferences.
      </p>
      <p>
        If we ever add anything that isn&rsquo;t strictly necessary, we will ask for your consent before setting it and update this page. See also our{' '}
        <A href="/privacy">Privacy Policy</A>.
      </p>
    </LegalPage>
  )
}
