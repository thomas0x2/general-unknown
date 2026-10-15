// In-run research program: random upgrade cards with rarity tiers.
import { weightedPick } from './rng.js';

export const RARITIES = [
  { id: 'common', name: 'Common', color: '#b9c6cf', mult: 1, weight: 56 },
  { id: 'uncommon', name: 'Uncommon', color: '#5fdc7a', mult: 1.6, weight: 27 },
  { id: 'rare', name: 'Rare', color: '#4aa8ff', mult: 2.4, weight: 11.5 },
  { id: 'epic', name: 'Epic', color: '#c46bff', mult: 3.4, weight: 4.5 },
  { id: 'legendary', name: 'Legendary', color: '#ffb52e', mult: 5, weight: 1 },
];

// Stats that are summed as percentages per tag. Tags: all, unit, building, defense,
// infantry, robot, drone, hq, or a specific unit/building id.
const STATS = ['hp', 'dmg', 'range', 'rate', 'speed', 'sight', 'build', 'cost', 'regen', 'dr', 'splash', 'intercept'];

export function createMods() {
  const m = { income: 0, research: 0, supply: 0, bounty: 0, flags: {} };
  for (const s of STATS) m[s] = {};
  return m;
}

export function addMod(mods, stat, tag, v) {
  if (STATS.includes(stat)) mods[stat][tag] = (mods[stat][tag] || 0) + v;
  else mods[stat] += v;
}

export function modSum(mods, stat, tags) {
  const t = mods[stat];
  let s = 0;
  for (const tag of tags) s += t[tag] || 0;
  return s;
}

const pct = (v) => `${Math.round(v * 100)}%`;

// Helper for simple stat cards. effects: [[stat, tag, baseValue], ...]
function statCard(id, name, tag, effects, text, extra = {}) {
  return {
    id, name, tag,
    text: (mult) => text.replace(/\{(\d)\}/g, (_, i) => fmtVal(effects[+i], mult)),
    apply: (game, mult) => { for (const [stat, t, v] of effects) addMod(game.mods, stat, t, v * mult); },
    ...extra,
  };
}

function fmtVal([stat, , v], mult) {
  if (stat === 'regen') return `${(v * mult * 100).toFixed(1)}%`;
  if (stat === 'supply') return `${Math.round(v * mult)}`;
  return pct(v * mult);
}

const has = (...ids) => (u) => ids.some((id) => u.has(id));

