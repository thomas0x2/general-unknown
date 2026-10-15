// Realistic top-down art for units and buildings.
// Units: camouflaged soldiers, tracked/wheeled vehicles, robots, drones and aircraft, facing +x.
// Buildings: pseudo-3D structures on concrete pads (light from the north-west), split into a static
// base (cached) and animated top parts (turrets, dishes, lights) drawn every frame.
import { TILE } from './data.js';

const TAU = Math.PI * 2;

// ------------------------------------------------------------------ colour
function hexRgb(h) {
  if (h.startsWith('rgb')) return h.match(/\d+/g).slice(0, 3).map(Number);
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const rgb = (c, a = 1) => (a === 1 ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${a})`);

// Military colours derived from a team palette: drab camouflage with the team colour as markings.
const camoCache = new Map();
export function camoOf(P) {
  let c = camoCache.get(P.main);
  if (c) return c;
  const t = hexRgb(P.main);
  const enemy = P.main === '#ff4d3a';
  const base = enemy ? [72, 70, 70] : [88, 96, 70];
  const dark = enemy ? [44, 40, 40] : [52, 60, 42];
  const light = enemy ? [104, 96, 92] : [128, 122, 92];
  c = {
    a: rgb(mix(base, t, enemy ? 0.06 : 0.14)),
    b: rgb(mix(dark, t, enemy ? 0.08 : 0.1)),
    c: rgb(mix(light, t, 0.06)),
    metal: rgb(mix([126, 132, 136], t, 0.05)),
    gun: '#2a2d2f',
    skin: enemy ? '#5a4c46' : '#6b5a48',
    glass: enemy ? ['#ff9a80', '#3a1410'] : ['#bfe8ff', '#16303e'],
    mark: P.main,
    markRgb: t,
    roof: rgb(mix(enemy ? [70, 64, 64] : [86, 90, 88], t, 0.05)),
    roof2: rgb(mix(enemy ? [56, 50, 50] : [70, 74, 72], t, 0.05)),
    wall: rgb(mix(enemy ? [48, 42, 42] : [58, 62, 60], t, 0.04)),
    concrete: '#7a7b76',
  };
  camoCache.set(P.main, c);
  return c;
}

// ------------------------------------------------------------------ helpers
function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); }
function poly(ctx, pts) { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); }

// deterministic pseudo random
function prng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// Fill the current path with camouflage (base + blotches), then outline it.
function camo(ctx, C, x, y, w, h, seed, outline = true) {
  ctx.save();
  ctx.fillStyle = C.a;
  ctx.fill();
  ctx.clip();
  const r = prng(seed);
  const n = 4 + Math.floor((w * h) / 90);
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = i % 3 === 0 ? C.c : C.b;
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.ellipse(x + r() * w, y + r() * h, 1.5 + r() * w * 0.22, 1 + r() * h * 0.18, r() * 3, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // light from the north-west
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, 'rgba(255,255,255,0.18)'); g.addColorStop(0.55, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,0.28)');
  ctx.fillStyle = g;
  ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  ctx.restore();
  if (outline) { ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 0.7; ctx.stroke(); }
}

function metalFill(ctx, C, x, y, w, h, base = C.metal) {
  ctx.fillStyle = base;
  ctx.fill();
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, 'rgba(255,255,255,0.32)'); g.addColorStop(0.5, 'rgba(255,255,255,0.02)'); g.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 0.6; ctx.stroke();
}

function light(ctx, x, y, r, color, on = true) {
  if (!on) { ctx.fillStyle = 'rgba(0,0,0,0.5)'; circle(ctx, x, y, r); ctx.fill(); return; }
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.6);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, color); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; circle(ctx, x, y, r * 2.6); ctx.fill();
}

function barrel(ctx, x0, x1, w, C, brake = true) {
  rr(ctx, x0, -w / 2, x1 - x0, w, w / 2);
  metalFill(ctx, C, x0, -w / 2, x1 - x0, w, C.gun);
  if (brake) { rr(ctx, x1 - w * 1.6, -w * 0.8, w * 1.6, w * 1.6, 0.6); metalFill(ctx, C, x1 - w * 1.6, -w * 0.8, w * 1.6, w * 1.6, '#3a3e40'); }
}

// rotor disc: translucent blur with faint blade streaks; frame rotates the streaks
function rotor(ctx, x, y, r, frame, blades = 2) {
  const g = ctx.createRadialGradient(x, y, r * 0.15, x, y, r);
  g.addColorStop(0, 'rgba(220,230,235,0.32)'); g.addColorStop(0.85, 'rgba(200,215,225,0.16)'); g.addColorStop(1, 'rgba(200,215,225,0.04)');
  ctx.fillStyle = g; circle(ctx, x, y, r); ctx.fill();
  ctx.strokeStyle = 'rgba(20,24,26,0.45)'; ctx.lineWidth = Math.max(0.8, r * 0.12);
  for (let i = 0; i < blades; i++) {
    const a = frame * 0.55 + (i * TAU) / blades;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * r * 0.95, y + Math.sin(a) * r * 0.95); ctx.stroke();
  }
  ctx.fillStyle = '#1c1f21'; circle(ctx, x, y, Math.max(0.8, r * 0.14)); ctx.fill();
}

// ------------------------------------------------------------------ soldiers
// One soldier at (x, y) facing +x. kind changes the weapon/kit.
function soldier(ctx, C, x, y, kind = 'rifle') {
  // backpack
  rr(ctx, x - 5.4, y - 2.4, 3, 4.8, 1); ctx.fillStyle = C.b; ctx.fill();
  if (kind === 'medic') { ctx.fillStyle = '#e8e8e8'; ctx.fillRect(x - 5.2, y - 1.6, 2.6, 3.2); ctx.fillStyle = '#d23a3a'; ctx.fillRect(x - 4.3, y - 1.2, 0.8, 2.4); ctx.fillRect(x - 5, y - 0.4, 2.2, 0.8); }
  if (kind === 'hacker') { ctx.strokeStyle = '#2a2d2f'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(x - 4.5, y - 2); ctx.lineTo(x - 7.5, y - 5.5); ctx.stroke(); light(ctx, x - 7.5, y - 5.5, 0.6, '#c08cff'); }
  // shoulders / torso
  ctx.beginPath(); ctx.ellipse(x - 0.6, y, 2.8, 4.2, 0, 0, TAU);
  camo(ctx, C, x - 3.4, y - 4.2, 5.6, 8.4, (x * 13 + y * 7) | 0);
  // arms forward to the weapon
  ctx.strokeStyle = C.a; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, y - 2.6); ctx.lineTo(x + 3, y + 0.4); ctx.moveTo(x, y + 2.8); ctx.lineTo(x + 2.4, y + 1.6); ctx.stroke();
  ctx.lineCap = 'butt';
  // weapon
  const W = {
    rifle: [1.2, 9, 1.1], sniper: [1.0, 13, 0.9], at: [-2, 9, 2.4], aa: [-2.5, 9.5, 2.3], gl: [1, 7.5, 1.8], shotgun: [1, 7.5, 1.4],
    medic: [1.2, 6.5, 0.9], hacker: [1.2, 5.5, 0.9], mortar: [1, 5, 0.8],
  }[kind] || [1.2, 9, 1.1];
  ctx.fillStyle = kind === 'at' ? '#4a5038' : kind === 'aa' ? '#4c4f44' : C.gun;
  rr(ctx, x + W[0], y + 0.9 - W[2] / 2, W[1], W[2], W[2] / 2); ctx.fill();
  if (kind === 'aa') { ctx.fillStyle = '#9fe0a0'; circle(ctx, x + W[0] + W[1], y + 0.9, 0.9); ctx.fill(); }
  if (kind === 'at') { ctx.fillStyle = '#2a2d2f'; ctx.fillRect(x + W[0] + W[1] - 1, y - 0.4, 1.2, 2.6); }
  // gloves
  ctx.fillStyle = C.skin; circle(ctx, x + 3, y + 0.6, 0.8); ctx.fill();
  // helmet with highlight
  const hg = ctx.createRadialGradient(x - 0.6, y - 0.8, 0.3, x, y, 2.8);
  hg.addColorStop(0, C.c); hg.addColorStop(1, C.b);
  ctx.fillStyle = hg; circle(ctx, x, y, 2.5); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 0.5; ctx.stroke();
  // IFF patch in team colour
  ctx.fillStyle = C.mark; ctx.fillRect(x - 2.2, y + 2.3, 1.8, 1.1);
}

function exo(ctx, C) {
  // armoured powered suit, heavier silhouette
  rr(ctx, -7, -3.5, 4, 7, 1.5); ctx.fillStyle = '#34383a'; ctx.fill();
  ctx.beginPath(); ctx.ellipse(-0.5, 0, 4.2, 6.5, 0, 0, TAU); camo(ctx, C, -4.7, -6.5, 8.4, 13, 91);
  for (const s of [-1, 1]) { rr(ctx, -4, s * 6.5 - 2.2, 6, 4.4, 1.6); metalFill(ctx, C, -4, s * 6.5 - 2.2, 6, 4.4); }
  // rotary gun
  rr(ctx, 1, 2.5, 10, 3, 1.2); metalFill(ctx, C, 1, 2.5, 10, 3, C.gun);
  ctx.fillStyle = '#111'; for (const dy of [3.2, 4, 4.8]) ctx.fillRect(10.5, dy - 0.25, 1.4, 0.5);
  const hg = ctx.createRadialGradient(-0.6, -0.8, 0.3, 0, 0, 3.4);
  hg.addColorStop(0, '#9aa0a2'); hg.addColorStop(1, '#3a3f42');
  ctx.fillStyle = hg; circle(ctx, 0, 0, 3.1); ctx.fill();
  ctx.fillStyle = '#7fd1ff'; ctx.fillRect(1.4, -1.2, 1.2, 2.4); // visor
  ctx.fillStyle = C.mark; ctx.fillRect(-3.5, 5.2, 2.6, 1.4);
}

// ------------------------------------------------------------------ vehicles
function tracks(ctx, L, W, tw) {
  for (const s of [-1, 1]) {
    const y = s > 0 ? W - tw : -W;
    rr(ctx, -L, y, L * 2, tw, 1.4); ctx.fillStyle = '#1e211f'; ctx.fill();
    ctx.strokeStyle = 'rgba(120,120,110,0.35)'; ctx.lineWidth = 0.6;
    ctx.beginPath();
    for (let x = -L + 1.5; x < L; x += 2.2) { ctx.moveTo(x, y + 0.6); ctx.lineTo(x, y + tw - 0.6); }
    ctx.stroke();
  }
}

function wheels(ctx, L, W, n, r = 2.4) {
  ctx.fillStyle = '#1b1d1c';
  for (let i = 0; i < n; i++) {
    const x = -L + 3 + (i * (L * 2 - 6)) / Math.max(1, n - 1);
    for (const s of [-1, 1]) { rr(ctx, x - r, s * W - 1.4, r * 2, 2.8, 1.2); ctx.fill(); }
  }
}

function hull(ctx, C, L, W, seed, bevel = 4) {
  poly(ctx, [[-L, -W], [L - bevel, -W], [L, -W + bevel * 0.7], [L, W - bevel * 0.7], [L - bevel, W], [-L, W]]);
  camo(ctx, C, -L, -W, L * 2, W * 2, seed);
  // engine deck grille at the rear
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 0.6;
  ctx.beginPath();
  for (let y = -W + 2.5; y < W - 2; y += 1.6) { ctx.moveTo(-L + 1.5, y); ctx.lineTo(-L + 5, y); }
  ctx.stroke();
  // headlights
  ctx.fillStyle = 'rgba(255,240,200,0.8)'; ctx.fillRect(L - 1.4, -W + 1.5, 1, 1.4); ctx.fillRect(L - 1.4, W - 2.9, 1, 1.4);
}

function turret(ctx, C, r, seed, mark = true) {
  poly(ctx, [[-r * 1.15, -r * 0.8], [r * 0.55, -r], [r * 1.05, -r * 0.4], [r * 1.05, r * 0.4], [r * 0.55, r], [-r * 1.15, r * 0.8]]);
  camo(ctx, C, -r * 1.15, -r, r * 2.2, r * 2, seed);
  ctx.fillStyle = C.b; circle(ctx, -r * 0.3, -r * 0.35, r * 0.32); ctx.fill(); // commander hatch
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 0.5; ctx.stroke();
  if (mark) { ctx.fillStyle = C.mark; ctx.fillRect(-r * 1.1, -r * 0.35, r * 0.28, r * 0.7); }
}

function legs(ctx, C, pts, thick) {
  ctx.lineCap = 'round';
  for (const [x0, y0, x1, y1, x2, y2] of pts) {
    ctx.strokeStyle = '#26292a'; ctx.lineWidth = thick + 1;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.strokeStyle = C.metal; ctx.lineWidth = thick - 0.4;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.fillStyle = '#1d2021'; circle(ctx, x2, y2, thick * 0.7); ctx.fill();
  }
  ctx.lineCap = 'butt';
}

// ------------------------------------------------------------------ units
// t: animation phase (frames for rotors and legs). Everything faces +x at the origin.
export function drawUnitArt(ctx, shape, P, t = 0) {
  const C = camoOf(P);
  const f = Math.floor(t * 8) % 4; // animation frame
  const step = [0, 1, 0, -1][f];
  ctx.save();
  ctx.lineJoin = 'round';
  switch (shape) {
    case 'squad': soldier(ctx, C, 3, 0); soldier(ctx, C, -3.5, -5.5); soldier(ctx, C, -3.5, 5.5); break;
    case 'squad_at': soldier(ctx, C, 3, -3.5, 'at'); soldier(ctx, C, -3, 4); break;
    case 'squad_aa': soldier(ctx, C, 3, -3.5, 'aa'); soldier(ctx, C, -3, 4); break;
    case 'squad_gl': soldier(ctx, C, 3, -3.5, 'gl'); soldier(ctx, C, -3, 4); soldier(ctx, C, -6, -7); break;
    case 'squad_shock': soldier(ctx, C, 4, -4, 'shotgun'); soldier(ctx, C, 4, 4, 'shotgun'); soldier(ctx, C, -3, 0, 'shotgun'); break;
    case 'medic': soldier(ctx, C, 2, -3.5, 'medic'); soldier(ctx, C, -3, 4, 'medic'); break;
    case 'hacker': soldier(ctx, C, 2, -3.5, 'hacker'); soldier(ctx, C, -3, 4, 'hacker'); break;
    case 'sniper':
      soldier(ctx, C, 0, -2, 'sniper');
      // ghillie suit fringe
      ctx.strokeStyle = 'rgba(70,82,52,0.7)'; ctx.lineWidth = 0.7;
      for (let i = 0; i < 9; i++) { const a = i * 0.7; ctx.beginPath(); ctx.moveTo(-1 + Math.cos(a) * 3, -2 + Math.sin(a) * 4); ctx.lineTo(-1 + Math.cos(a) * 5.5, -2 + Math.sin(a) * 6); ctx.stroke(); }
      soldier(ctx, C, -4, 5);
      break;
    case 'mortar': {
      ctx.fillStyle = '#3c3f3a'; circle(ctx, 6, 0, 3.4); ctx.fill();
      ctx.fillStyle = '#2a2d2f'; rr(ctx, 4, -1.1, 6, 2.2, 1); ctx.fill();
      ctx.strokeStyle = '#2a2d2f'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(10.5, -3); ctx.moveTo(8, 0); ctx.lineTo(10.5, 3); ctx.stroke();
      soldier(ctx, C, -2, -4.5, 'mortar'); soldier(ctx, C, -3, 5, 'mortar');
      break;
    }
    case 'exo': exo(ctx, C); break;
    case 'dog': {
      const k = step * 2;
      legs(ctx, C, [[4, -2.5, 6 + k, -5, 7 + k, -7], [4, 2.5, 6 - k, 5, 7 - k, 7], [-4, -2.5, -6 - k, -5, -5 - k, -7], [-4, 2.5, -6 + k, 5, -5 + k, 7]], 1.6);
      rr(ctx, -6.5, -3.2, 13, 6.4, 2.6); camo(ctx, C, -6.5, -3.2, 13, 6.4, 33);
      rr(ctx, 6, -2.2, 4, 4.4, 1.4); metalFill(ctx, C, 6, -2.2, 4, 4.4, '#2e3133');
      ctx.fillStyle = '#7fd1ff'; ctx.fillRect(9.2, -1.4, 0.8, 2.8);
      barrel(ctx, -1, 9, 1.4, C, false);
      ctx.fillStyle = C.mark; ctx.fillRect(-5.5, -0.8, 2, 1.6);
      break;
    }
    case 'ugv': {
      wheels(ctx, 12, 9, 3, 2.8);
      hull(ctx, C, 12, 7.5, 21, 3);
      ctx.fillStyle = '#2e3133'; rr(ctx, -9, -5, 6, 10, 1); ctx.fill(); // battery pack
      turret(ctx, C, 4.2, 22);
      barrel(ctx, 3, 17, 2, C);
      ctx.fillStyle = '#1a1c1d'; circle(ctx, 1.5, -3.6, 1.1); ctx.fill(); // sensor
      break;
    }
    case 'rover': {
      wheels(ctx, 11, 9, 3, 2.6);
      hull(ctx, C, 11, 7, 41, 3);
      const g = ctx.createRadialGradient(-1, -1.5, 0.5, 0, 0, 5.5);
      g.addColorStop(0, '#e6f0f4'); g.addColorStop(1, '#6d7a80');
      ctx.fillStyle = g; circle(ctx, 0, 0, 5); ctx.fill();
      ctx.fillStyle = '#20262a'; rr(ctx, 2, -1.6, 7, 3.2, 1.2); ctx.fill();
      light(ctx, 8.6, 0, 1, '#7fd1ff');
      break;
    }
    case 'crawler': {
      tracks(ctx, 11, 9.5, 3.2);
      hull(ctx, C, 10, 6.5, 51, 2);
      // crane arm
      ctx.strokeStyle = '#d6b23a'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-2, 0); ctx.lineTo(7, -5); ctx.lineTo(14, -3); ctx.stroke(); ctx.lineCap = 'butt';
      ctx.fillStyle = '#2a2d2f'; circle(ctx, 14, -3, 1.6); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(-7, -1.6, 4.5, 3.2); ctx.fillStyle = '#2fbf6a'; ctx.fillRect(-5.5, -1.6, 1.4, 3.2); ctx.fillRect(-7, -0.7, 4.5, 1.4);
      break;
    }
    case 'ifv': {
      tracks(ctx, 13, 9.5, 3);
      hull(ctx, C, 13, 7.2, 61);
      ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 0.6; rr(ctx, -12, -3.5, 4, 7, 0.5); ctx.stroke(); // rear ramp
      turret(ctx, C, 4.6, 62);
      barrel(ctx, 3, 18, 1.8, C);
      break;
    }
    case 'tank': {
      tracks(ctx, 16, 11.5, 3.6);
      hull(ctx, C, 16, 8.6, 71, 5);
      turret(ctx, C, 7, 72);
      barrel(ctx, 6, 27, 2.8, C);
      ctx.fillStyle = '#2b2e30'; circle(ctx, -1, 3.2, 1.6); ctx.fill(); // loader hatch
      break;
    }
    case 'juggernaut': {
      tracks(ctx, 21, 16, 5);
      hull(ctx, C, 20, 12, 81, 6);
      for (const s of [-1, 1]) {
        ctx.save(); ctx.translate(1, s * 5.5);
        turret(ctx, C, 5.5, 82 + s, s > 0);
        barrel(ctx, 5, 26, 2.6, C);
        ctx.restore();
      }
      break;
    }
    case 'mech': {
      const k = step * 4;
      for (const s of [-1, 1]) { rr(ctx, -6 + k * s, s * 10 - 3.5, 12, 7, 2); metalFill(ctx, C, -6 + k * s, s * 10 - 3.5, 12, 7, '#3a3e40'); }
      ctx.beginPath(); ctx.ellipse(0, 0, 9, 10.5, 0, 0, TAU); camo(ctx, C, -9, -10.5, 18, 21, 91);
      for (const s of [-1, 1]) {
        rr(ctx, -3, s * 10 - 3, 14, 6, 2); camo(ctx, C, -3, s * 10 - 3, 14, 6, 92 + s);
        ctx.save(); ctx.translate(0, s * 10); barrel(ctx, 8, 21, 2.6, C); ctx.restore();
      }
      ctx.fillStyle = '#20262a'; rr(ctx, 2, -3, 6, 6, 2); ctx.fill();
      light(ctx, 6.5, 0, 1, '#7fd1ff');
      ctx.fillStyle = C.mark; ctx.fillRect(-7, -2, 2.4, 4);
      break;
    }
    case 'walker': {
      const k = step * 4;
      legs(ctx, C, [[7, -6, 14 + k, -14, 18 + k, -19], [7, 6, 14 - k, 14, 18 - k, 19], [-7, -6, -14 - k, -14, -18 - k, -19], [-7, 6, -14 + k, 14, -18 + k, 19]], 3.4);
      rr(ctx, -14, -11, 28, 22, 6); camo(ctx, C, -14, -11, 28, 22, 101);
      turret(ctx, C, 8, 102);
      ctx.save(); ctx.translate(0, -3); barrel(ctx, 6, 30, 3, C); ctx.restore();
      ctx.save(); ctx.translate(0, 3); barrel(ctx, 6, 30, 3, C); ctx.restore();
      break;
    }
    // ---- drones
    case 'quad': case 'wasp': case 'fpv': case 'emp': {
      const s = shape === 'fpv' || shape === 'emp' ? 0.8 : 1;
      const arm = 5.5 * s;
      ctx.strokeStyle = '#25282a'; ctx.lineWidth = 1.6 * s;
      ctx.beginPath(); ctx.moveTo(-arm, -arm); ctx.lineTo(arm, arm); ctx.moveTo(-arm, arm); ctx.lineTo(arm, -arm); ctx.stroke();
      for (const [x, y] of [[-arm, -arm], [arm, arm], [-arm, arm], [arm, -arm]]) rotor(ctx, x, y, 3.8 * s, f + x);
      rr(ctx, -3.2 * s, -2.4 * s, 6.4 * s, 4.8 * s, 1.4);
      camo(ctx, C, -3.2 * s, -2.4 * s, 6.4 * s, 4.8 * s, 111);
      if (shape === 'quad') { ctx.fillStyle = '#121416'; circle(ctx, 3.4, 0, 1.4); ctx.fill(); light(ctx, 3.8, -0.3, 0.4, '#bfe8ff'); }
      if (shape === 'wasp') barrel(ctx, 1, 8, 1.1, C, false);
      if (shape === 'fpv') { rr(ctx, 2, -1.3, 5.5, 2.6, 1.2); ctx.fillStyle = '#5a5e3a'; ctx.fill(); ctx.fillStyle = '#c8a040'; ctx.fillRect(6.4, -1.3, 1.1, 2.6); }
      if (shape === 'emp') { ctx.strokeStyle = '#c08cff'; ctx.lineWidth = 0.8; circle(ctx, 0, 0, 2.6); ctx.stroke(); light(ctx, 0, 0, 1, '#c08cff'); }
      light(ctx, -2.6 * s, 0, 0.6, C.mark);
      break;
    }
    case 'stinger': {
      poly(ctx, [[9, 0], [-4, -4.5], [-2.5, 0], [-4, 4.5]]);
      metalFill(ctx, C, -4, -4.5, 13, 9, '#4a5054');
      ctx.fillStyle = '#c84a3a'; poly(ctx, [[9, 0], [6, -1.2], [6, 1.2]]); ctx.fill();
      light(ctx, -3.5, 0, 0.8, C.mark);
      break;
    }
    case 'bomber': {
      const arms = [];
      for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; arms.push([Math.cos(a) * 11, Math.sin(a) * 11]); }
      ctx.strokeStyle = '#25282a'; ctx.lineWidth = 1.8;
      ctx.beginPath(); for (const [x, y] of arms) { ctx.moveTo(0, 0); ctx.lineTo(x, y); } ctx.stroke();
      arms.forEach(([x, y], i) => rotor(ctx, x, y, 4, f + i));
      circle(ctx, 0, 0, 5.5); camo(ctx, C, -5.5, -5.5, 11, 11, 121);
      ctx.fillStyle = '#4a4e36'; for (const y of [-2.2, 2.2]) { rr(ctx, -3, y - 1.1, 6, 2.2, 1.1); ctx.fill(); }
      light(ctx, -4, 0, 0.7, C.mark);
      break;
    }
    case 'wing': {
      // MALE-class fixed wing UAV: long thin wing, V-tail, pusher prop
      rr(ctx, -9, -1.8, 18, 3.6, 1.8); camo(ctx, C, -9, -1.8, 18, 3.6, 131);
      poly(ctx, [[1, -1.5], [-1, -13], [-3.5, -13], [-3, -1.5]]); camo(ctx, C, -3.5, -13, 4.5, 11.5, 132);
      poly(ctx, [[1, 1.5], [-1, 13], [-3.5, 13], [-3, 1.5]]); camo(ctx, C, -3.5, 1.5, 4.5, 11.5, 133);
      poly(ctx, [[-8, -1], [-11, -5], [-12, -5], [-10.5, -1]]); ctx.fillStyle = C.b; ctx.fill();
      poly(ctx, [[-8, 1], [-11, 5], [-12, 5], [-10.5, 1]]); ctx.fill();
      rotor(ctx, -10, 0, 3, f);
      ctx.fillStyle = '#c9b37a'; rr(ctx, -2.5, -8, 4, 1.4, 0.7); ctx.fill(); rr(ctx, -2.5, 6.6, 4, 1.4, 0.7); ctx.fill();
      ctx.fillStyle = '#16191b'; circle(ctx, 7.5, 0, 1.2); ctx.fill();
      ctx.fillStyle = C.mark; ctx.fillRect(-2.6, -11.5, 1.2, 2.4);
      break;
    }
    case 'carrier': {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; ctx.lineTo(Math.cos(a) * 12, Math.sin(a) * 12); }
      ctx.closePath(); camo(ctx, C, -12, -12, 24, 24, 141);
      for (const [x, y] of [[-12, -11], [12, -11], [-12, 11], [12, 11]]) rotor(ctx, x, y, 6.5, f + x, 3);
      ctx.fillStyle = '#1c1f21'; for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.78; circle(ctx, Math.cos(a) * 5, Math.sin(a) * 5, 2); ctx.fill(); }
      light(ctx, 0, 0, 1.2, C.mark);
      break;
    }
    // ---- aircraft
    case 'heli': {
      // attack helicopter: tandem cockpit, stub wings with pods, tail boom
      rr(ctx, -24, -1.2, 16, 2.4, 1.2); camo(ctx, C, -24, -1.2, 16, 2.4, 151);
      poly(ctx, [[-23, -1], [-26, -4], [-27, -4], [-25.5, 0], [-27, 4], [-26, 4], [-23, 1]]); ctx.fillStyle = C.b; ctx.fill();
      rotor(ctx, -24, 2.6, 3, f, 2);
      ctx.beginPath(); ctx.ellipse(0, 0, 11, 4.2, 0, 0, TAU); camo(ctx, C, -11, -4.2, 22, 8.4, 152);
      rr(ctx, -3, -8.5, 5, 17, 1.5); camo(ctx, C, -3, -8.5, 5, 17, 153);
      ctx.fillStyle = '#3c4032'; for (const y of [-7.5, 7.5]) { rr(ctx, -4, y - 1.6, 7, 3.2, 1.4); ctx.fill(); }
      const cg = ctx.createLinearGradient(4, -2.5, 10, 2.5); cg.addColorStop(0, C.glass[0]); cg.addColorStop(1, C.glass[1]);
      ctx.fillStyle = cg; ctx.beginPath(); ctx.ellipse(6, 0, 4.5, 2.2, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = C.mark; ctx.fillRect(-9, -0.9, 3, 1.8);
      rotor(ctx, 0, 0, 17, f, 4);
      break;
    }
    case 'gunship': {
      rr(ctx, -15, -4, 30, 8, 4); camo(ctx, C, -15, -4, 30, 8, 161);
      rr(ctx, -4, -15, 6, 30, 2); camo(ctx, C, -4, -15, 6, 30, 162);
      poly(ctx, [[-14, -2], [-19, -7], [-20, -7], [-17, 0], [-20, 7], [-19, 7], [-14, 2]]); ctx.fillStyle = C.b; ctx.fill();
      const cg = ctx.createLinearGradient(9, -3, 15, 3); cg.addColorStop(0, C.glass[0]); cg.addColorStop(1, C.glass[1]);
      ctx.fillStyle = cg; ctx.beginPath(); ctx.ellipse(11, 0, 3.5, 2.6, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = C.mark; ctx.fillRect(-11, -1, 3, 2);
      rotor(ctx, -1, -15, 9, f, 3); rotor(ctx, -1, 15, 9, f + 1, 3);
      break;
    }
    case 'jet': {
      poly(ctx, [[17, 0], [6, -3], [-2, -4], [-5, -13], [-10, -13], [-9, -4], [-14, -5], [-15, -2], [-15, 2], [-14, 5], [-9, 4], [-10, 13], [-5, 13], [-2, 4], [6, 3]]);
      metalFill(ctx, C, -15, -13, 32, 26, '#6e767a');
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(-4, -4); ctx.lineTo(-8, -11); ctx.moveTo(-4, 4); ctx.lineTo(-8, 11); ctx.stroke();
      const cg = ctx.createLinearGradient(5, -1.5, 11, 1.5); cg.addColorStop(0, '#f2d58a'); cg.addColorStop(1, '#4a3a18');
      ctx.fillStyle = cg; ctx.beginPath(); ctx.ellipse(7.5, 0, 4, 1.6, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2a2d2f'; rr(ctx, -16, -2.4, 3, 1.8, 0.6); ctx.fill(); rr(ctx, -16, 0.6, 3, 1.8, 0.6); ctx.fill();
      ctx.fillStyle = C.mark; ctx.fillRect(-8, -11, 2, 2); ctx.fillRect(-8, 9, 2, 2);
      break;
    }
    case 'awacs': {
      poly(ctx, [[3, -2.5], [-3, -19], [-8, -19], [-6, -2.5]]); metalFill(ctx, C, -8, -19, 11, 16.5, '#7a8084');
      poly(ctx, [[3, 2.5], [-3, 19], [-8, 19], [-6, 2.5]]); metalFill(ctx, C, -8, 2.5, 11, 16.5, '#7a8084');
      rr(ctx, -16, -3, 33, 6, 3); metalFill(ctx, C, -16, -3, 33, 6, '#8a9094');
      poly(ctx, [[-13, -1], [-17, -7], [-18, -7], [-16, 0], [-18, 7], [-17, 7], [-13, 1]]); ctx.fillStyle = '#6a7074'; ctx.fill();
      const dg = ctx.createRadialGradient(-5, -2, 1, -4, 0, 7.5); dg.addColorStop(0, '#e6e9ea'); dg.addColorStop(1, '#4e5458');
      ctx.fillStyle = dg; circle(ctx, -4, 0, 7); ctx.fill();
      ctx.strokeStyle = C.mark; ctx.lineWidth = 1.2; circle(ctx, -4, 0, 4.5); ctx.stroke();
      ctx.fillStyle = '#16303e'; ctx.fillRect(13, -1.4, 2.4, 2.8);
      break;
    }
    default:
      ctx.fillStyle = C.a; circle(ctx, 0, 0, 6); ctx.fill();
  }
  ctx.restore();
}

export const ANIMATED_UNITS = new Set(['dog', 'mech', 'walker', 'quad', 'wasp', 'fpv', 'emp', 'bomber', 'wing', 'carrier', 'heli', 'gunship']);
// half-extent of each sprite (px) so caches are big enough for barrels and rotors
const UNIT_EXTENT = { tank: 30, walker: 32, juggernaut: 30, mech: 24, heli: 30, gunship: 26, awacs: 22, jet: 20, carrier: 22, bomber: 17, ugv: 20, ifv: 22, wing: 16 };

const spriteCache = new Map();
const SPRITE_SCALE = 3;
// Pre-rendered unit sprite (4 animation frames for animated shapes).
export function unitSprite(shape, P, frame = 0) {
  const fr = ANIMATED_UNITS.has(shape) ? frame & 3 : 0;
  const key = `${shape}|${P.main}|${fr}`;
  let c = spriteCache.get(key);
  if (c) return c;
  const ext = UNIT_EXTENT[shape] || 16;
  c = document.createElement('canvas');
  c.width = c.height = Math.ceil(ext * 2 * SPRITE_SCALE);
  const ctx = c.getContext('2d');
  ctx.translate(c.width / 2, c.height / 2);
  ctx.scale(SPRITE_SCALE, SPRITE_SCALE);
  drawUnitArt(ctx, shape, P, fr / 8);
  c.ext = ext;
  spriteCache.set(key, c);
  return c;
}

// ------------------------------------------------------------------ buildings
// Pseudo-3D box: footprint (x, y, w, d) on the ground, h tall. Roof is lifted by h * LIFT.
const LIFT = 0.55;
function box(ctx, C, x, y, w, d, h, roof = C.roof, wall = C.wall, opts = {}) {
  const up = h * LIFT;
  // cast shadow to the south-east
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  poly(ctx, [[x + w, y - up], [x + w + h * 0.45, y - up + h * 0.3], [x + w + h * 0.45, y + d + h * 0.3], [x + h * 0.45, y + d + h * 0.3], [x, y + d]]);
  ctx.fill();
  // south wall
  ctx.fillStyle = wall;
  ctx.fillRect(x, y + d - up, w, up);
  const wg = ctx.createLinearGradient(0, y + d - up, 0, y + d);
  wg.addColorStop(0, 'rgba(0,0,0,0.05)'); wg.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = wg; ctx.fillRect(x, y + d - up, w, up);
  if (opts.windows && up > 5) {
    ctx.fillStyle = 'rgba(180,220,255,0.35)';
    for (let wx = x + 3; wx < x + w - 4; wx += 6) ctx.fillRect(wx, y + d - up + up * 0.3, 3, Math.max(1.5, up * 0.3));
  }
  // roof
  ctx.fillStyle = roof;
  ctx.fillRect(x, y - up, w, d);
  const rg = ctx.createLinearGradient(x, y - up, x + w, y - up + d);
  rg.addColorStop(0, 'rgba(255,255,255,0.14)'); rg.addColorStop(1, 'rgba(0,0,0,0.16)');
  ctx.fillStyle = rg; ctx.fillRect(x, y - up, w, d);
  ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 0.8; ctx.strokeRect(x + 0.4, y - up + 0.4, w - 0.8, d - 0.8);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.moveTo(x + 1, y - up + d - 1); ctx.lineTo(x + 1, y - up + 1); ctx.lineTo(x + w - 1, y - up + 1); ctx.stroke();
  return y - up; // roof top
}

// cylinder (tank, silo, tower) seen from above with visible south side
function cylinder(ctx, cx, cy, r, h, top, side) {
  const up = h * LIFT;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(cx + h * 0.35, cy + h * 0.25, r, r * 0.95, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = side;
  ctx.fillRect(cx - r, cy - up, r * 2, up);
  ctx.beginPath(); ctx.ellipse(cx, cy, r, r * 0.95, 0, 0, Math.PI); ctx.fill();
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - up - r * 0.35, r * 0.1, cx, cy - up, r);
  g.addColorStop(0, '#dcdcd6'); g.addColorStop(0.15, top); g.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = top; ctx.beginPath(); ctx.ellipse(cx, cy - up, r, r * 0.95, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 0.7; ctx.stroke();
}

function pad(ctx, W, H, color = '#6f716c') {
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  rr(ctx, 1, 2, W - 1, H - 1, 3); ctx.fill();
  ctx.fillStyle = color;
  rr(ctx, 1, 1, W - 2, H - 2, 3); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 0.6;
  ctx.beginPath();
  for (let x = 8; x < W - 2; x += 8) { ctx.moveTo(x, 2); ctx.lineTo(x, H - 2); }
  for (let y = 8; y < H - 2; y += 8) { ctx.moveTo(2, y); ctx.lineTo(W - 2, y); }
  ctx.stroke();
  const r = prng(W * 31 + H);
  for (let i = 0; i < (W * H) / 40; i++) { ctx.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)'; ctx.fillRect(2 + r() * (W - 4), 2 + r() * (H - 4), 1.5, 1.5); }
}

function sandbags(ctx, cx, cy, rx, ry, gapA = null) {
  const n = Math.round((rx + ry) * 0.45);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    if (gapA != null && Math.abs(((a - gapA + Math.PI * 3) % TAU) - Math.PI) < 0.45) continue;
    const x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry;
    ctx.save(); ctx.translate(x, y); ctx.rotate(a + Math.PI / 2);
    rr(ctx, -3, -1.6, 6, 3.2, 1.4);
    ctx.fillStyle = i % 2 ? '#8a7d5a' : '#7c7050'; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.5; ctx.stroke();
    ctx.restore();
  }
}

function stripe(ctx, C, x, y, w, h) { ctx.fillStyle = C.mark; ctx.fillRect(x, y, w, h); ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(x, y, w, Math.min(h, 0.8)); }

function hazard(ctx, x, y, w, h) {
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = '#d6b23a'; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#1d1d1d'; ctx.lineWidth = 2;
  ctx.beginPath(); for (let k = x - h; k < x + w; k += 5) { ctx.moveTo(k, y + h); ctx.lineTo(k + h, y); } ctx.stroke();
  ctx.restore();
}

function hvac(ctx, x, y, s, t = 0, spin = false) {
  rr(ctx, x, y, s, s, 1); ctx.fillStyle = '#9a9e9c'; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 0.5; ctx.stroke();
  ctx.fillStyle = '#2a2d2f'; circle(ctx, x + s / 2, y + s / 2, s * 0.36); ctx.fill();
  ctx.strokeStyle = '#6e7270'; ctx.lineWidth = 0.6;
  const a = spin ? t * 9 : 0.4;
  ctx.beginPath(); for (let i = 0; i < 3; i++) { const b = a + (i * TAU) / 3; ctx.moveTo(x + s / 2, y + s / 2); ctx.lineTo(x + s / 2 + Math.cos(b) * s * 0.33, y + s / 2 + Math.sin(b) * s * 0.33); } ctx.stroke();
}

function dish(ctx, x, y, r, a) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 0.5, 0, 0, r);
  g.addColorStop(0, '#f2f2ee'); g.addColorStop(1, '#8e928f');
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, r * 0.55, r, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 0.5; ctx.stroke();
  ctx.strokeStyle = '#555'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(r * 0.9, 0); ctx.stroke();
  ctx.restore();
}

// Rotating weapon heads used by turrets and launchers (drawn every frame).
function gunHead(ctx, C, cx, cy, angle, kind, s = 1) {
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(angle); ctx.scale(s, s);
  switch (kind) {
    case 'mg':
      rr(ctx, -6, -5, 11, 10, 3); camo(ctx, C, -6, -5, 11, 10, 7);
      barrel(ctx, 3, 18, 1.8, C);
      ctx.fillStyle = '#121416'; circle(ctx, 1, -3, 1.3); ctx.fill();
      break;
    case 'twin':
      rr(ctx, -7, -6, 13, 12, 3); camo(ctx, C, -7, -6, 13, 12, 9);
      ctx.save(); ctx.translate(0, -2.8); barrel(ctx, 4, 21, 2, C); ctx.restore();
      ctx.save(); ctx.translate(0, 2.8); barrel(ctx, 4, 21, 2, C); ctx.restore();
      break;
    case 'cannon':
      rr(ctx, -9, -8, 17, 16, 4); camo(ctx, C, -9, -8, 17, 16, 11);
      barrel(ctx, 6, 28, 3, C);
      break;
    case 'laser': {
      const g = ctx.createRadialGradient(-2, -2, 1, 0, 0, 8);
      g.addColorStop(0, '#eef4f6'); g.addColorStop(1, '#5e6a70');
      ctx.fillStyle = g; circle(ctx, 0, 0, 7.5); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 0.6; ctx.stroke();
      rr(ctx, 2, -2.2, 11, 4.4, 1.5); metalFill(ctx, C, 2, -2.2, 11, 4.4, '#2e3438');
      light(ctx, 13, 0, 1.4, C.mark);
      break;
    }
    case 'sam':
      rr(ctx, -8, -9, 16, 18, 2); metalFill(ctx, C, -8, -9, 16, 18, C.b);
      for (const y of [-6.5, -2.2, 2.2, 6.5]) { rr(ctx, -6, y - 1.8, 15, 3.6, 1.6); metalFill(ctx, C, -6, y - 1.8, 15, 3.6, '#4a5048'); ctx.fillStyle = '#1a1c1d'; circle(ctx, 9, y, 1.2); ctx.fill(); }
      break;
    case 'mlrs':
      rr(ctx, -12, -10, 22, 20, 2); camo(ctx, C, -12, -10, 22, 20, 13);
      ctx.fillStyle = '#1c1f20';
      for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) { circle(ctx, -7 + c * 5, -6 + r * 6, 1.8); ctx.fill(); }
      break;
    case 'rail':
      rr(ctx, -10, -9, 18, 18, 4); camo(ctx, C, -10, -9, 18, 18, 15);
      for (const y of [-3.5, 2]) { rr(ctx, -4, y, 36, 2.2, 0.8); metalFill(ctx, C, -4, y, 36, 2.2, '#8e979c'); }
      ctx.fillStyle = 'rgba(127,209,255,0.6)'; ctx.fillRect(0, -1.3, 28, 2.6);
      break;
  }
  ctx.restore();
}

// Each building: h = wall height, base = static parts (cached), top = animated parts.
const B = {
  hq: {
    base(ctx, C, W, H) {
      pad(ctx, W, H, '#74766f');
      const ry = box(ctx, C, 8, 14, W - 16, H - 22, 22, C.roof, C.wall, { windows: true });
      // helipad marking and parapet details
      ctx.strokeStyle = 'rgba(240,240,230,0.7)'; ctx.lineWidth = 1.2;
      circle(ctx, W * 0.36, ry + (H - 22) * 0.5, 9); ctx.stroke();
      ctx.fillStyle = 'rgba(240,240,230,0.75)'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('H', W * 0.36, ry + (H - 22) * 0.5 + 0.5); ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
      hvac(ctx, W - 26, ry + 3, 7); hvac(ctx, W - 26, ry + 12, 7);
      stripe(ctx, C, 8, ry, W - 16, 2.4);
      // antenna mast
      ctx.strokeStyle = '#c8ccc8'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(14, ry + 4); ctx.lineTo(14, ry - 12); ctx.stroke();
    },
    top(ctx, C, W, H, t, angle) {
      const ry = 14 - 22 * LIFT;
      // time machine skylight
      const cx = W * 0.62, cy = ry + (H - 22) * 0.55;
      const pulse = 0.6 + Math.sin(t * 2.2) * 0.25;
      const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, 13);
      g.addColorStop(0, `rgba(255,255,255,${pulse})`); g.addColorStop(0.4, C.mark); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; circle(ctx, cx, cy, 13); ctx.fill();
      ctx.strokeStyle = 'rgba(220,240,255,0.6)'; ctx.lineWidth = 0.8;
      for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.arc(cx, cy, 6 + i * 4, t * (1 + i) + i, t * (1 + i) + i + 2.2); ctx.stroke(); }
      dish(ctx, W - 12, ry + 6, 5, -0.6 + Math.sin(t * 0.3) * 0.3);
      light(ctx, 14, ry - 12, 1.1, '#ff3a2a', Math.floor(t * 1.5) % 2 === 0);
      gunHead(ctx, C, W - 10, H - 6, angle, 'twin', 0.75);
    },
  },
  barracks: {
    base(ctx, C, W, H) {
      pad(ctx, W, H);
      for (const [y, d] of [[6, 22], [36, 22]]) {
        const ry = box(ctx, C, 6, y, W - 12, d - 6, 12, C.roof, C.wall, { windows: true });
        // gabled roof: two shades split by the ridge
        ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(6, ry + (d - 6) / 2, W - 12, (d - 6) / 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.beginPath(); ctx.moveTo(6, ry + (d - 6) / 2); ctx.lineTo(W - 6, ry + (d - 6) / 2); ctx.stroke();
        stripe(ctx, C, W - 12, ry + 2, 3, 3);
      }
      sandbags(ctx, W - 8, H - 7, 5, 3);
    },
  },
  factory: {
    base(ctx, C, W, H) {
      pad(ctx, W, H);
      const d = H - 16, ry = box(ctx, C, 4, 10, W - 8, d, 20, C.roof2, C.wall);
      // sawtooth roof with skylights
      for (let x = 6; x < W - 8; x += 9) {
        ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x, ry + 1, 4, d - 2);
        ctx.fillStyle = 'rgba(140,200,230,0.35)'; ctx.fillRect(x + 4, ry + 1, 2, d - 2);
      }
      hazard(ctx, W / 2 - 10, 10 + d - 20 * LIFT + 1, 20, 20 * LIFT - 2);
      stripe(ctx, C, 4, ry, W - 8, 2);
    },
  },
  dronebay: {
    base(ctx, C, W, H) {
      pad(ctx, W, H, '#5d5f5b');
      // landing pad
      ctx.strokeStyle = 'rgba(240,220,120,0.8)'; ctx.lineWidth = 1.2;
      circle(ctx, W * 0.62, H * 0.55, Math.min(W, H) * 0.3); ctx.stroke();
      ctx.strokeStyle = 'rgba(240,240,230,0.7)'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(W * 0.62 - 6, H * 0.55 - 6); ctx.lineTo(W * 0.62 + 6, H * 0.55 + 6); ctx.moveTo(W * 0.62 - 6, H * 0.55 + 6); ctx.lineTo(W * 0.62 + 6, H * 0.55 - 6); ctx.stroke();
      // arched hangar
      const ry = box(ctx, C, 3, 6, 18, H - 12, 14, C.roof, C.wall);
      for (let i = 0; i < 5; i++) { ctx.fillStyle = `rgba(255,255,255,${0.04 + (i % 2) * 0.06})`; ctx.fillRect(3 + i * 3.6, ry, 3.6, H - 12); }
      stripe(ctx, C, 3, ry, 2.5, H - 12);
    },
    top(ctx, C, W, H, t) {
      for (const [x, y] of [[W * 0.62 - 13, H * 0.55 - 13], [W * 0.62 + 13, H * 0.55 - 13], [W * 0.62 - 13, H * 0.55 + 13], [W * 0.62 + 13, H * 0.55 + 13]]) light(ctx, x, y, 0.9, C.mark, Math.floor(t * 2) % 2 === 0);
    },
  },
  mine: {
    base(ctx, C, W, H) {
      // open pit with terraces
      ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(W * 0.42, H * 0.55, W * 0.38, H * 0.36, 0, 0, TAU); ctx.fill();
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = ['#6b5a44', '#5a4a38', '#4a3c2e', '#3a2f24'][i];
        ctx.beginPath(); ctx.ellipse(W * 0.42, H * 0.55, W * (0.36 - i * 0.075), H * (0.34 - i * 0.07), 0, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = '#c9a2ff'; for (let i = 0; i < 4; i++) { ctx.globalAlpha = 0.7; circle(ctx, W * 0.36 + i * 4, H * 0.56 + (i % 2) * 3, 1.2); ctx.fill(); } ctx.globalAlpha = 1;
      // ore pile and conveyor
      ctx.fillStyle = '#8a7a5a'; ctx.beginPath(); ctx.ellipse(W - 10, H - 9, 8, 6, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#2b2d2c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(W * 0.5, H * 0.5); ctx.lineTo(W - 12, H - 12); ctx.stroke();
      ctx.strokeStyle = '#6b6e6c'; ctx.lineWidth = 1; ctx.setLineDash([2, 2]); ctx.stroke(); ctx.setLineDash([]);
      // headframe and shed
      box(ctx, C, W - 22, 3, 18, 12, 10, C.roof, C.wall);
      stripe(ctx, C, W - 22, 3 - 10 * LIFT, 18, 2);
    },
    top(ctx, C, W, H, t) {
      ctx.save(); ctx.translate(W * 0.42, H * 0.55);
      ctx.strokeStyle = '#d6b23a'; ctx.lineWidth = 2;
      const a = Math.sin(t * 1.5) * 0.4;
      ctx.beginPath(); ctx.moveTo(-4, 4); ctx.lineTo(-4 + Math.cos(a) * 9, 4 + Math.sin(a) * 9 - 6); ctx.stroke(); // excavator arm
      ctx.fillStyle = '#c99a2a'; rr(ctx, -9, 1, 9, 6, 1); ctx.fill();
      ctx.restore();
    },
  },
  refinery: {
    base(ctx, C, W, H) {
      pad(ctx, W, H);
      box(ctx, C, 4, H - 22, 26, 16, 12, C.roof, C.wall, { windows: true });
      cylinder(ctx, W - 16, 18, 10, 18, '#b9bbb6', '#7e807c');
      cylinder(ctx, 16, 14, 8, 14, '#c2c4bf', '#80827e');
      ctx.strokeStyle = '#8c8f8a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(24, 14); ctx.lineTo(W - 26, 16); ctx.moveTo(W - 16, 28); ctx.lineTo(W - 16, H - 12); ctx.lineTo(30, H - 12); ctx.stroke();
      stripe(ctx, C, W - 22, 18 - 18 * LIFT - 1, 12, 2);
      // flare stack
      ctx.fillStyle = '#5a5c5a'; ctx.fillRect(W - 7, H - 20, 3, 14);
    },
    top(ctx, C, W, H, t) {
      const fl = 0.7 + Math.sin(t * 13) * 0.3;
      const g = ctx.createRadialGradient(W - 5.5, H - 22, 0, W - 5.5, H - 22, 5 * fl);
      g.addColorStop(0, 'rgba(255,240,180,1)'); g.addColorStop(0.5, 'rgba(255,140,40,0.8)'); g.addColorStop(1, 'rgba(255,80,20,0)');
      ctx.fillStyle = g; circle(ctx, W - 5.5, H - 22, 5 * fl); ctx.fill();
    },
  },
  fob: {
    base(ctx, C, W, H) {
      ctx.fillStyle = '#6a5f48'; rr(ctx, 2, 2, W - 4, H - 4, 8); ctx.fill();
      const r = prng(5);
      for (let i = 0; i < 40; i++) { ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fillRect(4 + r() * (W - 8), 4 + r() * (H - 8), 2, 2); }
      // tents
      for (const [x, y] of [[8, 9], [8, 30]]) {
        box(ctx, C, x, y, 18, 12, 8, C.a, C.b);
        ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.moveTo(x, y + 6 - 8 * LIFT); ctx.lineTo(x + 18, y + 6 - 8 * LIFT); ctx.stroke();
      }
      sandbags(ctx, W / 2, H / 2, W / 2 - 4, H / 2 - 4, Math.PI / 2);
      ctx.strokeStyle = '#c8ccc8'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(W - 14, 14); ctx.lineTo(W - 14, 0); ctx.stroke();
    },
    top(ctx, C, W, H, t, angle) {
      // flag in team colour
      const wv = Math.sin(t * 6) * 1.5;
      ctx.fillStyle = C.mark;
      poly(ctx, [[W - 14, 0], [W - 4, 1 + wv], [W - 5, 4 + wv], [W - 14, 4]]); ctx.fill();
      gunHead(ctx, C, W - 16, H - 16, angle, 'mg', 0.8);
    },
  },
  logistics: {
    base(ctx, C, W, H) {
      pad(ctx, W, H, '#6c6c66');
      const cols = ['#7a3f2e', '#2e5a74', '#4d5f38', '#8a8a82', '#7a6a3a', '#3f4f5e'];
      let k = 0;
      for (const y of [6, 22, 38]) for (const x of [5, 34]) {
        const ry = box(ctx, C, x, y, 25, 10, 8 + (k % 2) * 6, cols[k % cols.length], 'rgba(0,0,0,0.5)');
        ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.5; ctx.beginPath();
        for (let cx = x + 2; cx < x + 25; cx += 2) { ctx.moveTo(cx, ry + 0.5); ctx.lineTo(cx, ry + 9.5); }
        ctx.stroke();
        k++;
      }
      stripe(ctx, C, 3, H - 5, W - 6, 2);
    },
  },
  datacenter: {
    base(ctx, C, W, H) {
      pad(ctx, W, H);
      const ry = box(ctx, C, 5, 8, W - 10, H - 14, 14, '#a6aaa8', '#6c706e');
      stripe(ctx, C, 5, ry, W - 10, 2);
    },
    top(ctx, C, W, H, t) {
      const ry = 8 - 14 * LIFT;
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) hvac(ctx, 9 + i * 16, ry + 6 + j * 17, 11, t + i + j, true);
      light(ctx, W - 8, ry + 4, 0.8, '#5fdc7a', Math.floor(t * 3) % 2 === 0);
    },
  },
  uplink: {
    base(ctx, C, W, H) {
      ctx.fillStyle = '#6f716c'; rr(ctx, 4, 6, W - 8, H - 8, 2); ctx.fill();
      // lattice tower drawn rising north (pseudo-3D)
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; poly(ctx, [[W / 2, H - 6], [W / 2 + 16, H + 6], [W / 2 + 18, H + 4], [W / 2 + 2, H - 8]]); ctx.fill();
      ctx.strokeStyle = '#9aa0a0'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(W / 2 - 5, H - 6); ctx.lineTo(W / 2, -22); ctx.lineTo(W / 2 + 5, H - 6);
      for (let y = H - 6; y > -18; y -= 6) { const k = (H - 6 - y) / (H + 16); const hw = 5 * (1 - k); ctx.moveTo(W / 2 - hw, y); ctx.lineTo(W / 2 + hw, y - 6); }
      ctx.stroke();
      ctx.fillStyle = '#d8dad6';
      for (const y of [-6, 2]) { ctx.fillRect(W / 2 - 7, y, 3, 5); ctx.fillRect(W / 2 + 4, y - 2, 3, 5); }
      stripe(ctx, C, W / 2 - 3, H - 9, 6, 2);
    },
    top(ctx, C, W, H, t) {
      light(ctx, W / 2, -22, 1.2, '#ff3a2a', Math.floor(t * 1.2) % 2 === 0);
      const k = (t * 0.8) % 1;
      ctx.strokeStyle = `rgba(127,209,255,${0.5 * (1 - k)})`; ctx.lineWidth = 1;
      circle(ctx, W / 2, -20, 4 + k * 14); ctx.stroke();
    },
  },
  lab: {
    base(ctx, C, W, H) {
      pad(ctx, W, H);
      const ry = box(ctx, C, 6, 10, W - 12, H - 16, 14, '#3e5a6a', C.wall, { windows: true });
      ctx.strokeStyle = 'rgba(200,230,255,0.35)'; ctx.lineWidth = 0.6; ctx.beginPath();
      for (let x = 10; x < W - 8; x += 6) { ctx.moveTo(x, ry + 1); ctx.lineTo(x, ry + H - 17); }
      ctx.stroke();
      stripe(ctx, C, 6, ry, W - 12, 2);
    },
    top(ctx, C, W, H, t) {
      const ry = 10 - 14 * LIFT;
      const g = ctx.createRadialGradient(W / 2, ry + (H - 16) / 2, 1, W / 2, ry + (H - 16) / 2, 10);
      g.addColorStop(0, `rgba(220,190,255,${0.7 + Math.sin(t * 3) * 0.2})`); g.addColorStop(1, 'rgba(180,140,255,0)');
      ctx.fillStyle = g; circle(ctx, W / 2, ry + (H - 16) / 2, 10); ctx.fill();
    },
  },
  radar: {
    base(ctx, C, W, H) {
      pad(ctx, W, H);
      box(ctx, C, 6, H - 20, 20, 14, 10, C.roof, C.wall);
      cylinder(ctx, W * 0.62, H * 0.42, 9, 10, '#a8aba6', '#6e706c');
      stripe(ctx, C, 6, H - 20 - 10 * LIFT, 20, 2);
    },
    top(ctx, C, W, H, t) {
      ctx.save(); ctx.translate(W * 0.62, H * 0.42 - 10 * LIFT); ctx.rotate(t * 1.6);
      rr(ctx, -2, -15, 4, 30, 1.5); metalFill(ctx, C, -2, -15, 4, 30, '#d8dad6');
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.5; ctx.beginPath(); for (let y = -13; y < 15; y += 3) { ctx.moveTo(-2, y); ctx.lineTo(2, y); } ctx.stroke();
      ctx.restore();
    },
  },
  repair: {
    base(ctx, C, W, H) {
      pad(ctx, W, H);
      const ry = box(ctx, C, 4, 6, W - 8, 24, 16, C.roof, C.wall);
      hazard(ctx, 14, 30 - 16 * LIFT + 1, W - 28, 16 * LIFT - 2);
      ctx.fillStyle = '#fff'; ctx.fillRect(W / 2 - 6, ry + 6, 12, 4); ctx.fillRect(W / 2 - 2, ry + 2, 4, 12);
      ctx.fillStyle = '#2fbf6a'; ctx.fillRect(W / 2 - 5, ry + 7, 10, 2); ctx.fillRect(W / 2 - 1, ry + 3, 2, 10);
      ctx.strokeStyle = '#d6b23a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(6, H - 6); ctx.lineTo(W - 6, H - 6); ctx.stroke();
    },
  },
  hospital: {
    base(ctx, C, W, H) {
      pad(ctx, W, H);
      const ry = box(ctx, C, 5, 8, W - 10, H - 14, 14, '#d6d8d2', '#8a8c88', { windows: true });
      ctx.fillStyle = '#d23a3a'; ctx.fillRect(W / 2 - 3, ry + 6, 6, 18); ctx.fillRect(W / 2 - 9, ry + 12, 18, 6);
      stripe(ctx, C, 5, ry, W - 10, 2);
    },
  },
  helipad: {
    base(ctx, C, W, H) {
      ctx.fillStyle = '#4c4e4b'; circle(ctx, W / 2, H / 2, W / 2 - 2); ctx.fill();
      ctx.strokeStyle = 'rgba(240,220,120,0.85)'; ctx.lineWidth = 1.5; circle(ctx, W / 2, H / 2, W / 2 - 6); ctx.stroke();
      ctx.fillStyle = 'rgba(240,240,230,0.85)'; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('H', W / 2, H / 2 + 1); ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
      stripe(ctx, C, W / 2 - 8, H - 7, 16, 2);
    },
    top(ctx, C, W, H, t) {
      for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; light(ctx, W / 2 + Math.cos(a) * (W / 2 - 4), H / 2 + Math.sin(a) * (H / 2 - 4), 0.7, C.mark, (Math.floor(t * 4) + i) % 4 === 0); }
    },
  },
  swarmhive: {
    base(ctx, C, W, H) {
      pad(ctx, W, H, '#5a5850');
      const hex = (x, y, r) => { ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + Math.PI / 6; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } ctx.closePath(); };
      for (const [x, y] of [[0, 0], [-14, -8], [14, -8], [-14, 8], [14, 8], [0, -16], [0, 16]]) {
        hex(W / 2 + x, H / 2 + y, 7.5); ctx.fillStyle = '#7a6a3a'; ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 0.8; ctx.stroke();
        hex(W / 2 + x, H / 2 + y, 4); ctx.fillStyle = '#2a2620'; ctx.fill();
      }
      stripe(ctx, C, 3, H - 5, W - 6, 2);
    },
    top(ctx, C, W, H, t) { light(ctx, W / 2, H / 2, 1.4, '#ffd34a', Math.sin(t * 3) > 0); },
  },
  cyberops: {
    base(ctx, C, W, H) {
      pad(ctx, W, H);
      const ry = box(ctx, C, 5, 9, W - 10, H - 15, 16, '#2e3236', '#202326');
      for (let i = 0; i < 4; i++) dish(ctx, 12 + i * 12, ry + 6, 3.5, -0.8);
      stripe(ctx, C, 5, ry, W - 10, 2);
    },
    top(ctx, C, W, H, t) {
      const ry = 9 - 16 * LIFT;
      for (let i = 0; i < 5; i++) for (let k = 0; k < 3; k++) {
        ctx.fillStyle = Math.sin(t * 7 + i * 3 + k * 5) > 0.3 ? '#c08cff' : 'rgba(192,140,255,0.2)';
        ctx.fillRect(10 + i * 10, ry + 16 + k * 7, 6, 1.5);
      }
    },
  },
  foundry: {
    base(ctx, C, W, H) {
      pad(ctx, W, H);
      const ry = box(ctx, C, 4, 12, W - 22, H - 18, 16, C.roof2, C.wall);
      stripe(ctx, C, 4, ry, W - 22, 2);
      cylinder(ctx, W - 10, 18, 5, 26, '#5e605d', '#3e403e');
      cylinder(ctx, W - 10, H - 14, 5, 20, '#5e605d', '#3e403e');
    },
    top(ctx, C, W, H, t) {
      const ry = 12 - 16 * LIFT;
      const g = ctx.createLinearGradient(0, ry + 10, 0, ry + 20);
      g.addColorStop(0, 'rgba(255,150,50,0)'); g.addColorStop(0.5, `rgba(255,150,50,${0.6 + Math.sin(t * 5) * 0.25})`); g.addColorStop(1, 'rgba(255,150,50,0)');
      ctx.fillStyle = g; ctx.fillRect(10, ry + 10, W - 34, 10);
      for (const y of [18 - 26 * LIFT, H - 14 - 20 * LIFT]) { ctx.fillStyle = 'rgba(180,180,180,0.25)'; circle(ctx, W - 10 + Math.sin(t + y) * 2, y - ((t * 8) % 8), 4); ctx.fill(); }
    },
  },
  airbase: {
    base(ctx, C, W, H) {
      ctx.fillStyle = '#3e403f'; rr(ctx, 1, H * 0.35, W - 2, H * 0.3, 2); ctx.fill();
      ctx.strokeStyle = 'rgba(240,240,230,0.7)'; ctx.lineWidth = 1.5; ctx.setLineDash([7, 6]);
      ctx.beginPath(); ctx.moveTo(6, H / 2); ctx.lineTo(W - 6, H / 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(240,240,230,0.7)'; for (let i = 0; i < 4; i++) { ctx.fillRect(4, H * 0.38 + i * 4, 6, 2); ctx.fillRect(W - 10, H * 0.38 + i * 4, 6, 2); }
      for (const [x, y] of [[6, 4], [W / 2 + 4, H * 0.68]]) {
        const ry = box(ctx, C, x, y, W / 2 - 10, H * 0.26, 14, C.roof, C.wall);
        for (let i = 0; i < 6; i++) { ctx.fillStyle = `rgba(255,255,255,${0.03 + (i % 2) * 0.07})`; ctx.fillRect(x, ry + i * (H * 0.26) / 6, W / 2 - 10, (H * 0.26) / 6); }
        stripe(ctx, C, x, ry, 3, H * 0.26);
      }
    },
    top(ctx, C, W, H, t) { for (let x = 8; x < W - 6; x += 12) { light(ctx, x, H * 0.36, 0.6, '#ffd76a', (Math.floor(t * 3) + x) % 3 === 0); light(ctx, x, H * 0.64, 0.6, '#ffd76a', (Math.floor(t * 3) + x) % 3 === 0); } },
  },
  barrier: {
    base(ctx, C, W, H) {
      for (const [x, y] of [[2, 2], [16, 2], [2, 16], [16, 16]]) {
        const ry = box(ctx, C, x, y, 14, 14, 10, '#9a8a62', '#6e6448');
        ctx.strokeStyle = 'rgba(60,60,55,0.6)'; ctx.lineWidth = 0.5; ctx.beginPath();
        for (let k = 2; k < 14; k += 3) { ctx.moveTo(x + k, ry); ctx.lineTo(x + k, ry + 14); ctx.moveTo(x, ry + k); ctx.lineTo(x + 14, ry + k); }
        ctx.stroke();
      }
      stripe(ctx, C, 3, 2 - 10 * LIFT, 3, 3);
    },
  },
  turret: {
    base(ctx, C, W, H) {
      ctx.fillStyle = '#5c5e5a'; circle(ctx, W / 2, H / 2, W / 2 - 3); ctx.fill();
      sandbags(ctx, W / 2, H / 2, W / 2 - 3, H / 2 - 3);
    },
    top(ctx, C, W, H, t, angle) { gunHead(ctx, C, W / 2, H / 2, angle, 'mg', 0.75); },
  },
  bunker: {
    base(ctx, C, W, H) {
      ctx.fillStyle = '#5a5244'; rr(ctx, 1, 1, W - 2, H - 2, 12); ctx.fill(); // earth berm
      box(ctx, C, 8, 10, W - 16, H - 16, 12, '#8a8b86', '#5a5b57');
      ctx.fillStyle = '#121416'; ctx.fillRect(14, H - 6 - 12 * LIFT * 0.5, W - 28, 2);
      stripe(ctx, C, 8, 10 - 12 * LIFT, 4, H - 16);
    },
    top(ctx, C, W, H, t, angle) { gunHead(ctx, C, W / 2, H / 2 - 6, angle, 'cannon', 0.75); },
  },
  bastion: {
    base(ctx, C, W, H) {
      ctx.fillStyle = '#4e4a40'; ctx.beginPath();
      for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + Math.PI / 8; ctx.lineTo(W / 2 + Math.cos(a) * 31, H / 2 + Math.sin(a) * 31); }
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + Math.PI / 8; ctx.lineTo(W / 2 + Math.cos(a) * 26, H / 2 - 6 + Math.sin(a) * 26); }
      ctx.closePath(); ctx.fillStyle = '#8a8b86'; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1; ctx.stroke();
      stripe(ctx, C, W / 2 - 10, H / 2 + 16, 20, 2);
    },
    top(ctx, C, W, H, t, angle) { gunHead(ctx, C, W / 2, H / 2 - 6, angle, 'twin', 1.1); },
  },
  laser: {
    base(ctx, C, W, H) {
      ctx.fillStyle = '#6a6c68'; rr(ctx, 3, 3, W - 6, H - 6, 4); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.8; ctx.stroke();
      stripe(ctx, C, 4, H - 6, W - 8, 1.6);
    },
    top(ctx, C, W, H, t, angle) { gunHead(ctx, C, W / 2, H / 2, angle, 'laser', W > 40 ? 1.4 : 0.85); },
  },
  sam: {
    base(ctx, C, W, H) {
      ctx.fillStyle = '#6a6c68'; rr(ctx, 3, 3, W - 6, H - 6, 4); ctx.fill();
      if (W > 40) { box(ctx, C, 4, H - 14, 16, 10, 8, C.roof, C.wall); }
      stripe(ctx, C, 4, H - 6, W - 8, 1.6);
    },
    top(ctx, C, W, H, t, angle) { gunHead(ctx, C, W / 2, H / 2, angle, 'sam', W > 40 ? 1.3 : 0.85); },
  },
  launcher: {
    base(ctx, C, W, H) {
      pad(ctx, W, H, '#5f615d');
      box(ctx, C, 4, H - 14, 18, 10, 8, C.roof, C.wall);
      stripe(ctx, C, 4, H - 14 - 8 * LIFT, 18, 2);
    },
    top(ctx, C, W, H, t, angle) { gunHead(ctx, C, W / 2 + 4, H / 2 - 4, angle, 'mlrs', 1); },
  },
  jammer: {
    base(ctx, C, W, H) {
      ctx.fillStyle = '#6a6c68'; rr(ctx, 4, 4, W - 8, H - 8, 3); ctx.fill();
      ctx.strokeStyle = '#a0a4a2'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(W / 2, H - 6); ctx.lineTo(W / 2, -10); ctx.stroke();
      ctx.fillStyle = '#d8dad6'; ctx.fillRect(W / 2 - 6, -6, 12, 3); ctx.fillRect(W / 2 - 4, 1, 8, 3);
      stripe(ctx, C, 6, H - 8, W - 12, 2);
    },
    top(ctx, C, W, H, t) {
      const k = (t * 1.5) % 1;
      ctx.strokeStyle = `rgba(180,140,255,${0.8 * (1 - k)})`; ctx.lineWidth = 1.2;
      circle(ctx, W / 2, -6, 3 + k * 14); ctx.stroke();
    },
  },
  disruptor: {
    base(ctx, C, W, H) {
      ctx.fillStyle = '#6a6c68'; circle(ctx, W / 2, H / 2, W / 2 - 3); ctx.fill();
      cylinder(ctx, W / 2, H / 2 + 2, 6, 16, '#5a5e62', '#3a3e42');
      stripe(ctx, C, W / 2 - 4, H - 6, 8, 2);
    },
    top(ctx, C, W, H, t) {
      const y = H / 2 + 2 - 16 * LIFT;
      light(ctx, W / 2, y, 2, '#c08cff', true);
      ctx.strokeStyle = 'rgba(192,140,255,0.6)'; ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) { const a = t * 3 + (i * TAU) / 3; ctx.beginPath(); ctx.arc(W / 2, y, 8, a, a + 0.8); ctx.stroke(); }
    },
  },
  railgun: {
    base(ctx, C, W, H) {
      pad(ctx, W, H, '#5f615d');
      for (const x of [6, W - 16]) box(ctx, C, x, H - 14, 10, 8, 8, '#3e4a52', '#2a3238');
      stripe(ctx, C, 6, H - 14 - 8 * LIFT, 10, 2);
    },
    top(ctx, C, W, H, t, angle) { gunHead(ctx, C, W / 2, H / 2 - 4, angle, 'rail', 1); },
  },
  silo: {
    base(ctx, C, W, H) {
      pad(ctx, W, H, '#6a6b66');
      ctx.fillStyle = '#4a4b47'; circle(ctx, W / 2, H / 2, 22); ctx.fill();
      ctx.fillStyle = '#7a7b76'; circle(ctx, W / 2, H / 2, 18); ctx.fill();
      ctx.fillStyle = '#2a2b28'; ctx.fillRect(W / 2 - 18, H / 2 - 1, 36, 2);
      hazard(ctx, W / 2 - 18, H / 2 + 19, 36, 3);
      stripe(ctx, C, 4, 4, 8, 2);
    },
    top(ctx, C, W, H, t) { light(ctx, W / 2, H / 2, 1.6, C.mark, Math.floor(t * 2) % 2 === 0); },
  },
  power: {
    base(ctx, C, W, H) {
      pad(ctx, W, H);
      cylinder(ctx, W * 0.34, H * 0.4, 12, 20, '#9a9b96', '#6e6f6a');
      cylinder(ctx, W * 0.7, H * 0.68, 11, 18, '#9a9b96', '#6e6f6a');
      for (const [x, y, r, h] of [[W * 0.34, H * 0.4, 8, 20], [W * 0.7, H * 0.68, 7, 18]]) { ctx.fillStyle = '#2a2b28'; ctx.beginPath(); ctx.ellipse(x, y - h * LIFT, r, r * 0.9, 0, 0, TAU); ctx.fill(); }
      stripe(ctx, C, 4, H - 6, 12, 2);
    },
    top(ctx, C, W, H, t) {
      for (const [x, y] of [[W * 0.34, H * 0.4 - 11], [W * 0.7, H * 0.68 - 10]]) for (let i = 0; i < 3; i++) {
        const k = ((t * 0.5 + i / 3) % 1);
        ctx.fillStyle = `rgba(230,230,230,${0.35 * (1 - k)})`; circle(ctx, x + k * 10, y - k * 14, 5 + k * 6); ctx.fill();
      }
    },
  },
};
B.cc = B.hq;

// Static (cached) base of a building, with margins for walls rising north and shadows south-east.
const baseCache = new Map();
export const BUILDING_MARGIN = { side: 18, up: 30 };
export function buildingBase(shape, P, w, h) {
  const key = `${shape}|${w}x${h}|${P.main}`;
  let c = baseCache.get(key);
  if (c) return c;
  const W = w * TILE, H = h * TILE, M = BUILDING_MARGIN;
  c = document.createElement('canvas');
  const S = 2;
  c.width = (W + M.side * 2) * S; c.height = (H + M.up + M.side) * S;
  const ctx = c.getContext('2d');
  ctx.scale(S, S);
  ctx.translate(M.side, M.up);
  (B[shape] || B.factory).base(ctx, camoOf(P), W, H);
  baseCache.set(key, c);
  return c;
}

export function drawBuildingTop(ctx, shape, P, w, h, t, angle) {
  const def = B[shape] || B.factory;
  if (def.top) def.top(ctx, camoOf(P), w * TILE, h * TILE, t, angle);
}

// Full building (base + top), uncached: for icons and placement ghosts.
export function drawBuildingArt(ctx, shape, P, w, h, t = 0, angle = -Math.PI / 4) {
  const def = B[shape] || B.factory;
  def.base(ctx, camoOf(P), w * TILE, h * TILE);
  if (def.top) def.top(ctx, camoOf(P), w * TILE, h * TILE, t, angle);
}
