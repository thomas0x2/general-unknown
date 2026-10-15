// Headless simulation test: runs full timelines with a scripted "player" bot for every faction
// and checks invariants. Usage: node tests/sim.test.mjs [--verbose]
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { defaultProfile, computeReward, metaNodesFor, loadMeta, getProfile, buyNode, defaultMeta, isFactionUnlocked, recordMilestones, unlockWatchList, unlockProgress } from '../src/meta.js';
import { BUILDINGS, UNITS, TILE, TEAM_PLAYER, TEAM_ENEMY } from '../src/data.js';
import { CARDS, RARITIES, makeDraft, cardAvailable } from '../src/upgrades.js';
import { FACTIONS, FACTION_ORDER } from '../src/factions.js';
import { mulberry32 } from '../src/rng.js';

const verbose = process.argv.includes('--verbose');
const log = (...a) => verbose && console.log(...a);

function maxProfile(fid) {
  const p = defaultProfile();
  for (const n of metaNodesFor(fid)) p.levels[n.id] = n.cost.length;
  return p;
}

// --- simple bot -----------------------------------------------------------
function tryPlace(g, type) {
  const hq = g.hq;
  for (let r = 3; r < 9; r++) {
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2 + r;
      const tx = Math.round(hq.tx + 1 + Math.cos(a) * r), ty = Math.round(hq.ty + 1 + Math.sin(a) * r);
      if (g.canPlace(type, tx, ty).ok) return g.placeBuilding(type, tx, ty).ok;
    }
  }
  return false;
}

const PRODUCTION = ['barracks', 'dronebay', 'robotics', 'airbase'];
function bot(g, rng, opts) {
  const mine = (t) => g.buildings.filter((b) => b.team === TEAM_PLAYER && b.type === t);
  if (g.research.ready > 0) { g.openDraft(); g.pickDraft(Math.floor(rng() * g.research.draft.length)); }
  if (g.ability.cd <= 0 && g.wave.n > 0) {
    const enemy = g.units.find((u) => u.team === TEAM_ENEMY && !u.garrison && g.explored[g.tileIdx(u.x, u.y)]);
    g.useAbility(enemy ? enemy.x : g.hq.x + 100, enemy ? enemy.y : g.hq.y - 100);
  }
  const prod = PRODUCTION.filter((t) => g.available(t));
  const signature = { skyrep: 'airbase', swarm: 'dronebay', forge: 'robotics' }[g.faction.id];
  if (!mine('barracks').length && g.credits >= g.costOf('barracks', true)) tryPlace(g, 'barracks');
  else if (signature && !mine(signature).length) { if (g.credits >= g.costOf(signature, true)) tryPlace(g, signature); }
  else if (mine('fabricator').length < 2 && g.credits >= g.costOf('fabricator', true) + 20) tryPlace(g, 'fabricator');
  else if (g.supplyCap - g.supplyUsed < 3 && g.credits >= 110 && mine('logistics').length < 6) tryPlace(g, 'logistics');
  else if (mine('sentry').length < 2 + g.wave.n && g.credits >= 140) tryPlace(g, 'sentry');
  for (const t of [...prod, 'hq']) for (const b of mine(t)) {
    if (!b.built || b.queue.length >= 2 || g.credits < 100) continue;
    const opts2 = g.trainsFor(b).filter((u) => g.available(u) && UNITS[u].weapon && u !== 'recon');
    if (opts2.length) g.train(b, opts2[Math.floor(rng() * opts2.length)]);
  }
  if (opts.attack && g.time > 600 && g.throttle('botattack', 30)) {
    const army = g.units.filter((u) => u.team === TEAM_PLAYER && u.def.weapon);
    if (army.length > 25) g.orderMove(army, g.enemyBase.x, g.enemyBase.y, true);
  }
}

