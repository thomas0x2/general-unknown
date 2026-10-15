// Permanent progression between timelines ("Chrono Lab") + persistence.
import { addMod } from './upgrades.js';
import { randomSeed } from './rng.js';

const SAVE_KEY = 'general-unknown-meta-v1';

export const BRANCHES = [
  { id: 'arsenal', name: 'Arsenal', desc: 'Blueprints carried back through time. Unlock new troops, robots, drones and structures.' },
  { id: 'doctrine', name: 'Doctrine', desc: 'Permanent military reforms. Stack them across timelines.' },
  { id: 'temporal', name: 'Temporal', desc: 'Exploit the time machine itself: research, intel and memory.' },
];

// cost: array of per-level costs (length = max level)
export const META_NODES = [
  // ---- Arsenal: infantry
  { id: 'manpads', branch: 'arsenal', group: 'Infantry', name: 'MANPADS Team', desc: 'Unlock anti-air missile infantry.', cost: [30] },
  { id: 'sniper', branch: 'arsenal', group: 'Infantry', name: 'Ghost Recon', desc: 'Unlock long-range recon snipers.', cost: [55], req: ['manpads'] },
  { id: 'exo', branch: 'arsenal', group: 'Infantry', name: 'Exo-Troopers', desc: 'Unlock powered-exoskeleton heavy infantry.', cost: [140], req: ['sniper'] },
  // ---- Arsenal: robots
  { id: 'robotics', branch: 'arsenal', group: 'Robots', name: 'Robotics Bay', desc: 'Unlock the Robotics Bay and Guard Dog quadrupeds.', cost: [60] },
  { id: 'mule', branch: 'arsenal', group: 'Robots', name: 'Mule UGV', desc: 'Unlock autonomous autocannon ground vehicles.', cost: [90], req: ['robotics'] },
  { id: 'aegis', branch: 'arsenal', group: 'Robots', name: 'Aegis Rover', desc: 'Unlock mobile laser point-defense rovers.', cost: [110], req: ['mule'] },
  { id: 'titan', branch: 'arsenal', group: 'Robots', name: 'Titan Mech', desc: 'Unlock heavy bipedal assault mechs.', cost: [240], req: ['mule'] },
  // ---- Arsenal: drones
  { id: 'fpv', branch: 'arsenal', group: 'Drones', name: 'FPV Kamikazes', desc: 'Unlock cheap one-way attack drones.', cost: [30] },
  { id: 'harpy', branch: 'arsenal', group: 'Drones', name: 'Harpy Strike Drone', desc: 'Unlock missile-armed loitering drones.', cost: [110], req: ['fpv'] },
  { id: 'hive', branch: 'arsenal', group: 'Drones', name: 'Hive Carrier', desc: 'Unlock the FPV-launching drone mothership.', cost: [220], req: ['harpy'] },
  // ---- Arsenal: structures
  { id: 'bunker', branch: 'arsenal', group: 'Structures', name: 'Bunker', desc: 'Unlock heavily armored autocannon bunkers.', cost: [35] },
  { id: 'ciws', branch: 'arsenal', group: 'Structures', name: 'Laser CIWS', desc: 'Unlock anti-air / anti-missile laser turrets.', cost: [55] },
  { id: 'interceptor', branch: 'arsenal', group: 'Structures', name: 'Interceptor Array', desc: 'Unlock long-range missile defense.', cost: [100], req: ['ciws'] },
  { id: 'jammer', branch: 'arsenal', group: 'Structures', name: 'EW Jammer', desc: 'Unlock electronic warfare against drones and missiles.', cost: [80], req: ['ciws'] },
  { id: 'radar', branch: 'arsenal', group: 'Structures', name: 'Radar Station', desc: 'Unlock wide-area radar coverage.', cost: [45] },
  { id: 'lab', branch: 'arsenal', group: 'Structures', name: 'Research Lab', desc: 'Unlock labs that accelerate the research program.', cost: [65] },
  { id: 'repair', branch: 'arsenal', group: 'Structures', name: 'Nanite Repair Bay', desc: 'Unlock area repair for units and buildings.', cost: [100], req: ['lab'] },
  { id: 'battery', branch: 'arsenal', group: 'Structures', name: 'Missile Battery', desc: 'Unlock long-range guided missile launchers.', cost: [120], req: ['radar'] },
  { id: 'railgun', branch: 'arsenal', group: 'Structures', name: 'Railgun', desc: 'Unlock hypersonic electromagnetic railguns.', cost: [280], req: ['battery'] },
  // ---- Doctrine
  { id: 'd_hp', branch: 'doctrine', name: 'Body Armor Program', desc: '+5% HP for all units per level.', cost: [20, 35, 55, 80, 110] },
  { id: 'd_dmg', branch: 'doctrine', name: 'Munitions Program', desc: '+5% damage for all units per level.', cost: [20, 35, 55, 80, 110] },
  { id: 'd_fort', branch: 'doctrine', name: 'Fortification Corps', desc: '+8% building HP and +6% defense damage per level.', cost: [20, 35, 55, 80, 110] },
  { id: 'd_credits', branch: 'doctrine', name: 'War Chest', desc: '+150 starting credits per level.', cost: [15, 30, 50, 75] },
  { id: 'd_income', branch: 'doctrine', name: 'Industrial Mobilization', desc: '+8% income per level.', cost: [25, 45, 70, 100, 140] },
  { id: 'd_build', branch: 'doctrine', name: 'Rapid Fabrication', desc: '+8% production and construction speed per level.', cost: [25, 45, 70, 100] },
  { id: 'd_supply', branch: 'doctrine', name: 'Logistics Doctrine', desc: '+4 supply cap per level.', cost: [20, 40, 70] },
  { id: 'd_garrison', branch: 'doctrine', name: 'Standing Army', desc: 'Start each timeline with 2 extra Rifle Squads per level.', cost: [20, 40, 70] },
  // ---- Temporal
  { id: 't_research', branch: 'temporal', name: 'Accelerated Research', desc: '+12% research speed per level.', cost: [20, 40, 65, 95] },
  { id: 't_luck', branch: 'temporal', name: 'Probability Engine', desc: 'Higher odds of rare research results per level.', cost: [30, 60, 100, 150] },
  { id: 't_choice', branch: 'temporal', name: 'Parallel Timelines', desc: 'See one extra research option each draft.', cost: [120] },
  { id: 't_reroll', branch: 'temporal', name: 'Quantum Reroll', desc: '+1 research reroll per timeline, per level.', cost: [25, 50, 90] },
  { id: 't_head', branch: 'temporal', name: 'Head Start', desc: 'Begin each timeline with one free research draft per level.', cost: [40, 80, 130] },
  { id: 't_gain', branch: 'temporal', name: 'Chronon Capacitor', desc: '+15% chronons earned per level.', cost: [30, 60, 100, 150] },
  { id: 't_warning', branch: 'temporal', name: 'Early Warning', desc: 'Know each wave\'s composition and launch point in advance.', cost: [25] },
  { id: 't_memory', branch: 'temporal', name: 'Chrono Cartography', desc: 'Remember terrain you explored in previous timelines.', cost: [40] },
  { id: 't_recon', branch: 'temporal', name: 'Temporal Recon', desc: 'Start every timeline knowing where the enemy base and outposts are.', cost: [60], req: ['t_memory'] },
];

