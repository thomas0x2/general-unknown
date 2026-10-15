// Procedural map generation + flow-field pathfinding.
import { MAP_W, MAP_H, TILE } from './data.js';
import { mulberry32 } from './rng.js';

export const T_PLAIN = 0;
export const T_FOREST = 1;
export const T_WATER = 2;
export const T_ROCK = 3;

export const SPEED_MULT = [1, 0.75, 0, 0];
const STEP_COST = [1, 1.35, Infinity, Infinity];

// ---------------------------------------------------------------------------
// Value noise
// ---------------------------------------------------------------------------
function makeNoise(rng, cells) {
  const g = new Float32Array((cells + 1) * (cells + 1));
  for (let i = 0; i < g.length; i++) g[i] = rng();
  const smooth = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    // x,y in [0,1)
    const fx = x * cells, fy = y * cells;
    const ix = Math.floor(fx), iy = Math.floor(fy);
    const tx = smooth(fx - ix), ty = smooth(fy - iy);
    const at = (a, b) => g[Math.min(b, cells) * (cells + 1) + Math.min(a, cells)];
    const a = at(ix, iy), b = at(ix + 1, iy), c = at(ix, iy + 1), d = at(ix + 1, iy + 1);
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };
}

function fbm(noises, x, y) {
  let v = 0, amp = 0.55, tot = 0;
  for (const n of noises) { v += n(x, y) * amp; tot += amp; amp *= 0.5; }
  return v / tot;
}