function runTimeline(fid, profile, seed, maxTime, opts = {}) {
  const g = new Game({ profile, faction: fid, seed, escalation: 0 });
  const rng = mulberry32(seed + 1);
  const dt = 1 / 30;
  let steps = 0;
  const t0 = Date.now();
  while (!g.over && g.time < maxTime) {
    g.step(dt);
    steps++;
    if (steps % 15 === 0) bot(g, rng, opts);
    g.events.length = 0;
    if (steps % 300 === 0) {
      for (const e of [...g.units, ...g.buildings]) {
        assert.ok(Number.isFinite(e.x) && Number.isFinite(e.y), `non-finite position ${e.type}`);
        assert.ok(Number.isFinite(e.hp), `non-finite hp ${e.type}`);
        if (e.kind === 'unit' && !e.air) {
          const tx = Math.floor(e.x / TILE), ty = Math.floor(e.y / TILE);
          assert.ok(g.path.terrainOk(tx, ty), `ground unit ${e.type} on impassable terrain`);
        }
      }
      assert.ok(Number.isFinite(g.credits), 'credits finite');
    }
  }
  return { g, ms: Date.now() - t0, steps };
}

// --- tests -----------------------------------------------------------------
let failures = 0;
function test(name, fn) {
  try { fn(); console.log(`ok   - ${name}`); }
  catch (e) { failures++; console.log(`FAIL - ${name}\n${e.stack}`); }
}

test('map generation is deterministic and connected', () => {
  const a = new Game({ profile: defaultProfile(), seed: 1234 });
  const b = new Game({ profile: defaultProfile(), seed: 1234 });
  assert.deepEqual(Array.from(a.map.tiles), Array.from(b.map.tiles));
  assert.ok(a.enemyCC, 'enemy CC placed');
  assert.ok(a.outpostBuildings.length === 2, 'two outposts');
  const f = a.path.field(a.hqGoals, 'hq', TEAM_ENEMY);
  const ei = Math.floor(a.enemyBase.y / TILE) * a.map.w + Math.floor(a.enemyBase.x / TILE);
  assert.ok(Number.isFinite(f[ei + a.map.w * 3]), 'enemy base can reach player HQ');
});

test('faction definitions are consistent', () => {
  for (const fid of FACTION_ORDER) {
    const f = FACTIONS[fid];
    for (const u of [...f.units, ...f.start]) assert.ok(UNITS[u], `${fid}: unknown unit ${u}`);
    for (const b of f.buildings) assert.ok(BUILDINGS[b], `${fid}: unknown building ${b}`);
    for (const n of f.arsenal) for (const id of n.unlocks) assert.ok(f.units.includes(id) || f.buildings.includes(id), `${fid}: node ${n.id} unlocks ${id} outside roster`);
    const g = new Game({ profile: maxProfile(fid), faction: fid, seed: 5 });
    // every roster unit must be trainable by some roster building
    const trainable = new Set([...g.trainsFor(g.hq), ...f.buildings.flatMap((b) => (BUILDINGS[b].trains ? g.trainsFor({ type: b, def: BUILDINGS[b] }) : []))]);
    for (const u of f.units) assert.ok(trainable.has(u), `${fid}: ${u} cannot be trained`);
    for (const id of [...f.units, ...f.buildings]) assert.ok(g.available(id), `${fid}: ${id} not available at max progress`);
    const fresh = new Game({ profile: defaultProfile(), faction: fid, seed: 5 });
    for (const u of f.start) assert.ok(fresh.available(u), `${fid}: start unit ${u} must be unlocked from the start`);
    assert.ok(fresh.available('barracks') && fresh.available('fabricator'), `${fid}: basic buildings available`);
  }
});

test('all research cards apply without error', () => {
  for (const c of CARDS) {
    const g = new Game({ profile: defaultProfile(), faction: c.faction || 'valdara', seed: 99 });
    for (let r = 0; r < RARITIES.length; r++) {
      if ((c.minRarity ?? 0) > r || (c.maxRarity ?? 4) < r) continue;
      c.apply(g, RARITIES[r].mult);
      assert.equal(typeof c.text(RARITIES[r].mult), 'string');
    }
    g.refreshStats();
    for (const u of g.units) assert.ok(u.st.maxHp > 0 && Number.isFinite(u.st.dmg));
  }
});

