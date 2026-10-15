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
const STATS = ['hp', 'dmg', 'range', 'rate', 'speed', 'sight', 'build', 'cost', 'regen', 'dr', 'splash', 'intercept', 'hack', 'stun'];

export function createMods() {
  const m = { income: 0, luck: 0, supply: 0, compute: 0, bounty: 0, abilityCd: 0, abilityPower: 0, flags: {} };
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
  if (stat === 'supply' || stat === 'compute') return `${Math.round(v * mult)}`;
  if (stat === 'luck') return (v * mult).toFixed(1);
  return pct(v * mult);
}

// Card requirements receive the game: available(id) = in this faction's roster and unlocked.
const has = (...ids) => (g) => ids.some((id) => g.available(id));
const hasClass = (cls) => (g) => g.hasClass(cls);

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
  statCard('tandem', 'Tandem Warheads', 'Infantry', [['dmg', 'at_team', 0.1], ['dmg', 'manpads', 0.1]], 'AT and MANPADS teams +{0} damage.', { req: has('at_team', 'manpads') }),
  statCard('marksman', 'Ballistic Computers', 'Infantry', [['dmg', 'sniper', 0.12], ['range', 'sniper', 0.04]], 'Ghost Recon +{0} damage, +{1} range.', { req: has('sniper') }),
  statCard('graphene', 'Graphene Armor', 'Robots', [['hp', 'robot', 0.1]], 'Robots +{0} max HP.', { req: hasClass('robot') }),
  statCard('servos', 'Overclocked Servos', 'Robots', [['speed', 'robot', 0.07], ['rate', 'robot', 0.06]], 'Robots +{0} speed, +{1} fire rate.', { req: hasClass('robot') }),
  statCard('nanites', 'Self-Repair Nanites', 'Robots', [['regen', 'robot', 0.004]], 'Robots regenerate {0} HP per second.', { req: hasClass('robot') }),
  statCard('batteries', 'Solid-State Batteries', 'Drones', [['speed', 'drone', 0.08], ['hp', 'drone', 0.06]], 'Drones +{0} speed, +{1} max HP.'),
  statCard('swarm_ai', 'Swarm Intelligence', 'Drones', [['dmg', 'drone', 0.09]], 'Drones +{0} damage.', { req: has('fpv', 'wasp', 'stinger', 'bomber', 'empdrone', 'harpy') }),
  statCard('drone_print', 'Rapid Drone Printing', 'Drones', [['build', 'drone', 0.12], ['cost', 'drone', 0.05]], 'Drones build {0} faster and cost {1} less.'),
  statCard('hardened', 'Hardened Structures', 'Buildings', [['hp', 'building', 0.1]], 'Buildings +{0} max HP.'),
  statCard('loaders', 'Rapid Autoloaders', 'Defenses', [['rate', 'defense', 0.07], ['rate', 'hq', 0.07]], 'Defenses and HQ +{0} fire rate.'),
  statCard('barrels', 'Extended Barrels', 'Defenses', [['range', 'defense', 0.05]], 'Defenses +{0} range.'),
  statCard('turret_dmg', 'Depleted Uranium Rounds', 'Defenses', [['dmg', 'defense', 0.07], ['dmg', 'hq', 0.07]], 'Defenses and HQ +{0} damage.'),
  statCard('thermobaric', 'Thermobaric Payloads', 'Global', [['splash', 'all', 0.08], ['dmg', 'battery', 0.06]], 'Splash radius +{0}, Missile Battery damage +{1}.'),
  statCard('intercept_algo', 'Intercept Algorithms', 'Defenses', [['intercept', 'all', 0.15]], 'Damage against missiles and drones from intercept weapons +{0}.', { req: has('ciws', 'interceptor', 'aegis') }),
  statCard('deep_learning', 'Deep Learning Cluster', 'Research', [['luck', '', 0.4]], 'Research luck +{0} (better rarity odds).'),
  statCard('salvage', 'Salvage Protocol', 'Economy', [['bounty', '', 0.04]], 'Kills refund {0} of the enemy\'s value as credits.'),
  statCard('supply_chain', 'Supply Chain AI', 'Economy', [['supply', '', 2], ['compute', '', 2]], 'Supply cap +{0}, compute cap +{1}.'),
  statCard('reactive', 'Reactive Armor', 'All Units', [['dr', 'unit', 0.03]], 'Units take {0} less damage.', { minRarity: 1 }),
  statCard('hq_fort', 'Citadel Protocol', 'HQ', [['hp', 'hq', 0.12], ['dmg', 'hq', 0.12]], 'HQ +{0} max HP and +{1} damage.'),
  statCard('overclock', 'Quantum Overclock', 'Global', [['rate', 'all', 0.03]], 'Everything +{0} fire rate.', { minRarity: 1 }),
  {
    id: 'funds', name: 'Emergency Appropriations', tag: 'Economy',
    text: (m) => `Receive ${Math.round(220 * m)} credits immediately.`,
    apply: (game, m) => { game.credits += Math.round(220 * m); },
  },
  {
    id: 'breakthrough', name: 'Research Breakthrough', tag: 'Research', minRarity: 2,
    text: (m) => `Gain ${m >= 5 ? 2 : 1} extra breakthrough${m >= 5 ? 's' : ''} immediately.`,
    apply: (game, m) => { game.research.ready += m >= 5 ? 2 : 1; },
  },
  statCard('aero', 'Aerospace Composites', 'Aircraft', [['hp', 'aircraft', 0.08], ['speed', 'aircraft', 0.05]], 'Aircraft +{0} max HP, +{1} speed.', { req: hasClass('aircraft') }),
  {
    id: 'command_net', name: 'Command Network', tag: 'Ability',
    text: (m) => `Commander ability recharges ${Math.round(8 * m)}% faster and is ${Math.round(10 * m)}% stronger.`,
    apply: (g, m) => { g.mods.abilityCd += 0.08 * m; g.mods.abilityPower += 0.1 * m; },
  },
  // ---- Faction cards (only offered to that faction, and more often) ----
  statCard('joint_ops', 'Joint Operations', 'Valdara', [['hp', 'unit', 0.04], ['dmg', 'unit', 0.04]], 'All units +{0} HP and +{1} damage.', { faction: 'valdara' }),
  {
    id: 'fire_mission', name: 'Fire Mission Grid', tag: 'Valdara', faction: 'valdara',
    text: (m) => `Artillery Barrage +${Math.round(20 * m)}% damage and recharges ${Math.round(5 * m)}% faster.`,
    apply: (g, m) => { g.mods.abilityPower += 0.2 * m; g.mods.abilityCd += 0.05 * m; },
  },
  statCard('drill', 'Drill Sergeants', 'Iron Guard', [['build', 'infantry', 0.12], ['cost', 'infantry', 0.03]], 'Infantry trains {0} faster and costs {1} less.', { faction: 'ironguard' }),
  statCard('entrench', 'Entrenchment Doctrine', 'Iron Guard', [['dr', 'infantry', 0.04]], 'Infantry takes {0} less damage.', { faction: 'ironguard', minRarity: 1 }),
  statCard('bayonet', 'Assault Doctrine', 'Iron Guard', [['dmg', 'shock', 0.12], ['dmg', 'grenadier', 0.12]], 'Shock Troopers and Grenadiers +{0} damage.', { faction: 'ironguard' }),
  statCard('firing_tables', 'Ballistic Firing Tables', 'Iron Guard', [['range', 'mortar', 0.06], ['splash', 'all', 0.06]], 'Mortar range +{0}, splash radius +{1}.', { faction: 'ironguard', req: has('mortar') }),
  statCard('swarm_link', 'Mesh Network Link', 'Swarm', [['dmg', 'drone', 0.06], ['hp', 'drone', 0.06]], 'Drones +{0} damage and +{1} HP.', { faction: 'swarm' }),
  statCard('cheap_frames', 'Injection-Molded Frames', 'Swarm', [['cost', 'drone', 0.04]], 'Drones cost {0} less.', { faction: 'swarm' }),
  {
    id: 'hive_queen', name: 'Hive Queens', tag: 'Swarm', faction: 'swarm', req: has('swarmhive'),
    text: (m) => `Swarm Hives print drones ${Math.round(15 * m)}% faster.`,
    apply: (g, m) => { g.mods.flags.hiveRate = (g.mods.flags.hiveRate || 0) + 0.15 * m; },
  },
  statCard('zero_day', 'Zero-Day Exploits', 'Ghostnet', [['hack', 'all', 0.2]], 'Hacking speed +{0}.', { faction: 'ghostnet' }),
  statCard('emp_harden', 'Pulse Amplifiers', 'Ghostnet', [['stun', 'all', 0.15]], 'Stun durations +{0}.', { faction: 'ghostnet' }),
  statCard('signal_intel', 'Signals Intelligence', 'Ghostnet', [['luck', '', 0.3], ['sight', 'all', 0.05]], 'Research luck +{0}, sight +{1}.', { faction: 'ghostnet' }),
  statCard('lean_mfg', 'Lean Manufacturing', 'Forge', [['build', 'all', 0.08], ['cost', 'building', 0.03]], 'Production +{0} faster, buildings {1} cheaper.', { faction: 'forge' }),
  statCard('alloys', 'Reinforced Alloys', 'Forge', [['hp', 'robot', 0.08], ['hp', 'building', 0.08]], 'Robots +{0} HP, buildings +{1} HP.', { faction: 'forge' }),
  {
    id: 'overtime', name: 'Mandatory Overtime', tag: 'Forge', faction: 'forge',
    text: (m) => `Overdrive lasts ${Math.round(20 * m)}% longer and recharges ${Math.round(5 * m)}% faster.`,
    apply: (g, m) => { g.mods.abilityPower += 0.2 * m; g.mods.abilityCd += 0.05 * m; },
  },
  statCard('avionics', 'Fire-Control Avionics', 'Sky Republic', [['range', 'aircraft', 0.05], ['dmg', 'aircraft', 0.06]], 'Aircraft +{0} range, +{1} damage.', { faction: 'skyrep' }),
  statCard('afterburners', 'Adaptive Engines', 'Sky Republic', [['speed', 'aircraft', 0.08], ['rate', 'aircraft', 0.05]], 'Aircraft +{0} speed, +{1} fire rate.', { faction: 'skyrep' }),
  statCard('rotor_comp', 'Composite Airframes', 'Sky Republic', [['hp', 'aircraft', 0.1]], 'Aircraft +{0} max HP.', { faction: 'skyrep' }),
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
    id: 'hive_mind', name: 'Hive Mind', tag: 'Drones', minRarity: 4, req: hasClass('drone'),
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

