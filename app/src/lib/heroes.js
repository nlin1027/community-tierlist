// Keep in sync with api/heroes.js.
export const HEROES = [
  'Abrams', 'Apollo', 'Baba', 'Bebop', 'Billy', 'Calico', 'Celeste', 'Deadman Danny',
  'Doorman', 'Drifter', 'Dynamo', 'Graves', 'Grey Talon', 'Haze', 'Holliday', 'Infernus',
  'Ivy', 'Kelvin', 'Lady Geist', 'Lash', 'Mcginnis', 'Mina', 'Mirage', 'Mo and Krill',
  'Nurse Harrow', 'Paige', 'Paradox', 'Pocket', 'Rat King', 'Rem', 'Seven', 'Shiv',
  'Silver', 'Sinclair', 'Solomon', 'Venator', 'Victor', 'Vindicta', 'Violet', 'Viscous',
  'Vyper', 'Warden', 'Wraith', 'Yamato',
];

// Highest first, as displayed.
export const TIERS = ['Z', 'S', 'A', 'B', 'C', 'D'];

export const TIER_COLORS = {
  Z: '#ff6b6b',
  S: '#ff9f43',
  A: '#ffd32a',
  B: '#0be881',
  C: '#48dbfb',
  D: '#a29bfe',
};

// API averages use D=1 ... Z=6.
const TIER_BY_NUMBER = { 1: 'D', 2: 'C', 3: 'B', 4: 'A', 5: 'S', 6: 'Z' };

export function tierFromAverage(average) {
  const n = Math.min(6, Math.max(1, Math.round(average)));
  return TIER_BY_NUMBER[n];
}

export function heroIcon(hero) {
  return `/deadlock-icons/${hero.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}.png`;
}

export function emptyBoard() {
  return Object.fromEntries(TIERS.map((t) => [t, []]));
}