test('drafts are distinct and respect faction and roster', () => {
  const rng = mulberry32(5);
  for (const fid of FACTION_ORDER) {
    const g = new Game({ profile: defaultProfile(), faction: fid, seed: 8 });
    for (let i = 0; i < 200; i++) {
      const d = makeDraft(rng, 4, i % 5, (c) => cardAvailable(c, g));
      assert.equal(new Set(d.map((x) => x.id)).size, d.length);
      assert.equal(d.length, 4);
      for (const p of d) {
        const card = CARDS.find((c) => c.id === p.id);
        assert.ok(!card.faction || card.faction === fid, `${fid} offered ${p.id}`);
        if (fid !== 'forge' && fid !== 'ghostnet' && fid !== 'valdara') assert.ok(!['graphene', 'servos', 'nanites'].includes(p.id), `${fid} has no robots but got ${p.id}`);
      }
    }
  }
});

test('commands: build, train, move, sell', () => {
  const g = new Game({ profile: defaultProfile(), seed: 77 });
  g.credits = 5000;
  assert.ok(tryPlace(g, 'barracks'));
  const bar = g.buildings.find((b) => b.type === 'barracks');
  for (let i = 0; i < 30 * 20; i++) g.step(1 / 30);
  assert.ok(bar.built, 'barracks finishes building');
  assert.ok(g.train(bar, 'rifle'));
  assert.ok(!g.train(bar, 'manpads'), 'locked unit cannot be trained');
  assert.ok(!g.train(bar, 'grenadier'), 'other faction unit cannot be trained');
  const before = g.units.filter((u) => u.team === TEAM_PLAYER).length;
  for (let i = 0; i < 30 * 8; i++) g.step(1 / 30);
  assert.equal(g.units.filter((u) => u.team === TEAM_PLAYER).length, before + 1);
  const rifles = g.units.filter((u) => u.type === 'rifle');
  const dest = { x: g.hq.x + 300, y: g.hq.y - 300 };
  g.orderMove(rifles, dest.x, dest.y);
  for (let i = 0; i < 30 * 20; i++) g.step(1 / 30);
  const avg = rifles.reduce((a, u) => a + Math.hypot(u.x - dest.x, u.y - dest.y), 0) / rifles.length;
  assert.ok(avg < 120, `units reach move target (avg dist ${avg.toFixed(1)})`);
  const c0 = g.credits;
  g.sell(bar);
  assert.ok(g.credits > c0);
});

test('buildings can be repaired for credits', () => {
  const g = new Game({ profile: defaultProfile(), seed: 44 });
  const hq = g.hq;
  hq.hp = hq.st.maxHp * 0.5;
  g.credits = 10000;
  assert.ok(g.toggleRepair(hq), 'repair starts on a damaged building');
  const h0 = hq.hp;
  for (let i = 0; i < 30 * 5; i++) g.step(1 / 30);
  const healed = hq.hp - h0, spent = g.stats.repaired;
  assert.ok(healed > hq.st.maxHp * 0.13 && healed < hq.st.maxHp * 0.17, `heals ~3%/s (${healed})`);
  assert.ok(spent > healed * g.repairCostPerHp(hq) * 0.8, 'repair costs credits');
  for (let i = 0; i < 30 * 30; i++) g.step(1 / 30);
  assert.equal(hq.hp, hq.st.maxHp, 'fully repaired');
  assert.ok(!hq.repairing, 'manual repair switches off when done');
  assert.ok(!g.toggleRepair(hq), 'cannot start repair on an intact building');
  // runs out of money
  hq.hp = hq.st.maxHp * 0.5; g.credits = 0;
  g.toggleRepair(hq);
  const h1 = hq.hp;
  for (let i = 0; i < 30 * 2; i++) { g.credits = 0; g.step(1 / 30); }
  assert.ok(hq.hp - h1 < 1, 'no repair without credits');
  // auto-repair handles everything that is damaged
  hq.repairing = false;
  g.autoRepair = true; g.credits = 10000;
  for (let i = 0; i < 30 * 3; i++) g.step(1 / 30);
  assert.ok(hq.hp > h1 + 100, 'auto-repair works');
  // Forge repairs cost half
  const f = new Game({ profile: defaultProfile(), faction: 'forge', seed: 44 });
  assert.ok(Math.abs(f.repairCostPerHp(f.hq) * 2 - g.repairCostPerHp(g.hq) * (g.hq.st.maxHp / f.hq.st.maxHp)) < 1e-9, 'forge discount');
});

