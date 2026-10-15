// Headless simulation test: runs full timelines with a scripted "player" bot and checks
// invariants. Usage: node tests/sim.test.mjs [--verbose]
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { defaultMeta, computeReward, META_NODES } from '../src/meta.js';
import { BUILDINGS, TILE, TEAM_PLAYER, TEAM_ENEMY } from '../src/data.js';
import { CARDS, RARITIES, makeDraft } from '../src/upgrades.js';
import { mulberry32 } from '../src/rng.js';

const verbose = process.argv.includes('--verbose');
const log = (...a) => verbose && console.log(...a);

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

function bot(g, rng, opts) {
  const mine = (t) => g.buildings.filter((b) => b.team === TEAM_PLAYER && b.type === t);
  if (g.research.ready > 0) { g.openDraft(); g.pickDraft(Math.floor(rng() * g.research.draft.length)); }
  if (!mine('barracks').length && g.credits >= 150) tryPlace(g, 'barracks');
  else if (mine('fabricator').length < 2 && g.credits >= 220) tryPlace(g, 'fabricator');
  else if (g.supplyCap - g.supplyUsed < 3 && g.credits >= 110 && mine('logistics').length < 6) tryPlace(g, 'logistics');
  else if (mine('sentry').length < 2 + g.wave.n && g.credits >= 140) tryPlace(g, 'sentry');
  for (const b of [...mine('barracks'), ...mine('hq')]) {
    if (b.queue.length < 2 && g.credits > 100) g.train(b, rng() < 0.35 && b.type === 'barracks' ? 'at_team' : 'rifle');
  }
  if (opts.attack && g.time > 600 && g.throttle('botattack', 30)) {
    const army = g.units.filter((u) => u.team === TEAM_PLAYER && !u.air);
    if (army.length > 25) g.orderMove(army, g.enemyBase.x, g.enemyBase.y, true);
  }
}