// ---------------------------------------------------------------------------
// Map generation
// ---------------------------------------------------------------------------
export function generateMap(seed) {
  const rng = mulberry32(seed);
  const W = MAP_W, H = MAP_H;
  const tiles = new Uint8Array(W * H);
  const road = new Uint8Array(W * H);
  const idx = (x, y) => y * W + x;

  const elev = [makeNoise(rng, 4), makeNoise(rng, 8), makeNoise(rng, 16)];
  const moist = [makeNoise(rng, 5), makeNoise(rng, 11), makeNoise(rng, 22)];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const e = fbm(elev, x / W, y / H);
      const m = fbm(moist, x / W, y / H);
      let t = T_PLAIN;
      if (e < 0.3) t = T_WATER;
      else if (e > 0.72) t = T_ROCK;
      else if (m > 0.58) t = T_FOREST;
      tiles[idx(x, y)] = t;
    }
  }
  // map border: rock
  for (let x = 0; x < W; x++) { tiles[idx(x, 0)] = T_ROCK; tiles[idx(x, H - 1)] = T_ROCK; }
  for (let y = 0; y < H; y++) { tiles[idx(0, y)] = T_ROCK; tiles[idx(W - 1, y)] = T_ROCK; }

  const clear = (cx, cy, r, to = T_PLAIN) => {
    for (let y = Math.floor(cy - r); y <= cy + r; y++)
      for (let x = Math.floor(cx - r); x <= cx + r; x++)
        if (x > 0 && y > 0 && x < W - 1 && y < H - 1 && (x - cx) ** 2 + (y - cy) ** 2 <= r * r) tiles[idx(x, y)] = to;
  };

  // Key locations (tile coords, centers)
  const hq = { x: rng.int(9, 13), y: rng.int(H - 14, H - 10) };
  const enemy = { x: rng.int(W - 22, W - 14), y: rng.int(12, 20) };
  const dirx = enemy.x - hq.x, diry = enemy.y - hq.y;
  const len = Math.hypot(dirx, diry);
  const px = -diry / len, py = dirx / len;
  const outposts = [0.42, 0.62].map((t, i) => {
    const off = (i === 0 ? 1 : -1) * rng.range(8, 14);
    return {
      x: Math.round(Math.min(W - 8, Math.max(7, hq.x + dirx * t + px * off))),
      y: Math.round(Math.min(H - 8, Math.max(7, hq.y + diry * t + py * off))),
    };
  });

  const sites = [];
  // one rare-earth deposit inside the starting build area, so the first mine needs no outpost
  {
    const a = rng.range(-Math.PI * 0.45, Math.PI * 0.05);
    sites.push({ x: Math.round(hq.x + Math.cos(a) * 6.5), y: Math.round(hq.y + Math.sin(a) * 6.5), home: true });
  }
  const far = (p, list, d) => list.every((q) => Math.hypot(p.x - q.x, p.y - q.y) >= d);
  // two sites reasonably close to the player, the rest spread around
  let guard = 0;
  while (sites.length < 3 && guard++ < 500) {
    const a = rng.range(0, Math.PI * 2), d = rng.range(13, 20);
    const p = { x: Math.round(hq.x + Math.cos(a) * d), y: Math.round(hq.y + Math.sin(a) * d) };
    if (p.x < 5 || p.y < 5 || p.x > W - 6 || p.y > H - 6) continue;
    if (far(p, sites, 9)) sites.push(p);
  }
  guard = 0;
  while (sites.length < 9 && guard++ < 2000) {
    const p = { x: rng.int(6, W - 7), y: rng.int(6, H - 7) };
    if (Math.hypot(p.x - hq.x, p.y - hq.y) < 12) continue;
    if (Math.hypot(p.x - enemy.x, p.y - enemy.y) < 15) continue;
    if (!far(p, outposts, 8)) continue;
    if (far(p, sites, 11)) sites.push(p);
  }

  clear(hq.x, hq.y, 10);
  clear(enemy.x, enemy.y, 12);
  for (const o of outposts) clear(o.x, o.y, 5);
  for (const s of sites) clear(s.x, s.y, 2.5);

  // Connectivity: carve corridors to anything unreachable from HQ.
  const reach = () => {
    const seen = new Uint8Array(W * H);
    const q = [idx(hq.x, hq.y)];
    seen[q[0]] = 1;
    while (q.length) {
      const i = q.pop();
      const x = i % W, y = (i / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = idx(nx, ny);
        if (!seen[j] && STEP_COST[tiles[j]] < Infinity) { seen[j] = 1; q.push(j); }
      }
    }
    return seen;
  };
  const carve = (a, b) => {
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 2);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const tx = Math.round(x + ox), ty = Math.round(y + oy);
        if (tx > 0 && ty > 0 && tx < W - 1 && ty < H - 1 && STEP_COST[tiles[idx(tx, ty)]] === Infinity) tiles[idx(tx, ty)] = T_PLAIN;
      }
    }
  };
  for (const p of [enemy, ...outposts, ...sites]) {
    const seen = reach();
    if (!seen[idx(p.x, p.y)]) carve(hq, p);
  }

  // Cosmetic roads (also slightly faster) via A*-ish Dijkstra on terrain.
  const roadTo = (a, b) => {
    const dist = new Float32Array(W * H).fill(Infinity);
    const prev = new Int32Array(W * H).fill(-1);
    const heap = new MinHeap();
    const s = idx(a.x, a.y), g = idx(b.x, b.y);
    dist[s] = 0; heap.push(s, 0);
    while (heap.size) {
      const i = heap.pop();
      if (i === g) break;
      const x = i % W, y = (i / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = idx(nx, ny);
        const c = STEP_COST[tiles[j]];
        if (c === Infinity) continue;
        const nd = dist[i] + (road[j] ? 0.3 : c * 1.4) + Math.abs(Math.sin(nx * 0.7 + ny * 0.3)) * 0.2;
        if (nd < dist[j]) { dist[j] = nd; prev[j] = i; heap.push(j, nd); }
      }
    }
    for (let i = g; i !== -1 && i !== s; i = prev[i]) road[i] = 1;
    road[s] = 1;
  };
  roadTo(hq, enemy);
  for (const o of outposts) roadTo(o, hq);
  for (const s of sites) roadTo(s, hq);

  // Supply crates: one-off pickups scattered over the map
  const crates = [];
  const reached = reach();
  guard = 0;
  while (crates.length < 10 && guard++ < 2000) {
    const p = { x: rng.int(4, W - 5), y: rng.int(4, H - 5) };
    if (tiles[idx(p.x, p.y)] !== T_PLAIN && tiles[idx(p.x, p.y)] !== T_FOREST) continue;
    if (Math.hypot(p.x - hq.x, p.y - hq.y) < 9 || Math.hypot(p.x - enemy.x, p.y - enemy.y) < 14) continue;
    if (!reached[idx(p.x, p.y)]) continue;
    if (far(p, crates, 8)) crates.push(p);
  }

  // Decorative per-tile variation
  const variant = new Uint8Array(W * H);
  for (let i = 0; i < variant.length; i++) variant[i] = (rng() * 256) | 0;

  return { seed, w: W, h: H, tiles, road, variant, hq, enemy, outposts, sites, crates };
}

// ---------------------------------------------------------------------------
// Binary min-heap keyed by float priority
// ---------------------------------------------------------------------------
export class MinHeap {
  constructor() { this.items = []; this.pri = []; }
  get size() { return this.items.length; }
  push(item, p) {
    const a = this.items, b = this.pri;
    let i = a.length;
    a.push(item); b.push(p);
    while (i > 0) {
      const par = (i - 1) >> 1;
      if (b[par] <= p) break;
      a[i] = a[par]; b[i] = b[par];
      i = par;
    }
    a[i] = item; b[i] = p;
  }
  pop() {
    const a = this.items, b = this.pri;
    const top = a[0];
    const lastI = a.pop(), lastP = b.pop();
    if (a.length) {
      let i = 0;
      const n = a.length;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && b[c + 1] < b[c]) c++;
        if (b[c] >= lastP) break;
        a[i] = a[c]; b[i] = b[c];
        i = c;
      }
      a[i] = lastI; b[i] = lastP;
    }
    return top;
  }
}