test('fabricator cost scales with count', () => {
  const g = new Game({ profile: defaultProfile(), seed: 77 });
  g.credits = 5000;
  const c1 = g.costOf('fabricator', true);
  tryPlace(g, 'fabricator');
  assert.ok(g.costOf('fabricator', true) > c1);
});

test('every faction ability fires and resolves', () => {
  for (const fid of FACTION_ORDER) {
    const g = new Game({ profile: maxProfile(fid), faction: fid, seed: 31 });
    for (let i = 0; i < 30 * 5; i++) g.step(1 / 30);
    const tx = g.hq.x + 200, ty = g.hq.y - 150;
    const enemies = [0, 1, 2].map((k) => g.spawnUnitNear('ifv', TEAM_ENEMY, tx + k * 20, ty));
    assert.ok(!g.useAbility(tx, ty).ok, `${fid}: ability is on cooldown at start`);
    g.ability.cd = 0;
    const units0 = g.units.filter((u) => u.team === TEAM_PLAYER).length;
    const res = g.useAbility(tx, ty);
    assert.ok(res.ok, `${fid}: ability used (${res.reason})`);
    for (let i = 0; i < 30 * 6; i++) g.step(1 / 30);
    const after = g.units.filter((u) => u.team === TEAM_PLAYER).length;
    const hurt = enemies.filter((e) => e.dead || e.hp < e.st.maxHp || e.team === TEAM_PLAYER).length;
    log(fid, 'units', units0, '->', after, 'enemies affected', hurt);
    if (fid === 'mobilize' || fid === 'ironguard') assert.ok(after > units0, 'mobilization adds units');
    if (fid === 'ghostnet') assert.ok(enemies.some((e) => e.team === TEAM_PLAYER), 'breach captures a vehicle');
    if (fid === 'forge') assert.ok(g.ability.activeUntil > 0);
    if (['valdara', 'swarm', 'skyrep'].includes(fid)) assert.ok(hurt > 0, `${fid}: strike damages enemies`);
    assert.ok(g.ability.cd > 0, 'cooldown restarted');
  }
});

test('hacker cells convert enemy vehicles', () => {
  const g = new Game({ profile: defaultProfile(), faction: 'ghostnet', seed: 12 });
  const h = g.spawnUnitNear('hacker', TEAM_PLAYER, g.hq.x + 150, g.hq.y - 100);
  h.order = { type: 'hold' };
  const ifv = g.spawnUnitNear('ifv', TEAM_ENEMY, g.hq.x + 300, g.hq.y - 100);
  ifv.order = { type: 'hold' };
  ifv.def = { ...ifv.def, weapon: null }; // passive target
  for (let i = 0; i < 30 * 20 && ifv.team !== TEAM_PLAYER; i++) g.step(1 / 30);
  assert.equal(ifv.team, TEAM_PLAYER, 'IFV converted');
  assert.equal(g.stats.hacked, 1);
});

