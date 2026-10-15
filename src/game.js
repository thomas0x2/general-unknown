// Core simulation: entities, orders, combat, economy, fog of war, enemy AI.
import {
  TILE, MAP_W, MAP_H, TEAM_PLAYER, TEAM_ENEMY, UNITS, BUILDINGS, ENEMY_UNITS, ENEMY_BUILDINGS,
  CRUISE_MISSILE, WAVE, RESEARCH, SITE_INCOME, VS,
} from './data.js';
import { generateMap, Pathing } from './map.js';
import { mulberry32, randomSeed } from './rng.js';
import { createMods, modSum, makeDraft, CARD_BY_ID, RARITIES, cardAvailable } from './upgrades.js';
import { applyMeta, unlockedSet, decodeMemory } from './meta.js';
import { FACTIONS, lockMap } from './factions.js';

export const BUILD_RADIUS = 9; // tiles from an existing building
const FOG_INTERVAL = 0.2;
const MAX_WAVE_UNITS = 90;

// ---------------------------------------------------------------------------
class SpatialHash {
  constructor(cell) { this.cell = cell; this.map = new Map(); }
  clear() { this.map.clear(); }
  key(cx, cy) { return cx + cy * 4096; }
  insert(e) {
    const k = this.key(Math.floor(e.x / this.cell), Math.floor(e.y / this.cell));
    let a = this.map.get(k);
    if (!a) { a = []; this.map.set(k, a); }
    a.push(e);
  }
  query(x, y, r, fn) {
    const c = this.cell;
    const x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c);
    const y0 = Math.floor((y - r) / c), y1 = Math.floor((y + r) / c);
    for (let cy = y0; cy <= y1; cy++)
      for (let cx = x0; cx <= x1; cx++) {
        const a = this.map.get(this.key(cx, cy));
        if (a) for (let i = 0; i < a.length; i++) fn(a[i]);
      }
  }
}

const circleCache = new Map();
function circleOffsets(r) {
  let c = circleCache.get(r);
  if (c) return c;
  c = [];
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r) c.push([x, y]);
  circleCache.set(r, c);
  return c;
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angleTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(1, t);
}

export class Game {
  constructor({ profile, faction = 'valdara', seed, escalation = 0 }) {
    this.seed = seed;
    this.faction = FACTIONS[faction];
    this.roster = new Set([...this.faction.units, ...this.faction.buildings, 'hq']);
    this.locks = lockMap(this.faction);
    this.rng = mulberry32(randomSeed());
    this.gameSeed = randomSeed();
    this.map = generateMap(seed);
    this.path = new Pathing(this.map);
    this.hash = new SpatialHash(128);
    this.units = [];
    this.buildings = [];
    this.projectiles = [];
    this.effects = [];
    this.events = [];
    this.selection = [];
    this.nextId = 1;
    this.time = 0;
    this.credits = 500;
    this.escalation = escalation;
    this.over = null;
    this.mods = createMods();
    this.research = { points: 0, level: 0, needed: RESEARCH.first, ready: 0, rerolls: 0, draft: null, picks: [] };
    this.unlocked = unlockedSet(profile, this.faction.id);
    this.luck = 0; this.draftSize = 3; this.extraRifles = 0; this.chrononGain = 0;
    this.faction.passive(this);
    applyMeta(profile, this);
    this.ability = { ...this.faction.ability, cd: 30, activeUntil: 0 };
    this.pending = []; // scheduled ability effects
    this.prodSpeed = 1;

    const N = MAP_W * MAP_H;
    this.vis = new Uint8Array(N);
    this.explored = this.cartography && profile.seed === seed ? decodeMemory(profile.memory, N) : new Uint8Array(N);
    this.marked = new Uint8Array(N); // tiles covered by AWACS: enemies there take extra damage
    this.memoryExplored = this.explored.slice();
    this.fogT = 0;
    this.fogVersion = 0;

    this.wave = { n: 0, next: WAVE.first, lastSpawn: null };
    this.missileT = 30;
    this.stats = { kills: 0, lost: 0, outposts: 0, facilities: 0, built: 0, trained: 0, earned: 0, hacked: 0, infantry: 0, drones: 0 };
    this.unlockWatch = []; // locked factions to announce mid-run: { id, name, stat, need, have }
    this.throttles = new Map();
    this.income = 0; this.supplyUsed = 0; this.supplyCap = 0;

    this.sites = this.map.sites.map((p) => ({ x: (p.x + 0.5) * TILE, y: (p.y + 0.5) * TILE, progress: 0, owner: -1 }));
    this.crates = this.map.crates.map((p) => ({ x: (p.x + 0.5) * TILE, y: (p.y + 0.5) * TILE, taken: false }));

    this.setupPlayer();
    this.setupEnemy();
    this.updateEconomy(0);
    this.updateFog();
  }

  // ------------------------------------------------------------------ setup
  setupPlayer() {
    const { hq } = this.map;
    this.hq = this.addBuilding('hq', TEAM_PLAYER, hq.x - 1, hq.y - 1, true);
    const start = [...this.faction.start, ...Array(this.extraRifles).fill('rifle')];
    const n = start.length;
    start.forEach((type, i) => {
      const a = -Math.PI / 4 + (i - (n - 1) / 2) * 0.32;
      const r = UNITS[type].air ? 60 : 85;
      this.spawnUnitNear(type, TEAM_PLAYER, this.hq.x + Math.cos(a) * r, this.hq.y + Math.sin(a) * r);
    });
    this.hqGoals = [];
    for (let y = this.hq.ty; y < this.hq.ty + 3; y++)
      for (let x = this.hq.tx; x < this.hq.tx + 3; x++) this.hqGoals.push(y * MAP_W + x);
  }

  setupEnemy() {
    const { enemy, outposts } = this.map;
    const ex = enemy.x, ey = enemy.y;
    const layout = [
      ['cc', -1, -1], ['ebarracks', -6, -2], ['factory', 3, -5], ['nest', -5, 3], ['silo', 4, 3],
      ['power', -1, 5], ['power', -2, -7], ['eradar', 6, 0], ['edome', -3, 1],
      ['eaa', 3, 0], ['eaa', -3, -4], ['eaa', 2, 6],
    ];
    const ring = [[9, 0], [6, 6], [0, 9], [-6, 6], [-9, 0], [-6, -6], [0, -9], [6, -6], [-8, 4], [-4, 8]];
    for (const [x, y] of ring) layout.push(['eturret', x, y]);
    for (const [t, dx, dy] of layout) {
      const b = this.addBuilding(t, TEAM_ENEMY, ex + dx, ey + dy, true);
      if (t === 'cc') this.enemyCC = b;
    }
    this.outpostBuildings = [];
    for (const o of outposts) {
      const b = this.addBuilding('outpost', TEAM_ENEMY, o.x - 1, o.y - 1, true);
      if (b) this.outpostBuildings.push(b);
      this.addBuilding('eturret', TEAM_ENEMY, o.x - 3, o.y + 2, true);
      this.addBuilding('eturret', TEAM_ENEMY, o.x + 2, o.y - 3, true);
      this.addBuilding('eaa', TEAM_ENEMY, o.x + 2, o.y + 2, true);
      for (const t of ['trooper', 'trooper', 'trooper', 'rocketeer']) this.spawnGarrison(t, (o.x + 0.5) * TILE, (o.y + 0.5) * TILE, 90);
    }
    const base = { x: (ex + 0.5) * TILE, y: (ey + 0.5) * TILE };
    for (const t of ['trooper', 'trooper', 'trooper', 'trooper', 'trooper', 'trooper', 'rocketeer', 'rocketeer', 'ifv', 'ifv', 'tank'])
      this.spawnGarrison(t, base.x, base.y, 200);
    this.enemyBase = base;

    if (this.temporalRecon) {
      for (const b of this.buildings) if (b.team === TEAM_ENEMY && (b.def.share > 0 || b.def.enables || b.def.outpost || b.type === 'cc')) b.discovered = true;
      this.revealArea(base.x, base.y, 8);
      for (const o of outposts) this.revealArea((o.x + 0.5) * TILE, (o.y + 0.5) * TILE, 4);
    }
  }

  spawnGarrison(type, x, y, spread) {
    const a = this.rng() * Math.PI * 2, r = this.rng() * spread;
    const u = this.spawnUnitNear(type, TEAM_ENEMY, x + Math.cos(a) * r, y + Math.sin(a) * r);
    if (u) { u.home = { x: u.x, y: u.y }; u.garrison = true; }
    return u;
  }

  revealArea(x, y, r) {
    const cx = Math.floor(x / TILE), cy = Math.floor(y / TILE);
    for (const [ox, oy] of circleOffsets(r)) {
      const tx = cx + ox, ty = cy + oy;
      if (tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H) this.explored[ty * MAP_W + tx] = 1;
    }
    for (const b of this.buildings) if (b.team === TEAM_ENEMY && Math.hypot(b.x - x, b.y - y) < r * TILE) b.discovered = true;
    this.fogVersion++;
  }

  // ------------------------------------------------------------ stats/mods
  tagsFor(kind, type, def, team) {
    if (team === TEAM_ENEMY) return [];
    if (kind === 'unit') return ['all', 'unit', def.cls, type];
    const t = ['all', 'building', type];
    if (def.tags?.includes('defense')) t.push('defense');
    if (type === 'hq') t.push('hq');
    return t;
  }

  computeStats(e) {
    const def = e.def, w = def.weapon;
    if (e.team === TEAM_ENEMY) {
      const esc = 1 + 0.2 * this.escalation;
      const elite = e.kind === 'unit' ? 1 + Math.max(0, (e.wave || 0) - WAVE.eliteFrom) * WAVE.eliteStep : 1;
      return {
        maxHp: def.hp * esc * elite, speed: def.speed || 0, sight: def.sight,
        dmg: w ? w.dmg * esc * (1 + (elite - 1) * 0.6) : 0, range: w ? w.range : 0, cd: w ? w.cd : 0,
        splash: w?.splash || 0, regen: 0, dr: 0, intercept: 1, hack: 1, stun: 1, radius: 1,
      };
    }
    const tags = e.tags;
    const M = (s) => modSum(this.mods, s, tags);
    return {
      maxHp: def.hp * (1 + M('hp')),
      speed: (def.speed || 0) * (1 + M('speed')),
      sight: def.sight * (1 + M('sight')),
      dmg: w ? w.dmg * (1 + M('dmg')) : 0,
      range: w ? (w.type === 'kamikaze' ? w.range : w.range * (1 + M('range'))) : 0,
      cd: w ? w.cd / (1 + M('rate')) : 0,
      splash: w?.splash ? w.splash * (1 + M('splash')) : 0,
      regen: M('regen'),
      dr: Math.min(0.6, M('dr')),
      intercept: 1 + M('intercept'),
      hack: 1 + M('hack'),
      stun: 1 + M('stun'),
      radius: 1 + M('range'), // aura radius for jammers, pulses, healers
    };
  }

