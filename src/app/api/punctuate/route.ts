import { NextResponse } from 'next/server'
import { anthropic } from '@/lib/anthropic'
import { requireUser } from '@/lib/supabase/route'
import { MODELS } from '@/lib/models'
import { withLanguage } from '@/lib/language'
import { logUsage } from '@/lib/usage-log'

export async function POST(request: Request) {
  try {
    const auth = await requireUser()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { text, context, final } = await request.json()
    if (!text?.trim()) return NextResponse.json({ error: 'text is required' }, { status: 400 })
    // Dictation sends `final: false` while the person is still talking and
    // `true` once they've stopped. Older callers send neither: treat that as
    // a finished thought, which is what they always got.
    const stillTalking = final === false

    const response = await anthropic.messages.create({
      model: MODELS.fast,
      // Punctuation adds little to the length, so the reply is about the size
      // of the input; leave headroom for long unbroken rambles.
      max_tokens: Math.min(4096, 128 + Math.ceil(text.length / 2)),
      system: withLanguage(`You punctuate dictated speech. The transcript comes from speech recognition and has no reliable punctuation or capitalisation.

The speaker is thinking out loud. They pause often — between sentences, but just as often in the middle of a sentence or a phrase, while they find the next word. The transcript doesn't show where they paused, and a pause is never a reason to end a sentence. Decide sentence boundaries from grammar and meaning alone: one thought is one sentence, even when it runs long. Use commas, em dashes and ellipses for the way spoken thought turns, doubles back and trails off, and full stops only where a thought is actually complete.

STRICT RULES:
- Every word in the input must appear in the output, unchanged, in the same order
- You may not add, remove, reorder, correct or rephrase any word — not even filler words, repetitions or false starts
- You may only insert punctuation and fix capitalisation: capitalise the start of a sentence, the word "I" and proper nouns; lowercase words capitalised for no reason
- Never join two words or split one: put spaces around an em dash ("this — that"), never hyphenate words the speaker said separately
- You may not add quotation marks unless the speaker is clearly quoting
- When previous text is given, the transcript continues it. If the previous text ends mid-sentence, carry that sentence on: don't capitalise the first word (unless it is "I" or a proper noun)
${stillTalking
  ? '- The speaker is still talking, so the transcript may stop partway through a sentence. If the last sentence is unfinished, leave it without closing punctuation'
  : '- This is the end of what they said: close the last sentence'}
- Return ONLY the punctuated transcript — no tags, no preamble, no explanation`),
      messages: [
        {
          role: 'user',
          content: context?.trim()
            ? `<previous_text>${context}</previous_text>\n\n<transcript>${text}</transcript>`
            : `<transcript>${text}</transcript>`,
        },
      ],
    })

    logUsage(auth.user.id, 'punctuate', response.model, response.usage)

    const result =
      response.content[0].type === 'text'
        ? response.content[0].text.replace(/^\s*<transcript>|<\/transcript>\s*$/g, '').trim()
        : text

    // Return both keys so old callers (check-in, post-publication) and the
    // new hook (which reads `text`) both work without a separate migration.
    // The caller checks the words came back unchanged before using this.
    return NextResponse.json({ text: result, punctuated: result })
  } catch (err) {
    console.error('punctuate error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
