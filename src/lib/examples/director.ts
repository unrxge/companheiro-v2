// A creative director three weeks from presenting a global campaign. Shown to
// people who said they work as creative directors. The brand is invented.

import type { ExampleSource } from './types'

export const director: ExampleSource = {
  key: 'director',
  practices: ['director'],
  label: 'Creative director',
  who: 'a creative director three weeks from presenting a global campaign',
  teaser: 'The first campaign in eleven years for a 120-year-old luggage maker: a film, six arrivals halls, an editorial issue and a repair ledger.',
  title: 'Aldermoor: Come Back Different',
  intent:
    'The first campaign in eleven years for Aldermoor, the trunk and luggage maker founded in 1903, launching in six markets in March. The client wants relevance with travellers under 45 without losing the owners who have carried the same case for thirty years. The campaign stands on the one thing no competitor can say: Aldermoor repairs every case it has ever made, for as long as it exists. Travel changes the people who do it; the case is what carries them through the change. For people who travel to come back as someone slightly different, and who are tired of travel sold as a backdrop.',
  arc: 'Breakaway',
  rules: [
    'No beaches, no infinity pools, nobody gazing at a view.',
    'Show the change; never claim it.',
    'The product is never the hero shot. The marks on it are.',
    'Every line has to work in an arrivals hall at six in the morning.',
  ],
  startedDaysAgo: 49,

  log: [
    { role: 'assistant', content: 'What has been taking up most of your thinking lately?' },
    { role: 'user', content: 'A pitch. Aldermoor, the luggage people. They haven’t run a campaign in eleven years and they’ve finally asked three agencies in. The brief says “make us relevant to a younger traveller”. Every agency in that room will show them a twenty-eight-year-old on a rooftop in Lisbon.' },
    { role: 'assistant', content: 'What do you know about them that the brief doesn’t say?' },
    { role: 'user', content: 'They repair everything they’ve ever made. Forever. There’s a workshop in Northampton with cases from the fifties on the bench. Nobody outside the trade knows.' },
    { role: 'assistant', content: 'What did you feel, standing in that workshop?' },
    { role: 'user', content: 'That those cases have been everywhere, and the people who own them came back different every time. The case is the only thing on the trip that stays itself.' },
    { role: 'assistant', content: 'Who is it for? Not the age range in the brief. The person.' },
    { role: 'user', content: 'Someone who travels to be changed, not to be photographed. Who has done the infinity pool and felt nothing. Who wants to come home and find they’re slightly not the person who left.' },
    { role: 'assistant', content: 'Where does that person feel it most?' },
    { role: 'user', content: 'Arriving. Not leaving. Every luxury brand buys departures: the lounge, the gate, the anticipation. Nobody is in arrivals at six in the morning, when you’re tired and changed and the city looks exactly the same.' },
    { role: 'assistant', content: 'Then this is what I hear underneath it: travel changes the people who do it, and what is worth owning is what carries you through the change. Does that hold?' },
    { role: 'user', content: 'Yes. And the line is already in there. Come back different.' },
    { role: 'assistant', content: 'Then give that line a rule to live by: show the change, never claim it.' },
  ],

  pieces: [
    {
      key: 'platform',
      title: 'The platform: Come Back Different',
      status: 'done',
      conviction: 'Luxury is not the destination. It is being changed by the trip, and owning something that lasts through it.',
      truth: 'We travel to come back as someone slightly different, and the one thing worth keeping the same is what carries us.',
      journey: [
        'Recognition — a tired traveller reads a line in an arrivals hall that names what they feel and have not said.',
        'Curiosity — the brand is barely signed; they look for who said it.',
        'Proof — they find the workshop: every case ever made, still being mended.',
        'Belonging — owning one becomes a way of keeping a record of who you have been.',
      ],
      parts: [
        {
          key: 'pl-insight', title: 'The insight', beat: 'grounded',
          body: 'Every travel brand sells leaving. Nobody speaks to arriving: six in the morning, tired, changed, and the city exactly as you left it.\n\nThe category sells the trip as a backdrop. Our traveller is tired of being the subject of their own holiday photographs. They go to be changed, and they come home not quite the person who left.',
        },
        {
          key: 'pl-truth', title: 'The truth only Aldermoor can tell', beat: 'tender',
          body: 'Aldermoor has repaired every case it has made since 1903, and still does. There are cases on the Northampton bench that have crossed the Atlantic forty times. The case is the one thing on the journey that stays itself, so the person carrying it can change.',
        },
        {
          key: 'pl-line', title: 'The platform', beat: 'expansive',
          body: 'Come back different.\n\nNot an instruction and not a promise. An observation, made only where it is true: in arrivals halls, in the histories of the cases on the bench, in the people who carry them.',
        },
        {
          key: 'pl-never', title: 'What we will not do', beat: 'urgent',
          body: 'No sunsets, no views, no models looking into the distance.\nNo “adventure”.\nNo claim that a suitcase changes your life.\nThe case is never shot new.',
        },
      ],
      tasks: [
        { title: 'Present the platform to the CMO and the family board in the workshop, not a meeting room', category: 'Client', done: true },
        { title: 'One-page pre-read: the arrivals insight first, the line last', category: 'Strategy', done: true },
      ],
      fragments: [
        { text: 'Everyone sells the leaving. Nobody is in arrivals at six in the morning.', part: 'pl-insight' },
        { text: 'The case is the only thing on the trip that stays itself.', part: 'pl-truth' },
      ],
    },
    {
      key: 'film',
      title: 'Hero film: Arrivals',
      status: 'drafted',
      conviction: 'The most honest moment of any journey is the first ten minutes back.',
      truth: 'Coming home shows you who you have become, because everything else stayed the same.',
      journey: [
        '6:04 — a woman walks out into arrivals after a year away; nobody is waiting.',
        'The city — the taxi, the same streets, the same corner shop, and her face not quite the same.',
        'The flat — everything exactly where she left it, except her.',
        'The case — scuffed, a strap re-stitched in Lisbon, set down in the hall. One typed line.',
      ],
      open: ['A director from fashion film, or one with a documentary eye?', 'Is she alone at the end, or does the phone ring?'],
      parts: [
        {
          key: 'fm-treatment', title: 'Treatment', beat: 'grounded',
          body: 'Ninety seconds, one take wherever we can bear it. Shot at real arrival times, available light, 35mm. She says nothing. We never see where she has been, only that she has been.\n\nNo voiceover. One line in the last frame, typed, never spoken.',
        },
        {
          key: 'fm-casting', title: 'Casting', beat: 'tender',
          body: 'Not a model. Someone who has really just come back from a long time away, street cast in Heathrow T2 and Lisbon arrivals. Thirty to fifty. Their own case if it is an Aldermoor; one aged by the workshop if not.',
        },
        {
          key: 'fm-sound', title: 'Sound', beat: 'restless',
          body: 'No music for the first sixty seconds: the hall, the taxi, the key in the door. Then one sustained piano note under the line. Commissioned, never licensed.',
        },
        {
          key: 'fm-cuts', title: 'Cutdowns', beat: 'expansive',
          intent: 'Thirty, fifteen and six seconds, each built on the one shot that carries the whole film: the key in the door.',
        },
      ],
      tasks: [
        { title: 'Three treatments from the director shortlist by the 28th', category: 'Production' },
        { title: 'Recce Heathrow T2 and Lisbon arrivals at 5:30am', category: 'Production' },
        { title: 'Ask the workshop to age two cases: ten years of use, and thirty', category: 'Production', done: true },
        { title: 'The last frame: decide the full stop', category: 'Writing' },
      ],
      fragments: [{ text: 'Everything exactly where she left it, except her.', part: 'fm-treatment' }],
    },
    {
      key: 'arrivals',
      title: 'Out of home: the arrivals halls',
      status: 'drafted',
      conviction: 'Speak to people at the moment the change is true, and nowhere else.',
      truth: 'The only honest place to say “come back different” is the place people come back to.',
      journey: [
        'Off the plane — tired, a little unreal, walking past baggage reclaim.',
        'The line — one sentence on a wall, no product, a logo the size of a luggage tag.',
        'The pause — they read it twice.',
        'Later — the same line on a scuffed case in a shop window across town.',
      ],
      parts: [
        {
          key: 'ar-buy', title: 'The buy', beat: 'grounded',
          body: 'Arrivals only, in six airports: Heathrow T2, JFK T4, Lisbon, Frankfurt, Incheon, São Paulo. Not one departures panel. Baggage reclaim and the walk to the taxi rank, where people are tired and honest.',
        },
        {
          key: 'ar-lines', title: 'Lines', beat: 'tender',
          body: 'You’re not the same. Your case is.\nWelcome back. You look different.\nEverything here is exactly where you left it. Except you.\nThe city didn’t change. Look again.',
        },
        {
          key: 'ar-desk', title: 'The repair desk', beat: 'expansive',
          body: 'A working Aldermoor bench in Heathrow T2 arrivals for the launch fortnight. Any case, any brand, mended free while you wait. We repair what is broken and never what is marked.',
        },
      ],
      tasks: [
        { title: 'Arrivals-only inventory in six airports; release the departures hold', category: 'Media' },
        { title: 'Clear “every case we have ever made” with legal before it goes on a wall', category: 'Legal' },
        { title: 'Who pays for the repair desk: media or experiential? Settle with the CMO', category: 'Client' },
        { title: 'Twenty arrivals lines, keep four', category: 'Writing', done: true },
      ],
      fragments: [
        { text: 'You’re not the same. Your case is.', part: 'ar-lines' },
        { text: 'We repair what’s broken, never what’s marked.', part: 'ar-desk' },
      ],
    },
    {
      key: 'issue',
      title: 'Editorial: The Return Issue',
      status: 'open',
      conviction: 'Depth is earned in print, not bought in media.',
      truth: 'A brand earns a place in people’s lives by publishing something worth keeping, not by interrupting what they read.',
      journey: [
        'The cover — no product: an empty hallway at dawn, a case set down in it.',
        'The essays — eight writers on the first night home after a long time away.',
        'The back page — the only Aldermoor in the issue: one entry from the repair books.',
        'The shelf — kept, not recycled.',
      ],
      open: ['Partner with an existing travel quarterly, or publish under Aldermoor’s own name?'],
      tasks: [
        { title: 'Shortlist three quarterlies whose readers match the person, not the biggest circulation', category: 'Strategy' },
        { title: 'Commission list: eight writers, at least four from outside the travel beat', category: 'Writing' },
      ],
    },
    {
      key: 'ledger',
      title: 'The Repair Ledger',
      status: 'open',
      conviction: 'The best proof a brand has is the history of its own products.',
      tasks: [
        { title: 'Ask the family for the 1952–1990 repair books', category: 'Client' },
        { title: 'An owner’s record that travels with the case: always asked for, never automatic', category: 'Strategy' },
      ],
    },
  ],

  threads: [
    {
      key: 'marks',
      at: { x: 2.25, y: 24 },
      name: 'The marks',
      intent: 'Scuffs, re-stitched straps, stickers half peeled: the record of where a case has been. The product is only ever seen with them.',
      hue: 'ochre',
      rules: ['A new case is never shown.'],
      on: [
        { at: 'fm-casting', note: 'Cases aged by the workshop: ten years of use, and thirty.' },
        { at: 'ar-desk', note: 'Repair what is broken, keep what is marked.' },
        { at: 'ledger', note: 'Every mark has an entry.' },
      ],
    },
    {
      key: 'arriving',
      at: { x: 1.12, y: 300 },
      name: 'Arriving, never leaving',
      intent: 'The campaign lives at the end of journeys: arrivals halls, the first night home, the hallway.',
      hue: 'tide',
      rules: ['Nothing at a departure gate. Ever.'],
      on: [
        { at: 'film', note: 'Opens in arrivals, ends in her hall.' },
        { at: 'arrivals', note: 'The only places we buy.' },
        { at: 'issue', note: 'The first night home, eight times over.' },
      ],
    },
    {
      key: 'workshop',
      at: { x: 0.1, y: 190 },
      name: 'The Northampton workshop',
      intent: 'The one place that proves the claim. Seen, never described.',
      hue: 'violet',
      on: [
        { at: 'pl-truth', note: 'Cases on the bench that crossed the Atlantic forty times.' },
        { at: 'issue', note: 'The back page comes straight from the repair books.' },
        { at: 'ledger', note: 'Where every entry is written.' },
      ],
    },
  ],

  items: [
    {
      kind: 'palette',
      pieces: ['platform'],
      at: { x: 0.04, y: 24 },
      swatches: [
        { hex: '#C9D3DA', name: 'Arrivals at 6am' },
        { hex: '#E8A04A', name: 'Night taxi' },
        { hex: '#9C5A27', name: 'Workshop tan' },
        { hex: '#1F2A44', name: 'Ledger ink' },
        { hex: '#EDE8DF', name: 'Hallway white' },
      ],
    },
    {
      kind: 'tasks',
      pieces: [],
      at: { x: 0.58, y: 16 },
      tasks: [
        { title: 'Pre-read to the CMO', done: true },
        { title: 'Workshop visit booked for the family board', done: true },
        { title: 'Media agency: arrivals-only plan, with what departures would have cost' },
        { title: 'Legal on the repair claim' },
        { title: 'Decide who presents the film idea (not me)' },
      ],
    },
    {
      kind: 'image',
      pieces: ['film'],
      at: { x: 1.1, y: 30 },
      caption: 'The light for the film: arrivals at 6am. Cold, flat, honest. Not golden hour.',
      file: { name: 'director-arrivals-light.jpg', mime: 'image/jpeg', bytes: 374603, width: 1200, height: 800 },
    },
    {
      kind: 'image',
      pieces: ['film'],
      at: { x: 1.66, y: 70 },
      caption: 'The taxi home: the city out of focus, because she isn’t looking at it.',
      file: { name: 'director-taxi-home.jpg', mime: 'image/jpeg', bytes: 403381, width: 1200, height: 800 },
    },
    {
      kind: 'image',
      pieces: ['arrivals'],
      at: { x: 2.3, y: 160 },
      caption: 'The marks are the product. Age the hero cases until they look like this.',
      file: { name: 'director-scuffed-leather.jpg', mime: 'image/jpeg', bytes: 289098, width: 1200, height: 800 },
    },
  ],

  kept: [
    { kind: 'decision', text: 'Arrivals only. Not one departures panel in any market.', why: 'Everyone sells the leaving.', daysAgo: 26 },
    { kind: 'decision', piece: 'film', text: 'No voiceover. One typed line in the last frame.', daysAgo: 18 },
    {
      kind: 'decision', piece: 'arrivals',
      text: 'A working repair desk in Heathrow T2 arrivals for the launch fortnight: it repairs what is broken and never what is marked.',
      why: 'It turns the message into a service, and the press gets a story instead of a media plan.',
      quote: 'We repair what’s broken, never what’s marked.',
      daysAgo: 6,
    },
    {
      kind: 'decision',
      text: 'The launch opens with two weeks of arrivals halls and the repair desk before the film appears anywhere.',
      why: 'If the film goes first, the arrivals halls become its cutdown.',
      daysAgo: 6,
    },
    { kind: 'open', text: 'Who pays for the repair desk: the media budget or experiential?', daysAgo: 6 },
    { kind: 'open', text: 'Whether the Repair Ledger sign-up belongs at launch or after it, as the answer to the CMO on conversion.', daysAgo: 6 },
  ],

  changes: [
    {
      piece: 'platform', field: 'core_truth', source: 'concept', daysAgo: 40,
      from: 'An Aldermoor case lasts a lifetime.',
      to: 'We travel to come back as someone slightly different, and the one thing worth keeping the same is what carries us.',
    },
    {
      piece: 'arrivals', field: 'intent', source: 'talk', daysAgo: 20,
      from: 'Own the airport.',
      to: 'Speak to people at the moment the change is true, and nowhere else.',
    },
  ],

  reading: {
    daysAgo: 3,
    statement:
      'Every piece is set at the end of a journey rather than the start of one: an arrivals hall, a first night home, a workshop where cases come back to be mended. Held side by side, the campaign never shows anyone travelling, only people and objects that have travelled, which leaves the Repair Ledger as the one piece that holds a whole journey at once.',
    gaps: [
      {
        text: '“Show the change; never claim it” and the arrivals lines pull against each other: “You look different” and “Except you” both tell people they have changed.',
        where: ['Out of home: the arrivals halls', 'Show the change; never claim it.'],
      },
      {
        text: '“The Repair Ledger” has no core truth yet, though the platform rests its proof on the workshop and two threads run through it.',
        where: ['The Repair Ledger'],
      },
    ],
  },

  conversation: {
    title: 'How it reaches them, and in what order',
    summary: 'Decided the campaign opens in arrivals halls with a working repair desk two weeks before the film. Who funds the desk, and how to answer the CMO on conversion, are still open.',
    daysAgo: 6,
    messages: [
      { role: 'person', text: 'How does this reach them?' },
      { role: 'companion', text: 'The canvas has four ways in, and they do different jobs. The arrivals halls are the only place the idea is literally true. The film is the emotional anchor. The Return Issue is depth for the few who want it. The Repair Ledger is proof. Most campaigns at this level lead with the film and let everything else follow. Yours is built the other way round. If the film launches first, the arrivals halls become a cutdown of something people have already seen. If the halls go first, the film becomes the explanation of something people have already felt. Which do you want the world to meet first?' },
      { role: 'person', text: 'The halls. Two weeks of just the lines in six airports, logo no bigger than a luggage tag. Then the film.' },
      { role: 'companion', text: 'Then the risk the canvas carries is attribution. A line loved in an arrivals hall, signed with a luggage-tag logo, can end up remembered as everyone’s and no one’s. The canvas holds one thing that is unmistakably Aldermoor’s and can’t be borrowed: the workshop, mending every case it has made since 1903. Is there a way for the workshop itself to stand in the halls, so the brand is carried by its proof rather than its logo?' },
      { role: 'person', text: 'A repair desk. A working Aldermoor bench in Heathrow arrivals for the launch fortnight. Any case, any brand, mended free while you wait. Ours get a ledger entry.' },
      { role: 'companion', text: 'That turns the out-of-home from a message into a service, and it hands the press a story instead of a media plan: a maker that has been mending cases since 1903 repairing its competitors’ luggage in a terminal is news, and a poster is not. It also pulls against your own rule that the marks are the product. A repair desk fixes things. Does it erase the scuffs, or keep them?' },
      { role: 'person', text: 'Keep them. We repair what’s broken, never what’s marked. That’s the line on the desk.' },
      { role: 'companion', text: 'I’ll keep that as a decision on the arrivals piece, and the order of the launch as a decision for the whole campaign. There is a question the canvas doesn’t answer yet, and you will be asked it: where the conversion is.' },
      { role: 'person', text: 'The CMO will ask it in the first five minutes. Their performance team wants a direct-response layer from day one.' },
      { role: 'companion', text: 'What it will convert is not something I can tell you, and nobody honestly can before it runs. What the canvas does offer is a reason to raise a hand that isn’t a discount: the Repair Ledger. An owner who registers a case has its repair history kept with it. That gives the performance team an audience of their own, built on the brand’s truth instead of a promotion that cheapens it. Whether it belongs at launch or after is a call for you and the CMO. I’ll keep it under Still open, beside who pays for the desk.' },
      { role: 'person', text: 'Leave both open. I’ll take them to Thursday.' },
      { role: 'companion', text: 'Both are under Still open for the whole campaign.' },
    ],
  },
}