  refreshStats() {
    for (const e of [...this.units, ...this.buildings]) {
      if (e.team !== TEAM_PLAYER) continue;
      const ratio = e.hp / e.st.maxHp;
      e.st = this.computeStats(e);
      e.hp = Math.min(e.st.maxHp, ratio * e.st.maxHp);
    }
    this.updateEconomy(0);
  }

  costOf(type, isBuilding) {
    const def = isBuilding ? BUILDINGS[type] : UNITS[type];
    const tags = this.tagsFor(isBuilding ? 'building' : 'unit', type, def, TEAM_PLAYER);
    let base = def.cost;
    if (def.costStep) base += def.costStep * this.buildings.filter((b) => b.team === TEAM_PLAYER && b.type === type && !b.dead).length;
    return Math.round(base * Math.max(0.4, 1 - modSum(this.mods, 'cost', tags)));
  }

  timeOf(type, isBuilding) {
    const def = isBuilding ? BUILDINGS[type] : UNITS[type];
    const tags = this.tagsFor(isBuilding ? 'building' : 'unit', type, def, TEAM_PLAYER);
    return def.time / (1 + modSum(this.mods, 'build', tags));
  }

  // In this faction's roster and unlocked in the Chrono Lab.
  available(id) { return this.roster.has(id) && (!this.locks[id] || this.unlocked.has(this.locks[id])); }
  isUnlocked(id) { return this.available(id); }
  inRoster(id) { return this.roster.has(id); }
  hasClass(cls) { return this.faction.units.some((u) => UNITS[u].cls === cls && this.available(u)); }
  trainsFor(b) {
    const list = b.type === 'hq' ? this.faction.hqTrains || b.def.trains : b.def.trains;
    return (list || []).filter((t) => this.roster.has(t));
  }
  supplyOf(type) {
    const def = UNITS[type];
    return def.supply * (this.faction.supplyMult?.[def.cls] ?? 1);
  }

  // --------------------------------------------------------------- entities
  spawnUnit(type, team, x, y) {
    const def = (team === TEAM_PLAYER ? UNITS : ENEMY_UNITS)[type];
    const u = {
      kind: 'unit', id: this.nextId++, type, def, team, x, y,
      angle: team === TEAM_PLAYER ? -Math.PI / 4 : Math.PI * 0.75,
      air: !!def.air, armor: def.armor, radius: def.radius, dead: false,
      order: { type: 'idle' }, target: null, cd: this.rng() * 0.5, scanT: this.rng() * 0.3,
      losT: 0, direct: false, wave: this.wave.n, home: null, slowUntil: 0, slowFactor: 1, flash: 0,
      stuckT: 0, lastD: Infinity, spawnT: def.spawner ? 2 : 0, children: 0, bob: this.rng() * 10,
    };
    u.tags = this.tagsFor('unit', type, def, team);
    u.st = this.computeStats(u);
    u.hp = u.st.maxHp;
    this.units.push(u);
    return u;
  }

  spawnUnitNear(type, team, x, y) {
    const def = (team === TEAM_PLAYER ? UNITS : ENEMY_UNITS)[type];
    if (!def.air) {
      const t = this.path.nearestWalkable(Math.floor(x / TILE), Math.floor(y / TILE), 10);
      if (!t) return null;
      if (!this.path.walkableAt(x, y)) { x = (t.x + 0.5) * TILE; y = (t.y + 0.5) * TILE; }
    }
    return this.spawnUnit(type, team, x, y);
  }

  addBuilding(type, team, tx, ty, built) {
    const def = (team === TEAM_PLAYER ? BUILDINGS : ENEMY_BUILDINGS)[type];
    for (let y = ty; y < ty + def.h; y++) for (let x = tx; x < tx + def.w; x++) if (!this.path.walkable(x, y)) return null;
    const b = {
      kind: 'building', id: this.nextId++, type, def, team, tx, ty, w: def.w, h: def.h,
      x: (tx + def.w / 2) * TILE, y: (ty + def.h / 2) * TILE, radius: Math.max(def.w, def.h) * TILE * 0.5,
      armor: 'struct', air: false, dead: false, built, progress: built ? 1 : 0, queue: [], rally: null,
      cd: this.rng() * 0.5, scanT: this.rng() * 0.3, target: null, discovered: team === TEAM_PLAYER, visible: team === TEAM_PLAYER,
      lastHit: -99, angle: team === TEAM_PLAYER ? -Math.PI / 4 : Math.PI * 0.75, flash: 0, effT: 0, salvoLeft: 0,
    };
    b.tags = this.tagsFor('building', type, def, team);
    b.st = this.computeStats(b);
    b.hp = built ? b.st.maxHp : b.st.maxHp * 0.08;
    this.buildings.push(b);
    this.path.setBlock(b, true);
    // push units out of the footprint
    for (const u of this.units) {
      if (u.air || u.dead) continue;
      const utx = Math.floor(u.x / TILE), uty = Math.floor(u.y / TILE);
      if (utx >= tx && utx < tx + def.w && uty >= ty && uty < ty + def.h) {
        const t = this.path.nearestWalkable(utx, uty, 6);
        if (t) { u.x = (t.x + 0.5) * TILE; u.y = (t.y + 0.5) * TILE; }
      }
    }
    return b;
  }

  // ------------------------------------------------------------- utilities
  emit(ev) { this.events.push(ev); }
  notify(text, level = 'info', pos = null, key = null, every = 0) {
    if (key && !this.throttle(key, every)) return;
    this.emit({ type: 'notify', text, level, pos });
  }
  sfx(name, x, y) { this.emit({ type: 'sfx', name, x, y }); }
  throttle(key, every) {
    const t = this.throttles.get(key);
    if (t != null && this.time - t < every) return false;
    this.throttles.set(key, this.time);
    return true;
  }
  fx(e) {
    if (this.effects.length > 900) return;
    e.t = 0;
    this.effects.push(e);
  }
  tileIdx(x, y) {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return -1;
    return ty * MAP_W + tx;
  }
  isVisible(e) {
    if (e.team === TEAM_PLAYER) return true;
    if (e.kind === 'building') return e.visible;
    const i = this.tileIdx(e.x, e.y);
    return i >= 0 && this.vis[i] === 1;
  }
  visibleAt(x, y) { const i = this.tileIdx(x, y); return i >= 0 && this.vis[i] === 1; }

  // ------------------------------------------------------------------ step
  step(dt) {
    if (this.over) return;
    this.time += dt;
    this.updateEconomy(dt);
    this.updateResearch(dt);
    this.updateAbility(dt);

    this.hash.clear();
    for (const u of this.units) if (!u.dead) this.hash.insert(u);
    for (const b of this.buildings) if (!b.dead) this.hash.insert(b);

    for (const b of this.buildings) if (!b.dead) this.updateBuilding(b, dt);
    for (const u of this.units) if (!u.dead) this.updateUnit(u, dt);
    this.separate();
    for (const p of this.projectiles) if (!p.dead) this.updateProjectile(p, dt);
    this.updateSites(dt);
    this.updateEnemyAI(dt);

    if (this.unlockWatch.length && this.throttle('unlockwatch', 1)) this.checkUnlocks();

    this.fogT -= dt;
    if (this.fogT <= 0) { this.fogT = FOG_INTERVAL; this.updateFog(); }

    for (const e of this.effects) e.t += dt;
    this.effects = this.effects.filter((e) => e.t < e.life);
    if (this.units.some((u) => u.dead)) this.units = this.units.filter((u) => !u.dead);
    if (this.buildings.some((b) => b.dead)) this.buildings = this.buildings.filter((b) => !b.dead);
    if (this.projectiles.some((p) => p.dead)) this.projectiles = this.projectiles.filter((p) => !p.dead);
    if (this.selection.some((e) => e.dead)) this.selection = this.selection.filter((e) => !e.dead);
  }

  updateEconomy(dt) {
    let inc = 0, cap = 0, used = 0, prod = 0, cyber = 0;
    const ib = this.faction.incomeBonus || {};
    for (const b of this.buildings) {
      if (b.team !== TEAM_PLAYER || !b.built || b.dead) continue;
      inc += (b.def.income || 0) * (1 + (ib[b.type] || 0));
      cap += b.def.supply || 0;
      prod += b.def.prodBonus || 0;
      if (b.def.cyber) cyber++;
    }
    this.cyberCenters = Math.min(2, cyber);
    this.prodSpeed = (1 + prod) * (this.overdrive() ? 3 : 1);
    const sites = this.sites.filter((s) => s.owner === TEAM_PLAYER).length;
    inc += sites * SITE_INCOME;
    for (const u of this.units) if (u.team === TEAM_PLAYER && !u.dead && !u.spawned) used += this.supplyOf(u.type);
    this.income = inc * (1 + this.mods.income);
    this.supplyCap = cap + this.mods.supply;
    this.supplyUsed = Math.round(used * 10) / 10;
    const gain = this.income * dt;
    this.credits += gain;
    this.stats.earned += gain;
  }

  researchRate() {
    let r = RESEARCH.base;
    for (const b of this.buildings) if (b.team === TEAM_PLAYER && b.built && b.def.research) r += b.def.research;
    return r * (1 + this.mods.research);
  }

  addResearch(pts) {
    const R = this.research;
    R.points += pts;
    while (R.points >= R.needed) {
      R.points -= R.needed;
      R.level++;
      R.ready++;
      R.needed = RESEARCH.first * Math.pow(RESEARCH.growth, R.level);
      this.notify('Research breakthrough ready — press T to choose an upgrade', 'good', null, 'research', 2);
      this.sfx('research');
    }
  }

  updateResearch(dt) { this.addResearch(this.researchRate() * dt); }

