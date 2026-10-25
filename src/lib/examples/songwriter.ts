// A songwriter halfway through an album. Shown to people who said they write songs.

import type { ExampleSource } from './types'

export const songwriter: ExampleSource = {
  key: 'songwriter',
  practices: ['songwriter'],
  label: 'Songwriter',
  who: 'a songwriter halfway through an album',
  teaser: 'Nine songs written the year I turned the age my father was when I was born.',
  title: 'The Age He Was',
  intent:
    'Nine songs written in the year I turned thirty-four, the age my father was when I was born. For anyone who has caught a parent’s gesture in their own hands and didn’t know whether to flinch or smile. The record should feel like a house at night: everyone asleep but one, and a radio on low somewhere.',
  arc: 'Integration',
  rules: [
    'No song tells the listener what to feel about him.',
    'Nothing louder than a kitchen at night.',
    'Keep the take where the voice cracks, if the crack is true.',
  ],
  startedDaysAgo: 58,

  log: [
    { role: 'assistant', content: 'What keeps coming back to you lately, even when you try to think about something else?' },
    { role: 'user', content: 'My dad. Nothing dramatic. He’s alive, he’s fine. I turned 34 in March and he was 34 when I was born, and I keep catching myself doing his things. The way he clears his throat before he says something hard. I did it on the phone last week and had to hang up.' },
    { role: 'assistant', content: 'What do you feel in that moment, before you decide what to feel?' },
    { role: 'user', content: 'Caught. Like being caught shoplifting something that was already mine. I’ve written three songs about it in a month without meaning to. I think it’s turning into an album.' },
    { role: 'assistant', content: 'If it is an album, who is it for? Not who would like it. Who needs it?' },
    { role: 'user', content: 'People my age who are starting to see their parents as people. Who are realising their parents were guessing too. And honestly, him. Even if he never hears it.' },
    { role: 'assistant', content: 'If the album could leave one thing behind in that person, what would it be?' },
    { role: 'user', content: 'Permission to forgive the guessing. Theirs and their own.' },
    { role: 'assistant', content: 'Then let’s say it plainly: at thirty-four you can finally see your father as a man who was also guessing, and that is where forgiving starts. Does that hold, or is it too neat?' },
    { role: 'user', content: 'It holds. But no song is allowed to say “forgive”. The second I say it, it’s a greeting card.' },
    { role: 'assistant', content: 'Then that’s your first rule, and it has teeth: no song tells the listener what to feel about him.' },
  ],

  pieces: [
    {
      key: 'kitchen-radio',
      title: 'Kitchen Radio',
      status: 'done',
      conviction: 'Love in my family was never said. It was left on, like a radio in an empty kitchen.',
      truth: 'The things we never said were never silent: they were the sound the house made.',
      journey: [
        'Arrival — 2am, a kitchen, the hum of a fridge and a station caught between two frequencies.',
        'Recognition — the listener knows this kitchen; everyone has one.',
        'His presence — he is in the room without ever being named.',
        'Warmth — the chorus is allowed to be tender without saying so.',
        'Left on — it ends with the radio still playing and nobody reaching for the dial.',
      ],
      ethos: 'Sung low and close, like someone trying not to wake the house.',
      parts: [
        {
          key: 'kr-verse-1', title: 'Verse 1', beat: 'grounded',
          body: 'Two in the morning, the fridge is humming\nthe clock on the wall keeps its own kind of time\nsomebody left the old station playing\ncaught in the static between two lines',
        },
        {
          key: 'kr-chorus', title: 'Chorus', beat: 'tender',
          body: 'And nobody said it, nobody had to\nit was there in the kettle, the bread and the light\nwe were never a family for saying the true things\nwe just left the radio on all night',
        },
        {
          key: 'kr-verse-2', title: 'Verse 2', beat: 'restless',
          body: 'You fixed the dial with a strip of tape once\nso it couldn’t wander off your song\nthirty years later the tape’s still holding\nand I still don’t know which of us was wrong',
        },
        {
          key: 'kr-bridge', title: 'Bridge', beat: 'expansive',
          body: 'I could turn it off\nI could find a clearer station\nI could say the thing out loud\nand break the conversation',
        },
        {
          key: 'kr-last-chorus', title: 'Last chorus', beat: 'tender',
          body: 'But nobody said it, nobody has to\nit’s there in the kettle, the bread and the light\nI’m not a person for saying the true things\nI’m leaving the radio on tonight',
        },
      ],
      tasks: [
        { title: 'Lock the bridge: “break the conversation” stays', category: 'Writing', done: true },
        { title: 'Record the kitchen at 2am: fridge, clock, the third stair', category: 'Recording', done: true },
        { title: 'Vocal take 4 is the one. The crack on “true things” stays', category: 'Recording', done: true },
        { title: 'Ask Leonor to sit the radio under the vocal, not beside it', category: 'Mixing' },
      ],
    },
    {
      key: 'hands',
      title: 'His Hands, My Hands',
      status: 'drafted',
      conviction: 'The body inherits before the mind agrees to.',
      truth: 'I found my father in my hands before I ever found him in my heart.',
      journey: [
        'Close-up — it opens on hands doing a small job: an orange peeled in one long ribbon.',
        'The double — two pairs of hands, thirty years apart, doing the same thing.',
        'The flinch — the second of not wanting to be him.',
        'Softening — the hands are gentle; maybe he was too.',
      ],
      open: [
        'Is the orange too pretty an image? It’s true, but is it too sweet?',
        'Does the last chorus turn into “our hands”, or does that say too much?',
      ],
      parts: [
        {
          key: 'hh-verse-1', title: 'Verse 1', beat: 'grounded',
          body: 'I peel an orange in one long ribbon\nthe way you did when I was small\nthumb pressed under, turning slowly\nand the peel doesn’t break at all',
        },
        {
          key: 'hh-chorus', title: 'Chorus', beat: 'tender',
          body: 'These are your hands, these are your hands\nI didn’t ask for them, I didn’t know\nthese are your hands on the steering wheel\nholding at ten and two, holding it low',
        },
        {
          key: 'hh-verse-2', title: 'Verse 2', beat: 'restless',
          body: 'I tap the table when I’m waiting\ntwo fingers, like a horse that won’t stand still\nMum used to say it drove her crazy',
        },
        {
          key: 'hh-bridge', title: 'Bridge', beat: 'expansive',
          intent: 'Where the flinch turns. It has to happen in one image, never an explanation.',
        },
      ],
      tasks: [
        { title: 'Finish verse 2. The line about Mum can’t be a joke at her expense', category: 'Writing' },
        { title: 'Try the bridge spoken, just once, to hear it', category: 'Writing' },
        { title: 'Restring his old Yamaha with light gauge before recording', category: 'Recording', done: true },
        { title: 'Fingerpicked, capo 2. No band until the last chorus', category: 'Arrangement' },
      ],
    },
    {
      key: 'thirty-four',
      title: 'Thirty-Four',
      status: 'drafted',
      conviction: 'Every parent was someone guessing, and you only see it when you reach the age they were.',
      truth: 'At thirty-four I can finally see my father as a man who was also guessing.',
      journey: [
        'The birthday — a cake, a number, and a quiet sum done in the car afterwards.',
        'The photograph — him at thirty-four holding a baby, looking terrified, which nobody ever mentioned.',
        'The turn — the terror wasn’t failure; it’s what love looks like at that age.',
        'The almost-call — it ends before anything is said: a thumb over his name.',
      ],
      open: ['Does he pick up, or does the song end before he does?'],
      parts: [
        {
          key: 'tf-car', title: 'The car after the party', beat: 'grounded',
          body: 'Sat in the car outside my own birthday\ndoing the sum on the back of my hand\nthirty-four, and you were holding\na screaming thing you didn’t understand',
        },
        {
          key: 'tf-chorus', title: 'Chorus', beat: 'tender',
          body: 'Thirty-four, and you didn’t know either\nthirty-four, and you held on all the same\nI always thought you kept a map in your pocket\nyou were reading road signs, calling out their names',
        },
        {
          key: 'tf-photograph', title: 'The photograph', beat: 'expansive',
          body: 'There’s a picture in Mum’s hall of you at the hospital\njacket still on, like you weren’t staying long\neverybody always says how proud you look there\nI looked again tonight, and I think they’re wrong',
        },
        {
          key: 'tf-bridge', title: 'Bridge', beat: 'restless',
          intent: 'The almost-call. Thumb over his name. It has to stay unsaid.',
        },
      ],
      tasks: [
        { title: 'Bridge: the thumb over his name. Don’t let him pick up', category: 'Writing' },
        { title: 'Second verse happens in a room, not in my head (Mum’s hallway)', category: 'Writing', done: true },
        { title: 'Retune to his open D for this one', category: 'Arrangement', done: true },
        { title: 'Cello alone, or the full strings? Try both before deciding', category: 'Arrangement' },
      ],
    },
    {
      key: 'things-he-fixed',
      title: 'Things He Fixed',
      status: 'open',
      conviction: 'A man who couldn’t say sorry fixed everything that broke instead.',
      truth: 'Every repair was an apology he didn’t have the words for.',
      journey: [
        'Inventory — a list of mended things: a bike chain, a lamp, a doll’s arm, a door that stuck.',
        'The pattern — the listener notices the mending always comes after a row.',
        'Understanding — the fixing was the saying.',
        'Unfixed — the one thing he couldn’t mend is left at the end, unnamed.',
      ],
      open: ['Do I name the one thing he couldn’t fix?', 'A list song, or a story song?'],
      tasks: [
        { title: 'Write the list first: twenty mended things, true ones only', category: 'Writing' },
        { title: 'Ask Mum what he fixed the week after the big row in ’98', category: 'Writing' },
      ],
    },
    {
      key: 'inheritance',
      title: 'Inheritance (interlude)',
      status: 'open',
      conviction: 'Forty seconds of an old cassette: him singing along to the car radio, badly, in 1993.',
      body: 'A found recording. Dad in the car, singing along to something on the radio, getting the words wrong and not caring. Mum kept the tape. Forty seconds, nothing added on top.',
      tasks: [
        { title: 'Digitise the cassette before it goes (Rui has a deck)', category: 'Recording' },
        { title: 'Ask him if I can use it. Or don’t, and ask after?', category: 'Release' },
      ],
    },
    {
      key: 'the-age-he-was',
      title: 'The Age He Was',
      status: 'open',
      conviction: 'You don’t stop being someone’s child when you understand them. You start being their friend.',
      truth: 'Understanding him didn’t end anything. It made us two people guessing in the same direction.',
      journey: [
        'The drive — driving to his house, his radio station on.',
        'The kitchen — the radio from the first song is here, still on.',
        'Nothing said — they talk about the weather, and this time it’s enough.',
        'Leaving — the door closes with the radio still playing behind it; the last chord turns major.',
      ],
      open: ['Is he in this song as a voice? Does he say one line?'],
      tasks: [
        { title: 'Play the last verse on his guitar, in his tuning', category: 'Arrangement' },
        { title: 'Record the front door closing, from outside, with the radio on in the kitchen', category: 'Recording' },
      ],
    },
  ],

  threads: [
    {
      key: 'radio',
      at: { x: 1.9, y: 30 },
      name: 'The kitchen radio',
      intent: 'A station half-tuned somewhere in the house: what was said instead of saying.',
      hue: 'tide',
      rules: ['Never a recording you could name. Always half-tuned.', 'It never switches off.'],
      on: [
        { at: 'kitchen-radio', note: 'The first sound on the record, before the guitar.' },
        { at: 'tf-bridge', note: 'Bleeds through from the next room while the thumb hovers.' },
        { at: 'the-age-he-was', note: 'Still playing behind the closed door. The last sound on the record.' },
      ],
    },
    {
      key: 'hands',
      at: { x: 1.25, y: 76 },
      name: 'Hands',
      intent: 'His hands, found in mine: what the body inherits before the mind agrees to.',
      hue: 'ember',
      rules: ['Show what the hands do, never what they mean.'],
      on: [
        { at: 'hands', note: 'The whole song.' },
        { at: 'tf-car', note: 'Doing the sum on the back of a hand.' },
        { at: 'things-he-fixed', note: 'All the mending is done by hand, never in words.' },
      ],
    },
    {
      key: 'tuning',
      at: { x: 3.3, y: 112 },
      name: 'His tuning',
      intent: 'Open D, the tuning he played in. Only the songs about him go into it.',
      hue: 'verdant',
      rules: ['A song about me stays in standard tuning.'],
      on: [
        { at: 'thirty-four', note: 'Open D, capo 2.' },
        { at: 'things-he-fixed', note: 'Open D if it’s a list song; standard if it turns into a story.' },
        { at: 'the-age-he-was', note: 'Standard until the last verse, which is played on his guitar.' },
      ],
    },
  ],

  items: [
    {
      kind: 'tasks',
      pieces: [],
      at: { x: 0.6, y: 20 },
      tasks: [
        { title: 'The stair that creaks (third from the top)', done: true },
        { title: 'Kettle clicking off', done: true },
        { title: 'His workbench vice turning' },
        { title: 'The indicator in his old Renault' },
        { title: 'The back door, which needs a shoulder' },
      ],
    },
    {
      kind: 'recording',
      pieces: ['thirty-four'],
      at: { x: 2.35, y: 40 },
      caption: 'Thirty-Four, the chorus in open D (phone on the stairs, 1am)',
      file: { name: 'songwriter-thirty-four-chords.m4a', mime: 'audio/mp4', bytes: 385371, seconds: 30.9, envelope: [1.0, 0.693, 0.799, 0.791, 0.861, 0.597, 0.839, 0.839, 0.744, 0.598, 0.823, 0.793, 0.795, 0.827, 0.737, 0.971, 0.882, 0.726, 0.542, 0.783, 0.743, 0.739, 0.414, 0.116] },
    },
    {
      kind: 'palette',
      pieces: ['kitchen-radio'],
      at: { x: 0.05, y: 44 },
      swatches: [
        { hex: '#8B5E3C', name: 'Workbench oak' },
        { hex: '#E8A33D', name: 'Radio dial' },
        { hex: '#2F4A6D', name: 'His overalls' },
        { hex: '#1C2230', name: 'Kitchen at 2am' },
        { hex: '#F2D16B', name: 'Insulating tape' },
      ],
    },
  ],

  kept: [
    { kind: 'decision', text: 'No features. One voice, like a conversation that only ever went one way.', daysAgo: 31 },
    { kind: 'decision', text: 'The record ends in a major key, on the last chord only.', why: 'He’d hate a sad ending and I’d hate a happy one.', daysAgo: 21 },
    { kind: 'decision', piece: 'thirty-four', text: 'Thirty-Four is track five of nine: the centre of the record.', why: 'Everything before it looks at him; everything after looks at me.', daysAgo: 16 },
    {
      kind: 'decision', piece: 'the-age-he-was',
      text: 'The radio never switches off. The record ends with it still playing behind a closed door.',
      why: 'I want them to feel he’s still in the room.',
      quote: 'The last sound is the door and the radio still on behind it.',
      daysAgo: 9,
    },
    { kind: 'open', text: 'Do I play him the record before it comes out?', daysAgo: 9 },
    { kind: 'open', piece: 'inheritance', text: 'A track of its own, or forty seconds at the start of Things He Fixed?', daysAgo: 5 },
  ],

  changes: [
    {
      piece: 'thirty-four', field: 'core_truth', source: 'talk', daysAgo: 12,
      from: 'I am afraid of becoming my father.',
      to: 'At thirty-four I can finally see my father as a man who was also guessing.',
    },
    {
      piece: 'the-age-he-was', field: 'open_threads', source: 'room', daysAgo: 9,
      from: 'Does the radio switch off at the end?',
      to: 'answered: No. It’s still playing behind the door.',
    },
  ],

  reading: {
    daysAgo: 6,
    statement:
      'Every song on the canvas happens indoors or in a parked car, and each one ends on something done instead of said: a radio left on, a thumb hovering over a name, a list of mended things. Held side by side, the record is a house heard from the inside, and only the closer goes out through its door.',
    gaps: [
      {
        text: '“Inheritance” has no core truth yet, and it is the only piece in his voice instead of yours. Nothing on the canvas says what his own voice is doing on a record about the things he never said.',
        where: ['Inheritance (interlude)'],
      },
      {
        text: 'The thread “Hands” never reaches the closer, though the record’s purpose begins with catching a parent’s gesture in your own hands.',
        where: ['Hands', 'The Age He Was'],
      },
    ],
  },

  conversation: {
    title: 'Whether the radio switches off',
    summary: 'Decided the radio never goes off: the record ends with it still playing behind a closed door. Whether to play him the record first is still open.',
    daysAgo: 9,
    messages: [
      { role: 'person', text: 'I keep wanting to end the record with the radio switching off. Click, silence, done. But something about it feels wrong and I can’t say what.' },
      { role: 'companion', text: 'The canvas might say it for you. The kitchen radio is how the record says what nobody says: the thread calls it “what was said instead of saying”. If it clicks off in the last second, the last thing a listener is handed is that the saying stopped. Is that what you want them to walk out with?' },
      { role: 'person', text: 'No. He’s alive. I want them to feel he’s still in the room. Still on, somewhere.' },
      { role: 'companion', text: 'Then the click is answering a question the record never asked. “The Age He Was” is the only song whose conviction is about carrying on: two people guessing in the same direction. If the radio doesn’t go off, where is it when the record ends?' },
      { role: 'person', text: 'In his kitchen. And I’m leaving. The last sound is the door and the radio still on behind it.' },
      { role: 'companion', text: 'That’s a decision about the closer, and it changes the thread too: the radio stops being a memory and becomes something that keeps going after the song does. Do you want “it never switches off” written into the thread as a rule, so every song that touches it holds to that?' },
      { role: 'person', text: 'Yes. And now I don’t know if I play him the record before it comes out. If the radio’s still on, maybe he should hear it.' },
      { role: 'companion', text: 'That one is yours to decide, and it doesn’t need deciding today. I’ll keep it under Still open for the whole record, so it’s there when you want to come back to it.' },
    ],
  },
}