export const NODE_BY_ID = Object.fromEntries(META_NODES.map((n) => [n.id, n]));

export function defaultMeta() {
  return {
    version: 1,
    chronons: 0,
    lifetime: 0,
    runs: 0,
    victories: 0,
    bestWave: 0,
    bestTime: 0,
    escalation: 0,
    maxEscalation: 0,
    levels: {},
    seed: randomSeed(),
    memory: '',
    history: [],
    seenIntro: false,
  };
}

export function loadMeta() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultMeta();
    return { ...defaultMeta(), ...JSON.parse(raw) };
  } catch {
    return defaultMeta();
  }
}

export function saveMeta(meta) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(meta)); } catch { /* storage unavailable */ }
}

export function resetMeta() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
  return defaultMeta();
}

export const level = (meta, id) => meta.levels[id] || 0;

export function nodeCost(meta, node) {
  const lv = level(meta, node.id);
  return lv < node.cost.length ? node.cost[lv] : null;
}

export function nodeAvailable(meta, node) {
  return !node.req || node.req.every((r) => level(meta, r) > 0);
}

export function buyNode(meta, id) {
  const node = NODE_BY_ID[id];
  const cost = nodeCost(meta, node);
  if (cost == null || meta.chronons < cost || !nodeAvailable(meta, node)) return false;
  meta.chronons -= cost;
  meta.levels[id] = level(meta, id) + 1;
  saveMeta(meta);
  return true;
}