  openDraft() {
    const R = this.research;
    if (R.draft || R.ready <= 0) return R.draft;
    R.draft = makeDraft(this.rng, this.draftSize, this.luck, (c) => cardAvailable(c, this));
    return R.draft;
  }

  rerollDraft() {
    const R = this.research;
    if (!R.draft || R.rerolls <= 0) return;
    R.rerolls--;
    R.draft = makeDraft(this.rng, this.draftSize, this.luck, (c) => cardAvailable(c, this));
  }

  pickDraft(i) {
    const R = this.research;
    if (!R.draft || !R.draft[i]) return;
    const pick = R.draft[i];
    const card = CARD_BY_ID[pick.id];
    card.apply(this, RARITIES[pick.rarity].mult);
    R.picks.push(pick);
    R.draft = null;
    R.ready--;
    this.refreshStats();
    this.sfx('upgrade');
  }

  // ------------------------------------------------------- commander ability
  overdrive() { return this.ability.id === 'overdrive' && this.time < this.ability.activeUntil; }
  abilityCooldown() { return this.ability.cooldown * Math.max(0.4, 1 - this.mods.abilityCd); }
  abilityPower() { return 1 + this.mods.abilityPower; }

  updateAbility(dt) {
    this.ability.cd = Math.max(0, this.ability.cd - dt);
    if (!this.pending.length) return;
    const due = this.pending.filter((p) => this.time >= p.at);
    if (!due.length) return;
    this.pending = this.pending.filter((p) => this.time < p.at);
    for (const p of due) p.fn();
  }

  later(delay, fn) { this.pending.push({ at: this.time + delay, fn }); }

  // Returns { ok, reason }. x/y are ignored for untargeted abilities.
  useAbility(x, y) {
    const A = this.ability;
    if (this.over) return { ok: false };
    if (A.cd > 0) return { ok: false, reason: `${A.name} recharging (${Math.ceil(A.cd)}s)` };
    if (A.target) {
      const i = this.tileIdx(x, y);
      if (i < 0 || !this.explored[i]) return { ok: false, reason: 'Target must be in scouted territory' };
    }
    const pw = this.abilityPower();
    const hq = this.hq;
    switch (A.id) {
      case 'barrage': {
        const n = Math.round(14 * Math.min(2, pw));
        for (let i = 0; i < n; i++) {
          const a = this.rng() * Math.PI * 2, r = Math.sqrt(this.rng()) * A.radius;
          const tx = x + Math.cos(a) * r, ty = y + Math.sin(a) * r;
          this.projectiles.push({
            kind: 'proj', type: 'shell', team: TEAM_PLAYER, x: hq.x, y: hq.y, angle: Math.atan2(ty - hq.y, tx - hq.x),
            speed: 950, target: null, tx, ty, dmg: 150 * pw, vs: VS.explosive, splash: 55, homing: false, interceptable: false,
            hp: 30, air: true, armor: 'missile', radius: 3, dead: false, life: 0, src: hq, delay: i * 0.28,
          });
        }
        this.sfx('launch', hq.x, hq.y);
        break;
      }
      case 'mobilize': {
        const n = Math.min(16, Math.round((4 + Math.floor(this.wave.n / 2)) * pw));
        for (let i = 0; i < n; i++) {
          const type = i % 3 === 2 && this.inRoster('grenadier') ? 'grenadier' : 'rifle';
          const a = (i / n) * Math.PI * 2;
          const u = this.spawnUnitNear(type, TEAM_PLAYER, hq.x + Math.cos(a) * 90, hq.y + Math.sin(a) * 90);
          if (!u) continue;
          u.spawned = true;
          this.setIdle(u);
        }
        this.fx({ type: 'ring', x: hq.x, y: hq.y, size: 140, life: 0.8, color: this.faction.color });
        this.notify(`Mass Mobilization: ${n} reservist squads report for duty`, 'good');
        this.sfx('ready');
        break;
      }
      case 'swarm': {
        const n = Math.min(26, Math.round((6 + this.wave.n * 0.6) * pw));
        for (let i = 0; i < n; i++) {
          const u = this.spawnUnit('fpv', TEAM_PLAYER, hq.x + (this.rng() - 0.5) * 60, hq.y + (this.rng() - 0.5) * 60);
          u.spawned = true;
          u.order = { type: 'amove', x: x + (this.rng() - 0.5) * A.radius, y: y + (this.rng() - 0.5) * A.radius };
          u.home = { x: u.order.x, y: u.order.y };
        }
        this.notify(`Swarm Strike: ${n} FPV drones launched`, 'good');
        this.sfx('launch', hq.x, hq.y);
        break;
      }
      case 'breach': {
        const r = A.radius;
        const victims = [];
        this.hash.query(x, y, r + 40, (o) => {
          if (o.team !== TEAM_ENEMY || o.dead || Math.hypot(o.x - x, o.y - y) - o.radius > r) return;
          this.stun(o, 8 * (1 + (this.mods.stun.all || 0)));
          if (o.kind === 'unit' && this.hackable(o)) victims.push(o);
        });
        victims.sort((a, b) => b.def.cost - a.def.cost);
        const n = Math.round(2 * pw);
        victims.slice(0, n).forEach((u) => this.convert(u));
        this.fx({ type: 'ring', x, y, size: r, life: 0.9, color: '#c08cff' });
        this.fx({ type: 'ring', x, y, size: r * 0.6, life: 0.6, color: '#ffffff' });
        this.notify(`Network Breach: hostile systems offline${victims.length ? `, ${Math.min(n, victims.length)} machines captured` : ''}`, 'good');
        this.sfx('railgun', x, y);
        break;
      }
      case 'overdrive': {
        A.activeUntil = this.time + A.duration * pw;
        this.updateEconomy(0);
        this.notify(`Overdrive: factories at 300% for ${Math.round(A.duration * pw)}s`, 'good');
        this.sfx('built');
        break;
      }
      case 'airstrike': {
        const ang = Math.atan2(y - hq.y, x - hq.x);
        const dx = Math.cos(ang), dy = Math.sin(ang);
        const L = A.length, n = 9;
        const from = { x: x - dx * 900, y: y - dy * 900 }, to = { x: x + dx * 900, y: y + dy * 900 };
        this.later(0.8, () => this.fx({ type: 'jet', x: from.x, y: from.y, x2: to.x, y2: to.y, life: 2.2 }));
        for (let i = 0; i < n; i++) {
          const f = i / (n - 1) - 0.5;
          const bx = x + dx * f * L, by = y + dy * f * L;
          // the jet crosses 1800px in 2.2s; drop each bomb as it passes overhead
          const t = 0.8 + ((900 + f * L) / 1800) * 2.2 + 0.25;
          this.later(t, () => {
            this.splash(bx, by, A.radius, 230 * pw, VS.explosive, TEAM_PLAYER, hq);
            this.fx({ type: 'explosion', x: bx, y: by, size: A.radius, life: 0.7 });
            this.fx({ type: 'scorch', x: bx, y: by, size: A.radius * 0.8, life: 30 });
            this.sfx('bigboom', bx, by);
          });
        }
        this.notify('Air Strike: bomber inbound', 'good');
        break;
      }
    }
    A.cd = this.abilityCooldown();
    return { ok: true };
  }

  // --------------------------------------------------------------- targeting
  canHit(w, o) {
    if (w.type === 'hack') return o.kind === 'unit' && o.team !== TEAM_PLAYER && this.hackable(o);
    if (o.air) return (w.targets === 'air' || w.targets === 'both') && (w.vs.air || 0) > 0;
    return w.targets === 'ground' || w.targets === 'both';
  }

  hackable(o) { return o.def.cls !== 'infantry' && o.def.shape !== 'walker' && !o.dead; }

  findTarget(e, range) {
    const w = e.def.weapon;
    let best = null, bestS = Infinity;
    const playerSide = e.team === TEAM_PLAYER;
    this.hash.query(e.x, e.y, range + 70, (o) => {
      if (o.team === e.team || o.dead) return;
      if (!this.canHit(w, o)) return;
      if (playerSide && !this.isVisible(o)) return;
      if (o.kind === 'building' && !o.built && o.team === TEAM_PLAYER && o.hp < 1) return;
      const d = dist(e, o) - o.radius - this.reach(e);
      if (d > range) return;
      let s = d;
      if (o.kind === 'building') {
        s += o.def.wall ? 500 : 160;
        if (e.def.prefersBuildings && !o.def.wall) s -= 900;
      } else if (o.def.weapon) s -= 50;
      if (w.type === 'kamikaze' && o.kind === 'unit') s -= o.st.maxHp * 0.1;
      if (s < bestS) { bestS = s; best = o; }
    });
    return best;
  }

  findMissile(e, range) {
    let best = null, bd = Infinity;
    for (const p of this.projectiles) {
      if (p.dead || !p.interceptable || p.team === e.team) continue;
      const d = dist(e, p);
      if (d <= range && d < bd) { bd = d; best = p; }
    }
    return best;
  }

  // Buildings measure weapon range from (roughly) their edge rather than their center.
  reach(e) { return e.kind === 'building' ? e.radius * 0.5 : 0; }
  inRange(e, t, range) { return dist(e, t) - (t.radius || 4) - this.reach(e) <= range; }