// Luck shifts the odds towards higher tiers: tier i's weight is scaled by (1 + LUCK_STEP * luck)^i.
const LUCK_STEP = 0.15;
export function rarityOdds(luck) {
  const k = 1 + LUCK_STEP * Math.max(0, luck);
  const w = RARITIES.map((r, i) => r.weight * Math.pow(k, i));
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map((x) => x / sum);
}

// Expected rarity tier (0 = Common … 4 = Legendary).
export function averageRarity(luck) {
  return rarityOdds(luck).reduce((a, p, i) => a + p * i, 0);
}

function rollRarity(rng, luck) {
  const odds = rarityOdds(luck);
  return weightedPick(rng, odds.map((p, i) => ({ i, p })), (x) => x.p).i;
}

// Build a draft of `count` distinct cards. avail(card) decides whether a card fits this game.
// Faction cards are weighted up so a faction's identity shows in its drafts.
export function makeDraft(rng, count, luck, avail) {
  const out = [];
  const used = new Set();
  let guard = 0;
  while (out.length < count && guard++ < 200) {
    const r = rollRarity(rng, luck);
    const pool = CARDS.filter((c) =>
      !used.has(c.id) &&
      (c.minRarity ?? 0) <= r &&
      (c.maxRarity ?? 4) >= r &&
      avail(c));
    if (!pool.length) continue;
    const card = weightedPick(rng, pool, (c) => (c.faction ? 3 : 1));
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

// Standard availability check used by the game.
export function cardAvailable(card, game) {
  if (card.faction && card.faction !== game.faction.id) return false;
  return !card.req || card.req(game);
}
