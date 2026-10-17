// A fiction writer midway through a season of stories on Substack. Shown to people who said they write.

import type { ExampleSource } from './types'

export const writer: ExampleSource = {
  key: 'writer',
  practices: ['writer'],
  label: 'Writer',
  who: 'a fiction writer midway through a season on Substack',
  teaser: 'Six stories set in a train station’s lost property office, one every other Sunday.',
  title: 'Lost Property: Season Two',
  intent:
    'Six short stories for my Substack, one every other Sunday, all set in the lost property office of a city train station, where Odile has catalogued forgotten things for nineteen years. Each story is one object and the life that let go of it. Across the season, readers should slowly realise Odile has been cataloguing herself. For people who read on the train, alone, and sometimes miss their stop.',
  arc: 'Expansion',
  rules: [
    'Under 2,500 words. It’s read on a phone between stops.',
    'Never solve the owner. Leave them a silhouette.',
    'Every issue ends on a sentence that could stand alone as a Note.',
  ],
  startedDaysAgo: 64,

  log: [
    { role: 'assistant', content: 'What did your first season teach you that you didn’t expect?' },
    { role: 'user', content: 'That the stories people replied to most weren’t the clever ones. It was the one about a woman returning a library book forty years late. People wrote to me about what they’d never given back.' },
    { role: 'assistant', content: 'So your readers didn’t want plot. They wanted to recognise something they’d kept. What do you keep?' },
    { role: 'user', content: 'Everything. I’ve got a drawer of keys to flats I don’t live in any more. I can’t throw them out. It feels like throwing out the person who lived there.' },
    { role: 'assistant', content: 'Where would a drawer like that exist in public?' },
    { role: 'user', content: 'A lost property office. Oh. Everyone’s drawer, in one room. And someone who works there.' },
    { role: 'assistant', content: 'Picture one person opening the email. Who are they?' },
    { role: 'user', content: 'Someone on the 7:40, alone, phone in one hand. They have twelve minutes. They want to feel something before work starts asking things of them.' },
    { role: 'assistant', content: 'What do you want them to carry off the train?' },
    { role: 'user', content: 'That it’s all right to keep things. That we don’t lose things, we leave them where we can’t bear to carry them any more.' },
    { role: 'assistant', content: 'That sounds like the season’s truth. And the clerk: what has she left there?' },
    { role: 'user', content: 'That’s the season. She’s left herself there. Nobody’s supposed to notice until the last issue.' },
  ],

  pieces: [
    {
      key: 'glove',
      title: 'Item 4471: A Glove, Left Hand',
      status: 'done',
      conviction: 'Some people leave half of a pair on purpose, so they have a reason to come back.',
      truth: 'A single glove is a promise to return that nobody keeps.',
      journey: [
        'The ledger — it opens on Odile’s entry: Item 4471. Glove, left. Grey wool. Platform 6.',
        'The visitor — a man comes to ask for it every winter, and never takes it.',
        'Suspicion — the reader realises he doesn’t want it back; he wants the asking.',
        'The hint — Odile goes out into January with bare hands, as she has for nineteen years.',
      ],
      parts: [
        {
          key: 'gl-entry', title: 'The entry', beat: 'grounded',
          body: 'Item 4471. Glove, left. Grey wool, darned at the thumb with a thread that doesn’t match. Found Platform 6, 14 December, under the third bench from the clock.\n\nOdile writes every entry the same way, in the same blue ink, in the same ledger that has been the same ledger since the station still had a ticket hall. She writes what the thing is, where it was found, and nothing about who might have owned it. That isn’t her job. Her job is to keep things until someone remembers them, and to let them go, gently, when no one does.',
        },
        {
          key: 'gl-winter', title: 'Every winter', beat: 'restless',
          body: 'He comes on the first cold Tuesday. He always says he’s here about a glove, and she always brings it out, and he always holds it the way you would hold a bird that might not be dead.\n\n“That’s not it,” he says. Every year. And every year she nods and puts it back on the shelf with the others from that December, and writes nothing, because there is nothing in the ledger for a man who comes to not collect a thing.',
        },
        {
          key: 'gl-wants', title: 'What he wants', beat: 'tender',
          body: 'It takes her four winters to understand. He doesn’t want the glove. He wants a place in the city where someone keeps the other half of something for him, and asks no questions, and is there on the first cold Tuesday.',
        },
        {
          key: 'gl-january', title: 'January', beat: 'expansive',
          body: 'She files it back under December. Outside, the platforms steam. Odile buttons her coat to the collar and goes out into the cold with her hands bare, the way she has for nineteen years, as if she had lost hers somewhere and never thought to ask.',
        },
      ],
      tasks: [
        { title: 'Schedule for Sunday 8:00. Subject line: “Item 4471”', category: 'Publishing', done: true },
        { title: 'Reply to the comments. Ask Marisol if I can use her mother’s umbrella story', category: 'Readers', done: true },
        { title: 'Post the last line as a Note on Monday', category: 'Publishing', done: true },
      ],
      fragments: [
        { text: 'as if she had lost hers somewhere and never thought to ask', part: 'gl-january' },
        { text: 'Lost property is a museum nobody visits on purpose.' },
      ],
    },
    {
      key: 'umbrella',
      title: 'Item 5209: The Umbrella That Came Back Twice',
      status: 'done',
      conviction: 'Some things return to us until we learn what they came back to say.',
      truth: 'We keep losing the things that belong to a life we’ve outgrown.',
      journey: [
        'Return — a red umbrella is handed in, collected, and handed in again a month later.',
        'The pattern — always the same woman, always on the same date.',
        'Odile speaks — for the first time in the season, Odile asks a question out loud.',
        'Let go — the woman tells her to keep it. It was her mother’s.',
      ],
      body:
        'The red umbrella comes in on the 3rd of October, and goes out again on the 4th, and comes back on the 3rd of November, wet, folded wrong, its strap undone like a collar no one has straightened.\n\nOdile knows the woman before she reaches the counter. Knows the walk, the apology already halfway out of her mouth. She brings the umbrella without being asked.\n\n“Why do you keep bringing it back?” Odile says, and is so surprised to hear her own voice in the room that she almost apologises for it.',
      tasks: [
        { title: 'Credit Marisol in the PS (she said yes)', category: 'Readers', done: true },
        { title: 'Ask Inês if her grandfather’s keyring can go into issue three', category: 'Readers', done: true },
      ],
      fragments: [{ text: 'Things come back to us until we learn what they came to say.' }],
    },
    {
      key: 'keys',
      title: 'Item 6120: Keys to a House That’s Been Sold',
      status: 'drafted',
      conviction: 'Keys are the only thing people cry over when they come to collect them.',
      truth: 'Handing back a key is the moment a home becomes an address.',
      journey: [
        'The ring — seven keys on a ring with a plastic strawberry, handed in by a taxi driver.',
        'The claim — an old woman comes for them, but the house they open was sold in March.',
        'Odile listens — she breaks her own rule and asks which key was the front door.',
        'Release — the woman takes one key off the ring and leaves the rest “for whoever lives there now”.',
      ],
      open: ['Does the woman get a name? The rule says no, but she might need one.'],
      parts: [
        {
          key: 'ky-strawberry', title: 'The strawberry', beat: 'grounded',
          body: 'Item 6120. Keys, seven, on a split ring. Plastic strawberry fob, the paint worn white where a thumb has been. Handed in by a taxi driver, rank B, who said only that she had been crying in the back and that he hadn’t liked to ask.\n\nOdile weighs them in her palm before she writes them down. Seven keys is a life. One is a flat. Three is a flat and a bicycle and a mother’s house. Seven is somebody who was trusted with a great many doors.',
        },
        {
          key: 'ky-seven', title: 'Seven keys', beat: 'restless',
          body: 'The woman comes on a Thursday. She is older than her handwriting on the claim form, and she holds the counter with both hands while Odile looks for the ring, as if the room were moving.\n\n“The house was sold in March,” she says, before anyone has asked her anything. “I don’t know why I still had them on me.”',
        },
        {
          key: 'ky-front-door', title: 'Which one was the front door', beat: 'tender',
          body: 'Her name was Celeste Amaral and she had lived at number 9, Rua das Flores, for forty-one years, since the winter she married a man who sold radios and died of something slow in the back bedroom, and she had raised three children there, two of whom still rang on Sundays.\n\nOdile, who never asks, asks: “Which one was the front door?”',
        },
        {
          key: 'ky-whoever', title: 'For whoever lives there now', beat: 'expansive',
          intent: 'The release: one key off the ring, the rest left behind. Under 150 words.',
        },
      ],
      tasks: [
        { title: 'Cut the paragraph where she tells her whole life. Silhouette, not portrait', category: 'Writing' },
        { title: 'Find the smell of an emptied house: paint? dust? nothing at all?', category: 'Writing' },
        { title: 'Write the last section in one sitting, no more than 150 words', category: 'Writing' },
        { title: 'Subject line and preview text', category: 'Publishing' },
        { title: 'Header image: brass key tag on green felt (shoot at the market on Saturday)', category: 'Publishing' },
        { title: 'Credit Inês in the PS for the strawberry keyring', category: 'Readers' },
      ],
      fragments: [
        { text: 'Seven is somebody who was trusted with a great many doors.', part: 'ky-strawberry' },
        { text: 'Keys are the only thing people come back for crying.' },
        { text: 'A home becomes an address the moment you hand back the key.' },
      ],
    },
    {
      key: 'dress',
      title: 'Item 6388: A Wedding Dress, Size 10, Unworn',
      status: 'open',
      conviction: 'Some things are lost the moment they’re bought, because the life they were for never arrives.',
      truth: 'Not every unworn thing is a tragedy. Some are a narrow escape.',
      journey: [
        'The box — a dress box left on the 23:10, the tissue paper never opened.',
        'Assumption — Odile, and the reader with her, assume heartbreak.',
        'The turn — the woman who comes for it is laughing; she left it on purpose.',
        'The escape — the happiest story of the season, dressed as the saddest.',
      ],
      open: ['Does she take it home, or give it to the office? Odile’s office doesn’t accept gifts.'],
      tasks: [
        { title: 'Write the ledger entry first. It sets the tone', category: 'Writing' },
        { title: 'Ask paid readers: what’s the best thing you ever left behind?', category: 'Readers' },
      ],
    },
    {
      key: 'ledger',
      title: 'Odile’s Ledger',
      status: 'open',
      conviction: 'The finale is Odile’s own entry: the only item in nineteen years she has never filed.',
      truth: 'The person who keeps everyone’s things has never claimed her own.',
      journey: [
        'The last day — the office is closing for renovation; everything must be claimed or cleared.',
        'The shelves — Odile walks the years, December by December.',
        'The entry — she writes one last item, and it is her.',
        'Claimed — she signs for herself, and walks out.',
      ],
      open: ['What exactly is her entry? An object, or a year?', 'Do readers who caught every hint get a line only they will understand?'],
      tasks: [{ title: 'List every hint planted in issues 1–4 so the last page pays them all', category: 'Writing' }],
    },
  ],

  threads: [
    {
      key: 'speaks',
      name: 'Odile speaks',
      intent: 'The few times Odile says something out loud. Each one should cost her.',
      hue: 'violet',
      rules: ['She never says why she took the job.'],
      on: [
        { at: 'umbrella', note: 'Her first question in nineteen years: “Why do you keep bringing it back?”' },
        { at: 'ky-front-door', note: '“Which one was the front door?” She breaks her own rule.' },
        { at: 'ledger', note: 'She speaks the whole last page.' },
      ],
    },
    {
      key: 'left',
      name: 'What Odile left',
      intent: 'The season’s hidden story: small signs that Odile has filed herself away. Readers shouldn’t notice until the finale.',
      hue: 'ember',
      rules: ['One hint per issue, never more.', 'A hint is something she does, never something she thinks.'],
      on: [
        { at: 'gl-january', note: 'She goes out into January with bare hands.' },
        { at: 'keys', note: 'There is a key on her own ring that opens nothing.' },
        { at: 'ledger', note: 'Every hint is paid off here.' },
      ],
    },
    {
      key: 'readers',
      name: 'From the readers',
      intent: 'Stories seeded by something a reader wrote back. Credited in the PS, always with permission.',
      hue: 'tide',
      on: [
        { at: 'umbrella', note: 'Marisol’s mother’s red umbrella.' },
        { at: 'keys', note: 'Inês’s grandfather’s strawberry keyring.' },
        { at: 'dress', note: 'The question to paid readers.' },
      ],
    },
  ],

  items: [
    {
      kind: 'tasks',
      pieces: [],
      tasks: [
        { title: 'Welcome email for new subscribers mentions the season', done: true },
        { title: 'Update the About page with the season blurb', done: true },
        { title: 'Make the season’s ledger as a PDF for paid readers (end of season)' },
        { title: 'Arrange a guest post swap with Ana’s newsletter for November' },
      ],
    },
    {
      kind: 'palette',
      pieces: [],
      swatches: [
        { hex: '#2E4A3B', name: 'Ledger green' },
        { hex: '#B08D57', name: 'Brass tag' },
        { hex: '#8A8F93', name: 'Platform grey' },
        { hex: '#23395B', name: 'Blue ink' },
        { hex: '#C8B99A', name: 'Claim form' },
      ],
    },
  ],

  kept: [
    { kind: 'decision', text: 'The season ends with Odile’s own entry in the ledger.', why: 'She’s been filing everyone else for nineteen years.', daysAgo: 40 },
    {
      kind: 'decision',
      text: 'The stories stay free. The archive goes behind the paywall after a month, and paid readers get the season’s ledger as a PDF.',
      why: 'The stories are how strangers find me.',
      daysAgo: 33,
    },
    { kind: 'decision', text: 'Ledger entries go back to one line. Odile doesn’t do jokes.', quote: 'One line. Odile doesn’t do jokes.', daysAgo: 14 },
    { kind: 'open', text: 'Does the reader ever find out what Odile lost, or only that she lost something?', daysAgo: 14 },
    {
      kind: 'decision', piece: 'keys',
      text: 'The woman with the keys keeps her silhouette: one detail, not a biography.',
      why: 'The rule says silhouette, and I broke it.',
      quote: 'She doesn’t need a whole life, she needs one detail.',
      daysAgo: 3,
    },
    { kind: 'open', text: 'Season three: the same office, or another room of the station?', daysAgo: 2 },
  ],

  changes: [
    {
      piece: 'keys', field: 'intent', source: 'concept', daysAgo: 18,
      from: 'Keys are the hardest thing to lose.',
      to: 'Keys are the only thing people cry over when they come to collect them.',
    },
    {
      piece: 'ledger', field: 'core_truth', source: 'talk', daysAgo: 11,
      from: 'Odile is the last lost thing in the office.',
      to: 'The person who keeps everyone’s things has never claimed her own.',
    },
  ],

  reading: {
    daysAgo: 4,
    statement:
      'Each object in the season is something that holds or covers: a glove for a hand, an umbrella over a body, keys to a house, a dress for a life. Side by side they grow a size with every issue, from the hand outwards, and not one of them is something a person would lose by accident.',
    gaps: [
      {
        text: '“Never solve the owner” and “Keys” pull against each other: as drafted, the woman has a name, a street and forty-one years of history.',
        where: ['Item 6120: Keys to a House That’s Been Sold', 'Never solve the owner. Leave them a silhouette.'],
      },
      {
        text: '“What Odile left” promises one hint per issue, but it does not appear in the umbrella issue or the wedding dress.',
        where: ['What Odile left'],
      },
    ],
  },

  conversation: {
    title: 'Who the season is for',
    summary: 'Settled that the season is written for the reader on the train, not for other writers, and the ledger entries go back to one line. Whether readers learn what Odile lost is still open.',
    daysAgo: 14,
    messages: [
      { role: 'person', text: 'Almost everyone who comments is another writer. I can feel myself starting to write for them. Clever structure, little nods. I don’t like it.' },
      { role: 'companion', text: 'The canvas is clear about who it’s for: people who read on the train, alone, and sometimes miss their stop. Writers aren’t mentioned anywhere on it. When you say you’re writing for them, what has changed in an issue? Is it something you can point to?' },
      { role: 'person', text: 'The ledger entries got longer. More jokes in them. In the first issue it was one line. Now it’s a paragraph showing off.' },
      { role: 'companion', text: 'Your first rule already speaks to that: it’s read on a phone, between stops. A one-line entry costs that reader a breath; a paragraph costs them a stop. Which of the two is Odile’s voice, and which is yours, showing the other writers what you can do?' },
      { role: 'person', text: 'One line. Odile doesn’t do jokes. OK. Ledger entries go back to one line.' },
      { role: 'companion', text: 'I’ll keep that as a decision for the whole season. Something else the canvas raises: the hidden story depends on readers not noticing the hints until the end. Do you want them to learn what Odile lost, or only that she lost something?' },
      { role: 'person', text: 'I don’t know yet. If I tell them, it’s a twist. If I don’t, it’s a feeling. Leave it open.' },
      { role: 'companion', text: 'Kept under Still open. It doesn’t need an answer until you’re writing the ledger issue.' },
    ],
  },
}