  // ------------------------------------------------------------------ units
  updateUnit(u, dt) {
    const st = u.st;
    u.flash = Math.max(0, u.flash - dt);
    if (st.regen && u.hp < st.maxHp) u.hp = Math.min(st.maxHp, u.hp + st.maxHp * st.regen * dt);
    u.cd -= dt;
    if (u.hackPts && this.time - u.hackT > 4) u.hackPts = Math.max(0, u.hackPts - u.st.maxHp * 0.05 * dt);
    if (u.stunUntil > this.time) return;
    const w = u.def.weapon;

    if (u.def.spawner) this.updateSpawner(u, dt);
    if (u.def.healer) {
      u.healT = (u.healT ?? 0) - dt;
      if (u.healT <= 0) { u.healT = 0.25; this.repairAround(u, 0.25); }
    }

    if (u.target && (u.target.dead || (u.target.kind === 'proj' && !u.target.interceptable))) u.target = null;
    const o = u.order;

    if (o.type === 'move') {
      u.target = null;
      this.followOrder(u, dt);
      return;
    }

    if (o.type === 'attack') {
      if (!o.target || o.target.dead) { this.setIdle(u); return; }
      u.target = o.target;
      if (w && this.canHit(w, o.target)) { this.engage(u, o.target, dt, true); return; }
      this.moveTo(u, o.target.x, o.target.y, dt, null);
      return;
    }

    // idle / hold / amove: automatic target acquisition
    if (w) {
      u.scanT -= dt;
      const acq = o.type === 'hold' || u.leashUntil > this.time ? st.range : Math.max(st.range, st.sight * 0.9);
      if (u.scanT <= 0) {
        u.scanT = 0.25 + this.rng() * 0.15;
        if (w.intercept) {
          const m = this.findMissile(u, st.range);
          if (m) u.target = m;
        }
        if (!u.target || u.target.kind !== 'proj') {
          const t = this.findTarget(u, acq);
          if (t && (!u.target || u.target.dead || !this.inRange(u, u.target, st.range))) u.target = t;
        }
        if (u.target && u.team === TEAM_PLAYER && u.target.kind === 'unit' && !this.isVisible(u.target)) u.target = null;
      }
      if (u.target) {
        const t = u.target;
        // leash for idle units and enemy garrison
        if (o.type === 'idle' && u.home) {
          const leash = u.alertUntil > this.time ? 900 : u.garrison ? 520 : st.sight * 1.3 + 60;
          if (dist(u, u.home) > leash && !this.inRange(u, t, st.range)) { u.target = null; u.leashUntil = this.time + 3; }
        }
        if (u.target) { this.engage(u, t, dt, o.type !== 'hold'); return; }
      }
    }

    if (o.type === 'amove') { this.followOrder(u, dt); return; }
    if (o.type === 'idle' && u.home && dist(u, u.home) > 24) {
      this.moveTo(u, u.home.x, u.home.y, dt, null);
      return;
    }
    if (u.air) u.angle += dt * 0.6; // hovering drift
  }

  updateSpawner(u, dt) {
    const sp = u.def.spawner;
    u.spawnT -= dt;
    if (u.spawnT > 0 || u.children >= sp.max) return;
    const t = this.findTarget({ ...u, def: { weapon: { targets: 'ground', vs: VS.kamikaze } } }, 460);
    if (!t) { u.spawnT = 0.5; return; }
    u.spawnT = sp.every;
    const c = this.spawnUnit(sp.unit, u.team, u.x, u.y);
    c.spawned = true;
    c.parent = u;
    u.children++;
    c.order = { type: 'attack', target: t };
    this.sfx('launch', u.x, u.y);
  }

  setIdle(u) {
    u.order = { type: 'idle' };
    if (!u.garrison) u.home = { x: u.x, y: u.y };
  }

  followOrder(u, dt) {
    const o = u.order;
    const d = Math.hypot(o.x - u.x, o.y - u.y);
    if (d < 6) { this.setIdle(u); return; }
    // stuck detection
    u.stuckT += dt;
    if (u.stuckT > 1) {
      if (u.lastD - d < 6 && (d < 70 || u.stuckT > 4)) { this.setIdle(u); return; }
      if (u.lastD - d >= 6) { u.stuckT = 0; u.lastD = d; }
    }
    this.moveTo(u, o.x, o.y, dt, o.goalTile ?? null, o.goals);
  }

  engage(u, t, dt, chase) {
    const st = u.st, w = u.def.weapon;
    const inR = this.inRange(u, t, st.range);
    if (w.type === 'kamikaze') {
      if (dist(u, t) <= u.radius + (t.radius || 4) + st.range) { this.kamikaze(u, t); return; }
      this.moveTo(u, t.x, t.y, dt, null);
      return;
    }
    if (inR) {
      u.angle = lerpAngle(u.angle, angleTo(u, t), dt * 10);
      if (u.cd <= 0) { this.fire(u, t); u.cd = st.cd; }
      u.stuckT = 0;
    } else if (chase) {
      this.moveTo(u, t.x, t.y, dt, null);
    } else {
      u.target = null;
    }
  }

  // Steering: direct when the straight line is clear, otherwise follow a flow field.
  moveTo(u, tx, ty, dt, goalTile, goals) {
    let sp = u.st.speed * (u.slowUntil > this.time ? u.slowFactor : 1);
    let dx = tx - u.x, dy = ty - u.y;
    const d = Math.hypot(dx, dy);
    if (d < 1) return;
    if (!u.air) {
      sp *= this.path.speedAt(u.x, u.y);
      u.losT -= dt;
      if (u.losT <= 0) {
        u.losT = 0.35 + this.rng() * 0.2;
        u.direct = d < TILE * 0.8 || this.path.clearLine(u.x, u.y, tx, ty);
      }
      if (!u.direct) {
        let gl = goals, key;
        if (gl) key = 'g' + goalTile;
        else {
          const gi = goalTile ?? this.tileIdx(tx, ty);
          gl = [gi]; key = 't' + gi;
        }
        const field = this.path.field(gl, key, u.team);
        const ctx = Math.floor(u.x / TILE), cty = Math.floor(u.y / TILE);
        const n = this.path.nextTile(field, ctx, cty, u.team);
        if (n) {
          const bi = n.y * MAP_W + n.x;
          const bid = this.path.block[bi];
          if (bid && this.path.blockTeam[bi] !== u.team + 1) {
            // a hostile structure is in the way: attack it
            const b = this.buildings.find((x) => x.id === bid);
            if (b && !b.dead && u.def.weapon && this.canHit(u.def.weapon, b)) { u.target = b; this.engage(u, b, dt, false); return; }
          }
          dx = (n.x + 0.5) * TILE - u.x;
          dy = (n.y + 0.5) * TILE - u.y;
        }
      }
    }
    const len = Math.hypot(dx, dy) || 1;
    const step = Math.min(sp * dt, d);
    const nx = u.x + (dx / len) * step, ny = u.y + (dy / len) * step;
    if (u.air) {
      u.x = Math.max(4, Math.min(MAP_W * TILE - 4, nx));
      u.y = Math.max(4, Math.min(MAP_H * TILE - 4, ny));
    } else if (this.path.walkableAt(nx, ny)) { u.x = nx; u.y = ny; }
    else if (this.path.walkableAt(nx, u.y)) u.x = nx;
    else if (this.path.walkableAt(u.x, ny)) u.y = ny;
    else u.losT = 0;
    u.angle = lerpAngle(u.angle, Math.atan2(dy, dx), dt * 8);
    u.moving = true;
  }

  separate() {
    for (const u of this.units) {
      if (u.dead) continue;
      this.hash.query(u.x, u.y, u.radius * 2 + 4, (o) => {
        if (o === u || o.kind !== 'unit' || o.dead || o.air !== u.air || o.id < u.id) return;
        const dx = o.x - u.x, dy = o.y - u.y;
        const d = Math.hypot(dx, dy) || 0.01;
        const min = (u.radius + o.radius) * (u.air ? 0.9 : 0.8);
        if (d >= min) return;
        const push = (min - d) * 0.5;
        const px = (dx / d) * push, py = (dy / d) * push;
        if (u.air || this.path.walkableAt(u.x - px, u.y - py)) { u.x -= px; u.y -= py; }
        if (o.air || this.path.walkableAt(o.x + px, o.y + py)) { o.x += px; o.y += py; }
      });
    }
  }

  // ----------------------------------------------------------------- combat
  fire(e, t) {
    const w = e.def.weapon, st = e.st;
    const muzzle = { x: e.x + Math.cos(e.angle) * e.radius * 0.8, y: e.y + Math.sin(e.angle) * e.radius * 0.8 };
    const intercept = !!w.intercept && (t.kind === 'proj' || t.air);
    switch (w.type) {
      case 'hack': {
        this.hack(t, st.dmg * st.hack, e);
        this.fx({ type: 'beam', x: muzzle.x, y: muzzle.y, x2: t.x, y2: t.y, life: 0.2, team: e.team, color: '192,140,255' });
        break;
      }
      case 'bullet': {
        this.damage(t, st.dmg, w.vs, e, intercept);
        this.fx({ type: 'tracer', x: muzzle.x, y: muzzle.y, x2: t.x + (this.rng() - 0.5) * 8, y2: t.y + (this.rng() - 0.5) * 8, life: 0.07, team: e.team, heavy: st.dmg > 18 });
        this.sfx(st.dmg > 18 ? 'cannon' : 'gun', e.x, e.y);
        break;
      }
      case 'laser': {
        if (w.pierce) this.railgun(e, t, muzzle);
        else this.damage(t, st.dmg, w.vs, e, intercept);
        this.fx({ type: 'beam', x: muzzle.x, y: muzzle.y, x2: t.x, y2: t.y, life: w.pierce ? 0.35 : 0.09, team: e.team, heavy: !!w.pierce });
        this.sfx(w.pierce ? 'railgun' : 'laser', e.x, e.y);
        break;
      }
      case 'rocket':
      case 'missile':
      case 'shell': {
        const salvo = (w.salvo || 1) + (w.type === 'missile' && e.team === TEAM_PLAYER ? this.mods.flags.salvo || 0 : 0);
        for (let i = 0; i < salvo; i++) this.launch(e, t, muzzle, i, salvo);
        this.sfx(w.type === 'shell' ? 'cannon' : 'launch', e.x, e.y);
        break;
      }
    }
  }

  launch(e, t, from, i, n) {
    const w = e.def.weapon, st = e.st;
    const spread = n > 1 ? (i - (n - 1) / 2) * 0.35 : 0;
    const a = (e.angle || angleTo(e, t)) + spread;
    const p = {
      kind: 'proj', type: w.type, team: e.team, x: from.x, y: from.y, angle: a,
      speed: w.projSpeed || 400, target: t, tx: t.x, ty: t.y, dmg: st.dmg, vs: w.vs, splash: st.splash,
      homing: w.type !== 'shell', interceptable: w.type === 'missile', hp: 30, air: true, armor: 'missile', radius: 4,
      dead: false, life: 0, src: e, intercept: !!w.intercept, delay: i * 0.12,
    };
    if (w.type === 'shell') {
      // lead slightly and scatter
      p.tx += (this.rng() - 0.5) * 12; p.ty += (this.rng() - 0.5) * 12;
    }
    this.projectiles.push(p);
  }

