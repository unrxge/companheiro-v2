import type { Metadata } from 'next'
import { LegalPage, H2, UL, Email } from '@/components/legal/legal-page'

export const metadata: Metadata = {
  title: 'Accessibility',
  description: 'How Companheiro works towards WCAG 2.2 AA, what is known not to work yet, and how to tell us about a barrier.',
  alternates: { canonical: '/accessibility' },
}

export default function AccessibilityPage() {
  return (
    <LegalPage title="Accessibility" current="/accessibility">
      <p>
        Companheiro should be usable by everyone who wants to use it. We aim to meet the Web Content Accessibility Guidelines (WCAG) 2.2 at level AA. We
        haven&rsquo;t had an independent audit yet, so we describe this honestly as a goal we are working towards rather than a claim of full conformance.
      </p>

      <H2 id="what-works">What we have done</H2>
      <UL>
        <li>Text and controls meet AA colour contrast in both the light and dark themes.</li>
        <li>Every interactive control shows a visible focus outline when you navigate with a keyboard.</li>
        <li>Form fields have accessible names and error messages are announced to screen readers.</li>
        <li>You can zoom the page; pinch-zoom is never disabled.</li>
        <li>Animation is reduced or removed when your device asks for reduced motion.</li>
        <li>Anything you can say to the microphone, you can also type.</li>
        <li>Decorative images are hidden from screen readers; images that carry meaning have text alternatives.</li>
      </UL>

      <H2 id="known-issues">Known limitations</H2>
      <UL>
        <li>
          Arranging cards and threads on the project canvas needs a mouse, trackpad or touch. Moving them by keyboard is not yet supported; we are working
          on it.
        </li>
        <li>Some images and recordings you upload have no text alternative unless you add a caption.</li>
        <li>The app previews on the home page are illustrations with sample data; what they show is also described in the text beside them.</li>
      </UL>

      <H2 id="feedback">Tell us about a barrier</H2>
      <p>
        If something is hard or impossible to use, write to <Email />. Tell us the page and what happened, and we will reply within five working days and
        try to fix it or find another way to give you what you need.
      </p>
    </LegalPage>
  )
}
