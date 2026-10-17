// A one-person design studio two months into a client identity. Shown to people
// who said they take on client projects or work as creative directors.

import type { ExampleSource } from './types'

export const studio: ExampleSource = {
  key: 'studio',
  practices: ['client', 'director'],
  label: 'One-person studio',
  who: 'a one-person design studio, two months into a client’s identity',
  teaser: 'A brand for a sixty-year-old bakery opening its second shop. Round two with the client.',
  title: 'Aurélia Bakery: The Second Shop',
  intent:
    'A brand identity for Aurélia, a bakery that has fed the same street since 1964 and is now opening its first new shop in a generation, across the river, in a neighbourhood that has never queued for its bread. Teresa, the founder’s granddaughter, is taking over. The brand has to carry the trust of the old counter into a room that has none yet, and be something she can hand to her own children.',
  arc: 'Beginning',
  rules: [
    'Nothing that looks like a franchise.',
    'The old shop changes nothing. The new one learns from it.',
    'Every choice has to survive greaseproof paper and a warm loaf.',
  ],
  startedDaysAgo: 52,

  log: [
    { role: 'assistant', content: 'What has been taking up most of your thinking lately?' },
    { role: 'user', content: 'A client project. I run a one-person design studio and I’m doing the identity for a bakery my grandmother would have gone to. Sixty years, same street, same oven. The granddaughter, Teresa, is opening a second shop across the river and she’s terrified it’ll feel like a chain. Her father thinks it should look exactly like 1964. She wants it modern. I’m in the middle.' },
    { role: 'assistant', content: 'What is the thing in the old shop you’d be heartbroken to lose?' },
    { role: 'user', content: 'The handwriting. Dona Aurélia wrote every order in the same notebooks for forty years. The price boards are still in her hand. Nobody’s touched them.' },
    { role: 'assistant', content: 'Who walks into the new shop? Not a market segment. One person.' },
    { role: 'user', content: 'Someone who just moved to that neighbourhood, who doesn’t know the name, who’s paid eight euros for bad sourdough. They need to trust it before they’ve tasted it.' },
    { role: 'assistant', content: 'So the identity has to give a stranger sixty years of trust in the time it takes to read a sign. What can’t it do?' },
    { role: 'user', content: 'Pretend. It can’t fake old. No distressed textures, no invented “established” badges. The age has to be real or not there at all.' },
    { role: 'assistant', content: 'Then this is what I hear at the centre of it: the new shop should taste like her bread without looking like her shop. The trust travels in the hand, not the decor. Does that hold?' },
    { role: 'user', content: 'Yes. That’s the presentation. That’s literally the first slide.' },
  ],

  pieces: [
    {
      key: 'strategy',
      title: 'Strategy & voice',
      status: 'done',
      conviction: 'Trust travels in the hand, not in the decor.',
      truth: 'The new shop should taste like Aurélia’s bread without looking like Aurélia’s shop.',
      journey: [
        'Passing — a stranger crosses the street because the sign reads like a person wrote it.',
        'First loaf — the bag, the band, the paper: everything they touch was made with care, and nothing shouts.',
        'Recognition — on the second visit they are greeted the way the old street greets its regulars.',
        'Belonging — six months on, they ask for “an Aurélia” instead of “a loaf”, like the old street does.',
      ],
      parts: [
        {
          key: 'st-positioning', title: 'Positioning', beat: 'grounded',
          body: 'Aurélia is not a heritage brand. It is a bakery that happens to be sixty years old.\n\nWe don’t sell nostalgia. We sell the thing nostalgia is made of: the same loaf, made the same way, by people who know your name by the third visit.',
        },
        {
          key: 'st-voice', title: 'Voice', beat: 'tender',
          body: 'Speaks like the counter, not like a menu. Short. Warm. A little dry.\n\nYes: “Come early. The good ones go first.”\nNo: “Artisanal sourdough crafted with passion since 1964.”',
        },
        {
          key: 'st-never', title: 'What we’ll never do', beat: 'urgent',
          body: 'Fake age: no distressed textures, no invented badges.\nSay “artisanal”.\nPut the founder’s face on a bag.\nLet the second shop look like a copy of the first.',
        },
      ],
      tasks: [
        { title: 'Present the strategy to Teresa and Sr. Joaquim at the counter, not in an office', category: 'Client', done: true },
        { title: 'Invoice phase one (strategy)', category: 'Admin', done: true },
      ],
      fragments: [
        { text: 'Not new. Just more.', part: 'st-positioning' },
        { text: 'Bread for the street, since 1964.' },
      ],
    },
    {
      key: 'wordmark',
      title: 'Wordmark & monogram',
      status: 'drafted',
      conviction: 'The mark should look written by someone, never drawn by a system.',
      truth: 'A name written by hand is a promise that someone is still in the kitchen.',
      journey: [
        'Glance — from across the street, the word reads before the shop does.',
        'Hand — up close, the curve of the A is Aurélia’s own, from the 1971 order book.',
        'Age — nothing about it is old-fashioned; it simply looks as if it has always been there.',
      ],
      open: ['One colour, or two?'],
      parts: [
        {
          key: 'wm-round-1', title: 'Round 1: what we learned', beat: 'grounded',
          body: 'Showed five directions. Teresa loved the clean sans; her father said it looked like a bank. Both were right.\n\nWhat survived: the A from the 1971 order book. They both reached for it on the screen at the same time.',
        },
        {
          key: 'wm-round-2', title: 'Round 2: three options', beat: 'restless',
          body: 'Option A: her A, redrawn as little as possible, with a quiet serif for the rest of the word.\nOption B: the whole word from her handwriting, spacing evened out, nothing else touched.\nOption C: a plain wordmark, with her A as a separate stamp.',
        },
        {
          key: 'wm-monogram', title: 'The monogram', beat: 'expansive',
          intent: 'Only if it earns its place: the bread band, the oven door, the stamp on the cake box. If it is decoration, cut it.',
        },
      ],
      tasks: [
        { title: 'Send round two on Thursday: three options, not five', category: 'Client' },
        { title: 'Test option B at 12mm on the bread band. Does the A survive?', category: 'Design' },
        { title: 'Ask Teresa for scans of the 1971 order book (the pages with prices)', category: 'Client', done: true },
        { title: 'Hold the A against the old price board in daylight', category: 'Design', done: true },
      ],
    },
    {
      key: 'packaging',
      title: 'Packaging: bag, band & box',
      status: 'drafted',
      conviction: 'The packaging is the brand’s handshake: the only part people take home.',
      truth: 'What people carry home matters more than what they see in the shop.',
      journey: [
        'Hand-off — warm bread, a paper bag, the band folded once around the loaf.',
        'Walk home — the side of the bag facing out says Aurélia, for the neighbours.',
        'Kitchen — the band carries one line in her handwriting.',
        'The bottom of the bag — “1964”, small, for whoever looks.',
      ],
      open: ['Does the ink smudge on a warm crust?'],
      parts: [
        {
          key: 'pk-bag', title: 'The bag', beat: 'grounded',
          body: 'Kraft, unbleached, FSC. The wordmark once, on one side. Nothing on the other: that is where the bread shows through the grease.',
        },
        {
          key: 'pk-band', title: 'The bread band', beat: 'tender',
          body: 'A paper band folded once around the loaf, sealed with the A. One line in her handwriting, changed weekly:\n“Come early. The good ones go first.”\n“Still warm? Eat the end on the way home.”\n“Same oven since 1964.”',
        },
        {
          key: 'pk-box', title: 'The cake box', beat: 'expansive',
          intent: 'For Sundays and birthdays. The one place we are allowed to be festive.',
        },
      ],
      tasks: [
        { title: 'Quotes from two printers for kraft bags (FSC, a run of 10,000)', category: 'Production' },
        { title: 'Test the band’s ink on a real warm loaf at 7am', category: 'Production' },
        { title: 'Write six more lines for the band, in her voice, not mine', category: 'Writing' },
        { title: 'Sr. Joaquim’s yes on “1964” living on the bottom of the bag', category: 'Client', done: true },
      ],
      fragments: [{ text: 'Still warm? Eat the end on the way home.', part: 'pk-band' }],
    },
    {
      key: 'shopfront',
      title: 'Shopfront & signage',
      status: 'open',
      conviction: 'The sign has to be read from across the road by someone who has never heard of us.',
      tasks: [
        { title: 'The façade is in a protected zone. Ask the council what’s allowed', category: 'Production' },
        { title: 'Measure the fascia; photograph it at 7am and at 6pm', category: 'Design' },
      ],
    },
    {
      key: 'opening',
      title: 'Opening week',
      status: 'open',
      conviction: 'Before the first loaf is sold, the street should already know someone is baking for them.',
      truth: 'A neighbourhood trusts a shop that introduces itself before it sells anything.',
      journey: [
        'The letter — a week before opening, a handwritten letter through every door on the street.',
        'The smell — three days of baking with the doors open and nothing for sale.',
        'The first morning — the first fifty loaves go to whoever is waiting.',
        'Regulars — by Friday, Teresa knows ten names.',
      ],
      open: ['Do we give bread away, or does that cheapen it?'],
      tasks: [
        { title: 'Draft the letter to the neighbours: from Teresa, signed by hand', category: 'Writing' },
        { title: 'Opening moved to 14 March. Update the timeline', category: 'Client', done: true },
        { title: 'Invoice 50% of phase two', category: 'Admin' },
      ],
    },
  ],

  threads: [
    {
      key: 'handwriting',
      at: { x: 0.62, y: 108 },
      name: 'Dona Aurélia’s handwriting',
      intent: 'Her hand from the old order books, used wherever a person would write: the mark, the band, the letter.',
      hue: 'ember',
      rules: ['Used as she wrote it. Never redrawn into a font.'],
      on: [
        { at: 'wm-round-2', note: 'The A from the 1971 order book.' },
        { at: 'pk-band', note: 'Every line on the bread band.' },
        { at: 'opening', note: 'The letter’s heading, from her notebook.' },
      ],
    },
    {
      key: 'regulars',
      at: { x: 0.14, y: 46 },
      name: 'What the regulars say',
      intent: 'How the old street talks about the bakery: “an Aurélia”, “the early ones”. The brand borrows their words and never invents its own.',
      hue: 'tide',
      on: [
        { at: 'st-voice', note: 'Every line of the voice was overheard at the counter.' },
        { at: 'pk-band', note: 'The band’s lines.' },
        { at: 'opening', note: 'The letter to the new street.' },
      ],
    },
    {
      key: 'tile',
      at: { x: 2.05, y: 36 },
      name: 'The counter-tile blue',
      intent: 'The blue of the old counter’s tiles: the one colour carried over from 1964.',
      hue: 'verdant',
      on: [
        { at: 'wordmark', note: 'The second colour, if there is one.' },
        { at: 'shopfront', note: 'The door, painted to match.' },
      ],
    },
  ],

  items: [
    {
      kind: 'palette',
      pieces: ['wordmark', 'packaging'],
      at: { x: 1.1, y: 28 },
      swatches: [
        { hex: '#A8642B', name: 'Crust' },
        { hex: '#F3EDE2', name: 'Flour' },
        { hex: '#5C3317', name: 'Burnt sugar' },
        { hex: '#2C6E8F', name: 'Counter tile' },
        { hex: '#1E1B18', name: 'Oven door' },
      ],
    },
    {
      kind: 'tasks',
      pieces: ['wordmark'],
      at: { x: 1.56, y: 64 },
      tasks: [
        { title: 'Teresa: make the A less “tech”', done: true },
        { title: 'Both: try everything in one colour first', done: true },
        { title: 'Sr. Joaquim: wants “1964” somewhere visible' },
        { title: 'Teresa: can the A work as a small round avatar?' },
      ],
    },
  ],

  kept: [
    { kind: 'decision', text: 'The old shop keeps its painted sign. Only the new one gets the new mark.', why: 'The old street would never forgive us.', daysAgo: 35 },
    { kind: 'decision', piece: 'packaging', text: '“1964” lives on the bottom of the bag, not in the logo.', why: 'Her father gets his year; the mark stays young.', daysAgo: 19 },
    {
      kind: 'decision',
      text: '“Grow” in the brief means lasting another sixty years, not opening more shops.',
      why: 'Teresa doesn’t want to be the last generation.',
      quote: 'It’s not about more shops. It’s about the bakery still being there when her kids are her age.',
      daysAgo: 10,
    },
    { kind: 'open', text: 'Does the wholesale line to cafés carry the Aurélia name, or one of its own?', daysAgo: 10 },
    { kind: 'open', piece: 'wordmark', text: 'Is the monogram earning its place, or is it decoration?', daysAgo: 6 },
  ],

  changes: [
    {
      piece: 'strategy', field: 'core_truth', source: 'concept', daysAgo: 44,
      from: 'Aurélia is a heritage brand for a new generation.',
      to: 'The new shop should taste like Aurélia’s bread without looking like Aurélia’s shop.',
    },
    {
      piece: 'opening', field: 'intent', source: 'talk', daysAgo: 10,
      from: 'Open with a party the whole neighbourhood will talk about.',
      to: 'Before the first loaf is sold, the street should already know someone is baking for them.',
    },
  ],

  reading: {
    daysAgo: 5,
    statement:
      'Every piece in progress is something held at arm’s length: a bag, a band, a mark sized for a loaf, a voice heard over a counter. Held side by side, the identity is built to be touched, and nothing on the canvas yet works from across the street, which is where the strategy says a stranger first meets it.',
    gaps: [
      {
        text: '“Dona Aurélia’s handwriting” says her hand is never redrawn into a font, and option A in round two redraws her A.',
        where: ['Dona Aurélia’s handwriting', 'Wordmark & monogram'],
      },
      {
        text: '“Shopfront & signage” has no core truth yet, though the strategy’s journey begins with a stranger reading the sign from across the road.',
        where: ['Shopfront & signage'],
      },
    ],
  },

  conversation: {
    title: 'The brief against the vision',
    summary: 'Read “grow” in Teresa’s brief as lasting, not expanding, and turned the opening week into an introduction before a sale. The wholesale name is still open.',
    daysAgo: 10,
    messages: [
      { role: 'person', text: 'Hold what was asked for against the vision as it stands.' },
      { role: 'companion', text: 'The brief asks for three things: modern, clean, and able to grow into more shops. The first two sit comfortably with the canvas. The third pulls against it in two places: the rule “nothing that looks like a franchise”, and the strategy’s conviction that trust travels in the hand, not the decor. A brand built to multiply usually leans on sameness, and this canvas is built on the opposite. Did she mean more shops?' },
      { role: 'person', text: 'I asked her today. She said she doesn’t want to be the last generation. It’s not about more shops. It’s about the bakery still being there when her kids are her age.' },
      { role: 'companion', text: 'Then “grow” in the brief is about time, not branches, and the brief and the vision stop arguing. It changes what the wordmark is for, too: it has to last, not repeat. Do you want that kept as a decision for the whole project, in her words?' },
      { role: 'person', text: 'Yes. And it makes me rethink the opening. I had a launch party planned. That’s a franchise move, isn’t it?' },
      { role: 'companion', text: 'Whether a party is right is yours to judge. What the canvas does say is that the strategy’s journey starts with a stranger who has never heard of Aurélia, and that the old street’s trust was built over years of mornings. What would it look like for the new street to get a morning before it gets a party?' },
      { role: 'person', text: 'A letter. Teresa writes to every door a week before. Then we bake with the doors open for three days and sell nothing. Then we open.' },
      { role: 'companion', text: 'That’s a different conviction from the one Opening week was locked with. I’ll offer it as a change to that piece’s concept, built from what you just said. You can take it there, or keep the old one.' },
    ],
  },
}