test('separate save profiles and v1 migration', () => {
  const store = {};
  globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  store['general-unknown-meta-v1'] = JSON.stringify({ chronons: 77, runs: 4, levels: { fpv: 1, d_hp: 2 }, seenIntro: true, bestWave: 9 });
  const m = loadMeta();
  assert.equal(m.profiles.valdara.chronons, 77);
  assert.equal(m.profiles.valdara.levels.d_hp, 2);
  assert.ok(m.seenIntro);
  assert.ok(!isFactionUnlocked(m, 'skyrep'), 'an old best wave of 9 is nowhere near enough any more');
  assert.ok(!isFactionUnlocked(m, 'swarm'));
  m.unlocked.push('swarm'); // pretend it was earned
  getProfile(m, 'swarm').chronons = 30;
  assert.ok(buyNode(m, 'swarm', 'stinger'));
  assert.equal(getProfile(m, 'swarm').chronons, 0);
  assert.ok(!getProfile(m, 'valdara').levels.stinger, 'purchases do not leak between factions');
  const m2 = loadMeta();
  assert.equal(m2.profiles.swarm.levels.stinger, 1, 'v2 save round-trips');
  delete globalThis.localStorage;
  assert.ok(defaultMeta().profiles);
});

test('saves from the old unlock rules are re-checked', () => {
  const store = {};
  globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  const old = defaultMeta();
  delete old.unlockRules;
  old.unlocked = ['valdara', 'ironguard', 'swarm', 'forge', 'skyrep'];
  old.faction = 'swarm';
  old.profiles.swarm = { ...defaultProfile(), runs: 3, chronons: 120, levels: { stinger: 1 } };
  old.milestones.infantry = 320; // enough infantry for Iron Guard...
  old.profiles.valdara = { ...defaultProfile(), bestWave: 12 }; // ...and wave 12 reached
  store['general-unknown-meta-v2'] = JSON.stringify(old);
  const m = loadMeta();
  assert.deepEqual(m.unlocked.sort(), ['ironguard', 'valdara'], 'only factions that meet the new rules stay');
  assert.deepEqual(m.relocked.sort(), ['forge', 'skyrep', 'swarm']);
  assert.equal(m.faction, 'valdara', 'a re-locked faction is deselected');
  assert.equal(m.profiles.swarm.chronons, 120, 'faction progress is kept');
  assert.ok(!isFactionUnlocked(m, 'swarm'), 'having played a faction no longer unlocks it');
  const again = loadMeta();
  assert.equal(again.relocked.length, 3, 'the reset is saved immediately and runs only once');
  assert.deepEqual(again.unlocked.sort(), ['ironguard', 'valdara']);
  delete globalThis.localStorage;
});

test('factions unlock through hard, chained milestones', () => {
  const meta = defaultMeta();
  for (const fid of FACTION_ORDER) assert.equal(isFactionUnlocked(meta, fid), fid === 'valdara', `${fid} initial lock state`);
  const run = (o) => ({ stats: { infantry: 0, drones: 0, built: 0, outposts: 0, facilities: 0, ...o.stats }, wave: { n: o.wave || 5 } });
  // a decent timeline unlocks nothing
  assert.deepEqual(recordMilestones(meta, run({ stats: { infantry: 40, drones: 20, built: 30, outposts: 1 }, wave: 9 })), []);
  assert.equal(unlockProgress(meta, 'ironguard').goals[0].have, 40);
  // lifetime goals accumulate, but wave 12 is still required
  for (let i = 0; i < 7; i++) recordMilestones(meta, run({ stats: { infantry: 40 }, wave: 8 }));
  assert.ok(!isFactionUnlocked(meta, 'ironguard'), '300 infantry alone is not enough');
  assert.deepEqual(recordMilestones(meta, run({ wave: 12 })), ['ironguard']);
  // Swarm needs Iron Guard (done) + 200 drones + 3 outposts over a career
  for (let i = 0; i < 9; i++) recordMilestones(meta, run({ stats: { drones: 20 } }));
  assert.ok(!isFactionUnlocked(meta, 'swarm'));
  recordMilestones(meta, run({ stats: { outposts: 1 } }));
  assert.deepEqual(recordMilestones(meta, run({ stats: { outposts: 1 } })), ['swarm']);
  // Sky Republic: Forge first, then wave 18 and both outposts in one timeline
  recordMilestones(meta, run({ stats: { outposts: 1 }, wave: 18 }));
  assert.ok(!isFactionUnlocked(meta, 'skyrep'), 'requires Forge Union first');
  for (let i = 0; i < 10; i++) recordMilestones(meta, run({ stats: { built: 25 } }));
  assert.ok(isFactionUnlocked(meta, 'forge'));
  assert.ok(!isFactionUnlocked(meta, 'skyrep'), 'outposts must fall in the same timeline');
  assert.deepEqual(recordMilestones(meta, run({ stats: { outposts: 2 } })), ['skyrep']);
  // Ghostnet: wave 22 + 3 facilities in a single timeline
  recordMilestones(meta, run({ stats: { facilities: 2 }, wave: 22 }));
  recordMilestones(meta, run({ stats: { facilities: 2 } }));
  assert.ok(!isFactionUnlocked(meta, 'ghostnet'), 'facility kills do not add up across timelines');
  assert.deepEqual(recordMilestones(meta, run({ stats: { facilities: 3 } })), ['ghostnet']);
  assert.equal(unlockWatchList(meta).length, 0);
});