function runTimeline(meta, seed, maxTime, opts = {}) {
  const g = new Game({ meta, seed, escalation: 0 });
  const rng = mulberry32(seed + 1);
  const dt = 1 / 30;
  let t = 0, steps = 0;
  const t0 = Date.now();
  while (!g.over && g.time < maxTime) {
    g.step(dt);
    steps++;
    if (steps % 15 === 0) bot(g, rng, opts);
    g.events.length = 0;
    t += dt;
    // invariants
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
  const ms = Date.now() - t0;
  return { g, ms, steps };
}

// --- tests -----------------------------------------------------------------
let failures = 0;
function test(name, fn) {
  try { fn(); console.log(`ok   - ${name}`); }
  catch (e) { failures++; console.log(`FAIL - ${name}\n${e.stack}`); }
}

test('map generation is deterministic and connected', () => {
  const meta = defaultMeta();
  const a = new Game({ meta, seed: 1234 });
  const b = new Game({ meta, seed: 1234 });
  assert.deepEqual(Array.from(a.map.tiles), Array.from(b.map.tiles));
  assert.ok(a.enemyCC, 'enemy CC placed');
  assert.ok(a.outpostBuildings.length === 2, 'two outposts');
  const f = a.path.field(a.hqGoals, 'hq', TEAM_ENEMY);
  const ei = Math.floor(a.enemyBase.y / TILE) * a.map.w + Math.floor(a.enemyBase.x / TILE);
  // enemy base center is inside the CC; check a neighbouring tile below it
  const below = ei + a.map.w * 3;
  assert.ok(Number.isFinite(f[below]), 'enemy base can reach player HQ');
});

test('all research cards apply without error', () => {
  const meta = defaultMeta();
  for (const c of CARDS) {
    const g = new Game({ meta, seed: 99 });
    for (let r = 0; r < RARITIES.length; r++) {
      if ((c.minRarity ?? 0) > r || (c.maxRarity ?? 4) < r) continue;
      c.apply(g, RARITIES[r].mult);
      assert.equal(typeof c.text(RARITIES[r].mult), 'string');
    }
    g.refreshStats();
    for (const u of g.units) assert.ok(u.st.maxHp > 0 && Number.isFinite(u.st.dmg));
  }
});

test('drafts have distinct cards and respect unlocks', () => {
  const rng = mulberry32(5);
  for (let i = 0; i < 300; i++) {
    const d = makeDraft(rng, 4, i % 5, new Set());
    assert.equal(new Set(d.map((x) => x.id)).size, d.length);
    assert.ok(d.length === 4);
    for (const p of d) assert.ok(!['graphene', 'servos', 'nanites', 'twin_salvo'].includes(p.id));
  }
});

test('commands: build, train, move, sell', () => {
  const g = new Game({ meta: defaultMeta(), seed: 77 });
  g.credits = 5000;
  assert.ok(tryPlace(g, 'barracks'));
  const bar = g.buildings.find((b) => b.type === 'barracks');
  for (let i = 0; i < 30 * 20; i++) g.step(1 / 30);
  assert.ok(bar.built, 'barracks finishes building');
  assert.ok(g.train(bar, 'rifle'));
  assert.ok(!g.train(bar, 'manpads'), 'locked unit cannot be trained');
  const before = g.units.filter((u) => u.team === TEAM_PLAYER).length;
  for (let i = 0; i < 30 * 8; i++) g.step(1 / 30);
  assert.equal(g.units.filter((u) => u.team === TEAM_PLAYER).length, before + 1);
  const rifles = g.units.filter((u) => u.type === 'rifle');
  const dest = { x: g.hq.x + 300, y: g.hq.y - 300 };
  g.orderMove(rifles, dest.x, dest.y);
  for (let i = 0; i < 30 * 20; i++) g.step(1 / 30);
  const avg = rifles.reduce((a, u) => a + Math.hypot(u.x - dest.x, u.y - dest.y), 0) / rifles.length;
  log('avg distance to move target', avg.toFixed(1));
  assert.ok(avg < 120, `units reach move target (avg dist ${avg.toFixed(1)})`);
  const c0 = g.credits;
  g.sell(bar);
  assert.ok(g.credits > c0);
});

test('every meta node level can be bought with enough chronons', () => {
  const meta = defaultMeta();
  meta.chronons = 1e6;
  for (const n of META_NODES) for (let i = 0; i < n.cost.length; i++) meta.levels[n.id] = (meta.levels[n.id] || 0) + 1;
  const g = new Game({ meta, seed: 3 });
  assert.ok(g.research.ready >= 3, 'head start drafts');
  assert.equal(g.draftSize, 4);
  for (const t of Object.keys(BUILDINGS)) if (!BUILDINGS[t].noBuild) assert.ok(g.isUnlocked(BUILDINGS[t]), t);
});

for (const seed of [11, 202, 3003]) {
  test(`full timeline with bot (seed ${seed}) runs and ends`, () => {
    const meta = defaultMeta();
    const { g, ms, steps } = runTimeline(meta, seed, 60 * 30);
    const r = computeReward(g);
    console.log(`       seed ${seed}: wave ${g.wave.n}, t=${(g.time / 60).toFixed(1)}min, kills ${g.stats.kills}, lost ${g.stats.lost}, ` +
      `units ${g.units.length}, chronons ${r.total}, sim ${(ms / steps).toFixed(2)}ms/step`);
    assert.ok(g.over, 'unupgraded player eventually loses');
    assert.ok(g.wave.n >= 2, 'survives at least the first wave');
  });
}

test('fully upgraded attacking bot plays a long timeline', () => {
  const meta = defaultMeta();
  for (const n of META_NODES) meta.levels[n.id] = n.cost.length;
  const { g } = runTimeline(meta, 4242, 60 * 30, { attack: true });
  console.log(`       upgraded: wave ${g.wave.n}, t=${(g.time / 60).toFixed(1)}min, kills ${g.stats.kills}, outposts ${g.stats.outposts}, facilities ${g.stats.facilities}, over=${JSON.stringify(g.over)}`);
});

if (failures) { console.log(`\n${failures} test(s) failed`); process.exit(1); }
console.log('\nall tests passed');