export const CARDS = [
  statCard('composites', 'Advanced Composites', 'All Units', [['hp', 'unit', 0.06]], 'All units +{0} max HP.'),
  statCard('munitions', 'Smart Munitions', 'All Units', [['dmg', 'unit', 0.05]], 'All units +{0} damage.'),
  statCard('ai_targeting', 'AI Fire Control', 'Global', [['range', 'all', 0.035]], 'Units and defenses +{0} range.'),
  statCard('fusion_cells', 'Fusion Microcells', 'Economy', [['income', '', 0.08]], 'Income +{0}.'),
  statCard('auto_fab', 'Automated Fabrication', 'Economy', [['build', 'all', 0.08]], 'Production and construction +{0} faster.'),
  statCard('logistics_ai', 'Logistics AI', 'Economy', [['cost', 'all', 0.035]], 'Everything costs {0} less.'),
  statCard('sensors', 'Quantum Sensors', 'Global', [['sight', 'all', 0.1]], 'Sight range +{0}.'),
  statCard('exo_plating', 'Exosuit Plating', 'Infantry', [['hp', 'infantry', 0.1]], 'Infantry +{0} max HP.'),
  statCard('neural_link', 'Neural Link HUD', 'Infantry', [['dmg', 'infantry', 0.08]], 'Infantry +{0} damage.'),
  statCard('stims', 'Combat Stims', 'Infantry', [['speed', 'infantry', 0.06], ['rate', 'infantry', 0.05]], 'Infantry +{0} speed, +{1} fire rate.'),
  statCard('field_medic', 'Medical AI', 'Infantry', [['regen', 'infantry', 0.003]], 'Infantry regenerate {0} HP per second.', { minRarity: 1 }),
  statCard('tandem', 'Tandem Warheads', 'Infantry', [['dmg', 'at_team', 0.1], ['dmg', 'manpads', 0.1]], 'AT and MANPADS teams +{0} damage.'),
  statCard('marksman', 'Ballistic Computers', 'Infantry', [['dmg', 'sniper', 0.12], ['range', 'sniper', 0.04]], 'Ghost Recon +{0} damage, +{1} range.', { req: has('sniper') }),
  statCard('graphene', 'Graphene Armor', 'Robots', [['hp', 'robot', 0.1]], 'Robots +{0} max HP.', { req: has('robotics') }),
  statCard('servos', 'Overclocked Servos', 'Robots', [['speed', 'robot', 0.07], ['rate', 'robot', 0.06]], 'Robots +{0} speed, +{1} fire rate.', { req: has('robotics') }),
  statCard('nanites', 'Self-Repair Nanites', 'Robots', [['regen', 'robot', 0.004]], 'Robots regenerate {0} HP per second.', { req: has('robotics') }),
  statCard('batteries', 'Solid-State Batteries', 'Drones', [['speed', 'drone', 0.08], ['hp', 'drone', 0.06]], 'Drones +{0} speed, +{1} max HP.'),
  statCard('swarm_ai', 'Swarm Intelligence', 'Drones', [['dmg', 'drone', 0.09]], 'Drones +{0} damage.', { req: has('fpv') }),
  statCard('drone_print', 'Rapid Drone Printing', 'Drones', [['build', 'drone', 0.12], ['cost', 'drone', 0.05]], 'Drones build {0} faster and cost {1} less.'),
  statCard('hardened', 'Hardened Structures', 'Buildings', [['hp', 'building', 0.1]], 'Buildings +{0} max HP.'),
  statCard('loaders', 'Rapid Autoloaders', 'Defenses', [['rate', 'defense', 0.07], ['rate', 'hq', 0.07]], 'Defenses and HQ +{0} fire rate.'),
  statCard('barrels', 'Extended Barrels', 'Defenses', [['range', 'defense', 0.05]], 'Defenses +{0} range.'),
  statCard('turret_dmg', 'Depleted Uranium Rounds', 'Defenses', [['dmg', 'defense', 0.07], ['dmg', 'hq', 0.07]], 'Defenses and HQ +{0} damage.'),
  statCard('thermobaric', 'Thermobaric Payloads', 'Global', [['splash', 'all', 0.08], ['dmg', 'battery', 0.06]], 'Splash radius +{0}, Missile Battery damage +{1}.'),
  statCard('intercept_algo', 'Intercept Algorithms', 'Defenses', [['intercept', 'all', 0.15]], 'Damage against missiles and drones from intercept weapons +{0}.', { req: has('ciws', 'interceptor', 'aegis') }),
  statCard('deep_learning', 'Deep Learning Cluster', 'Research', [['research', '', 0.1]], 'Research speed +{0}.'),
  statCard('salvage', 'Salvage Protocol', 'Economy', [['bounty', '', 0.04]], 'Kills refund {0} of the enemy\'s value as credits.'),
  statCard('supply_chain', 'Supply Chain AI', 'Economy', [['supply', '', 2]], 'Supply cap +{0}.'),
  statCard('reactive', 'Reactive Armor', 'All Units', [['dr', 'unit', 0.03]], 'Units take {0} less damage.', { minRarity: 1 }),
  statCard('hq_fort', 'Citadel Protocol', 'HQ', [['hp', 'hq', 0.12], ['dmg', 'hq', 0.12]], 'HQ +{0} max HP and +{1} damage.'),
  statCard('overclock', 'Quantum Overclock', 'Global', [['rate', 'all', 0.03]], 'Everything +{0} fire rate.', { minRarity: 1 }),
  {
    id: 'funds', name: 'Emergency Appropriations', tag: 'Economy',
    text: (m) => `Receive ${Math.round(220 * m)} credits immediately.`,
    apply: (game, m) => { game.credits += Math.round(220 * m); },
  },
  {
    id: 'breakthrough', name: 'Research Breakthrough', tag: 'Research', minRarity: 1,
    text: (m) => `Gain ${Math.round(25 * m)}% of a research level immediately.`,
    apply: (game, m) => { game.research.points += game.research.needed * 0.25 * m; },
  },
  // ---- Unique epics / legendaries (fixed effect) ----
  {
    id: 'conscription', name: 'Total Mobilization', tag: 'Infantry', minRarity: 3, maxRarity: 3,
    text: () => 'Rifle Squads cost 40% less and train 50% faster.',
    apply: (g) => { addMod(g.mods, 'cost', 'rifle', 0.4); addMod(g.mods, 'build', 'rifle', 0.5); },
  },
  {
    id: 'twin_salvo', name: 'Twin Salvo', tag: 'Defenses', minRarity: 3, maxRarity: 3, req: has('battery'),
    text: () => 'Missile Batteries fire 2 extra missiles per salvo.',
    apply: (g) => { g.mods.flags.salvo = (g.mods.flags.salvo || 0) + 2; },
  },
  {
    id: 'fpv_swarm', name: 'Swarm Doctrine', tag: 'Drones', minRarity: 3, maxRarity: 3, req: has('fpv'),
    text: () => 'FPV Kamikazes cost 50% less and deal +30% damage.',
    apply: (g) => { addMod(g.mods, 'cost', 'fpv', 0.5); addMod(g.mods, 'dmg', 'fpv', 0.3); },
  },
  {
    id: 'veteran_core', name: 'Veteran AI Cores', tag: 'All Units', minRarity: 3, maxRarity: 3,
    text: () => 'All units +15% HP, +15% damage and regenerate 0.5% HP per second.',
    apply: (g) => { addMod(g.mods, 'hp', 'unit', 0.15); addMod(g.mods, 'dmg', 'unit', 0.15); addMod(g.mods, 'regen', 'unit', 0.005); },
  },
  {
    id: 'chrono_shield', name: 'Chrono Shield', tag: 'HQ', minRarity: 4,
    text: () => 'HQ +60% max HP and regenerates 1.2% HP per second. Time bends around your command.',
    apply: (g) => { addMod(g.mods, 'hp', 'hq', 0.6); addMod(g.mods, 'regen', 'hq', 0.012); },
  },
  {
    id: 'hive_mind', name: 'Hive Mind', tag: 'Drones', minRarity: 4,
    text: () => 'All drones +35% HP, damage and speed.',
    apply: (g) => { for (const s of ['hp', 'dmg', 'speed']) addMod(g.mods, s, 'drone', 0.35); },
  },
  {
    id: 'overwatch', name: 'Overwatch Network', tag: 'Global', minRarity: 4,
    text: () => 'Everything +20% range and +30% sight.',
    apply: (g) => { addMod(g.mods, 'range', 'all', 0.2); addMod(g.mods, 'sight', 'all', 0.3); },
  },
  {
    id: 'fusion_break', name: 'Fusion Breakthrough', tag: 'Economy', minRarity: 4,
    text: () => 'Income +50%. Construction and production +25% faster.',
    apply: (g) => { g.mods.income += 0.5; addMod(g.mods, 'build', 'all', 0.25); },
  },
  {
    id: 'iron_wall', name: 'Iron Wall Doctrine', tag: 'Buildings', minRarity: 4,
    text: () => 'Buildings +50% HP, defenses +25% damage and take 15% less damage.',
    apply: (g) => { addMod(g.mods, 'hp', 'building', 0.5); addMod(g.mods, 'dmg', 'defense', 0.25); addMod(g.mods, 'dr', 'building', 0.15); },
  },
];