  launchCruise(from, tx, ty) {
    const p = {
      kind: 'proj', type: 'cruise', team: TEAM_ENEMY, x: from.x, y: from.y, angle: angleTo(from, { x: tx, y: ty }),
      speed: CRUISE_MISSILE.speed, target: null, tx, ty, dmg: CRUISE_MISSILE.dmg * (1 + 0.2 * this.escalation), vs: CRUISE_MISSILE.vs,
      splash: CRUISE_MISSILE.splash, homing: false, interceptable: true, hp: CRUISE_MISSILE.hp, air: true, armor: 'missile',
      radius: 6, dead: false, life: 0, src: null, delay: 0, cruise: true,
    };
    this.projectiles.push(p);
    return p;
  }

  railgun(e, t, from) {
    const ang = angleTo(from, t);
    const len = e.st.range + 60;
    const x2 = from.x + Math.cos(ang) * len, y2 = from.y + Math.sin(ang) * len;
    const hit = new Set();
    const steps = Math.ceil(len / 64);
    for (let s = 0; s <= steps; s++) {
      const px = from.x + (x2 - from.x) * (s / steps), py = from.y + (y2 - from.y) * (s / steps);
      this.hash.query(px, py, 60, (o) => {
        if (o.team === e.team || o.dead || o.air || hit.has(o)) return;
        // distance from o to segment
        const vx = x2 - from.x, vy = y2 - from.y;
        const tt = Math.max(0, Math.min(1, ((o.x - from.x) * vx + (o.y - from.y) * vy) / (vx * vx + vy * vy)));
        const d = Math.hypot(from.x + vx * tt - o.x, from.y + vy * tt - o.y);
        if (d <= o.radius + 6) hit.add(o);
      });
    }
    let first = true;
    for (const o of hit) { this.damage(o, e.st.dmg * (first ? 1 : 0.7), e.def.weapon.vs, e); first = false; }
    if (!hit.has(t)) this.damage(t, e.st.dmg, e.def.weapon.vs, e);
  }

  kamikaze(u, t) {
    const st = u.st;
    if (u.def.weapon.emp) {
      const r = st.splash;
      this.hash.query(t.x, t.y, r + 30, (o) => {
        if (o.team === u.team || o.dead || Math.hypot(o.x - t.x, o.y - t.y) - (o.radius || 0) > r) return;
        this.stun(o, u.def.weapon.emp * st.stun);
      });
      this.fx({ type: 'ring', x: t.x, y: t.y, size: r, life: 0.6, color: '#c08cff' });
    }
    this.damage(t, st.dmg, u.def.weapon.vs, u);
    this.splash(t.x, t.y, st.splash, st.dmg * 0.45, u.def.weapon.vs, u.team, u, t);
    this.fx({ type: 'explosion', x: t.x, y: t.y, size: st.splash, life: 0.5 });
    this.sfx('explosion', t.x, t.y);
    u.dead = true;
    if (u.parent && !u.parent.dead) u.parent.children = Math.max(0, u.parent.children - 1);
  }

  damage(t, raw, vs, src, intercept = false) {
    if (t.dead) return;
    const mult = t.kind === 'proj' ? (vs.missile || 0) : (vs[t.armor] ?? 1);
    if (mult <= 0) return;
    let dmg = raw * mult;
    if (intercept && src?.st) dmg *= src.st.intercept;
    if (t.team === TEAM_ENEMY && t.kind !== 'proj' && this.marked[this.tileIdx(t.x, t.y)]) dmg *= 1.15;
    if (t.st?.dr) dmg *= 1 - t.st.dr;
    t.hp -= dmg;
    t.flash = 0.08;
    if (t.kind === 'building') {
      t.lastHit = this.time;
      if (t.team === TEAM_ENEMY && src && src.kind) this.alertGarrison(t, src);
      if (t.team === TEAM_PLAYER && src && src.kind === 'unit' && !src.dead) this.alertDefenders(t, src);
      if (t.team === TEAM_PLAYER) {
        const what = t.type === 'hq' ? 'HQ under attack!' : 'Base under attack';
        this.notify(what, 'danger', { x: t.x, y: t.y }, t.type === 'hq' ? 'hqhit' : 'basehit', t.type === 'hq' ? 8 : 15);
      }
    } else if (t.kind === 'unit' && src && src.kind && !src.dead) {
      if (t.team === TEAM_ENEMY && t.garrison) this.alertGarrison(t, src);
      if (!t.target && t.order.type !== 'move' && t.def.weapon && this.canHit(t.def.weapon, src) && src.kind !== 'proj') t.target = src;
    }
    if (t.hp <= 0) this.kill(t, src);
  }

  splash(x, y, r, dmg, vs, team, src, exclude) {
    if (r <= 0) return;
    this.hash.query(x, y, r + 24, (o) => {
      if (o.team === team || o.dead || o.air || o === exclude) return;
      const d = Math.hypot(o.x - x, o.y - y) - o.radius;
      if (d > r) return;
      const f = 1 - 0.5 * Math.max(0, d) / r;
      this.damage(o, dmg * f, vs, src);
    });
  }

  // Hacking: progress accumulates until the machine's control link is broken, then it switches sides.
  hack(t, pts, src) {
    if (t.dead || t.team === TEAM_PLAYER) return;
    t.hackPts = (t.hackPts || 0) + pts;
    t.hackT = this.time;
    if (t.garrison && src) this.alertGarrison(t, src);
    if (t.hackPts >= t.st.maxHp * 0.6) this.convert(t);
  }

  convert(u) {
    u.team = TEAM_PLAYER;
    u.garrison = false;
    u.spawned = true; // captured units cost no supply
    u.hackPts = 0;
    u.target = null;
    u.tags = ['all', 'unit', u.def.cls, u.type];
    const ratio = u.hp / u.st.maxHp;
    u.st = this.computeStats(u);
    u.hp = Math.max(1, ratio * u.st.maxHp);
    this.setIdle(u);
    this.stats.hacked++;
    for (const o of this.units) if (o.target === u) o.target = null;
    for (const b of this.buildings) if (b.target === u) b.target = null;
    this.selection = this.selection.filter((e) => e.team === TEAM_PLAYER);
    this.fx({ type: 'ring', x: u.x, y: u.y, size: 30, life: 0.6, color: '#c08cff' });
    this.fx({ type: 'text', x: u.x, y: u.y, text: 'HACKED', life: 1.4, color: '#d9c2ff' });
    this.notify(`${u.def.name} hacked and under your control`, 'good', null, 'hacked', 3);
    this.sfx('upgrade', u.x, u.y);
  }

  // Idle player units near an attacked building move to defend it.
  alertDefenders(b, src) {
    if (!this.throttle('defend' + b.id, 1)) return;
    this.hash.query(b.x, b.y, 520, (u) => {
      if (u.kind !== 'unit' || u.team !== TEAM_PLAYER || u.dead || u.order.type !== 'idle') return;
      if (u.target || !u.def.weapon || !this.canHit(u.def.weapon, src)) return;
      if (dist(u, b) > 520) return;
      u.alertUntil = this.time + 10;
      u.target = src;
    });
  }

  alertGarrison(b, src) {
    if (b.kind === 'building' && !b.def.outpost && Math.hypot(b.x - this.enemyBase.x, b.y - this.enemyBase.y) < 16 * TILE) {
      this.baseHitAt = this.time;
      this.baseAttacker = src;
    }
    if (!this.throttle('alert' + b.id, 1.5)) return;
    for (const u of this.units) {
      if (!u.garrison || u.dead || u.team !== TEAM_ENEMY) continue;
      if (dist(u, b) > 900) continue;
      u.alertUntil = this.time + 12;
      if (!u.target && u.def.weapon && this.canHit(u.def.weapon, src)) u.target = src;
    }
  }

  kill(e, src) {
    if (e.dead) return;
    e.dead = true;
    if (e.kind === 'proj') {
      this.fx({ type: 'explosion', x: e.x, y: e.y, size: e.cruise ? 26 : 12, life: 0.35, air: true });
      if (e.cruise) this.notify('Cruise missile intercepted', 'good', null, 'intercept', 4);
      return;
    }
    const big = e.kind === 'building' ? e.radius * 1.2 : e.radius * 1.6;
    this.fx({ type: 'explosion', x: e.x, y: e.y, size: big, life: e.kind === 'building' ? 1.1 : 0.6 });
    if (e.kind === 'building' || e.radius > 12) this.fx({ type: 'scorch', x: e.x, y: e.y, size: big * 0.9, life: 40 });
    this.sfx(e.kind === 'building' ? 'bigboom' : 'explosion', e.x, e.y);
    if (e.parent && !e.parent.dead) e.parent.children = Math.max(0, e.parent.children - 1);

    if (e.kind === 'unit') {
      if (e.team === TEAM_ENEMY) {
        this.stats.kills++;
        this.addResearch(e.def.cost * RESEARCH.killFactor * (1 + this.mods.research));
        if (this.mods.bounty > 0) {
          const c = e.def.cost * this.mods.bounty;
          this.credits += c;
          this.stats.earned += c;
        }
      } else if (!e.spawned) this.stats.lost++;
      return;
    }
    // building
    this.path.setBlock(e, false);
    if (e.team === TEAM_PLAYER) {
      if (e.type === 'hq') {
        this.over = { victory: false };
        this.emit({ type: 'over' });
      } else this.notify(`${e.def.name} destroyed`, 'warn', { x: e.x, y: e.y });
      return;
    }
    e.discovered = true;
    const def = e.def;
    if (e.type === 'cc') {
      this.stats.facilities++;
      this.over = { victory: true };
      this.emit({ type: 'over' });
      return;
    }
    if (def.outpost) {
      this.stats.outposts++;
      this.addResearch(this.research.needed * 0.5);
      this.credits += 300;
      this.notify('Forward outpost destroyed! +300 credits, research boost. Enemy waves must now travel further.', 'good', { x: e.x, y: e.y });
      return;
    }
    if (def.share > 0 || def.enables) {
      this.stats.facilities++;
      this.addResearch(this.research.needed * 0.6);
      this.credits += 400;
      const why = {
        ebarracks: 'Enemy infantry production halted.',
        factory: 'No more tanks or walkers!',
        nest: 'Enemy drone production halted.',
        silo: 'No more cruise missile strikes!',
        power: 'Enemy waves weakened.',
        eradar: 'Enemy missile strikes lose accuracy.',
      }[e.type] || '';
      this.notify(`${def.name} destroyed! ${why}`, 'good', { x: e.x, y: e.y });
    }
  }

