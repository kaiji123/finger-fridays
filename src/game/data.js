// All tunable game content lives here.

export const CURSES = {
  sausage: { name: 'Sausage fingers', desc: 'Your fingertips have swollen. Good luck.' },
  reshuffle: { name: 'Reshuffle', desc: 'Every time Gary yells, the keys scramble.' },
  coffee: { name: 'Coffee hand', desc: 'Your left hand is holding coffee. Type one-handed.' },
  mittens: { name: 'Mittens', desc: 'The AC is broken. Your fingers are one big blob.' },
};

// Each rank: shift length (seconds), active curses, boss walk-by gap (seconds), prompts.
export const RANKS = [
  {
    name: 'Intern', time: 60, curses: ['sausage'], bossGap: [16, 22],
    prompts: [
      'dear valued client, the report is attached.',
      'hi team, the coffee machine is broken again.',
      'sorry for the late reply, i was in a meeting.',
      'hello, i have fixed the typo in the slides.',
    ],
  },
  {
    name: 'Junior', time: 70, curses: ['sausage', 'reshuffle'], bossGap: [14, 20],
    prompts: [
      'hi all, the updated slides are attached. the numbers look great.',
      'dear client, sorry for the delay. your order will ship on monday.',
      'quick reminder, the quarterly review has moved to friday at five.',
    ],
  },
  {
    name: 'Manager', time: 80, curses: ['sausage', 'reshuffle', 'coffee'], bossGap: [13, 18],
    prompts: [
      'team, great work this week. please submit your timesheets before you leave.',
      'dear valued client, thank you for your patience. the issue is now resolved.',
    ],
  },
  {
    name: 'Director', time: 85, curses: ['mittens', 'reshuffle'], bossGap: [12, 17],
    prompts: [
      'to all staff, the office fridge will be cleaned every friday. label your yoghurt.',
      'dear board, revenue is up, morale is down, and someone keeps taking my stapler.',
    ],
  },
  {
    name: 'VP', time: 90, curses: ['mittens', 'reshuffle', 'coffee'], bossGap: [11, 15],
    prompts: [
      'dear shareholders, we are pleased to announce record profits, synergy, and a new logo.',
    ],
  },
  {
    name: 'CEO', time: 95, curses: ['sausage', 'reshuffle', 'coffee'], bossGap: [10, 14],
    prompts: [
      'to everyone, i am thrilled to announce that fridays are now mandatory. thank you.',
      'dear team, the yacht is doing well. please stop asking about bonuses. warm regards.',
    ],
  },
];

export const LINES = {
  busted: [
    'What is THIS?!',
    'Is that the email from MONDAY?!',
    'I SAW that!',
    'My office. Five o clock.',
    'Are you writing to the client NOW?!',
  ],
  cleared: [
    'Hmm. Carry on.',
    'Nice. Empty desk. Very productive.',
    'Keep up the... whatever this is.',
    'Good. Good. Synergy.',
  ],
  typo: [
    '{word}?! Is that a word?',
    'Did you just type {word}?',
    '{word}. Wonderful.',
    'Who taught you to spell {word}?',
  ],
  promoted: [
    'Promoted. Do not let it go to your head.',
    'Fine work. You get a bigger chair.',
    'Promoted! Your new desk has a window. Facing a wall.',
  ],
  warning: [
    'This is your official warning. {phrase}? Really?',
    'I will let it slide. This time.',
    'Sloppy. Do better on Monday.',
  ],
  fired: [
    '{phrase}... You are FIRED!',
    'Clear your desk. You are FIRED!',
    'Pack up the plant. You are FIRED!',
  ],
};

export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const fill = (line, vars) => line.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