export const CARD_BY_ID = Object.fromEntries(CARDS.map((c) => [c.id, c]));

function rollRarity(rng, luck) {
  const items = RARITIES.map((r, i) => ({ i, w: i === 0 ? r.weight : r.weight * (1 + 0.35 * luck) }));
  return weightedPick(rng, items, (x) => x.w).i;
}

// Build a draft of `count` distinct cards. unlocked = Set of meta unlock ids.
export function makeDraft(rng, count, luck, unlocked) {
  const out = [];
  const used = new Set();
  let guard = 0;
  while (out.length < count && guard++ < 200) {
    const r = rollRarity(rng, luck);
    const pool = CARDS.filter((c) =>
      !used.has(c.id) &&
      (c.minRarity ?? 0) <= r &&
      (c.maxRarity ?? 4) >= r &&
      (!c.req || c.req(unlocked)) &&
      // uniques only appear at their own tier
      !(c.minRarity >= 3 && r < c.minRarity));
    if (!pool.length) continue;
    const card = pool[Math.floor(rng() * pool.length)];
    used.add(card.id);
    out.push({ id: card.id, rarity: r });
  }
  return out;
}

export function describeCard(pick) {
  const card = CARD_BY_ID[pick.id];
  const rar = RARITIES[pick.rarity];
  return { card, rarity: rar, text: card.text(rar.mult) };
}