  // ------------------------------------------------------------- buildings
  updateBuilding(b, dt) {
    const st = b.st;
    b.flash = Math.max(0, b.flash - dt);
    if (!b.built) {
      const t = this.timeOf(b.type, true) / (b.team === TEAM_PLAYER ? this.prodSpeed : 1);
      b.progress += dt / t;
      b.hp = Math.min(st.maxHp, b.hp + st.maxHp * 0.92 * dt / t);
      if (b.progress >= 1) {
        b.built = true; b.progress = 1;
        if (b.team === TEAM_PLAYER) this.stats.built++;
        this.notify(`${b.def.name} online`, 'info', null);
        this.sfx('built', b.x, b.y);
        this.updateEconomy(0);
      }
      return;
    }
    const regen = st.regen + (b.team === TEAM_PLAYER && this.overdrive() ? 0.02 : 0);
    if (regen && b.hp < st.maxHp) b.hp = Math.min(st.maxHp, b.hp + st.maxHp * regen * dt);
    if (b.team === TEAM_ENEMY && this.time - b.lastHit > 15 && b.hp < st.maxHp) b.hp = Math.min(st.maxHp, b.hp + st.maxHp * 0.004 * dt);

    // production
    if (b.queue.length) {
      const q = b.queue[0];
      if (this.supplyUsed + this.supplyOf(q.type) > this.supplyCap + 1e-6) {
        q.blocked = true;
        this.notify('Supply cap reached — build a Logistics Hub', 'warn', null, 'supply', 12);
      } else {
        q.blocked = false;
        q.t += dt * this.prodSpeed;
        if (q.t >= this.timeOf(q.type, false)) {
          b.queue.shift();
          this.produce(b, q.type);
        }
      }
    }

    // specials
    b.effT -= dt;
    if (b.effT <= 0) {
      b.effT = 0.25;
      if (b.def.jammer) this.jam(b, 0.25);
      if (b.def.repair) this.repairAround(b, 0.25);
    }
    if (b.def.spawner) this.updateHiveBuilding(b, dt);
    if (b.def.pulse) {
      b.pulseT = (b.pulseT ?? 1) - dt;
      if (b.pulseT <= 0) { b.pulseT = b.def.pulse.every; this.empPulse(b); }
    }

    const w = b.def.weapon;
    if (!w || b.stunUntil > this.time) return;
    b.cd -= dt;
    b.scanT -= dt;
    if (b.target && (b.target.dead || !this.inRange(b, b.target, st.range) || (b.team === TEAM_PLAYER && b.target.kind !== 'proj' && !this.isVisible(b.target)))) b.target = null;
    if (b.scanT <= 0) {
      b.scanT = 0.2 + this.rng() * 0.1;
      if (w.intercept) {
        const m = this.findMissile(b, st.range);
        if (m && (w.prioritizeMissiles || !b.target || b.target.kind !== 'proj')) b.target = m;
      }
      if (!b.target) b.target = this.findTarget(b, st.range);
    }
    if (b.target) {
      b.angle = lerpAngle(b.angle, angleTo(b, b.target), dt * 8);
      if (b.cd <= 0) { this.fire(b, b.target); b.cd = st.cd; }
    }
  }

  // Swarm Hive: prints free drones that guard the hive.
  updateHiveBuilding(b, dt) {
    const sp = b.def.spawner;
    b.children ??= 0;
    b.spawnT = (b.spawnT ?? 4) - dt * (1 + (this.mods.flags.hiveRate || 0));
    if (b.spawnT > 0 || b.children >= sp.max) return;
    b.spawnT = sp.every;
    const u = this.spawnUnit(sp.unit, b.team, b.x + (this.rng() - 0.5) * 30, b.y + (this.rng() - 0.5) * 30);
    u.spawned = true;
    u.parent = b;
    u.home = { x: b.x + (this.rng() - 0.5) * 120, y: b.y + (this.rng() - 0.5) * 120 };
    u.order = { type: 'idle' };
    b.children++;
  }

  stun(e, seconds) {
    if (e.dead) return;
    const until = this.time + seconds;
    if (!(e.stunUntil > until)) e.stunUntil = until;
    if (e.kind === 'unit') e.target = null;
  }

  // Disruptor Tower: periodic EMP that stuns nearby enemies.
  empPulse(b) {
    const P = b.def.pulse, r = P.radius * (b.st.radius || 1);
    let hit = 0;
    this.hash.query(b.x, b.y, r, (o) => {
      if (o.team === b.team || o.dead || dist(b, o) > r) return;
      this.stun(o, P.stun * b.st.stun);
      hit++;
    });
    if (hit) {
      this.fx({ type: 'ring', x: b.x, y: b.y, size: r, life: 0.5, color: '#c08cff' });
      this.sfx('laser', b.x, b.y);
    }
  }

  produce(b, type) {
    const ty = b.ty + b.h;
    const t = this.path.nearestWalkable(b.tx + Math.floor(b.w / 2), ty, 8);
    const x = t ? (t.x + 0.5) * TILE : b.x, y = t ? (t.y + 0.5) * TILE : b.y + b.radius + 10;
    const u = this.spawnUnit(type, TEAM_PLAYER, x + (this.rng() - 0.5) * 8, y + (this.rng() - 0.5) * 8);
    this.stats.trained++;
    if (u.def.cls === 'infantry') this.stats.infantry++;
    if (u.def.cls === 'drone') this.stats.drones++;
    if (b.rally) this.orderMove([u], b.rally.x, b.rally.y, b.rally.attack);
    else this.setIdle(u);
    this.sfx('ready', b.x, b.y);
    this.updateEconomy(0);
  }

  jam(b, dt) {
    const J = b.def.jammer, r = J.radius * (b.st.radius || 1);
    this.hash.query(b.x, b.y, r, (o) => {
      if (o.team === b.team || o.dead || !o.air || o.kind !== 'unit') return;
      if (dist(b, o) > r) return;
      o.slowUntil = this.time + 0.4;
      o.slowFactor = J.slow;
      this.damage(o, J.dps * dt * 1.5, VS.laser, b);
    });
    for (const p of this.projectiles) {
      if (p.dead || p.team === b.team || !p.interceptable || p.jammedBy?.has(b.id)) continue;
      if (dist(b, p) > r) continue;
      (p.jammedBy ||= new Set()).add(b.id);
      if (this.rng() < J.deflect) {
        p.target = null; p.homing = false;
        const a = this.rng() * Math.PI * 2, d = 150 + this.rng() * 150;
        p.tx = p.x + Math.cos(a) * d; p.ty = p.y + Math.sin(a) * d;
        this.fx({ type: 'ring', x: p.x, y: p.y, size: 30, life: 0.4, color: '#b48cff' });
        this.notify('Missile spoofed by EW', 'good', null, 'spoof', 5);
      }
    }
  }

  // Heal friendly entities around `b` (a repair building or a healer unit).
  // only: 'infantry' | 'air' | 'mech' (robots, vehicles and buildings)
  healFilter(o, only) {
    if (!only) return true;
    if (only === 'infantry') return o.kind === 'unit' && o.def.cls === 'infantry';
    if (only === 'air') return o.kind === 'unit' && o.air;
    if (only === 'mech') return o.kind === 'building' || (o.kind === 'unit' && !o.air && o.def.cls !== 'infantry');
    return true;
  }

  repairAround(b, dt, R = b.def.repair || b.def.healer) {
    const radius = R.radius * (b.st.radius || 1);
    this.hash.query(b.x, b.y, radius, (o) => {
      if (o.team !== b.team || o.dead || o === b || dist(b, o) > radius) return;
      if (o.kind === 'building' && !o.built) return;
      if (!this.healFilter(o, R.only)) return;
      if (o.hp < o.st.maxHp) {
        o.hp = Math.min(o.st.maxHp, o.hp + o.st.maxHp * R.rate * dt);
        if (this.rng() < 0.15) this.fx({ type: 'spark', x: o.x + (this.rng() - 0.5) * 16, y: o.y + (this.rng() - 0.5) * 16, life: 0.5, color: '#7dffb0' });
      }
    });
  }

  // ------------------------------------------------------------ projectiles
  updateProjectile(p, dt) {
    if (p.delay > 0) { p.delay -= dt; return; }
    p.life += dt;
    if (p.life > (p.cruise ? 40 : 9)) { p.dead = true; return; }
    if (p.homing && p.target) {
      if (p.target.dead) { p.target = null; }
      else { p.tx = p.target.x; p.ty = p.target.y; }
    }
    const dx = p.tx - p.x, dy = p.ty - p.y;
    const d = Math.hypot(dx, dy);
    const step = p.speed * dt;
    const desired = Math.atan2(dy, dx);
    if (p.type === 'missile' || p.cruise) {
      const turn = p.cruise ? 1.2 : 4.5;
      const diff = Math.atan2(Math.sin(desired - p.angle), Math.cos(desired - p.angle));
      p.angle += Math.max(-turn * dt, Math.min(turn * dt, diff));
      if (d < 90) p.angle = desired;
    } else p.angle = desired;
    if (d <= step + 2) {
      p.x = p.tx; p.y = p.ty;
      this.impact(p);
      return;
    }
    p.x += Math.cos(p.angle) * step;
    p.y += Math.sin(p.angle) * step;
    if ((p.type === 'missile' || p.cruise || p.type === 'rocket') && this.rng() < 0.7) {
      this.fx({ type: 'smoke', x: p.x, y: p.y, size: p.cruise ? 6 : 3, life: p.cruise ? 1.2 : 0.5 });
    }
  }

  impact(p) {
    p.dead = true;
    const t = p.target;
    if (t && t.kind === 'proj') {
      if (!t.dead) this.damage(t, p.dmg, p.vs, p.src, true);
      this.fx({ type: 'explosion', x: p.x, y: p.y, size: 10, life: 0.3, air: true });
      return;
    }
    if (p.splash > 0) {
      if (t && !t.dead && Math.hypot(t.x - p.x, t.y - p.y) < p.splash + t.radius) this.damage(t, p.dmg * 0.6, p.vs, p.src, p.intercept);
      this.splash(p.x, p.y, p.splash, p.dmg * (t ? 0.6 : 1), p.vs, p.team, p.src, t);
      this.fx({ type: 'explosion', x: p.x, y: p.y, size: p.splash * 0.8, life: 0.55 });
      this.sfx('explosion', p.x, p.y);
    } else {
      if (t && !t.dead && Math.hypot(t.x - p.x, t.y - p.y) < t.radius + 20) this.damage(t, p.dmg, p.vs, p.src, p.intercept);
      this.fx({ type: 'explosion', x: p.x, y: p.y, size: 9, life: 0.3, air: !!(t && t.air) });
    }
  }

