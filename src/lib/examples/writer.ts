// A man shaping a year of morning journals into three pieces of writing.
// Shown to people who said they write.

import type { ExampleSource } from './types'

export const writer: ExampleSource = {
  key: 'writer',
  practices: ['writer'],
  label: 'Journaling',
  who: 'a man shaping a year of morning journals into three pieces of writing',
  teaser: 'A year of journal entries written at half past five, and the three pieces of writing being drawn out of them.',
  title: 'Before Anyone Wakes Up',
  intent:
    'For almost a year I have written in a notebook every morning at half past five, before Mia and Ana wake up and the day starts asking for me. Most of those entries are for nobody. This project is what I am drawing out of them: three pieces of writing, each one built from the mornings that kept circling the same thing, that I might one day let someone read. The year is the raw material; the three pieces are what it is saying. They are about the weight most people carry and never mention: a job that pays for a life I barely have time to live, the dreams I put in a drawer, and the people I love most getting the most tired version of me. For anyone who has stayed in the shower ten minutes longer because it is the one place nobody needs anything from them.',
  arc: 'Beginning',
  rules: [
    'Written from what happened, then shaped. Never invented.',
    'Say the hard thing once, plainly, and move on. No self-pity.',
    'Never advice. If it sounds like a self-help book, cut it.',
  ],
  startedDaysAgo: 46,

  log: [
    { role: 'assistant', content: 'What has been on your mind lately, even when you try to think about something else?' },
    { role: 'user', content: 'Mornings, honestly. Since last autumn I get up at half five, before my daughter and my wife are up, and just write in a notebook. Nothing fancy. It’s nearly a year of mornings now, and it’s the only part of the day that feels like mine.' },
    { role: 'assistant', content: 'What ends up on the page in that hour?' },
    { role: 'user', content: 'Things I’d never say out loud. That I’m tired all the time. That I thought I’d be somewhere else by thirty-eight. That I love my family and I still stay in the shower an extra ten minutes because nobody can need anything from me in there.' },
    { role: 'assistant', content: 'Do you want to do something with those pages, or is writing them the point?' },
    { role: 'user', content: 'Reading back, the same few things keep coming up, month after month. I’ve been thinking about pulling those out into actual pieces. Not a book. Maybe three. Something I could finish, and maybe show someone one day.' },
    { role: 'assistant', content: 'If one person read those three pieces, who would you want it to be? Not who would like them. Who needs them.' },
    { role: 'user', content: 'Some guy like me. Late thirties, a decent job he doesn’t love, a kid, a list of things he meant to do by now. Who thinks he’s the only one who feels like this.' },
    { role: 'assistant', content: 'What would you want him to feel when he gets to the end?' },
    { role: 'user', content: 'That the tired version of him isn’t all of him. That there’s still an hour somewhere that’s his.' },
    { role: 'assistant', content: 'Then this is what I hear underneath it: the life you have and the life you dreamed of are not enemies, and the hour before everyone wakes is where they meet. Does that hold?' },
    { role: 'user', content: 'Yeah. That’s it. As long as it never sounds like a self-help book.' },
    { role: 'assistant', content: 'Then hold to that as a rule: say the hard thing plainly, and never turn it into advice.' },
  ],

  pieces: [
    {
      key: 'half-past-five',
      title: 'Half Past Five',
      status: 'done',
      touchedDaysAgo: 0,
      conviction: 'Everyone deserves one hour a day that nobody can ask anything of.',
      truth: 'The only hour I’m not useful to anyone is the only hour I feel like myself.',
      journey: [
        'The dark — I wake six minutes before the alarm, afraid to lose even one of them.',
        'The quiet house — the kettle, the boiler, everyone I love asleep upstairs.',
        'The honest page — what I write when nobody will ever read it.',
        'Footsteps — Mia on the stairs; the hour ends, and I’m glad to give the day away.',
      ],
      parts: [
        {
          key: 'hp-alarm', title: 'The alarm before the alarm', beat: 'grounded',
          body: 'Tuesday, 5:24. I wake six minutes before the alarm, the way I do now, as if some part of me is afraid of losing even one of these minutes. I switch it off before it can wake Ana. The floor is cold. I go down in the dark. I know this house by feel now: eleven steps, the turn, the kitchen door that has to be lifted slightly or it scrapes.',
        },
        {
          key: 'hp-house', title: 'What the house sounds like', beat: 'tender',
          body: 'The fridge. The boiler deciding whether to start. A car somewhere on the main road: someone else with somewhere to be. The kettle is the loudest thing I own at this hour, and I stand over it like I’m guarding it.\n\nI’ve started to think of the house as breathing. Everyone I love is upstairs, asleep, and for one hour I’m the only one keeping watch, and nobody knows I’m doing it, and that’s fine. That’s the point.',
        },
        {
          key: 'hp-honest', title: 'What I write when nobody’s reading', beat: 'restless',
          body: 'Today I wrote: I am tired in a way sleep doesn’t fix.\n\nI wrote: I’m thirty-eight and I still feel like I’m waiting for my real life to start, and I’m scared that this is it, and I’m scared that it isn’t.\n\nI wrote: I love them so much it frightens me, and last night I gave them the worst of me, because the worst was all that was left.',
        },
        {
          key: 'hp-footsteps', title: 'Footsteps', beat: 'expansive',
          body: '6:28. Small feet on the landing. Mia never walks down the stairs; she arrives at the bottom of them all at once. I close the notebook. Not because it’s a secret. Because the hour is over, and the rest of the day belongs to everyone else, and I want to give it to them with both hands.',
        },
      ],
      tasks: [
        { title: 'Read it aloud once, to myself, in the garden', category: 'Writing', done: true },
        { title: 'Cut the paragraph about work. It’s the one place I’m complaining', category: 'Writing', done: true },
        { title: 'Decide whether Ana reads it first', category: 'Sharing' },
      ],
      fragments: [
        { text: 'I am tired in a way sleep doesn’t fix.', part: 'hp-honest' },
        { text: 'Everyone I love is upstairs, asleep, and for one hour I’m the only one keeping watch.', part: 'hp-house' },
      ],
    },
    {
      key: 'the-drawer',
      title: 'The Drawer',
      status: 'drafted',
      conviction: 'Dreams you put away don’t die. They wait, and the waiting is its own kind of grief.',
      truth: 'I didn’t give up on what I wanted. I put it somewhere safe and forgot where.',
      journey: [
        'The list — found in a box from the old flat: things to do by thirty, in handwriting I barely recognise.',
        'The reasons — each one crossed off for a good reason, and one for no reason at all.',
        'Still there — none of it is dead; it is waiting to see if I come back.',
        'Taken out — the last line on the list, “Write something”, is the notebook in my hands.',
      ],
      open: ['Does the swimming stay in? It’s the only one with no excuse, and that’s why it hurts.'],
      parts: [
        {
          key: 'dr-list', title: 'The list', beat: 'grounded',
          body: 'I found it in the box from the old flat, folded inside a birthday card. Things to do by 30, in handwriting I barely recognise as mine.\n\nPlay a gig people pay to see.\nLive abroad for a year.\nLearn to swim properly.\nA house you can hear the sea from.\nWrite something.',
        },
        {
          key: 'dr-reasons', title: 'The reasons', beat: 'restless',
          body: 'I read it in the staff room on my lunch break, between a sandwich and a meeting about targets.\n\nThe gig: Rui moved to Leeds, and I needed the Saturday shifts, and honestly we were never that good, and anyway.\nAbroad: Mum’s first operation, then the second, and by then Ana, and by then the flat.\nSwimming: I just didn’t. There’s no reason. I just didn’t.\nThe sea: we bought the house we could afford, forty minutes from anything blue.',
        },
        {
          key: 'dr-still', title: 'What’s still in there', beat: 'tender',
          body: 'None of it is dead. That’s what surprised me. I thought I’d feel grief, reading it. I felt something closer to being looked at by someone who still expects me to turn up.',
        },
        {
          key: 'dr-taken', title: 'The one I’m taking out', beat: 'expansive',
          intent: 'The last line on the list is the notebook. End on the notebook, never on a lesson.',
        },
      ],
      tasks: [
        { title: 'Find the actual list (the box from the old flat)', category: 'Finding things', done: true },
        { title: 'Write each reason in one line, without defending it', category: 'Writing' },
        { title: 'Ask Rui if he still has the photo of us playing at the Crown', category: 'Finding things' },
        { title: 'End on the notebook, not on a lesson', category: 'Writing' },
      ],
      fragments: [
        { text: 'Write something.', part: 'dr-list' },
        { text: 'Forty minutes from anything blue.', part: 'dr-reasons' },
        { text: 'None of it is dead. It’s waiting to see if I come back.' },
      ],
    },
    {
      key: 'tired-version',
      title: 'The Tired Version',
      status: 'open',
      conviction: 'Love isn’t proved in the big moments. It’s in what you have left at seven in the evening.',
      truth: 'The people I love most get what’s left of me, and they deserve the first of me.',
      journey: [
        'Seven o’clock — I come through the front door with nothing left.',
        'The small no — “not tonight” to a game of cards.',
        'The noticing — she stops asking me, and asks her mum instead.',
        'The turn — one morning she comes down at ten to six, and I let her stay.',
      ],
      open: ['Do I let Mia into the hour, or does that end it?'],
      tasks: [
        { title: 'Write down what Mia said on Tuesday before I lose the exact words', category: 'Writing' },
        { title: 'Notice for one week: what time do I stop being any good?', category: 'Noticing' },
      ],
      fragments: [
        { text: 'She’s stopped asking me to play after dinner. She asks Ana now.' },
        { text: 'They get what’s left of me.' },
      ],
    },
  ],

  threads: [
    {
      key: 'notebook',
      at: { x: 1.62, y: 48 },
      name: 'The notebook',
      intent: 'The cheap blue notebook from the supermarket, a year of mornings in it. Where it is in each piece says how safe I feel.',
      hue: 'tide',
      rules: ['It is never called a journal in the writing.'],
      on: [
        { at: 'hp-footsteps', note: 'Closed when the footsteps come. Not hidden, closed.' },
        { at: 'dr-taken', note: 'The thing taken out of the drawer is the notebook itself.' },
      ],
    },
    {
      key: 'mia',
      at: { x: 2.3, y: 28 },
      name: 'Mia',
      intent: 'My daughter, glimpsed. She is the reason for most of it and never the subject.',
      hue: 'ember',
      rules: ['She never says more than one line.'],
      on: [
        { at: 'hp-footsteps', note: 'She arrives at the bottom of the stairs all at once.' },
        { at: 'tired-version', note: 'The whole piece is for her.' },
      ],
    },
    {
      key: 'unsaid',
      at: { x: 0.55, y: 92 },
      name: 'What I don’t say out loud',
      intent: 'What I write and would never say to anyone: that I’m tired, that I’m scared, that I wanted more.',
      hue: 'violet',
      on: [
        { at: 'hp-honest', note: 'Everything I write and would never say.' },
        { at: 'dr-reasons', note: 'The reasons I give other people, beside the real ones.' },
      ],
    },
  ],

  items: [
    {
      kind: 'tasks',
      pieces: [],
      at: { x: 0, y: 'beside' },
      tasks: [
        { title: 'Up at 5:30, four days a week', done: true },
        { title: 'Read back through the year and mark which mornings belong to which piece', done: true },
        { title: 'Tell Ana what the half-past-five thing is', done: true },
        { title: 'Buy the next notebook before this one runs out' },
        { title: 'Ask at the library about the Thursday writing group' },
      ],
    },
  ],

  kept: [
    { kind: 'decision', text: 'Three pieces, not a book. Three is something I can finish.', daysAgo: 30 },
    { kind: 'decision', text: 'If anyone else ever reads these, Mia becomes “my daughter”.', why: 'It’s her life too.', daysAgo: 18 },
    {
      kind: 'decision', piece: 'the-drawer',
      text: 'The one thing taken out of the drawer is the writing itself.',
      why: 'It was the last line on the list, and it is what this is.',
      quote: 'The thing I’m taking out of the drawer is this. Writing.',
      daysAgo: 8,
    },
    { kind: 'open', text: 'Does anyone ever read these, or is finishing them enough?', daysAgo: 8 },
    { kind: 'open', piece: 'tired-version', text: 'Whether Ana belongs in this piece, or only Mia.', daysAgo: 4 },
  ],

  changes: [
    {
      piece: 'half-past-five', field: 'core_truth', source: 'talk', daysAgo: 20,
      from: 'I get up early because it’s the only time I get anything done.',
      to: 'The only hour I’m not useful to anyone is the only hour I feel like myself.',
    },
    {
      piece: 'the-drawer', field: 'intent', source: 'talk', daysAgo: 8,
      from: 'I gave up on my dreams to be responsible.',
      to: 'Dreams you put away don’t die. They wait, and the waiting is its own kind of grief.',
    },
  ],

  reading: {
    daysAgo: 3,
    statement:
      'Each piece sits at a different hour of the same kind of day: half past five in the kitchen, a lunch break in the staff room, seven in the evening at the front door. Held side by side, they move from the hour you keep for yourself into the hours other people need you, and only the last one lets someone stay in the hour you keep.',
    gaps: [
      {
        text: '“Say the hard thing once, plainly” and “The Drawer” pull against each other: as drafted, most of its reasons are defended at length, and only the one about swimming is said once and left.',
        where: ['The Drawer', 'Say the hard thing once, plainly, and move on. No self-pity.'],
      },
      {
        text: '“The Tired Version” has no words yet, and its journey ends with someone else inside the hour that “Half Past Five” says nobody can ask anything of.',
        where: ['The Tired Version', 'Half Past Five'],
      },
    ],
  },

  conversation: {
    title: 'What comes out of the drawer',
    summary: 'Decided the one thing taken out of the drawer is the writing itself, which turned The Drawer from giving up into waiting. Whether anyone ever reads these is still open.',
    daysAgo: 8,
    messages: [
      { role: 'person', text: 'I’m stuck on the end of The Drawer. I’ve listed everything I put away: the band, the year abroad, the house by the sea. I wanted to end by taking one thing out, but every option sounds like a midlife crisis.' },
      { role: 'companion', text: 'The canvas might help. The project is about the dreams you put in a drawer, and its first piece is about the one hour a day nobody can ask anything of. What do you do in that hour?' },
      { role: 'person', text: 'I write. Oh.' },
      { role: 'companion', text: 'Is that the thing that came out of the drawer?' },
      { role: 'person', text: 'It’s literally on the list. “Write something.” I wrote that when I was twenty-two and forgot. The thing I’m taking out of the drawer is this. Writing.' },
      { role: 'companion', text: 'Then the ending is already happening, which may be why every other option felt false. Do you want it kept as a decision on The Drawer: the one thing taken out is the writing itself?' },
      { role: 'person', text: 'Yes. And it changes what the piece is. It isn’t about giving up. It’s about things waiting.' },
      { role: 'companion', text: 'That is a different conviction from the one it was locked with, which was about giving dreams up to be responsible. I’ll offer the change on the piece, so you can see the old and the new side by side before you take it. It leaves one question: if the writing is what comes out, does anyone ever get to read it?' },
      { role: 'person', text: 'I don’t know. Maybe finishing them is enough. Leave that open.' },
      { role: 'companion', text: 'Kept under Still open for the whole project. It doesn’t need an answer until the third piece is written.' },
    ],
  },
}