test('a running timeline announces unlocks as soon as the last goal is met', () => {
  const meta = defaultMeta();
  meta.unlocked.push('ironguard');
  meta.milestones.drones = 199;
  meta.milestones.outposts = 3;
  const g = new Game({ profile: defaultProfile(), seed: 21 });
  g.unlockWatch = unlockWatchList(meta);
  g.credits = 9999;
  tryPlace(g, 'dronebay');
  const bay = g.buildings.find((b) => b.type === 'dronebay');
  for (let i = 0; i < 30 * 20; i++) g.step(1 / 30);
  g.events.length = 0;
  g.train(bay, 'recon');
  let seen = false;
  for (let i = 0; i < 30 * 10 && !seen; i++) {
    g.step(1 / 30);
    seen = g.events.some((e) => e.type === 'notify' && /Swarm Collective/.test(e.text));
    g.events.length = 0;
  }
  assert.ok(seen, 'swarm unlock announced mid-run');
  assert.ok(!g.unlockWatch.find((w) => w.id === 'ghostnet').announced, 'chained faction not announced');
});

const results = {};
for (const fid of FACTION_ORDER) {
  test(`timeline with bot: ${FACTIONS[fid].name}`, () => {
    let waves = 0;
    for (const seed of [11, 202]) {
      const { g, ms, steps } = runTimeline(fid, defaultProfile(), seed, 60 * 30);
      const r = computeReward(g);
      waves += g.wave.n;
      console.log(`       ${fid} seed ${seed}: wave ${g.wave.n}, t=${(g.time / 60).toFixed(1)}min, kills ${g.stats.kills}, hacked ${g.stats.hacked}, chronons ${r.total}, sim ${(ms / steps).toFixed(2)}ms/step`);
      assert.ok(g.over, 'unupgraded player eventually loses');
      assert.ok(g.wave.n >= 2, 'survives at least the first wave');
    }
    results[fid] = waves / 2;
  });
}

test('fully upgraded attacking bot plays a long timeline', () => {
  const { g } = runTimeline('valdara', maxProfile('valdara'), 4242, 60 * 30, { attack: true });
  console.log(`       upgraded: wave ${g.wave.n}, t=${(g.time / 60).toFixed(1)}min, kills ${g.stats.kills}, outposts ${g.stats.outposts}, facilities ${g.stats.facilities}, over=${JSON.stringify(g.over)}`);
});

if (failures) { console.log(`\n${failures} test(s) failed`); process.exit(1); }
console.log('\naverage wave reached per faction (no upgrades):', JSON.stringify(results));
console.log('all tests passed');