  // -------------------------------------------------------------- map stuff
  updateSites(dt) {
    this.siteT = (this.siteT || 0) - dt;
    if (this.siteT > 0) return;
    const step = 0.25;
    this.siteT = step;
    for (const s of this.sites) {
      let p = 0, e = 0;
      this.hash.query(s.x, s.y, 3 * TILE, (o) => {
        if (o.kind !== 'unit' || o.dead || o.air || !o.def.weapon) return;
        if (Math.hypot(o.x - s.x, o.y - s.y) > 3 * TILE) return;
        if (o.team === TEAM_PLAYER) p++; else e++;
      });
      const before = s.owner;
      if (p && !e) s.progress = Math.min(1, s.progress + step / 6);
      else if (e && !p) s.progress = Math.max(-1, s.progress - step / 6);
      if (s.progress >= 1) s.owner = TEAM_PLAYER;
      else if (s.progress <= -1) s.owner = TEAM_ENEMY;
      else if ((s.owner === TEAM_PLAYER && s.progress <= 0) || (s.owner === TEAM_ENEMY && s.progress >= 0)) s.owner = -1;
      if (before !== s.owner) {
        if (s.owner === TEAM_PLAYER) this.notify(`Rare-earth site secured (+${SITE_INCOME}/s)`, 'good', s);
        else if (before === TEAM_PLAYER) this.notify('Rare-earth site lost', 'warn', s);
      }
    }
    for (const c of this.crates) {
      if (c.taken) continue;
      let found = null;
      this.hash.query(c.x, c.y, 30, (o) => { if (o.kind === 'unit' && o.team === TEAM_PLAYER && !o.dead && Math.hypot(o.x - c.x, o.y - c.y) < 28) found = o; });
      if (!found) continue;
      c.taken = true;
      const r = this.rng();
      if (r < 0.55) {
        const amt = 120 + Math.floor(this.rng() * 120);
        this.credits += amt;
        this.notify(`Supply cache recovered: +${amt} credits`, 'good', c);
        this.fx({ type: 'text', x: c.x, y: c.y, text: `+${amt}`, life: 1.5, color: '#ffd76a' });
      } else if (r < 0.85) {
        this.addResearch(this.research.needed * 0.35);
        this.notify('Prototype data recovered: research boosted', 'good', c);
        this.fx({ type: 'text', x: c.x, y: c.y, text: 'DATA', life: 1.5, color: '#7fd1ff' });
      } else {
        const targets = this.buildings.filter((b) => b.team === TEAM_ENEMY && !b.discovered && (b.def.share > 0 || b.def.enables || b.def.outpost || b.type === 'cc'));
        const t = targets[Math.floor(this.rng() * targets.length)];
        if (t) {
          this.revealArea(t.x, t.y, 5);
          this.notify(`Intel cache: enemy ${t.def.name} located`, 'good', { x: t.x, y: t.y });
        } else {
          this.credits += 200;
          this.notify('Supply cache recovered: +200 credits', 'good', c);
        }
      }
      this.sfx('pickup', c.x, c.y);
    }
  }