// ---------------------------------------------------------------------------
// Pathing: terrain + building occupancy + cached flow fields.
// ---------------------------------------------------------------------------
const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];

export class Pathing {
  constructor(map) {
    this.map = map;
    this.W = map.w; this.H = map.h;
    this.block = new Int32Array(map.w * map.h); // 0 = free, else building id
    this.blockTeam = new Uint8Array(map.w * map.h); // 0 = free, else team + 1
    this.cache = new Map();
  }

  inBounds(tx, ty) { return tx >= 0 && ty >= 0 && tx < this.W && ty < this.H; }
  terrainOk(tx, ty) { return this.inBounds(tx, ty) && STEP_COST[this.map.tiles[ty * this.W + tx]] < Infinity; }
  walkable(tx, ty) { return this.terrainOk(tx, ty) && !this.block[ty * this.W + tx]; }
  walkableAt(x, y) { return this.walkable(Math.floor(x / TILE), Math.floor(y / TILE)); }

  speedAt(x, y) {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (!this.inBounds(tx, ty)) return 1;
    const i = ty * this.W + tx;
    return this.map.road[i] ? 1.2 : SPEED_MULT[this.map.tiles[i]] || 1;
  }

  setBlock(b, val) {
    for (let y = b.ty; y < b.ty + b.h; y++)
      for (let x = b.tx; x < b.tx + b.w; x++)
        if (this.inBounds(x, y)) {
          this.block[y * this.W + x] = val ? b.id : 0;
          this.blockTeam[y * this.W + x] = val ? b.team + 1 : 0;
        }
    this.cache.clear();
  }

  // Straight-line walkability check (sampled every ~half tile).
  clearLine(x0, y0, x1, y1) {
    const d = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.ceil(d / (TILE * 0.45));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      if (!this.walkableAt(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false;
    }
    return true;
  }

  nearestWalkable(tx, ty, maxR = 12) {
    if (this.walkable(tx, ty)) return { x: tx, y: ty };
    for (let r = 1; r <= maxR; r++) {
      let best = null, bd = Infinity;
      for (let y = ty - r; y <= ty + r; y++)
        for (let x = tx - r; x <= tx + r; x++) {
          if (Math.max(Math.abs(x - tx), Math.abs(y - ty)) !== r) continue;
          if (!this.walkable(x, y)) continue;
          const d = (x - tx) ** 2 + (y - ty) ** 2;
          if (d < bd) { bd = d; best = { x, y }; }
        }
      if (best) return best;
    }
    return null;
  }

  // Flow field toward goal tiles for a team. Own buildings are solid; enemy buildings are
  // passable at a high cost so attackers path "through" walls (and shoot them) when enclosed.
  field(goals, key, team) {
    const fullKey = key + ':' + team;
    let f = this.cache.get(fullKey);
    if (f) { this.cache.delete(fullKey); this.cache.set(fullKey, f); return f; }
    const W = this.W, H = this.H, tiles = this.map.tiles, block = this.block, bt = this.blockTeam;
    const own = team + 1;
    const dist = new Float32Array(W * H).fill(Infinity);
    const heap = new MinHeap();
    for (const g of goals) { dist[g] = 0; heap.push(g, 0); }
    while (heap.size) {
      const i = heap.pop();
      const di = dist[i];
      const x = i % W, y = (i / W) | 0;
      for (const [dx, dy, dc] of DIRS) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        const tc = STEP_COST[tiles[j]];
        if (tc === Infinity || bt[j] === own) continue;
        if (dx && dy) {
          if (STEP_COST[tiles[y * W + nx]] === Infinity || STEP_COST[tiles[ny * W + x]] === Infinity) continue;
          if (block[y * W + nx] || block[ny * W + x]) continue;
        }
        const nd = di + dc * tc + (block[j] ? 8 : 0);
        if (nd < dist[j]) { dist[j] = nd; heap.push(j, nd); }
      }
    }
    f = dist;
    this.cache.set(fullKey, f);
    if (this.cache.size > 64) this.cache.delete(this.cache.keys().next().value);
    return f;
  }

  // Best neighbouring tile on a field from (tx,ty). Returns {x,y} or null when at a local minimum.
  nextTile(field, tx, ty, team) {
    const W = this.W, H = this.H, tiles = this.map.tiles, block = this.block;
    const own = team + 1;
    const here = this.inBounds(tx, ty) ? field[ty * W + tx] : Infinity;
    let best = null, bd = here;
    for (const [dx, dy, dc] of DIRS) {
      const nx = tx + dx, ny = ty + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (this.blockTeam[j] === own) continue;
      if (dx && dy && (STEP_COST[tiles[ty * W + nx]] === Infinity || STEP_COST[tiles[ny * W + tx]] === Infinity ||
        block[ty * W + nx] || block[ny * W + tx])) continue;
      const v = field[j] + (dc - 1) * 0.01;
      if (v < bd) { bd = v; best = { x: nx, y: ny }; }
    }
    return best;
  }
}
