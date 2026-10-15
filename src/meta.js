// Permanent progression between timelines ("Chrono Lab") + persistence.
import { addMod } from './upgrades.js';
import { randomSeed } from './rng.js';
import { FACTIONS } from './factions.js';

const SAVE_KEY = 'general-unknown-meta-v2';
const OLD_SAVE_KEY = 'general-unknown-meta-v1';

export const BRANCHES = [
  { id: 'arsenal', name: 'Arsenal', desc: 'Blueprints carried back through time. Unlock this faction\'s troops, machines and structures.' },
  { id: 'doctrine', name: 'Doctrine', desc: 'Permanent military reforms. Stack them across timelines.' },
  { id: 'temporal', name: 'Temporal', desc: 'Exploit the time machine itself: research, intel and memory.' },
];

// Doctrine and temporal nodes shared by every faction. cost: per-level costs (length = max level).
const SHARED_NODES = [
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

const nodeCache = new Map();
// Full Chrono Lab tree for one faction: its arsenal, its two faction doctrines, then the shared nodes.
export function metaNodesFor(fid) {
  let list = nodeCache.get(fid);
  if (list) return list;
  const f = FACTIONS[fid];
  list = [
    ...f.arsenal.map((n) => ({ ...n, branch: 'arsenal' })),
    {
      id: 'f_ability', branch: 'doctrine', name: `${f.ability.name} Protocol`, faction: true,
      desc: `${f.ability.name}: 12% faster recharge and +15% power per level.`, cost: [30, 60, 100],
    },
    { id: 'f_special', branch: 'doctrine', name: f.special.name, desc: f.special.desc, cost: f.special.cost, faction: true },
    ...SHARED_NODES,
  ];
  nodeCache.set(fid, list);
  return list;
}

export function nodeById(fid, id) { return metaNodesFor(fid).find((n) => n.id === id); }

export function defaultProfile() {
  return {
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
  };
}

export function defaultMeta() {
  return { version: 2, seenIntro: false, faction: null, profiles: {} };
}

// Each faction has its own save profile (chronons, unlocks, records, map memory).
export function getProfile(meta, fid) {
  if (!meta.profiles[fid]) meta.profiles[fid] = defaultProfile();
  return meta.profiles[fid];
}

export function loadMeta() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const m = { ...defaultMeta(), ...JSON.parse(raw) };
      for (const k of Object.keys(m.profiles)) m.profiles[k] = { ...defaultProfile(), ...m.profiles[k] };
      return m;
    }
    // migrate a pre-faction save into the Valdaran profile
    const old = localStorage.getItem(OLD_SAVE_KEY);
    if (old) {
      const o = JSON.parse(old);
      const m = defaultMeta();
      m.seenIntro = !!o.seenIntro;
      const p = defaultProfile();
      for (const k of Object.keys(p)) if (o[k] !== undefined) p[k] = o[k];
      m.profiles.valdara = p;
      m.faction = 'valdara';
      return m;
    }
  } catch { /* corrupt or unavailable storage: start fresh */ }
  return defaultMeta();
}

export function saveMeta(meta) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(meta)); } catch { /* storage unavailable */ }
}

export const level = (profile, id) => profile.levels[id] || 0;

export function nodeCost(profile, node) {
  const lv = level(profile, node.id);
  return lv < node.cost.length ? node.cost[lv] : null;
}

export function nodeAvailable(profile, node) {
  return !node.req || node.req.every((r) => level(profile, r) > 0);
}

export function buyNode(meta, fid, id) {
  const profile = getProfile(meta, fid);
  const node = nodeById(fid, id);
  if (!node) return false;
  const cost = nodeCost(profile, node);
  if (cost == null || profile.chronons < cost || !nodeAvailable(profile, node)) return false;
  profile.chronons -= cost;
  profile.levels[id] = level(profile, id) + 1;
  saveMeta(meta);
  return true;
}

// Arsenal node ids this profile has bought.
export function unlockedSet(profile, fid) {
  return new Set(FACTIONS[fid].arsenal.filter((n) => level(profile, n.id) > 0).map((n) => n.id));
}

// Apply permanent doctrine/temporal bonuses to a new game.
export function applyMeta(profile, game) {
  const L = (id) => level(profile, id);
  const m = game.mods;
  addMod(m, 'hp', 'unit', 0.05 * L('d_hp'));
  addMod(m, 'dmg', 'unit', 0.05 * L('d_dmg'));
  addMod(m, 'hp', 'building', 0.08 * L('d_fort'));
  addMod(m, 'dmg', 'defense', 0.06 * L('d_fort'));
  m.income += 0.08 * L('d_income');
  addMod(m, 'build', 'all', 0.08 * L('d_build'));
  m.supply += 4 * L('d_supply');
  m.research += 0.12 * L('t_research');
  m.abilityCd += 0.12 * L('f_ability');
  m.abilityPower += 0.15 * L('f_ability');
  if (L('f_special')) game.faction.special.apply(game, L('f_special'));
  game.credits += 150 * L('d_credits');
  game.extraRifles = 2 * L('d_garrison');
  game.luck = L('t_luck');
  game.draftSize = 3 + L('t_choice');
  game.research.rerolls += L('t_reroll');
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
