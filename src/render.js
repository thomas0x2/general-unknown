// Canvas renderer: terrain, entities, effects, fog of war, overlays, minimap.
import { TILE, MAP_W, MAP_H, TEAM_PLAYER, TEAM_ENEMY, BUILDINGS } from './data.js';
import { T_PLAIN, T_FOREST, T_WATER, T_ROCK } from './map.js';
import { drawUnitShape, drawBuildingShape, teamPalette } from './shapes.js';
import { unitSprite, buildingBase, drawBuildingTop, ANIMATED_UNITS, BUILDING_MARGIN } from './art.js';
import { BUILD_RADIUS } from './game.js';
import { mulberry32 } from './rng.js';

// Blue blueprint silhouette of a building sprite, with a light edge outline (cached per sprite).
const blueprints = new WeakMap();
function blueprintOf(base) {
  let c = blueprints.get(base);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = base.width; c.height = base.height;
  const x = c.getContext('2d');
  x.drawImage(base, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = '#4a9ae0'; x.fillRect(0, 0, c.width, c.height);
  x.globalCompositeOperation = 'luminosity';
  x.globalAlpha = 0.55;
  x.drawImage(base, 0, 0);
  x.globalCompositeOperation = 'destination-in';
  x.globalAlpha = 1;
  x.drawImage(base, 0, 0);
  blueprints.set(base, c);
  return c;
}

const WORLD_W = MAP_W * TILE, WORLD_H = MAP_H * TILE;
const TERRAIN_RGB = {
  [T_PLAIN]: [40, 54, 41],
  [T_FOREST]: [25, 46, 31],
  [T_WATER]: [14, 36, 56],
  [T_ROCK]: [58, 60, 66],
};

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cam = { x: 0, y: 0, zoom: 1 };
    this.view = { w: 1, h: 1, dpr: 1 };
    this.game = null;
    this.fogCanvas = document.createElement('canvas');
    this.fogCanvas.width = MAP_W; this.fogCanvas.height = MAP_H;
    this.fogCtx = this.fogCanvas.getContext('2d');
    this.fogImg = this.fogCtx.createImageData(MAP_W, MAP_H);
    // blurred, upscaled copy for soft fog edges
    this.fogBig = document.createElement('canvas');
    this.fogBig.width = MAP_W * 4; this.fogBig.height = MAP_H * 4;
    this.fogBigCtx = this.fogBig.getContext('2d');
    this.fogVersion = -1;
    this.pings = [];
    this.particles = [];
    this.shake = 0;
    this.hover = null;
    this.placing = null; // {type, tx, ty, ok}
    this.dragBox = null;
    this.time = 0;
  }

  setGame(game) {
    this.game = game;
    this.terrain = this.renderTerrain(game.map);
    this.miniTerrain = this.renderMiniTerrain();
    this.particles = [];
    this.shake = 0;
    const rnd = mulberry32(game.map.seed);
    this.cloudSprite ??= this.makeCloudSprite();
    this.clouds = Array.from({ length: 9 }, () => ({ x: rnd() * WORLD_W, y: rnd() * WORLD_H, s: 2.4 + rnd() * 2.6, a: 0.10 + rnd() * 0.08 }));
    this.fogVersion = -1;
    this.pings = [];
    this.cam.x = game.hq.x + 120;
    this.cam.y = game.hq.y - 100;
    this.cam.zoom = 1.3;
  }

  // The map only occupies the area not covered by the HUD (top bar, bottom bar, build panel),
  // so nothing on the battlefield can hide behind the interface.
  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const hud = document.getElementById('hud');
    let top = 0, bottom = 0, right = 0;
    if (hud && !hud.hidden) {
      top = document.getElementById('topbar').getBoundingClientRect().bottom;
      bottom = window.innerHeight - document.getElementById('bottombar').getBoundingClientRect().top;
      right = document.getElementById('buildpanel').getBoundingClientRect().width;
    }
    const w = Math.max(100, window.innerWidth - right), h = Math.max(100, window.innerHeight - top - bottom);
    this.view = { w, h, dpr, ox: 0, oy: top };
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    Object.assign(this.canvas.style, { width: w + 'px', height: h + 'px', left: '0px', top: top + 'px' });
    this.vignette = this.makeVignette();
  }

  // ------------------------------------------------------------ coordinates
  // Page (client) coordinates <-> canvas-local coordinates.
  pageToWorld(px, py) { return this.toWorld(px - this.view.ox, py - this.view.oy); }
  worldToPage(wx, wy) { const s = this.toScreen(wx, wy); return { x: s.x + this.view.ox, y: s.y + this.view.oy }; }

  toWorld(sx, sy) {
    const { w, h } = this.view, z = this.cam.zoom;
    return { x: (sx - w / 2) / z + this.cam.x, y: (sy - h / 2) / z + this.cam.y };
  }
  toScreen(wx, wy) {
    const { w, h } = this.view, z = this.cam.zoom;
    return { x: (wx - this.cam.x) * z + w / 2, y: (wy - this.cam.y) * z + h / 2 };
  }
  clampCam() {
    const { w, h } = this.view, z = this.cam.zoom;
    const hw = w / 2 / z, hh = h / 2 / z;
    this.cam.x = Math.max(Math.min(hw, WORLD_W / 2), Math.min(WORLD_W - Math.min(hw, WORLD_W / 2), this.cam.x));
    this.cam.y = Math.max(Math.min(hh, WORLD_H / 2), Math.min(WORLD_H - Math.min(hh, WORLD_H / 2), this.cam.y));
  }

  ping(x, y, color = '#ff4d3a', life = 3) { this.pings.push({ x, y, color, t: 0, life }); }

  // -------------------------------------------------------------- terrain
  renderTerrain(map) {
    const W = MAP_W, H = MAP_H, N = W * H, tiles = map.tiles;
    const rand = mulberry32(map.seed ^ 0x5bd1e995);

    // --- distance fields (tiles): water depth, distance to water, rock height
    const distFrom = (isSource) => {
      const d = new Float32Array(N).fill(1e9);
      const q = [];
      for (let i = 0; i < N; i++) if (isSource(i)) { d[i] = 0; q.push(i); }
      for (let h = 0; h < q.length; h++) {
        const i = q[h], x = i % W, y = (i / W) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = ny * W + nx;
          if (d[j] > d[i] + 1) { d[j] = d[i] + 1; q.push(j); }
        }
      }
      return d;
    };
    const depth = distFrom((i) => tiles[i] !== T_WATER);
    const toWater = distFrom((i) => tiles[i] === T_WATER);
    const rockH = distFrom((i) => tiles[i] !== T_ROCK);

    // --- smooth value noise
    const perm = new Uint8Array(512);
    for (let i = 0; i < 256; i++) perm[i] = i;
    for (let i = 255; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
    for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
    const hash = (x, y) => perm[(perm[x & 255] + y) & 511] / 255;
    const vnoise = (x, y) => {
      const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
      const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
      const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
    const fbm = (x, y) => vnoise(x, y) * 0.55 + vnoise(x * 2.1, y * 2.1) * 0.3 + vnoise(x * 4.3, y * 4.3) * 0.15;

    // --- per-tile height and colour
    const hT = new Float32Array(N), rT = new Float32Array(N), gT = new Float32Array(N), bT = new Float32Array(N), wT = new Float32Array(N);
    const mixc = (a, b, t) => a.map((v, k) => v + (b[k] - v) * t);
    for (let i = 0; i < N; i++) {
      const x = i % W, y = (i / W) | 0, t = tiles[i];
      let c;
      if (t === T_WATER) {
        const dd = Math.min(depth[i], 6) / 6;
        c = mixc([34, 86, 96], [7, 24, 42], Math.sqrt(dd));
        hT[i] = -0.4 - dd * 1.6; wT[i] = 1;
      } else if (t === T_ROCK) {
        const rh = Math.min(rockH[i], 5);
        c = mixc([74, 74, 76], [118, 116, 112], rh / 5);
        hT[i] = 0.9 + rh * 0.75;
      } else {
        const dry = fbm(x * 0.09, y * 0.09);
        c = mixc([44, 66, 40], [82, 80, 50], Math.max(0, Math.min(1, (dry - 0.38) * 2.2)));
        if (t === T_FOREST) { c = mixc(c, [22, 44, 26], 0.65); hT[i] = 0.25; }
        if (toWater[i] === 1) c = mixc(c, [104, 98, 72], 0.55); // beach
        hT[i] += fbm(x * 0.2 + 40, y * 0.2) * 0.35;
      }
      rT[i] = c[0]; gT[i] = c[1]; bT[i] = c[2];
    }

    // --- per-sample relief shading (4px samples, upscaled smoothly)
    const S = 4, SW = (W * TILE) / S, SH = (H * TILE) / S;
    const bil = (f, sx, sy) => {
      const tx = (sx * S) / TILE - 0.5, ty = (sy * S) / TILE - 0.5;
      const x0 = Math.max(0, Math.min(W - 1, Math.floor(tx))), y0 = Math.max(0, Math.min(H - 1, Math.floor(ty)));
      const x1 = Math.min(W - 1, x0 + 1), y1 = Math.min(H - 1, y0 + 1);
      const fx = Math.max(0, Math.min(1, tx - x0)), fy = Math.max(0, Math.min(1, ty - y0));
      const a = f[y0 * W + x0], b = f[y0 * W + x1], c = f[y1 * W + x0], d = f[y1 * W + x1];
      return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
    };
    const hS = new Float32Array(SW * SH);
    for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
      const rock = bil(hT, x, y);
      hS[y * SW + x] = rock + fbm(x * 0.05, y * 0.05) * 0.5 + (rock > 1 ? Math.abs(vnoise(x * 0.12, y * 0.12) - 0.5) * 1.6 : 0);
    }
    const small = document.createElement('canvas');
    small.width = SW; small.height = SH;
    const sctx = small.getContext('2d');
    const img = sctx.createImageData(SW, SH);
    for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
      const j = y * SW + x;
      const xl = Math.max(0, x - 1), xr = Math.min(SW - 1, x + 1), yu = Math.max(0, y - 1), yd = Math.min(SH - 1, y + 1);
      const dx = hS[y * SW + xr] - hS[y * SW + xl], dy = hS[yd * SW + x] - hS[yu * SW + x];
      // light from the north-west
      let shade = 1 + (dx + dy) * 0.55;
      shade = Math.max(0.55, Math.min(1.45, shade));
      const grain = 0.93 + vnoise(x * 0.9, y * 0.9) * 0.14;
      const w = bil(wT, x, y);
      let r = bil(rT, x, y) * shade * grain, g = bil(gT, x, y) * shade * grain, b = bil(bT, x, y) * shade * grain;
      if (w > 0.3 && w < 0.66) {
        // surf line along the shore
        const f = (1 - Math.abs(w - 0.48) / 0.18) * (0.5 + vnoise(x * 0.4, y * 0.4) * 0.6);
        r += 70 * f; g += 80 * f; b += 80 * f;
      } else if (w >= 0.66) {
        const rip = Math.max(0, vnoise(x * 0.35 + y * 0.12, y * 0.6) - 0.62) * 70;
        r += rip * 0.5; g += rip * 0.8; b += rip;
      }
      img.data[j * 4] = r; img.data[j * 4 + 1] = g; img.data[j * 4 + 2] = b; img.data[j * 4 + 3] = 255;
    }
    sctx.putImageData(img, 0, 0);

    const c = document.createElement('canvas');
    c.width = WORLD_W; c.height = WORLD_H;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(small, 0, 0, WORLD_W, WORLD_H);
    const rnd = (i, k) => ((map.variant[i] * 9301 + k * 49297) % 233280) / 233280;

    // --- cliff faces: rock plateaus cast a shadow to the south-east and catch light on the north-west rim
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (tiles[i] !== T_ROCK) continue;
      const px = x * TILE, py = y * TILE;
      const notRock = (dx, dy) => { const nx = x + dx, ny = y + dy; return nx >= 0 && ny >= 0 && nx < W && ny < H && tiles[ny * W + nx] !== T_ROCK; };
      if (notRock(0, 1)) { const g = ctx.createLinearGradient(0, py + TILE - 4, 0, py + TILE + 14); g.addColorStop(0, 'rgba(10,10,12,0.55)'); g.addColorStop(1, 'rgba(10,10,12,0)'); ctx.fillStyle = g; ctx.fillRect(px - 2, py + TILE - 4, TILE + 4, 18); }
      if (notRock(1, 0)) { const g = ctx.createLinearGradient(px + TILE - 4, 0, px + TILE + 12, 0); g.addColorStop(0, 'rgba(10,10,12,0.45)'); g.addColorStop(1, 'rgba(10,10,12,0)'); ctx.fillStyle = g; ctx.fillRect(px + TILE - 4, py - 2, 16, TILE + 4); }
      ctx.fillStyle = 'rgba(220,220,210,0.16)';
      if (notRock(0, -1)) ctx.fillRect(px, py, TILE, 2.5);
      if (notRock(-1, 0)) ctx.fillRect(px, py, 2.5, TILE);
    }

    // --- old craters: the border has been fought over before
    for (let n = 0; n < 40; n++) {
      const x = rand() * WORLD_W, y = rand() * WORLD_H;
      const i = Math.floor(y / TILE) * W + Math.floor(x / TILE);
      if (tiles[i] !== T_PLAIN) continue;
      const r = 6 + rand() * 12;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 1.6);
      g.addColorStop(0, 'rgba(18,16,12,0.55)'); g.addColorStop(0.6, 'rgba(30,28,20,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(140,130,100,0.18)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x - 1, y - 1, r, Math.PI * 0.9, Math.PI * 1.8); ctx.stroke();
    }

    // --- roads: shoulder, surface, worn centre, tyre tracks
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const roadPath = () => {
      ctx.beginPath();
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (!map.road[y * W + x]) continue;
        const cx = (x + 0.5) * TILE, cy = (y + 0.5) * TILE;
        for (const [dx, dy] of [[1, 0], [0, 1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < W && ny < H && map.road[ny * W + nx]) { ctx.moveTo(cx, cy); ctx.lineTo((nx + 0.5) * TILE, (ny + 0.5) * TILE); }
        }
      }
    };
    roadPath();
    ctx.strokeStyle = 'rgba(20,18,12,0.35)'; ctx.lineWidth = 18; ctx.stroke();
    ctx.strokeStyle = 'rgba(96,86,64,0.75)'; ctx.lineWidth = 13; ctx.stroke();
    ctx.strokeStyle = 'rgba(122,110,82,0.5)'; ctx.lineWidth = 6; ctx.stroke();
    ctx.setLineDash([3, 5]);
    ctx.strokeStyle = 'rgba(40,34,24,0.35)'; ctx.lineWidth = 1.2;
    ctx.save(); ctx.translate(-3.5, -3.5); roadPath(); ctx.stroke(); ctx.restore();
    ctx.save(); ctx.translate(3.5, 3.5); roadPath(); ctx.stroke(); ctx.restore();
    ctx.setLineDash([]);

    // --- vegetation and boulders, lit from the north-west, shadows to the south-east
    const tree = (x, y, r, i, conifer) => {
      ctx.fillStyle = 'rgba(0,0,0,0.32)';
      ctx.beginPath(); ctx.ellipse(x + r * 0.55, y + r * 0.7, r * 1.05, r * 0.85, 0, 0, Math.PI * 2); ctx.fill();
      const base = [26 + rnd(i, 2) * 14, 56 + rnd(i, 3) * 22, 30 + rnd(i, 4) * 10];
      if (conifer) {
        for (const [k, rr] of [[0, 1], [1, 0.62]]) {
          const col = k ? base.map((v) => v + 22) : base;
          ctx.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
          ctx.beginPath();
          for (let p = 0; p < 14; p++) {
            const a = (p / 14) * Math.PI * 2, rad = (p % 2 ? 0.55 : 1) * r * rr;
            ctx.lineTo(x + Math.cos(a) * rad - k * r * 0.15, y + Math.sin(a) * rad - k * r * 0.15);
          }
          ctx.closePath(); ctx.fill();
        }
      } else {
        ctx.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgb(${base[0] + 14},${base[1] + 20},${base[2] + 8})`;
        ctx.beginPath(); ctx.arc(x - r * 0.22, y - r * 0.22, r * 0.72, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgba(190,230,150,0.16)`;
        ctx.beginPath(); ctx.arc(x - r * 0.42, y - r * 0.42, r * 0.36, 0, Math.PI * 2); ctx.fill();
      }
    };
    const boulder = (x, y, s, i) => {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(x + s * 0.3, y + s * 0.4, s * 0.8, s * 0.55, 0, 0, Math.PI * 2); ctx.fill();
      const pts = [];
      for (let p = 0; p < 6; p++) { const a = (p / 6) * Math.PI * 2 + rnd(i, p) * 0.6; pts.push([x + Math.cos(a) * s * (0.7 + rnd(i, p + 9) * 0.4), y + Math.sin(a) * s * (0.6 + rnd(i, p + 3) * 0.4)]); }
      const g = ctx.createLinearGradient(x - s, y - s, x + s, y + s);
      g.addColorStop(0, '#9a9a96'); g.addColorStop(1, '#3e3f42');
      ctx.fillStyle = g;
      ctx.beginPath(); pts.forEach(([px, py]) => ctx.lineTo(px, py)); ctx.closePath(); ctx.fill();
    };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, t = tiles[i];
      const px = x * TILE, py = y * TILE;
      if (t === T_FOREST) {
        const n = 3 + Math.floor(rnd(i, 1) * 2);
        for (let k = 0; k < n; k++) tree(px + 5 + rnd(i, k) * 22, py + 5 + rnd(i, k + 7) * 22, 5.5 + rnd(i, k + 3) * 5, i + k, rnd(i, k + 11) < 0.35);
      } else if (t === T_PLAIN) {
        // stray trees near woodland, grass tufts elsewhere
        const nearForest = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => tiles[(y + dy) * W + x + dx] === T_FOREST);
        if (nearForest && rnd(i, 8) < 0.45 && !map.road[i]) tree(px + 6 + rnd(i, 2) * 20, py + 6 + rnd(i, 5) * 20, 4 + rnd(i, 6) * 4, i, rnd(i, 9) < 0.4);
        if (!map.road[i]) for (let k = 0; k < 3; k++) {
          if (rnd(i, k + 20) > 0.6) continue;
          const gx = px + rnd(i, k + 30) * 30, gy = py + rnd(i, k + 40) * 30;
          ctx.strokeStyle = rnd(i, k) < 0.5 ? 'rgba(120,160,90,0.25)' : 'rgba(150,150,90,0.22)';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx - 1.5, gy - 4); ctx.moveTo(gx, gy); ctx.lineTo(gx + 1.5, gy - 3.5); ctx.stroke();
        }
        if (rnd(i, 50) < 0.025) boulder(px + 16, py + 16, 4 + rnd(i, 51) * 4, i);
      } else if (t === T_ROCK) {
        if (rockH[i] <= 2 && rnd(i, 1) < 0.55) boulder(px + 6 + rnd(i, 2) * 20, py + 6 + rnd(i, 3) * 20, 5 + rnd(i, 4) * 7, i);
      }
    }

    // --- tactical grid overlay
    ctx.strokeStyle = 'rgba(140,210,255,0.028)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= W; x++) { ctx.moveTo(x * TILE + 0.5, 0); ctx.lineTo(x * TILE + 0.5, WORLD_H); }
    for (let y = 0; y <= H; y++) { ctx.moveTo(0, y * TILE + 0.5); ctx.lineTo(WORLD_W, y * TILE + 0.5); }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(140,210,255,0.07)';
    ctx.beginPath();
    for (let x = 0; x <= W; x += 8) { ctx.moveTo(x * TILE + 0.5, 0); ctx.lineTo(x * TILE + 0.5, WORLD_H); }
    for (let y = 0; y <= H; y += 8) { ctx.moveTo(0, y * TILE + 0.5); ctx.lineTo(WORLD_W, y * TILE + 0.5); }
    ctx.stroke();
    ctx.fillStyle = 'rgba(160,220,255,0.22)'; ctx.font = '10px monospace';
    for (let x = 0; x < W; x += 8) for (let y = 0; y < H; y += 8) ctx.fillText(`${String.fromCharCode(65 + x / 8)}${y / 8 + 1}`, x * TILE + 4, y * TILE + 12);
    return c;
  }

  renderMiniTerrain() {
    const c = document.createElement('canvas');
    c.width = 340; c.height = 340;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.terrain, 0, 0, 340, 340);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(0, 0, 340, 340);
    return c;
  }

  // Soft cloud sprite, reused for drifting cloud shadows.
  makeCloudSprite() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const ctx = c.getContext('2d');
    const rnd = mulberry32(7);
    for (let i = 0; i < 9; i++) {
      const x = 70 + rnd() * 116, y = 80 + rnd() * 96, r = 40 + rnd() * 50;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(0,0,0,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    return c;
  }

  makeVignette() {
    const { w, h } = this.view;
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w / 2)); c.height = Math.max(1, Math.round(h / 2));
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(c.width / 2, c.height / 2, Math.min(c.width, c.height) * 0.35, c.width / 2, c.height / 2, Math.hypot(c.width, c.height) * 0.6);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,4,8,0.55)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
    return c;
  }

  // Renderer-side particles spawned from game explosions: sparks, debris, smoke.
  spawnParticles(e) {
    const P = this.particles;
    if (P.length > 1400) return;
    const n = Math.min(26, 4 + e.size / 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * e.size * 5;
      P.push({ k: 'spark', x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, life: 0.25 + Math.random() * 0.35, s: 1 + Math.random() * 1.5 });
    }
    if (!e.air) {
      for (let i = 0; i < n / 3; i++) {
        const a = Math.random() * Math.PI * 2, sp = 20 + Math.random() * e.size * 3;
        P.push({ k: 'debris', x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, life: 0.6 + Math.random() * 0.6, s: 1.5 + Math.random() * 2.5, r: Math.random() * 6 });
      }
    }
    for (let i = 0; i < Math.max(2, n / 4); i++) {
      P.push({ k: 'smoke', x: e.x + (Math.random() - 0.5) * e.size, y: e.y + (Math.random() - 0.5) * e.size, vx: 6 + Math.random() * 8, vy: -8 - Math.random() * 10, t: 0, life: 1.6 + Math.random() * 1.8, s: e.size * (0.35 + Math.random() * 0.4) });
    }
    if (e.size > 34 && Math.hypot(e.x - this.cam.x, e.y - this.cam.y) < 900) this.shake = Math.min(9, Math.max(this.shake, e.size / 9));
  }

  drawParticles(ctx, dt, pass) {
    const P = this.particles;
    if (pass === 'smoke') {
      for (const p of P) {
        if (p.k !== 'smoke') continue;
        const k = p.t / p.life;
        ctx.fillStyle = `rgba(70,70,70,${0.22 * (1 - k)})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.s * (0.6 + k * 1.4), 0, Math.PI * 2); ctx.fill();
      }
      return;
    }
    for (const p of P) {
      p.t += dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      const drag = p.k === 'smoke' ? 0.4 : 3;
      p.vx *= Math.exp(-drag * dt); p.vy *= Math.exp(-drag * dt);
      if (p.k === 'smoke') continue;
      const k = p.t / p.life;
      if (p.k === 'spark') {
        ctx.strokeStyle = `rgba(255,${190 - k * 120},${90 - k * 80},${1 - k})`;
        ctx.lineWidth = p.s;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); ctx.stroke();
      } else {
        ctx.fillStyle = `rgba(24,22,20,${1 - k})`;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r + p.t * 6); ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s); ctx.restore();
      }
    }
    this.particles = P.filter((p) => p.t < p.life);
  }

  updateFogImage() {
    const g = this.game;
    if (this.fogVersion === g.fogVersion) return;
    this.fogVersion = g.fogVersion;
    const d = this.fogImg.data;
    for (let i = 0; i < MAP_W * MAP_H; i++) {
      d[i * 4] = 4; d[i * 4 + 1] = 9; d[i * 4 + 2] = 15;
      d[i * 4 + 3] = g.vis[i] ? 0 : g.explored[i] ? 135 : 250;
    }
    this.fogCtx.putImageData(this.fogImg, 0, 0);
    const b = this.fogBigCtx;
    b.clearRect(0, 0, this.fogBig.width, this.fogBig.height);
    b.imageSmoothingEnabled = true;
    b.filter = 'blur(3px)';
    b.drawImage(this.fogCanvas, 0, 0, this.fogBig.width, this.fogBig.height);
    b.filter = 'none';
  }

  // ------------------------------------------------------------------ frame
  draw(dt) {
    const g = this.game;
    if (!g) return;
    this.time += dt;
    const ctx = this.ctx, { w, h, dpr } = this.view, z = this.cam.zoom;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#05080b';
    ctx.fillRect(0, 0, w, h);
    this.shake = Math.max(0, this.shake - dt * 18);
    const sxk = this.shake ? (Math.random() - 0.5) * this.shake : 0, syk = this.shake ? (Math.random() - 0.5) * this.shake : 0;
    ctx.setTransform(z * dpr, 0, 0, z * dpr, (w / 2 - this.cam.x * z + sxk) * dpr, (h / 2 - this.cam.y * z + syk) * dpr);

    // new explosions spawn renderer particles
    for (const e of g.effects) if (e.type === 'explosion' && !e.seen) { e.seen = true; if (g.visibleAt(e.x, e.y)) this.spawnParticles(e); }

    const tl = this.toWorld(0, 0), br = this.toWorld(w, h);
    const vx0 = tl.x - 64, vy0 = tl.y - 64, vx1 = br.x + 64, vy1 = br.y + 64;
    const onScreen = (e, pad = 0) => e.x > vx0 - pad && e.x < vx1 + pad && e.y > vy0 - pad && e.y < vy1 + pad;

    // terrain (only the visible slice)
    const sx = Math.max(0, tl.x), sy = Math.max(0, tl.y);
    const sw = Math.min(WORLD_W, br.x) - sx, sh = Math.min(WORLD_H, br.y) - sy;
    if (sw > 0 && sh > 0) ctx.drawImage(this.terrain, sx, sy, sw, sh, sx, sy, sw, sh);

    // ground effects
    for (const e of g.effects) if (e.type === 'scorch' && onScreen(e)) {
      ctx.globalAlpha = 0.45 * (1 - e.t / e.life);
      ctx.fillStyle = '#050505';
      ctx.beginPath(); ctx.ellipse(e.x, e.y, e.size, e.size * 0.8, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    this.drawSites(ctx, g);
    this.drawCrates(ctx, g, onScreen);
    if (this.placing) this.drawBuildArea(ctx, g, vx0, vy0, vx1, vy1);
    if (g.selection.some((e) => e.kind === 'unit' && g.needsUplink(e)) || (this.placing && BUILDINGS[this.placing.type].uplink)) this.drawUplinks(ctx, g);

    // selection rings under units
    const sel = new Set(g.selection);
    for (const e of g.selection) {
      if (e.kind !== 'unit') continue;
      const ry = e.y + (e.air ? 10 : 2), rx = e.radius + 5;
      ctx.fillStyle = 'rgba(120,255,170,0.10)';
      ctx.beginPath(); ctx.ellipse(e.x, ry, rx, rx * 0.7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(120,255,170,0.95)'; ctx.lineWidth = 1.5 / z + 0.5;
      const spin = this.time * 1.5;
      for (let q = 0; q < 3; q++) {
        ctx.beginPath(); ctx.ellipse(e.x, ry, rx, rx * 0.7, 0, spin + (q * Math.PI * 2) / 3, spin + (q * Math.PI * 2) / 3 + 1.6); ctx.stroke();
      }
    }

    // buildings, north to south so nearer (southern) structures overlap the ones behind them
    const sortedB = g.buildings.slice().sort((a, b) => (a.ty + a.h) - (b.ty + b.h));
    for (const b of sortedB) {
      if (b.dead || !onScreen(b, 80)) continue;
      if (b.team === TEAM_ENEMY && !b.discovered) continue;
      this.drawBuilding(ctx, b, sel.has(b));
    }

    // ground units
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    for (const u of g.units) {
      if (u.air || !onScreen(u)) continue;
      if (u.team === TEAM_ENEMY && !g.isVisible(u)) continue;
      ctx.beginPath(); ctx.ellipse(u.x + 2.5, u.y + 3.5, u.radius * 1.05, u.radius * 0.8, 0, 0, Math.PI * 2); ctx.fill();
    }
    for (const u of g.units) {
      if (u.air || !onScreen(u)) continue;
      if (u.team === TEAM_ENEMY && !g.isVisible(u)) continue;
      this.drawUnit(ctx, u);
    }

    // projectiles + effects (below air)
    for (const p of g.projectiles) {
      if (p.dead || p.delay > 0 || !onScreen(p)) continue;
      if (p.team === TEAM_ENEMY && !p.cruise && !g.visibleAt(p.x, p.y)) continue;
      this.drawProjectile(ctx, p);
    }
    this.drawParticles(ctx, dt, 'smoke');
    ctx.globalCompositeOperation = 'lighter';
    this.drawEffects(ctx, g, onScreen, false);
    this.drawParticles(ctx, dt, 'fx');
    ctx.globalCompositeOperation = 'source-over';

    // air units (with shadows)
    for (const u of g.units) {
      if (!u.air || !onScreen(u)) continue;
      if (u.team === TEAM_ENEMY && !g.isVisible(u)) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(u.x + 6, u.y + 12, u.radius * 0.9, u.radius * 0.5, 0, 0, Math.PI * 2); ctx.fill();
      this.drawUnit(ctx, u);
    }
    ctx.globalCompositeOperation = 'lighter';
    this.drawEffects(ctx, g, onScreen, true);
    ctx.globalCompositeOperation = 'source-over';

    // drifting cloud shadows
    for (const c of this.clouds) {
      c.x += dt * 9; c.y += dt * 3;
      if (c.x - 128 * c.s > WORLD_W) c.x = -128 * c.s;
      if (c.y - 128 * c.s > WORLD_H) c.y = -128 * c.s;
      const r = 128 * c.s;
      if (c.x + r < vx0 || c.x - r > vx1 || c.y + r < vy0 || c.y - r > vy1) continue;
      ctx.globalAlpha = c.a;
      ctx.drawImage(this.cloudSprite, c.x - r, c.y - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;

    // fog of war
    this.updateFogImage();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.fogBig, 0, 0, this.fogBig.width, this.fogBig.height, 0, 0, WORLD_W, WORLD_H);

    // incoming cruise missiles are tracked by early-warning satellites: always shown
    for (const p of g.projectiles) {
      if (!p.cruise || p.dead || p.team !== TEAM_ENEMY) continue;
      ctx.strokeStyle = 'rgba(255,80,60,0.35)'; ctx.setLineDash([8, 8]); ctx.lineWidth = 1.5 / z;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.tx, p.ty); ctx.stroke(); ctx.setLineDash([]);
      const k = 0.5 + 0.5 * Math.sin(this.time * 10);
      ctx.strokeStyle = `rgba(255,80,60,${0.4 + k * 0.5})`; ctx.lineWidth = 2 / z;
      ctx.beginPath(); ctx.arc(p.tx, p.ty, p.splash, 0, Math.PI * 2); ctx.stroke();
      if (!g.visibleAt(p.x, p.y)) this.drawProjectile(ctx, p);
    }

    // overlays on top of fog
    for (const b of g.buildings) {
      if (b.dead || !onScreen(b, 80)) continue;
      if (b.team === TEAM_ENEMY && !b.discovered) continue;
      const show = sel.has(b) || this.hover === b || b.hp < b.st.maxHp * 0.999 || !b.built;
      if (show && (b.team === TEAM_PLAYER || b.visible)) this.drawBar(ctx, b.x, b.y - b.h * TILE / 2 - 6, b.w * TILE * 0.8, b.hp / b.st.maxHp, b.team);
      if (!b.built) {
        const by = b.y - b.h * TILE / 2 - 1 - BUILDING_MARGIN.up * 0.55;
        this.drawBar(ctx, b.x, by, b.w * TILE * 0.8, b.progress, 2);
        ctx.fillStyle = '#ffd76a'; ctx.font = `bold ${Math.max(9, 10 / this.cam.zoom)}px monospace`; ctx.textAlign = 'center';
        ctx.fillText(`${Math.floor(b.progress * 100)}%`, b.x, by - 4);
        ctx.textAlign = 'start';
      }
      if (b.team === TEAM_PLAYER && (b.repairActive || b.repairing)) this.drawRepairIcon(ctx, b);
      if (b.queue?.length) this.drawBar(ctx, b.x, b.y + b.h * TILE / 2 + 4, b.w * TILE * 0.7, b.queue[0].t / g.timeOf(b.queue[0].type, false), 3);
    }
    for (const u of g.units) {
      if (!onScreen(u)) continue;
      if (u.team === TEAM_ENEMY && !g.isVisible(u)) continue;
      if (sel.has(u) || this.hover === u || u.hp < u.st.maxHp * 0.999)
        this.drawBar(ctx, u.x, u.y - u.radius - 7, Math.max(16, u.radius * 2.2), u.hp / u.st.maxHp, u.team);
    }

    // selected: range, rally
    if (g.selection.length === 1) {
      const e = g.selection[0];
      if (e.st?.range) {
        ctx.strokeStyle = e.team === TEAM_PLAYER ? 'rgba(57,213,255,0.25)' : 'rgba(255,77,58,0.25)';
        ctx.lineWidth = 1 / z; ctx.setLineDash([4 / z, 4 / z]);
        ctx.beginPath(); ctx.arc(e.x, e.y, e.st.range + (e.kind === 'building' ? e.radius * 0.5 : 0), 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
      }
      const aura = e.def.jammer || e.def.repair || e.def.healer || e.def.pulse;
      if (aura) {
        const r = aura.radius * (e.st.radius || 1);
        ctx.strokeStyle = e.def.jammer || e.def.pulse ? 'rgba(180,140,255,0.3)' : 'rgba(125,255,176,0.3)';
        ctx.lineWidth = 1 / z; ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, Math.PI * 2); ctx.stroke();
      }
    }
    for (const e of g.selection) {
      if (e.kind === 'building' && e.rally) {
        ctx.strokeStyle = 'rgba(120,255,170,0.5)'; ctx.lineWidth = 1 / z; ctx.setLineDash([5 / z, 5 / z]);
        ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.rally.x, e.rally.y); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(120,255,170,0.9)';
        ctx.beginPath(); ctx.arc(e.rally.x, e.rally.y, 4, 0, Math.PI * 2); ctx.fill();
      }
      if (e.kind === 'unit' && e.team === TEAM_PLAYER) {
        // current order, then queued waypoints
        const legs = [e.order, ...(e.queue || [])].filter((o) => o.type === 'move' || o.type === 'amove' || o.type === 'attack');
        let px = e.x, py = e.y;
        for (const o of legs) {
          const tx = o.type === 'attack' ? o.target.x : o.x, ty = o.type === 'attack' ? o.target.y : o.y;
          ctx.strokeStyle = o.type === 'move' ? 'rgba(120,255,170,0.35)' : 'rgba(255,120,90,0.4)';
          ctx.lineWidth = 1 / z;
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(tx, ty); ctx.stroke();
          if (e.queue?.length) { ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.arc(tx, ty, 3 / z + 1, 0, Math.PI * 2); ctx.fill(); }
          px = tx; py = ty;
        }
      }
    }

    // pings
    for (const p of this.pings) {
      p.t += dt;
      const k = (p.t % 1);
      ctx.strokeStyle = p.color; ctx.globalAlpha = (1 - k) * (1 - p.t / p.life);
      ctx.lineWidth = 3 / z;
      ctx.beginPath(); ctx.arc(p.x, p.y, 20 + k * 80, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    this.pings = this.pings.filter((p) => p.t < p.life);

    if (this.placing) this.drawPlacement(ctx, g);
    if (this.abilityAim) this.drawAbilityAim(ctx, g);
    if (this.moveMarker) {
      const m = this.moveMarker;
      m.t += dt;
      const k = m.t / 0.5;
      if (k < 1) {
        ctx.strokeStyle = m.attack ? `rgba(255,100,80,${1 - k})` : `rgba(120,255,170,${1 - k})`;
        ctx.lineWidth = 2 / z;
        ctx.beginPath(); ctx.ellipse(m.x, m.y, 14 * (1 - k * 0.5), 9 * (1 - k * 0.5), 0, 0, Math.PI * 2); ctx.stroke();
      } else this.moveMarker = null;
    }

    // screen space: vignette, drag box
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.vignette) ctx.drawImage(this.vignette, 0, 0, w, h);
    if (this.dragBox) {
      const b = this.dragBox;
      ctx.strokeStyle = 'rgba(120,255,170,0.9)'; ctx.fillStyle = 'rgba(120,255,170,0.08)'; ctx.lineWidth = 1;
      ctx.fillRect(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1), Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0));
      ctx.strokeRect(Math.min(b.x0, b.x1) + 0.5, Math.min(b.y0, b.y1) + 0.5, Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0));
    }
  }

  drawBar(ctx, x, y, w, frac, team) {
    const z = this.cam.zoom;
    const hgt = Math.max(2.5, 3.5 / z);
    frac = Math.max(0, Math.min(1, frac));
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, hgt + 2);
    let color;
    if (team === 2) color = '#ffd76a';
    else if (team === 3) color = '#7fd1ff';
    else if (team === 4) color = '#c08cff';
    else if (team === TEAM_ENEMY) color = '#ff5a45';
    else color = frac > 0.6 ? '#5fdc7a' : frac > 0.3 ? '#ffc93c' : '#ff5a45';
    ctx.fillStyle = color;
    ctx.fillRect(x - w / 2, y, w * frac, hgt);
  }

  drawUnit(ctx, u) {
    const P = teamPalette(u.team === TEAM_PLAYER ? 0 : 1);
    // faint team ring keeps friend and foe readable under the camouflage
    ctx.strokeStyle = P.glow.replace('0.35', '0.6'); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(u.x, u.y + (u.air ? 0 : 1), u.radius + 2.5, (u.radius + 2.5) * 0.8, 0, 0, Math.PI * 2); ctx.stroke();
    const moved = Math.abs(u.x - (u.px ?? u.x)) + Math.abs(u.y - (u.py ?? u.y)) > 0.01;
    u.px = u.x; u.py = u.y;
    const shape = u.def.shape;
    const frame = !ANIMATED_UNITS.has(shape) ? 0 : u.air ? Math.floor(this.time * 24 + u.bob) & 3 : moved ? Math.floor(this.time * 9 + u.bob) & 3 : 0;
    const spr = unitSprite(shape, P, frame);
    ctx.save();
    const bob = u.air ? Math.sin(this.time * 3 + u.bob) * 1.5 : 0;
    ctx.translate(u.x, u.y + bob);
    if (u.flash > 0) { ctx.shadowColor = '#fff'; ctx.shadowBlur = 10; }
    ctx.rotate(u.angle);
    ctx.drawImage(spr, -spr.ext, -spr.ext, spr.ext * 2, spr.ext * 2);
    ctx.restore();
    if (u.stunUntil > this.game.time) this.drawStun(ctx, u.x, u.y, u.radius + 4);
    if (u.hackPts > 0 && u.team === TEAM_ENEMY) this.drawBar(ctx, u.x, u.y + u.radius + 5, Math.max(16, u.radius * 2.2), u.hackPts / (u.st.maxHp * 0.6), 4);
    if (u.slowUntil > this.game.time) {
      ctx.strokeStyle = 'rgba(180,140,255,0.6)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(u.x, u.y, u.radius + 3 + Math.sin(this.time * 20), 0, Math.PI * 2); ctx.stroke();
    }
  }

  // Spinning wrench badge on buildings under repair (dimmed when repairs are paused for credits).
  drawRepairIcon(ctx, b) {
    const x = b.tx * TILE + b.w * TILE - 4, y = b.ty * TILE + 4;
    const z = this.cam.zoom, r = 8 / Math.max(0.7, z);
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = b.repairActive ? 0.75 + Math.sin(this.time * 6) * 0.25 : 0.45;
    ctx.fillStyle = 'rgba(8,24,14,0.9)'; ctx.strokeStyle = '#7dffb0'; ctx.lineWidth = 1.5 / z;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.rotate(b.repairActive ? Math.sin(this.time * 5) * 0.5 - 0.6 : -0.6);
    ctx.fillStyle = '#7dffb0';
    ctx.fillRect(-r * 0.12, -r * 0.15, r * 0.24, r * 0.75);
    ctx.beginPath(); ctx.arc(0, -r * 0.35, r * 0.32, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(8,24,14,1)';
    ctx.fillRect(-r * 0.1, -r * 0.7, r * 0.2, r * 0.32);
    ctx.restore();
  }

  drawStun(ctx, x, y, r) {
    ctx.strokeStyle = 'rgba(192,140,255,0.85)'; ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + this.time * 3;
      const rr = r + (i % 2 ? 4 : -1) + Math.sin(this.time * 30 + i) * 2;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.stroke();
  }

  // Construction site: dug plot and hazard tape, the finished structure as a blueprint,
  // the real building rising from the ground behind a glowing build line with welding sparks,
  // scaffolding around the unfinished part and a tower crane on larger sites.
  drawConstruction(ctx, b, P, base) {
    const M = BUILDING_MARGIN, W = b.w * TILE, H = b.h * TILE, p = Math.max(0, Math.min(1, b.progress));
    const t = this.time + b.id * 1.7;
    const sw = W + M.side * 2, sh = H + M.up + M.side;
    // 1. ground works: excavated plot with tyre tracks
    ctx.fillStyle = '#4f4130';
    ctx.beginPath(); ctx.roundRect(1, 1, W - 2, H - 2, 3); ctx.fill();
    ctx.strokeStyle = 'rgba(30,24,16,0.35)'; ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let k = 6; k < W - 3; k += 11) { ctx.moveTo(k, 3); ctx.lineTo(k + 3, H - 3); }
    ctx.stroke();
    // 2. blueprint of the finished building
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.drawImage(blueprintOf(base), -M.side, -M.up, sw, sh);
    ctx.restore();
    // 3. the real building, revealed from the ground up (the footprint's south edge is ground level)
    const top = -M.up, ground = H;
    const edge = ground - (ground - top) * p;
    if (p > 0.01) {
      ctx.save();
      ctx.beginPath(); ctx.rect(-M.side, edge, sw, ground + M.side - edge); ctx.clip();
      ctx.drawImage(base, -M.side, -M.up, sw, sh);
      ctx.restore();
    }
    // 4. scaffolding: poles around the unfinished part, ledgers on the front face
    if (p < 0.97) {
      const sTop = Math.max(-M.up * 0.5, edge - 3);
      ctx.save();
      ctx.beginPath(); ctx.rect(-6, -M.up, W + 12, sTop + M.up); ctx.clip();
      ctx.strokeStyle = 'rgba(200,204,206,0.7)'; ctx.lineWidth = 0.9;
      ctx.beginPath();
      const y0 = -M.up * 0.5;
      ctx.rect(-2.5, y0, W + 5, H - y0 + 0.5);
      for (let x = -2.5; x <= W + 2.5; x += 10) { ctx.moveTo(x, H - 1); ctx.lineTo(x, H - 13); }
      for (let y = H - 5; y > H - 14; y -= 4) { ctx.moveTo(-2.5, y); ctx.lineTo(W + 2.5, y); }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(160,164,166,0.55)'; ctx.lineWidth = 0.6;
      ctx.beginPath();
      for (let x = -2.5; x < W; x += 20) { ctx.moveTo(x, H - 1); ctx.lineTo(x + 10, H - 13); }
      ctx.stroke();
      ctx.fillStyle = 'rgba(220,224,226,0.85)';
      for (let x = -2.5; x <= W + 2.5; x += 10) { ctx.fillRect(x - 1, y0 - 1, 2, 2); ctx.fillRect(x - 1, H - 1, 2, 2); }
      ctx.restore();
    }
    // build line + welding sparks
    if (p < 1) {
      const g = ctx.createLinearGradient(0, edge - 4, 0, edge + 4);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, P.main); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.55 + Math.sin(t * 6) * 0.2;
      ctx.fillStyle = g; ctx.fillRect(1, edge - 4, W - 2, 8);
      for (let i = 0; i < 3; i++) {
        const ph = Math.floor(t * 7 + i * 13.7);
        const r = ((ph * 9301 + 49297) % 233280) / 233280;
        if (((ph * 7 + i) % 3) === 0) continue;
        const sx = 4 + r * (W - 8), sy = Math.min(H - 3, edge + (r - 0.5) * 3);
        const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, 5);
        sg.addColorStop(0, 'rgba(255,255,255,0.95)'); sg.addColorStop(0.35, 'rgba(255,200,120,0.8)'); sg.addColorStop(1, 'rgba(255,140,40,0)');
        ctx.globalAlpha = 1;
        ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sx, sy, 5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    // 5. hazard tape around the site
    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#d6b23a'; ctx.strokeRect(-1, -1, W + 2, H + 2);
    ctx.strokeStyle = '#1b1b1b'; ctx.setLineDash([4, 4]); ctx.lineDashOffset = -t * 6; ctx.strokeRect(-1, -1, W + 2, H + 2);
    ctx.restore();
    // 6. tower crane on bigger sites
    if (b.w >= 2) {
      const mx = W - 5, my = H - 5;
      const jib = Math.max(W, H) * 1.05, a = -Math.PI * 0.75 + Math.sin(t * 0.5) * 0.7;
      ctx.save();
      ctx.translate(mx, my - 18);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(4, 18, 6, 6);
      ctx.strokeStyle = '#d6b23a'; ctx.lineWidth = 1;
      ctx.strokeRect(-3, 0, 6, 18);
      ctx.beginPath(); for (let y = 0; y < 18; y += 3) { ctx.moveTo(-3, y); ctx.lineTo(3, y + 3); } ctx.stroke();
      ctx.rotate(a);
      ctx.fillStyle = '#d6b23a';
      ctx.fillRect(-10, -1.6, jib + 10, 3.2);
      ctx.fillStyle = '#7a7c7a'; ctx.fillRect(-12, -3, 6, 6); // counterweight
      ctx.strokeStyle = '#8a6a1a'; ctx.lineWidth = 0.6;
      ctx.beginPath(); for (let x = -8; x < jib; x += 4) { ctx.moveTo(x, -1.6); ctx.lineTo(x + 2, 1.6); } ctx.stroke();
      const hook = jib * (0.55 + Math.sin(t * 0.8) * 0.25);
      ctx.strokeStyle = 'rgba(30,30,30,0.8)'; ctx.beginPath(); ctx.moveTo(hook, 0); ctx.lineTo(hook, 6); ctx.stroke();
      ctx.fillStyle = '#6b5a3a'; ctx.fillRect(hook - 3, 6, 6, 3);
      ctx.fillStyle = '#2a2d2f'; ctx.fillRect(-2, -2, 4, 4); // cab
      ctx.restore();
    }
  }

  drawBuilding(ctx, b, selected) {
    const P = teamPalette(b.team === TEAM_PLAYER ? 0 : 1);
    ctx.save();
    ctx.translate(b.tx * TILE, b.ty * TILE);
    const base = buildingBase(b.def.shape, P, b.w, b.h), M = BUILDING_MARGIN;
    if (!b.built) {
      this.drawConstruction(ctx, b, P, base);
      ctx.restore();
    } else {
      if (b.flash > 0) { ctx.shadowColor = '#fff'; ctx.shadowBlur = 8; }
      ctx.drawImage(base, -M.side, -M.up, b.w * TILE + M.side * 2, b.h * TILE + M.up + M.side);
      ctx.shadowBlur = 0;
      drawBuildingTop(ctx, b.def.shape, P, b.w, b.h, this.time + b.id, b.angle);
      ctx.restore();
    }
    if (b.stunUntil > this.game.time) this.drawStun(ctx, b.x, b.y, b.radius);
    if (selected) {
      ctx.strokeStyle = 'rgba(120,255,170,0.9)'; ctx.lineWidth = 1.5 / this.cam.zoom + 0.5;
      ctx.strokeRect(b.tx * TILE - 2, b.ty * TILE - 2, b.w * TILE + 4, b.h * TILE + 4);
    }
    if (b.type === 'cc' || b.def.outpost) {
      ctx.fillStyle = 'rgba(255,120,100,0.8)'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
      ctx.fillText(b.type === 'cc' ? 'HEGEMONY COMMAND' : 'OUTPOST', b.x, b.ty * TILE - 12);
      ctx.textAlign = 'start';
    }
  }

  drawProjectile(ctx, p) {
    const col = p.team === TEAM_PLAYER ? '#b6f1ff' : '#ffb09f';
    if (p.type === 'shell') {
      ctx.fillStyle = '#ffe9a8';
      ctx.beginPath(); ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2); ctx.fill();
      return;
    }
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    // engine glow
    ctx.globalCompositeOperation = 'lighter';
    const gr = p.cruise ? 14 : 7, gl = ctx.createRadialGradient(-7, 0, 0, -7, 0, gr);
    gl.addColorStop(0, 'rgba(255,190,110,0.8)'); gl.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(-7, 0, gr, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    if (p.cruise) {
      ctx.fillStyle = '#d8d8d8'; ctx.fillRect(-9, -2.5, 16, 5);
      ctx.fillStyle = '#ff4d3a'; ctx.fillRect(5, -2.5, 4, 5);
      ctx.fillStyle = 'rgba(255,160,60,0.9)';
      ctx.beginPath(); ctx.moveTo(-9, -2); ctx.lineTo(-16 - Math.random() * 6, 0); ctx.lineTo(-9, 2); ctx.fill();
    } else {
      ctx.strokeStyle = col; ctx.lineWidth = p.type === 'missile' ? 3 : 2;
      ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(3, 0); ctx.stroke();
      ctx.fillStyle = '#ffd38a';
      ctx.beginPath(); ctx.arc(-6, 0, 1.8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  drawEffects(ctx, g, onScreen, airLayer) {
    for (const e of g.effects) {
      if (e.type === 'scorch' || (e.type !== 'jet' && !onScreen(e, 200))) continue;
      const k = e.t / e.life;
      if (airLayer !== (e.type === 'text' || e.type === 'jet' || !!e.air)) continue;
      ctx.globalCompositeOperation = e.type === 'smoke' || e.type === 'jet' || e.type === 'text' ? 'source-over' : 'lighter';
      switch (e.type) {
        case 'tracer': {
          if (e.team === TEAM_ENEMY && !g.visibleAt(e.x, e.y) && !g.visibleAt(e.x2, e.y2)) break;
          ctx.strokeStyle = e.team === TEAM_PLAYER ? `rgba(255,240,170,${1 - k})` : `rgba(255,150,110,${1 - k})`;
          ctx.lineWidth = e.heavy ? 2.2 : 1.2;
          ctx.beginPath();
          const sx = e.x + (e.x2 - e.x) * k * 0.5, sy = e.y + (e.y2 - e.y) * k * 0.5;
          ctx.moveTo(sx, sy); ctx.lineTo(e.x2, e.y2); ctx.stroke();
          ctx.fillStyle = `rgba(255,220,120,${1 - k})`;
          ctx.beginPath(); ctx.arc(e.x, e.y, e.heavy ? 3 : 2, 0, Math.PI * 2); ctx.fill();
          break;
        }
        case 'beam': {
          if (e.team === TEAM_ENEMY && !g.visibleAt(e.x, e.y) && !g.visibleAt(e.x2, e.y2)) break;
          const c = e.color || (e.heavy ? '200,235,255' : e.team === TEAM_PLAYER ? '90,230,255' : '255,90,140');
          ctx.strokeStyle = `rgba(${c},${0.35 * (1 - k)})`; ctx.lineWidth = e.heavy ? 9 : 5;
          ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x2, e.y2); ctx.stroke();
          ctx.strokeStyle = `rgba(255,255,255,${0.9 * (1 - k)})`; ctx.lineWidth = e.heavy ? 2.5 : 1.3;
          ctx.stroke();
          break;
        }
        case 'explosion': {
          const r = e.size * (0.4 + k * 0.9);
          const grd = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r);
          grd.addColorStop(0, `rgba(255,250,210,${1 - k})`);
          grd.addColorStop(0.35, `rgba(255,170,60,${0.9 * (1 - k)})`);
          grd.addColorStop(1, 'rgba(120,40,10,0)');
          ctx.fillStyle = grd;
          ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, Math.PI * 2); ctx.fill();
          if (k < 0.25) {
            // brief light flash that washes over the surroundings
            const fr = e.size * 2.6, fl = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, fr);
            fl.addColorStop(0, `rgba(255,200,120,${0.35 * (1 - k * 4)})`); fl.addColorStop(1, 'rgba(255,120,40,0)');
            ctx.fillStyle = fl; ctx.beginPath(); ctx.arc(e.x, e.y, fr, 0, Math.PI * 2); ctx.fill();
          }
          ctx.strokeStyle = `rgba(255,220,160,${0.5 * (1 - k)})`; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(e.x, e.y, e.size * (0.5 + k * 1.3), 0, Math.PI * 2); ctx.stroke();
          break;
        }
        case 'jet': {
          const x = e.x + (e.x2 - e.x) * k, y = e.y + (e.y2 - e.y) * k;
          const ang = Math.atan2(e.y2 - e.y, e.x2 - e.x);
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          ctx.beginPath(); ctx.ellipse(x + 30, y + 50, 26, 12, ang, 0, Math.PI * 2); ctx.fill();
          ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
          drawUnitShape(ctx, 'jet', teamPalette(0), this.time, 2.4);
          ctx.restore();
          break;
        }
        case 'smoke':
          ctx.fillStyle = `rgba(160,160,160,${0.28 * (1 - k)})`;
          ctx.beginPath(); ctx.arc(e.x, e.y, e.size * (1 + k * 2), 0, Math.PI * 2); ctx.fill();
          break;
        case 'spark':
          ctx.fillStyle = e.color; ctx.globalAlpha = 1 - k;
          ctx.fillRect(e.x - 1, e.y - 1 - k * 10, 2, 2);
          ctx.globalAlpha = 1;
          break;
        case 'ring':
          ctx.strokeStyle = e.color; ctx.globalAlpha = 1 - k; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(e.x, e.y, e.size * (0.3 + k), 0, Math.PI * 2); ctx.stroke();
          ctx.globalAlpha = 1;
          break;
        case 'text':
          ctx.fillStyle = e.color; ctx.globalAlpha = 1 - k;
          ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center';
          ctx.fillText(e.text, e.x, e.y - 10 - k * 24);
          ctx.textAlign = 'start'; ctx.globalAlpha = 1;
          break;
      }
    }
  }

  // Rare-earth deposits: glinting ore outcrops; a footprint outline invites a mine.
  drawSites(ctx, g) {
    for (const s of g.sites) {
      if (!g.explored[g.tileIdx(s.x, s.y)] || (s.mine && !s.mine.dead)) continue;
      const cx = s.x, cy = s.y;
      ctx.fillStyle = 'rgba(60,46,30,0.55)';
      ctx.beginPath(); ctx.ellipse(cx, cy + 2, 22, 16, 0, 0, Math.PI * 2); ctx.fill();
      for (let k = 0; k < 7; k++) {
        const a = k * 0.9 + 0.3, r = 4 + (k % 3) * 5;
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.75, h = 5 + (k % 2) * 4;
        ctx.fillStyle = '#3a3230';
        ctx.beginPath(); ctx.moveTo(x - 4, y + 3); ctx.lineTo(x, y - h); ctx.lineTo(x + 4, y + 3); ctx.closePath(); ctx.fill();
        ctx.fillStyle = k % 2 ? '#c9a2ff' : '#8fd8c8';
        ctx.globalAlpha = 0.75 + Math.sin(this.time * 2 + k) * 0.25;
        ctx.beginPath(); ctx.moveTo(x - 1.5, y + 1); ctx.lineTo(x, y - h + 2); ctx.lineTo(x + 1.5, y + 1); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = 'rgba(216,194,106,0.45)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
      ctx.strokeRect(s.tx * TILE - TILE / 2, s.ty * TILE - TILE / 2, TILE * 2, TILE * 2);
      ctx.setLineDash([]);
      if (s.home && !s.mine) {
        ctx.fillStyle = 'rgba(216,194,106,0.8)'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
        ctx.fillText('RARE EARTH', cx, cy - 22); ctx.textAlign = 'start';
      }
    }
  }

  // Uplink coverage: where drones may fly.
  drawUplinks(ctx, g) {
    const z = this.cam.zoom;
    ctx.save();
    ctx.fillStyle = 'rgba(127,209,255,0.05)';
    ctx.strokeStyle = 'rgba(127,209,255,0.55)';
    ctx.lineWidth = 1.5 / z; ctx.setLineDash([10 / z, 8 / z]);
    for (const n of g.uplinks) { ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    ctx.restore();
  }

  drawCrates(ctx, g, onScreen) {
    for (const c of g.crates) {
      if (c.taken || !onScreen(c) || !g.explored[g.tileIdx(c.x, c.y)]) continue;
      ctx.fillStyle = '#5a4a2a'; ctx.strokeStyle = '#ffd76a'; ctx.lineWidth = 1.5;
      ctx.fillRect(c.x - 7, c.y - 6, 14, 12); ctx.strokeRect(c.x - 7, c.y - 6, 14, 12);
      ctx.beginPath(); ctx.moveTo(c.x - 7, c.y); ctx.lineTo(c.x + 7, c.y); ctx.stroke();
      ctx.globalAlpha = 0.4 + 0.4 * Math.sin(this.time * 4);
      ctx.beginPath(); ctx.arc(c.x, c.y, 13, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  drawBuildArea(ctx, g, vx0, vy0, vx1, vy1) {
    ctx.fillStyle = 'rgba(57,213,255,0.05)';
    ctx.strokeStyle = 'rgba(57,213,255,0.18)';
    ctx.lineWidth = 1;
    for (const b of g.buildings) {
      if (b.team !== TEAM_PLAYER || b.dead || b.def.wall) continue;
      const r = (BUILD_RADIUS + b.w / 2) * TILE;
      if (b.x + r < vx0 || b.x - r > vx1 || b.y + r < vy0 || b.y - r > vy1) continue;
      ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  }

  drawAbilityAim(ctx, g) {
    const a = this.abilityAim, A = g.ability, z = this.cam.zoom;
    const ok = g.explored[g.tileIdx(a.x, a.y)];
    const col = ok ? teamPalette(0).main : '#ff4d3a';
    ctx.strokeStyle = col; ctx.lineWidth = 2 / z; ctx.setLineDash([8 / z, 6 / z]);
    ctx.fillStyle = ok ? teamPalette(0).glow.replace('0.35', '0.12') : 'rgba(255,77,58,0.12)';
    if (A.id === 'airstrike') {
      const ang = Math.atan2(a.y - g.hq.y, a.x - g.hq.x);
      ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(ang);
      ctx.fillRect(-A.length / 2, -A.radius, A.length, A.radius * 2);
      ctx.strokeRect(-A.length / 2, -A.radius, A.length, A.radius * 2);
      ctx.restore();
    } else {
      ctx.beginPath(); ctx.arc(a.x, a.y, A.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.fillStyle = col; ctx.font = `bold ${12 / z}px sans-serif`; ctx.textAlign = 'center';
    ctx.fillText(ok ? A.name.toUpperCase() : 'TARGET MUST BE SCOUTED', a.x, a.y - (A.id === 'airstrike' ? A.radius : A.radius) - 8 / z);
    ctx.textAlign = 'start';
  }

  drawPlacement(ctx, g) {
    const p = this.placing;
    if (p.tx == null) return;
    const def = BUILDINGS[p.type];
    const x = p.tx * TILE, y = p.ty * TILE;
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.translate(x, y);
    drawBuildingShape(ctx, def.shape, teamPalette(0), def.w, def.h, this.time, -Math.PI / 4);
    ctx.restore();
    ctx.fillStyle = p.ok ? 'rgba(95,220,122,0.25)' : 'rgba(255,77,58,0.3)';
    ctx.strokeStyle = p.ok ? '#5fdc7a' : '#ff4d3a';
    ctx.lineWidth = 2 / this.cam.zoom;
    ctx.fillRect(x, y, def.w * TILE, def.h * TILE);
    ctx.strokeRect(x, y, def.w * TILE, def.h * TILE);
    const w = def.weapon;
    const range = w ? w.range * (1 + (g.mods.range.all || 0) + (def.tags?.includes('defense') ? g.mods.range.defense || 0 : 0)) : def.jammer?.radius || def.repair?.radius || 0;
    if (range) {
      ctx.strokeStyle = 'rgba(57,213,255,0.4)'; ctx.setLineDash([5, 5]); ctx.lineWidth = 1 / this.cam.zoom;
      ctx.beginPath(); ctx.arc(x + def.w * TILE / 2, y + def.h * TILE / 2, range + (w ? def.w * TILE * 0.25 : 0), 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
    if (!p.ok && p.reason) {
      ctx.fillStyle = '#ff8a7a'; ctx.font = `${12 / this.cam.zoom}px sans-serif`; ctx.textAlign = 'center';
      ctx.fillText(p.reason, x + def.w * TILE / 2, y - 8 / this.cam.zoom);
      ctx.textAlign = 'start';
    }
  }

  // ---------------------------------------------------------------- minimap
  drawMinimap(mctx, size) {
    const g = this.game;
    if (!g) return;
    const s = size / MAP_W;
    mctx.imageSmoothingEnabled = true;
    mctx.clearRect(0, 0, size, size);
    mctx.drawImage(this.miniTerrain, 0, 0, size, size);
    mctx.drawImage(this.fogBig, 0, 0, size, size);
    const k = s / TILE;
    for (const site of g.sites) {
      if (!g.explored[g.tileIdx(site.x, site.y)]) continue;
      mctx.fillStyle = site.mine && !site.mine.dead ? teamPalette(0).main : '#d8c26a';
      mctx.beginPath(); mctx.arc(site.x * k, site.y * k, 2.5, 0, Math.PI * 2); mctx.fill();
    }
    for (const b of g.buildings) {
      if (b.dead || (b.team === TEAM_ENEMY && !b.discovered)) continue;
      mctx.fillStyle = b.team === TEAM_PLAYER ? teamPalette(0).main : '#ff4d3a';
      mctx.fillRect(b.tx * s, b.ty * s, Math.max(2, b.w * s), Math.max(2, b.h * s));
    }
    for (const u of g.units) {
      if (u.team === TEAM_ENEMY && !g.isVisible(u)) continue;
      mctx.fillStyle = u.team === TEAM_PLAYER ? teamPalette(0).light : '#ff7a66';
      mctx.fillRect(u.x * k - 1, u.y * k - 1, 2, 2);
    }
    for (const p of g.projectiles) {
      if (!p.cruise || p.dead) continue;
      mctx.fillStyle = Math.sin(this.time * 12) > 0 ? '#ffffff' : '#ff4d3a';
      mctx.fillRect(p.x * k - 1.5, p.y * k - 1.5, 3, 3);
    }
    for (const p of this.pings) {
      const kk = p.t % 1;
      mctx.strokeStyle = p.color; mctx.globalAlpha = 1 - kk; mctx.lineWidth = 1.5;
      mctx.beginPath(); mctx.arc(p.x * k, p.y * k, 3 + kk * 12, 0, Math.PI * 2); mctx.stroke();
      mctx.globalAlpha = 1;
    }
    // viewport
    const tl = this.toWorld(0, 0), br = this.toWorld(this.view.w, this.view.h);
    mctx.strokeStyle = 'rgba(255,255,255,0.8)'; mctx.lineWidth = 1;
    mctx.strokeRect(tl.x * k, tl.y * k, (br.x - tl.x) * k, (br.y - tl.y) * k);
  }
}