  updateFog() {
    const vis = this.vis, exp = this.explored;
    vis.fill(0);
    const mark = (x, y, sight) => {
      const r = Math.max(1, Math.round(sight / TILE));
      const cx = Math.floor(x / TILE), cy = Math.floor(y / TILE);
      for (const [ox, oy] of circleOffsets(r)) {
        const tx = cx + ox, ty = cy + oy;
        if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) continue;
        const i = ty * MAP_W + tx;
        vis[i] = 1; exp[i] = 1;
      }
    };
    for (const u of this.units) if (u.team === TEAM_PLAYER && !u.dead) mark(u.x, u.y, u.st.sight);
    this.marked.fill(0);
    for (const u of this.units) {
      if (u.team !== TEAM_PLAYER || u.dead || !u.def.marker) continue;
      const r = Math.round(u.st.sight / TILE), cx = Math.floor(u.x / TILE), cy = Math.floor(u.y / TILE);
      for (const [ox, oy] of circleOffsets(r)) {
        const tx = cx + ox, ty = cy + oy;
        if (tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H) this.marked[ty * MAP_W + tx] = 1;
      }
    }
    for (const b of this.buildings) if (b.team === TEAM_PLAYER && !b.dead) mark(b.x, b.y, b.built ? b.st.sight : 96);
    for (const b of this.buildings) {
      if (b.team !== TEAM_ENEMY) continue;
      let v = false;
      for (let y = b.ty; y < b.ty + b.h && !v; y++) for (let x = b.tx; x < b.tx + b.w; x++) if (vis[y * MAP_W + x]) { v = true; break; }
      b.visible = v;
      if (v) b.discovered = true;
    }
    this.fogVersion++;
  }

  // ------------------------------------------------------------- enemy AI
  enemyAlive(type) { return this.buildings.some((b) => b.team === TEAM_ENEMY && b.type === type && !b.dead); }

  enemyShare() {
    let s = 0;
    for (const b of this.buildings) if (b.team === TEAM_ENEMY && !b.dead) s += b.def.share || 0;
    return s;
  }

  enemySources() {
    const src = new Set();
    for (const b of this.buildings) if (b.team === TEAM_ENEMY && !b.dead && b.def.enables) src.add(b.def.enables);
    return src;
  }

  waveBudget(n) {
    const cyber = 1 - 0.12 * (this.cyberCenters || 0);
    return (WAVE.baseBudget * Math.pow(WAVE.growth, n - 1) + WAVE.linear * (n - 1)) * this.enemyShare() * (1 + 0.15 * this.escalation) * cyber;
  }

  waveComposition(n, budget = this.waveBudget(n), rng = mulberry32((this.gameSeed + n * 7919) >>> 0)) {
    const src = this.enemySources();
    const ccAlive = this.enemyCC && !this.enemyCC.dead;
    const pool = Object.entries(ENEMY_UNITS).filter(([id, d]) =>
      d.minWave <= n && (src.has(d.src) || (id === 'trooper' && ccAlive)));
    const comp = {};
    if (!pool.length) return { comp, count: 0, budget: 0 };
    let count = 0;
    const minCost = Math.min(...pool.map(([, d]) => d.cost));
    while (budget >= minCost && count < MAX_WAVE_UNITS) {
      const afford = pool.filter(([, d]) => d.cost <= budget);
      let tot = 0;
      const ws = afford.map(([id, d]) => {
        const w = d.weight * (id === 'trooper' ? 1 : 1 + 0.12 * (n - d.minWave));
        tot += w;
        return w;
      });
      let r = rng() * tot, k = 0;
      while (r > ws[k] && k < ws.length - 1) { r -= ws[k]; k++; }
      const [id, d] = afford[k];
      comp[id] = (comp[id] || 0) + 1;
      budget -= d.cost;
      count++;
    }
    return { comp, count };
  }

  waveSpawnPoint() {
    const outs = this.buildings.filter((b) => b.team === TEAM_ENEMY && b.def.outpost && !b.dead);
    if (outs.length) {
      outs.sort((a, b) => dist(a, this.hq) - dist(b, this.hq));
      return { x: outs[0].x, y: outs[0].y + outs[0].radius + 20, from: outs[0] };
    }
    return { x: this.enemyBase.x - 120, y: this.enemyBase.y + 140, from: null };
  }

  directionName(p) {
    const a = Math.atan2(p.y - this.hq.y, p.x - this.hq.x);
    const names = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
    return names[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
  }

  spawnWave() {
    const n = ++this.wave.n;
    const { comp, count } = this.waveComposition(n);
    const sp = this.waveSpawnPoint();
    let i = 0;
    for (const [id, c] of Object.entries(comp)) {
      for (let k = 0; k < c; k++) {
        const a = (i * 2.399) % (Math.PI * 2), r = 20 + Math.sqrt(i) * 16;
        const u = this.spawnUnitNear(id, TEAM_ENEMY, sp.x + Math.cos(a) * r, sp.y + Math.sin(a) * r);
        i++;
        if (!u) continue;
        u.wave = n;
        u.st = this.computeStats(u);
        u.hp = u.st.maxHp;
        u.order = { type: 'amove', x: this.hq.x, y: this.hq.y, goals: this.hqGoals, goalTile: 'hq' };
      }
    }
    // reinforce the home garrison
    if (n >= 2) {
      const garrison = this.units.filter((u) => u.garrison && u.team === TEAM_ENEMY).length;
      const add = Math.min(Math.floor(n / 2), 34 - garrison);
      const types = n < 6 ? ['trooper', 'rocketeer'] : n < 10 ? ['trooper', 'rocketeer', 'ifv'] : ['rocketeer', 'ifv', 'tank'];
      if (this.enemyCC && !this.enemyCC.dead)
        for (let k = 0; k < add; k++) {
          const g = this.spawnGarrison(types[k % types.length], this.enemyBase.x, this.enemyBase.y, 220);
          if (g) { g.wave = n; g.st = this.computeStats(g); g.hp = g.st.maxHp; }
        }
    }
    this.wave.lastSpawn = { x: sp.x, y: sp.y, n, count, comp };
    const dir = this.directionName(sp);
    const known = this.earlyWarning || this.explored[this.tileIdx(sp.x, sp.y)];
    this.notify(count ? `Wave ${n} inbound${known ? ` from the ${dir}` : ''} — ${count} hostiles` : `Wave ${n}: the enemy has nothing left to send`, count ? 'danger' : 'good', known ? sp : null);
    this.emit({ type: 'wave', n, pos: known ? sp : null });
    this.sfx('alarm');
    this.wave.next = this.time + WAVE.interval;
  }

  spawnReinforcements() {
    const n = Math.max(this.wave.n, 3) + 2;
    const { comp, count } = this.waveComposition(n, this.waveBudget(n) * WAVE.reinforceShare, this.rng);
    if (!count) return;
    const src = this.buildings.filter((b) => b.team === TEAM_ENEMY && !b.dead && (b.def.enables || b.type === 'cc') && b.type !== 'silo' && b.type !== 'eradar');
    const atk = this.baseAttacker && !this.baseAttacker.dead ? this.baseAttacker : null;
    let i = 0;
    for (const [id, c] of Object.entries(comp)) {
      for (let k = 0; k < c; k++) {
        const from = src[i++ % src.length] || this.enemyCC;
        const u = this.spawnUnitNear(id, TEAM_ENEMY, from.x + (this.rng() - 0.5) * 60, from.y + from.radius + 24 + this.rng() * 30);
        if (!u) continue;
        u.wave = n; u.st = this.computeStats(u); u.hp = u.st.maxHp;
        u.garrison = true; u.home = { x: u.x, y: u.y }; u.alertUntil = this.time + 20;
        if (atk) { u.order = { type: 'amove', x: atk.x, y: atk.y }; }
      }
    }
    this.notify(`Hegemony reinforcements deployed (${count})`, 'danger', { x: this.enemyCC.x, y: this.enemyCC.y }, 'reinf', 10);
  }

  updateEnemyAI(dt) {
    if (this.time >= this.wave.next) this.spawnWave();

    // cruise missile strikes
    if (this.wave.n >= WAVE.missileFrom && this.enemyAlive('silo')) {
      this.missileT -= dt;
      if (this.missileT <= 0) {
        this.missileT = Math.max(18, 46 - this.wave.n);
        const silo = this.buildings.find((b) => b.team === TEAM_ENEMY && b.type === 'silo' && !b.dead);
        const targets = this.buildings.filter((b) => b.team === TEAM_PLAYER && !b.dead && !b.def.wall);
        const nMis = 1 + Math.floor((this.wave.n - WAVE.missileFrom) / 4);
        const scatter = this.enemyAlive('eradar') ? 18 : 150;
        for (let k = 0; k < nMis && targets.length; k++) {
          const t = targets[Math.floor(this.rng() * targets.length)];
          const p = this.launchCruise({ x: silo.x, y: silo.y },
            t.x + (this.rng() - 0.5) * 2 * scatter, t.y + (this.rng() - 0.5) * 2 * scatter);
          p.delay = k * 0.6;
          if (this.cyberCenters && this.rng() < 0.3) {
            // guidance hacked by a Cyber Ops Center: the missile wanders off into the wilderness
            const a = this.rng() * Math.PI * 2;
            p.tx = Math.max(40, Math.min(MAP_W * TILE - 40, t.x + Math.cos(a) * 700));
            p.ty = Math.max(40, Math.min(MAP_H * TILE - 40, t.y + Math.sin(a) * 700));
            p.spoofed = true;
            this.notify('Cyber Ops: missile guidance hijacked', 'good', null, 'cyberspoof', 6);
          }
        }
        this.notify(`Missile launch detected! ${nMis} cruise missile${nMis > 1 ? 's' : ''} inbound`, 'danger', null, 'missile', 5);
        this.emit({ type: 'missile' });
        this.sfx('alarm');
      }
    }

    // emergency reinforcements while the home base is under attack
    if (this.baseHitAt != null && this.time - this.baseHitAt < 6 && this.enemyCC && !this.enemyCC.dead && this.throttle('reinforce', WAVE.reinforceEvery)) {
      this.spawnReinforcements();
    }

    // idle wave units with nothing left to do keep pushing to the HQ
    if (this.throttle('reorder', 3)) {
      for (const u of this.units) {
        if (u.team !== TEAM_ENEMY || u.garrison || u.dead) continue;
        if (u.order.type === 'idle' && !u.target) u.order = { type: 'amove', x: this.hq.x, y: this.hq.y, goals: this.hqGoals, goalTile: 'hq' };
      }
    }
  }

  // Announce a faction unlock the moment this run pushes a lifetime milestone over the line.
  checkUnlocks() {
    for (const w of this.unlockWatch) {
      if (w.announced) continue;
      const run = w.fromRun(this);
      const total = w.mode === 'max' ? Math.max(w.have, run) : w.have + run;
      if (total >= w.need) {
        w.announced = true;
        this.notify(`Faction unlocked: ${w.name}! Available from your next timeline.`, 'good');
        this.sfx('research');
      }
    }
  }

  // ------------------------------------------------------------- commands
  orderMove(units, x, y, attack = false) {
    const list = units.filter((u) => u.kind === 'unit' && u.team === TEAM_PLAYER && !u.dead);
    if (!list.length) return;
    const ground = list.filter((u) => !u.air), air = list.filter((u) => u.air);
    const place = (group, spacing) => {
      const n = group.length;
      const cols = Math.ceil(Math.sqrt(n));
      // stable assignment: sort by angle around centroid
      let cx = 0, cy = 0;
      for (const u of group) { cx += u.x; cy += u.y; }
      cx /= n; cy /= n;
      group.sort((a, b) => (a.x - cx + (a.y - cy) * 0.3) - (b.x - cx + (b.y - cy) * 0.3));
      let gt = Math.floor(x / TILE), gtt = Math.floor(y / TILE);
      if (group[0] && !group[0].air) {
        const w = this.path.nearestWalkable(gt, gtt, 15);
        if (w) { gt = w.x; gtt = w.y; }
      }
      const goalTile = gtt * MAP_W + gt;
      group.forEach((u, i) => {
        const r = Math.floor(i / cols), c = i % cols;
        let px = x + (c - (cols - 1) / 2) * spacing, py = y + (r - (Math.ceil(n / cols) - 1) / 2) * spacing;
        if (!u.air && !this.path.walkableAt(px, py)) {
          const w = this.path.nearestWalkable(Math.floor(px / TILE), Math.floor(py / TILE), 10);
          if (w) { px = (w.x + 0.5) * TILE; py = (w.y + 0.5) * TILE; }
        }
        u.order = { type: attack ? 'amove' : 'move', x: px, y: py, goalTile: u.air ? null : goalTile, goals: u.air ? null : [goalTile] };
        u.home = { x: px, y: py };
        u.stuckT = 0; u.lastD = Infinity; u.losT = 0;
        if (!attack) u.target = null;
      });
    };
    if (ground.length) place(ground, 24);
    if (air.length) place(air, 26);
  }

  orderAttack(units, target) {
    for (const u of units) {
      if (u.kind !== 'unit' || u.team !== TEAM_PLAYER || u.dead) continue;
      if (!u.def.weapon || !this.canHit(u.def.weapon, target)) {
        // can't hit it: move next to it instead
        this.orderMove([u], target.x, target.y, true);
        continue;
      }
      u.order = { type: 'attack', target };
      u.target = target;
      u.losT = 0;
    }
  }

  orderStop(units) { for (const u of units) if (u.kind === 'unit' && u.team === TEAM_PLAYER) { this.setIdle(u); u.target = null; } }
  orderHold(units) { for (const u of units) if (u.kind === 'unit' && u.team === TEAM_PLAYER) { u.order = { type: 'hold' }; u.home = { x: u.x, y: u.y }; } }

  canPlace(type, tx, ty) {
    const def = BUILDINGS[type];
    if (!def || def.noBuild) return { ok: false, reason: 'Cannot build' };
    for (let y = ty; y < ty + def.h; y++)
      for (let x = tx; x < tx + def.w; x++) {
        if (!this.path.walkable(x, y)) return { ok: false, reason: 'Blocked' };
        if (!this.explored[y * MAP_W + x]) return { ok: false, reason: 'Unexplored' };
      }
    const cx = tx + def.w / 2, cy = ty + def.h / 2;
    let near = false;
    for (const b of this.buildings) {
      if (b.team !== TEAM_PLAYER || b.dead || b.def.wall) continue;
      const d = Math.hypot(b.tx + b.w / 2 - cx, b.ty + b.h / 2 - cy);
      if (d <= BUILD_RADIUS + b.w / 2) { near = true; break; }
    }
    if (!near) return { ok: false, reason: 'Too far from your base' };
    // no enemy units on the footprint
    for (const u of this.units) {
      if (u.team !== TEAM_ENEMY || u.air || u.dead) continue;
      const utx = Math.floor(u.x / TILE), uty = Math.floor(u.y / TILE);
      if (utx >= tx && utx < tx + def.w && uty >= ty && uty < ty + def.h) return { ok: false, reason: 'Enemy in the way' };
    }
    if (this.credits < this.costOf(type, true)) return { ok: false, reason: 'Not enough credits' };
    return { ok: true };
  }

  placeBuilding(type, tx, ty) {
    const c = this.canPlace(type, tx, ty);
    if (!c.ok) return c;
    this.credits -= this.costOf(type, true);
    const b = this.addBuilding(type, TEAM_PLAYER, tx, ty, false);
    b.paid = this.costOf(type, true);
    this.sfx('place', b.x, b.y);
    this.updateFog();
    return { ok: true, building: b };
  }

  train(b, type) {
    const def = UNITS[type];
    if (!b || b.dead || !b.built || !this.trainsFor(b).includes(type) || !this.available(type)) return false;
    if (b.queue.length >= 6) return false;
    const cost = this.costOf(type, false);
    if (this.credits < cost) { this.notify('Not enough credits', 'warn', null, 'nocred', 1.5); return false; }
    this.credits -= cost;
    b.queue.push({ type, t: 0, paid: cost });
    this.sfx('click');
    return true;
  }

  cancelTrain(b, i) {
    const q = b.queue[i];
    if (!q) return;
    b.queue.splice(i, 1);
    this.credits += q.paid;
  }

  sell(b) {
    if (!b || b.dead || b.team !== TEAM_PLAYER || b.type === 'hq') return;
    const paid = b.paid ?? b.def.cost;
    const refund = Math.round(b.built ? paid * 0.5 * (b.hp / b.st.maxHp) : paid);
    for (const q of b.queue) this.credits += q.paid;
    this.credits += refund;
    b.dead = true;
    this.path.setBlock(b, false);
    this.fx({ type: 'explosion', x: b.x, y: b.y, size: 20, life: 0.4 });
    this.notify(`${b.def.name} recycled (+${refund})`, 'info');
    this.updateEconomy(0);
  }

  setRally(b, x, y) { if (b.def.trains) b.rally = { x, y }; }

  retreat() {
    if (this.over) return;
    this.over = { victory: false, retreat: true };
    this.emit({ type: 'over' });
  }
}
