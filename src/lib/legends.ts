import { hashStr } from './format';

export interface Legend {
  e: string;
  f: string;
  t: string;
  q: string;
}

// Picked deterministically from the agent id so a subagent's codename never changes mid-run.
export const TECH_LEGENDS: Legend[] = [
  {
    e: '🚀',
    f: 'Elon Musk',
    t: 'Tesla & SpaceX',
    q: 'When something is important enough, you do it even if the odds are not in your favor.',
  },
  { e: '🍏', f: 'Steve Jobs', t: 'Apple co-founder', q: 'Stay hungry, stay foolish.' },
  {
    e: '🪟',
    f: 'Bill Gates',
    t: 'Microsoft co-founder',
    q: 'Measuring programming progress by lines of code is like measuring aircraft building progress by weight.',
  },
  { e: '🖥️', f: 'Alan Kay', t: 'Smalltalk & OOP pioneer', q: 'The best way to predict the future is to invent it.' },
  { e: '🐧', f: 'Linus Torvalds', t: 'Creator of Linux & Git', q: 'Talk is cheap. Show me the code.' },
  {
    e: '🐛',
    f: 'Grace Hopper',
    t: 'COBOL pioneer, Rear Admiral',
    q: "It's easier to ask forgiveness than it is to get permission.",
  },
  {
    e: '🔐',
    f: 'Alan Turing',
    t: 'Father of computer science',
    q: 'We can only see a short distance ahead, but we can see plenty there that needs to be done.',
  },
  { e: '🌐', f: 'Tim Berners-Lee', t: 'Inventor of the World Wide Web', q: 'This is for everyone.' },
  {
    e: '🎮',
    f: 'John Carmack',
    t: 'id Software, Doom & Quake',
    q: "Focus is a matter of deciding what things you're not going to do.",
  },
  { e: '🐍', f: 'Guido van Rossum', t: 'Creator of Python', q: 'Code is read much more often than it is written.' },
  {
    e: '⌨️',
    f: 'Dennis Ritchie',
    t: 'Creator of C & Unix',
    q: 'The only way to learn a new programming language is by writing programs in it.',
  },
  {
    e: '📚',
    f: 'Donald Knuth',
    t: 'The Art of Computer Programming',
    q: 'Premature optimization is the root of all evil.',
  },
  { e: '🧮', f: 'Edsger Dijkstra', t: 'Algorithms pioneer', q: 'Simplicity is prerequisite for reliability.' },
  {
    e: '🧠',
    f: 'Geoffrey Hinton',
    t: 'Godfather of deep learning',
    q: 'In the long run, curiosity-driven research works best.',
  },
  {
    e: '🤖',
    f: 'Andrej Karpathy',
    t: 'Deep learning, ex-Tesla & OpenAI',
    q: 'The hottest new programming language is English.',
  },
  { e: '💡', f: 'Sam Altman', t: 'CEO of OpenAI', q: 'Move faster. Slowness anywhere justifies slowness everywhere.' },
  {
    e: '🟩',
    f: 'Jensen Huang',
    t: 'Founder & CEO of NVIDIA',
    q: 'Software is eating the world, but AI is going to eat software.',
  },
  { e: '📦', f: 'Jeff Bezos', t: 'Founder of Amazon', q: 'Your margin is my opportunity.' },
  {
    e: '✒️',
    f: 'Ada Lovelace',
    t: 'The first programmer',
    q: 'That brain of mine is something more than merely mortal, as time will show.',
  },
  { e: '🌙', f: 'Margaret Hamilton', t: 'Led Apollo flight software', q: 'There was no choice but to be pioneers.' },
  { e: '👍', f: 'Mark Zuckerberg', t: 'Founder & CEO of Meta', q: 'Move fast and break things.' },
  {
    e: '♟️',
    f: 'Demis Hassabis',
    t: 'Co-founder & CEO of DeepMind',
    q: 'Solve intelligence, and then use that to solve everything else.',
  },
  {
    e: '🔮',
    f: 'Ilya Sutskever',
    t: 'Co-founder of OpenAI & SSI',
    q: "It may be that today's large neural networks are slightly conscious.",
  },
  { e: '⚡', f: 'Andrew Ng', t: 'Co-founder of Coursera & Google Brain', q: 'AI is the new electricity.' },
  { e: '🍎', f: 'Steve Wozniak', t: 'Apple co-founder', q: "Never trust a computer you can't throw out a window." },
  {
    e: '☁️',
    f: 'Satya Nadella',
    t: 'CEO of Microsoft',
    q: 'Our industry does not respect tradition — it only respects innovation.',
  },
  { e: '🧑‍💻', f: 'Paul Graham', t: 'Co-founder of Y Combinator', q: 'Make something people want.' },
];

export function legendFor(id: unknown): Legend {
  return TECH_LEGENDS[hashStr(String(id)) % TECH_LEGENDS.length];
}