export function unlockedSet(meta) {
  return new Set(META_NODES.filter((n) => n.branch === 'arsenal' && level(meta, n.id) > 0).map((n) => n.id));
}

// Apply permanent doctrine/temporal bonuses to a new game.
export function applyMeta(meta, game) {
  const L = (id) => level(meta, id);
  const m = game.mods;
  addMod(m, 'hp', 'unit', 0.05 * L('d_hp'));
  addMod(m, 'dmg', 'unit', 0.05 * L('d_dmg'));
  addMod(m, 'hp', 'building', 0.08 * L('d_fort'));
  addMod(m, 'dmg', 'defense', 0.06 * L('d_fort'));
  m.income += 0.08 * L('d_income');
  addMod(m, 'build', 'all', 0.08 * L('d_build'));
  m.supply += 4 * L('d_supply');
  m.research += 0.12 * L('t_research');
  game.credits += 150 * L('d_credits');
  game.extraRifles = 2 * L('d_garrison');
  game.luck = L('t_luck');
  game.draftSize = 3 + L('t_choice');
  game.research.rerolls = L('t_reroll');
  game.research.ready += L('t_head');
  game.chrononGain = 0.15 * L('t_gain');
  game.earlyWarning = L('t_warning') > 0;
  game.temporalRecon = L('t_recon') > 0;
  game.cartography = L('t_memory') > 0;
}

// Chronons awarded at the end of a timeline.
export function computeReward(game) {
  const s = game.stats;
  const waves = Math.max(0, game.wave.n - (game.over && !game.over.victory ? 1 : 0));
  const parts = [
    [`Waves survived ×${waves}`, waves * 6],
    [`Enemies destroyed ×${s.kills}`, Math.floor(s.kills * 0.25)],
    [`Outposts destroyed ×${s.outposts}`, s.outposts * 15],
    [`Facilities destroyed ×${s.facilities}`, s.facilities * 30],
    [`Minutes in theater ×${Math.floor(game.time / 60)}`, Math.floor(game.time / 60 * 1.5)],
  ];
  if (game.over?.victory) parts.push(['Impossible victory', 250]);
  const base = parts.reduce((a, p) => a + p[1], 0);
  const mult = (1 + (game.chrononGain || 0)) * (1 + 0.25 * game.escalation);
  return { parts, base, mult, total: Math.round(base * mult) };
}

// Explored-tile memory (bitset, base64) for Chrono Cartography.
export function encodeMemory(explored) {
  const bytes = new Uint8Array(Math.ceil(explored.length / 8));
  for (let i = 0; i < explored.length; i++) if (explored[i]) bytes[i >> 3] |= 1 << (i & 7);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function decodeMemory(str, n) {
  const out = new Uint8Array(n);
  if (!str) return out;
  try {
    const s = atob(str);
    for (let i = 0; i < n; i++) if (s.charCodeAt(i >> 3) & (1 << (i & 7))) out[i] = 1;
  } catch { /* corrupt memory: ignore */ }
  return out;
}
