// A filmmaker shooting a short documentary series. Shown to people who said
// they make content or work as cinematographers.

import type { ExampleSource } from './types'

export const series: ExampleSource = {
  key: 'series',
  practices: ['creator', 'cinematographer'],
  label: 'Filmmaker',
  who: 'a filmmaker three episodes into a documentary series',
  teaser: 'Five people who work through the night, filmed under the last sodium streetlights before the city switches to LED.',
  title: 'The Orange Hours',
  intent:
    'A five-part documentary series, eight to twelve minutes an episode, about people who work while the city sleeps, filmed only under the last sodium streetlights before the council replaces them with white LEDs this winter. The night has a colour, and it is being switched off. For anyone who has walked home at 4am and felt the city belonged to them, and for the people who were awake making that possible. Episodes on YouTube, vertical cuts for Instagram, one festival cut.',
  arc: 'Breakaway',
  rules: [
    'Available light only. No added fixtures, ever.',
    'Handheld at chest height: we are a colleague, not a camera.',
    'Nobody appears without seeing their cut first.',
    'Vertical cuts come from the edit, never shot separately.',
  ],
  startedDaysAgo: 71,

  log: [
    { role: 'assistant', content: 'What have you been noticing that nobody else seems to?' },
    { role: 'user', content: 'The streetlights. My whole street went from orange to this blue-white LED in one week. It looks like a car park now. Nobody said a word. And I realised every night scene I’ve ever loved, I shot under sodium.' },
    { role: 'assistant', content: 'So a look is disappearing. But a look on its own is a reel, not a series. Who lives in that light?' },
    { role: 'user', content: 'Night workers. The man who washes the trams at the depot. Nurses. Taxi drivers. The fish market at 5am. People who only ever see the city orange.' },
    { role: 'assistant', content: 'What do you feel when you film at night that you don’t feel by day?' },
    { role: 'user', content: 'That everyone awake is on the same side. Like a secret shift.' },
    { role: 'assistant', content: 'Who is watching? One person, one screen.' },
    { role: 'user', content: 'Someone who’s walked home at 4am and felt like the city was theirs. And people who work nights, who never see themselves on screen unless it’s a crime drama.' },
    { role: 'assistant', content: 'Then the series holds two things at once: a light that is ending, and the people who live in it. What’s the sentence under both?' },
    { role: 'user', content: 'The night has a colour, and it’s being switched off. And the people who kept it lit were always the ones nobody saw.' },
    { role: 'assistant', content: 'And what will you refuse to do, however good it would look?' },
    { role: 'user', content: 'Light anything. If the sodium’s gone, we show the white. No gels, no faking it.' },
  ],

  pieces: [
    {
      key: 'tram',
      title: 'Ep. 1: The Tram Washer',
      status: 'done',
      conviction: 'The first people awake are the ones who make the city look as if it slept.',
      truth: 'Somebody washes the morning before anyone sees it.',
      journey: [
        'Cold open — twenty seconds of Sr. Armando in the depot doorway before his shift, saying nothing.',
        'The wash — water, brushes, orange light on wet metal: the city’s whole morning being polished.',
        'The confession — in eleven years he has never ridden a tram in daylight.',
        'First tram out — 5:52; he watches it leave clean and goes home as the yard lamp goes off.',
      ],
      parts: [
        {
          key: 'tr-cold-open', title: 'Cold open', beat: 'grounded',
          body: 'WIDE, locked off, 35mm. Sr. Armando in the depot doorway, under the one sodium lamp left in the yard. Twenty seconds. He lights nothing, says nothing.\n\nNo music. Depot hum, a tram sighing on its rails.\n\nTitle over black: THE ORANGE HOURS.',
        },
        {
          key: 'tr-wash', title: 'The wash', beat: 'expansive',
          body: 'Handheld at chest height, walking with him. 35mm at f/1.4, ISO 6400: the sodium turns the water to copper. Let the noise read as grain; don’t clean it out in the grade.\n\nSound: brushes, the pressure hose, his radio on the bench, a football match from somewhere far away.',
        },
        {
          key: 'tr-daylight', title: 'Daylight', beat: 'tender',
          body: 'ARMANDO (V.O.): “Eleven years. I’ve never been on one in the day. I wouldn’t know what it looks like full of people.”\n\nHold on his face. Don’t cut away to cover.',
        },
        {
          key: 'tr-first-out', title: 'First tram out', beat: 'urgent',
          body: '5:52. The first tram leaves the depot spotless. He watches it go. Above him the yard lamp ticks off at 6:04. We got it in one take.',
        },
      ],
      tasks: [
        { title: 'Final grade: keep the sodium orange, don’t correct it to white', category: 'Edit', done: true },
        { title: 'Premiere on YouTube, Thursday 21:00', category: 'Publish', done: true },
        { title: 'Three vertical cuts: the cold open, the hose, “never been on one in the day”', category: 'Publish', done: true },
        { title: 'Send Sr. Armando the link and a printed still', category: 'Release', done: true },
      ],
      fragments: [
        { text: 'I’ve never been on one in the day.', part: 'tr-daylight' },
        { text: 'You don’t light the night. You find where it’s already lit.' },
      ],
    },
    {
      key: 'ward',
      title: 'Ep. 2: Ward 4, Night',
      status: 'drafted',
      conviction: 'Night nurses hold the hours when people are most afraid, and nobody thanks the hour.',
      truth: 'The bravest work in a hospital happens after the visitors have gone home.',
      journey: [
        'Corridor — a long fluorescent corridor; the one window at the end of it is orange.',
        'Rounds — Enfermeira Rosa checks on sleepers by the sound of their breathing.',
        '3am — the hardest hour, and she names it: “the hour people let go.”',
        'Handover — at 8 she tells the day nurse everything, then walks out into white daylight.',
      ],
      open: ['The ward is lit by fluorescent, not sodium. Does it belong in this series, or is the window enough?'],
      ethos: 'No patient’s face, ever. If a hand is in frame, it is there with permission.',
      parts: [
        {
          key: 'wd-corridor', title: 'The corridor', beat: 'grounded',
          body: 'Locked-off wide. The corridor is fluorescent, green-white; the window at the far end is the only sodium in the episode. Hold until a nurse crosses the window.\n\nCurrently 2:40. Needs to be 1:30.',
        },
        {
          key: 'wd-rounds', title: 'Rounds', beat: 'tender',
          body: 'Handheld at her shoulder. The ward night-lights are so low we are at ISO 12800. Accept it. Grain is honest; a lamp would be a lie.',
        },
        {
          key: 'wd-3am', title: '3am', beat: 'restless',
          body: 'ROSA (V.O.): “Three is the hour people let go. We don’t say it to families. But we know.”\n\nStill missing: the shot of her at the window. Reshoot Tuesday night.',
        },
        {
          key: 'wd-handover', title: 'Handover', beat: 'expansive',
          intent: 'She walks out into white daylight: the only daylight in the series before the finale.',
        },
      ],
      tasks: [
        { title: 'Cut the corridor sequence down to 1:30', category: 'Edit' },
        { title: 'Reshoot Tuesday: Rosa at the window, 3am', category: 'Shoot' },
        { title: 'Send Rosa her cut before anything goes out (rule three)', category: 'Edit' },
        { title: 'Written sign-off on the final cut from the hospital’s comms team', category: 'Release' },
        { title: 'Write the episode description. No adjectives about “heroes”', category: 'Writing' },
      ],
      fragments: [{ text: 'Three is the hour people let go.', part: 'wd-3am' }],
    },
    {
      key: 'lamps',
      title: 'Ep. 3: The Man Who Switches Off the Night',
      status: 'drafted',
      conviction: 'The person who ends a thing can be the one who loved it most.',
      truth: 'Sr. Augusto has replaced four thousand sodium lamps, and he says goodnight to every one.',
      journey: [
        'The lift — up in the cherry picker at 2am, the city orange beneath him.',
        'The swap — one lamp out, one LED in; the street goes from amber to white in a second.',
        'The confession — he keeps one old sodium bulb from every street, in his garage.',
        'The garage — he switches one on for us: the only sodium lamp in the city that will never be replaced.',
      ],
      open: ['Do we film him at home with his family, or keep him in the night?'],
      parts: [
        {
          key: 'lp-lift', title: 'The lift', beat: 'expansive',
          body: 'From the ground: 85mm, him rising into the orange. From the basket: the 35mm, the street below.\n\nSafety: harness on the camera op, council escort, nothing handheld over the edge.',
        },
        {
          key: 'lp-swap', title: 'The swap', beat: 'urgent',
          body: 'One take, no reset: we get one lamp a night on this street. Expose for the sodium and let the LED blow out. That clip is the whole series in four seconds.',
        },
        {
          key: 'lp-garage', title: 'The garage', beat: 'tender',
          intent: 'His collection: shelves of old bulbs, each with a street name on masking tape. He switches one on.',
        },
      ],
      tasks: [
        { title: 'Recce the route at 2am: which streets still have sodium next week?', category: 'Shoot', done: true },
        { title: 'Test the FX3 at ISO 12800 under LED and under sodium. Does the noise read as grain?', category: 'Shoot', done: true },
        { title: 'Book the 35mm f/1.4 again, and the 85', category: 'Shoot' },
        { title: 'Questions for Sr. Augusto: the first lamp he ever changed, and the one he never will', category: 'Writing' },
      ],
      fragments: [
        { text: 'He says goodnight to every lamp before he switches it off.' },
        { text: 'Amber to white in four seconds. The whole series in one swap.', part: 'lp-swap' },
      ],
    },
    {
      key: 'taxi',
      title: 'Ep. 4: Taxi, 3am',
      status: 'open',
      conviction: 'A night taxi is a confessional with the meter running.',
      open: ['Could the driver’s route stand in for the map?'],
      tasks: [
        { title: 'Find a driver who’ll let us ride along for three nights', category: 'Shoot' },
        { title: 'Rig: a dash mount and one handheld. Make sure it doesn’t look like a gimbal', category: 'Shoot' },
      ],
    },
    {
      key: 'dawn',
      title: 'Ep. 5: Dawn Market',
      status: 'open',
      conviction: 'The series ends where the night does: at the fish market, the morning the last sodium lamp in the district goes out.',
      truth: 'Every night ends, and the people who worked it go home in a light that isn’t theirs.',
      journey: [
        '5am — the market under orange: ice, silver fish, everyone shouting.',
        'The others — Armando, Rosa and Augusto, each glimpsed on their way home.',
        'The switch — the last sodium lamp in the district ticks off at sunrise.',
        'White — the daylight comes in, uncorrected, and we stop.',
      ],
      open: ['How many nights do we wait for the last lamp? The council won’t give a date.'],
      tasks: [{ title: 'Ask the council for the switch-off schedule in the market district', category: 'Shoot' }],
    },
  ],

  threads: [
    {
      key: 'sodium',
      name: 'Sodium light',
      intent: 'The 589-nanometre orange of the old streetlights: the look of the series, and the thing it is about.',
      hue: 'ochre',
      rules: ['Never faked with a gel. If the sodium has gone, show the white.'],
      on: [
        { at: 'tr-cold-open', note: 'The last lamp left in the depot yard.' },
        { at: 'wd-corridor', note: 'Only through the window at the end of the corridor.' },
        { at: 'lamps', note: 'He is the one switching it off.' },
        { at: 'dawn', note: 'The last one in the district, going out.' },
      ],
    },
    {
      key: 'silence',
      name: 'Before the shift',
      intent: 'Each person held in silence for twenty seconds before they start work.',
      hue: 'tide',
      rules: ['Hold it longer than feels comfortable. Twenty seconds at least.'],
      on: [
        { at: 'tr-cold-open', note: 'Armando in the depot doorway.' },
        { at: 'ward', note: 'Rosa in the locker room, putting her watch on face-down.' },
        { at: 'lamps', note: 'Augusto in the cab of the truck, engine off.' },
      ],
    },
    {
      key: 'map',
      name: 'The city map',
      intent: 'A hand-drawn map of the city where the orange dots go out, one episode at a time.',
      hue: 'violet',
      on: [
        { at: 'tram', note: 'Every dot orange.' },
        { at: 'lamps', note: 'Half of them white.' },
        { at: 'dawn', note: 'The last one.' },
      ],
    },
  ],

  items: [
    {
      kind: 'palette',
      pieces: ['tram', 'lamps'],
      swatches: [
        { hex: '#FF9A2E', name: 'Sodium, 589nm' },
        { hex: '#E6ECF2', name: 'LED white' },
        { hex: '#1B2A44', name: '4am blue' },
        { hex: '#2F5D50', name: 'Wet tram green' },
        { hex: '#CFE3D4', name: 'Ward fluorescent' },
      ],
    },
    {
      kind: 'tasks',
      pieces: ['lamps'],
      tasks: [
        { title: 'FX3 and four batteries (the cold drains them by 4am)', done: true },
        { title: '35mm f/1.4', done: true },
        { title: 'Hi-vis vests, two', done: true },
        { title: '85mm f/1.8' },
        { title: 'Lav mic for Sr. Augusto' },
        { title: 'Hand warmers: it’s 4°C up on the lift' },
      ],
    },
  ],

  kept: [
    { kind: 'decision', text: 'Vertical cuts point to the episode. They never replace it.', daysAgo: 30 },
    {
      kind: 'decision', piece: 'dawn',
      text: 'Episode five ends on the last sodium lamp in the district going out at dawn. We wait for it, however many nights it takes.',
      why: 'It’s the only ending that’s true.',
      daysAgo: 24,
    },
    {
      kind: 'decision', piece: 'lamps',
      text: 'Sr. Augusto is not the villain. He is the one who loves the lamps most.',
      why: 'He keeps a bulb from every street.',
      quote: 'He’s not the villain, he’s the one who loves them most.',
      daysAgo: 13,
    },
    {
      kind: 'decision', piece: 'taxi',
      text: 'The taxi episode earns its place by showing the city change street by street, or it goes.',
      quote: 'The taxi earns its place by showing the change street by street, or it goes.',
      daysAgo: 7,
    },
    { kind: 'open', text: 'Festival cut: episodes one and three as a single film, or the series as it is?', daysAgo: 7 },
    { kind: 'open', text: 'Is there a sixth episode about us, the crew, at night?', daysAgo: 3 },
  ],

  changes: [
    {
      piece: 'lamps', field: 'intent', source: 'talk', daysAgo: 13,
      from: 'Progress erases the beauty nobody thought to protect.',
      to: 'The person who ends a thing can be the one who loved it most.',
    },
    {
      piece: 'ward', field: 'open_threads', source: 'room', daysAgo: 8,
      from: '',
      to: 'The ward is lit by fluorescent, not sodium. Does it belong in this series, or is the window enough?',
    },
  ],

  reading: {
    daysAgo: 2,
    statement:
      'Every episode so far follows one person through a single shift, and in each the light changes exactly once: a yard lamp ticking off, a ward door opening onto daylight, a street turning white in one swap. Side by side the series is a run of small dawns before the real one, and the finale is the only episode where the change of light is the story rather than the ending.',
    gaps: [
      {
        text: '“Taxi, 3am” has no core truth and nothing on the canvas tying it to the sodium light, though the series says it is filmed only under it.',
        where: ['Ep. 4: Taxi, 3am', 'Sodium light'],
      },
      {
        text: '“Ward 4, Night” takes place under fluorescent light, and the series’ purpose says it is filmed under the last sodium streetlights; the window at the end of the corridor is the only place the two meet.',
        where: ['Ep. 2: Ward 4, Night'],
      },
    ],
  },

  conversation: {
    title: 'What is weakest in the series',
    summary: 'Named the taxi episode as the one least tied to the light, and decided it earns its place by showing the city change street by street, or goes. The festival cut is still open.',
    daysAgo: 7,
    messages: [
      { role: 'person', text: 'Say what is weakest in this.' },
      { role: 'companion', text: 'Whether any of it is good isn’t mine to say, but I can tell you where the canvas holds least: “Taxi, 3am”. Every other episode has a person whose work touches the light the series is about. Armando works under the last lamp in the yard, Augusto switches the lamps off, the market is where the last one goes out, and even the ward has its one orange window. The taxi episode has a conviction about confession, no core truth yet, and nothing connecting it to sodium light.' },
      { role: 'person', text: 'It’s the one I pitched first. A taxi at night is the most cinematic thing I can think of.' },
      { role: 'companion', text: 'That might be why it’s the loosest: the image came before the idea. The series is about a light being switched off and the people who live in it. What does a taxi driver see of that light that nobody else in the series does?' },
      { role: 'person', text: 'Oh. He drives through every neighbourhood in one night. He’d see the city change street by street. Orange, white, orange, white. He’d know which districts are already done.' },
      { role: 'companion', text: 'Then he might be the only person who can show the whole city changing within one shift, which is what “The city map” is trying to do with drawings. You could build the episode’s concept on that if you want to. Do you want to keep it as a question for now, or settle that the episode stays only if it holds to this?' },
      { role: 'person', text: 'Settle it. The taxi earns its place by showing the change street by street, or it goes.' },
      { role: 'companion', text: 'Kept as a decision on the episode. Its open thread now asks whether the driver’s route could stand in for the map.' },
    ],
  },
}
