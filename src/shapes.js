// Vector art for units and buildings. Everything is drawn around the origin, facing +x.
import { TILE } from './data.js';

const TAU = Math.PI * 2;

const ENEMY_PALETTE = { main: '#ff4d3a', light: '#ffc0b5', dark: '#4a1610', body: '#2a1614', glow: 'rgba(255,77,58,0.35)' };
function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function mix(a, b, t) { return a.map((v, i) => Math.round(v + (b[i] - v) * t)); }
const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;

// Derive a full unit palette from one faction color.
export function makePalette(hex) {
  const c = hexRgb(hex);
  return {
    main: hex,
    light: rgb(mix(c, [255, 255, 255], 0.65)),
    dark: rgb(mix(c, [6, 12, 16], 0.74)),
    body: rgb(mix(c, [12, 20, 24], 0.86)),
    glow: `rgba(${c[0]},${c[1]},${c[2]},0.35)`,
  };
}

let playerPalette = makePalette('#39d5ff');
export function setPlayerColor(hex) { playerPalette = makePalette(hex); }
export function teamPalette(team) { return team === 0 ? playerPalette : ENEMY_PALETTE; }

function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); }
function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function soldier(ctx, x, y, P, gunLen = 6, gunW = 1.6, gunColor = null) {
  ctx.fillStyle = P.body;
  circle(ctx, x, y, 3.4); ctx.fill();
  ctx.strokeStyle = P.main; ctx.lineWidth = 1.3; ctx.stroke();
  ctx.strokeStyle = gunColor || P.light; ctx.lineWidth = gunW;
  ctx.beginPath(); ctx.moveTo(x + 1, y + 1); ctx.lineTo(x + 1 + gunLen, y + 1); ctx.stroke();
}

function rotors(ctx, pts, r, P, t) {
  for (const [x, y] of pts) {
    ctx.fillStyle = 'rgba(200,230,255,0.12)';
    circle(ctx, x, y, r); ctx.fill();
    ctx.strokeStyle = 'rgba(220,240,255,0.5)'; ctx.lineWidth = 1;
    const a = t * 40 + x;
    ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); ctx.lineTo(x - Math.cos(a) * r, y - Math.sin(a) * r); ctx.stroke();
  }
}

// ---------------------------------------------------------------------------
export function drawUnitShape(ctx, shape, P, t = 0, scale = 1) {
  ctx.save();
  ctx.scale(scale, scale);
  ctx.lineJoin = 'round';
  switch (shape) {
    case 'squad':
      soldier(ctx, 3, 0, P); soldier(ctx, -3, -5, P); soldier(ctx, -3, 5, P);
      break;
    case 'squad_at':
      soldier(ctx, 3, -3, P, 9, 3, '#c9b37a'); soldier(ctx, -3, 4, P);
      break;
    case 'squad_aa':
      soldier(ctx, 3, -3, P, 9, 3, '#9fe0a0'); soldier(ctx, -3, 4, P);
      ctx.fillStyle = '#9fe0a0'; circle(ctx, 12, -2, 1.5); ctx.fill();
      break;
    case 'squad_gl':
      soldier(ctx, 3, -3, P, 7, 3.2, '#d6c48a'); soldier(ctx, -3, 4, P); soldier(ctx, -6, -6, P);
      break;
    case 'squad_shock':
      ctx.fillStyle = P.dark; rrect(ctx, -7, -9, 12, 18, 4); ctx.fill();
      soldier(ctx, 4, -4, P, 5, 2.6); soldier(ctx, 4, 4, P, 5, 2.6); soldier(ctx, -3, 0, P, 5, 2.6);
      break;
    case 'medic':
      soldier(ctx, 2, -3, P, 3); soldier(ctx, -3, 4, P, 3);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(-1.5, -9, 3, 7); ctx.fillRect(-5, -7, 10, 3);
      ctx.fillStyle = '#ff5a6a'; ctx.fillRect(-1, -8.5, 2, 6); ctx.fillRect(-4.5, -6.5, 9, 2);
      break;
    case 'mortar':
      soldier(ctx, -4, -4, P, 3); soldier(ctx, -4, 5, P, 3);
      ctx.fillStyle = '#7d8790'; circle(ctx, 5, 0, 4); ctx.fill();
      ctx.fillStyle = '#0b0f12'; circle(ctx, 5, 0, 2); ctx.fill();
      break;
    case 'hacker':
      soldier(ctx, 2, -3, P, 4); soldier(ctx, -3, 4, P, 4);
      ctx.strokeStyle = '#c08cff'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-6, -5); ctx.lineTo(-6, -12); ctx.stroke();
      ctx.globalAlpha *= 0.5 + 0.5 * Math.sin(t * 6);
      ctx.beginPath(); ctx.arc(-6, -12, 3.5, 0, Math.PI * 2); ctx.stroke();
      break;
    case 'sniper':
      ctx.globalAlpha *= 0.85 + Math.sin(t * 3) * 0.1;
      soldier(ctx, 0, 0, P, 13, 1.2);
      ctx.strokeStyle = P.main; ctx.globalAlpha *= 0.4; circle(ctx, 0, 0, 7); ctx.stroke();
      break;
    case 'exo':
      ctx.fillStyle = P.body; rrect(ctx, -7, -7, 12, 14, 4); ctx.fill();
      ctx.strokeStyle = P.main; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.fillStyle = P.dark; rrect(ctx, -9, -9, 6, 5, 2); ctx.fill(); rrect(ctx, -9, 4, 6, 5, 2); ctx.fill();
      ctx.fillStyle = P.light; circle(ctx, 0, 0, 2.6); ctx.fill();
      ctx.strokeStyle = '#d8dde0'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(2, 5); ctx.lineTo(13, 5); ctx.stroke();
      break;
    case 'dog': {
      const k = Math.sin(t * 14) * 2;
      ctx.strokeStyle = P.main; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(4, -3); ctx.lineTo(6 + k, -7); ctx.moveTo(4, 3); ctx.lineTo(6 - k, 7);
      ctx.moveTo(-4, -3); ctx.lineTo(-6 - k, -7); ctx.moveTo(-4, 3); ctx.lineTo(-6 + k, 7);
      ctx.stroke();
      ctx.fillStyle = P.body; rrect(ctx, -6, -3.5, 12, 7, 3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = P.light; rrect(ctx, 6, -2.5, 4, 5, 1.5); ctx.fill();
      ctx.strokeStyle = '#cfd6da'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(9, 0); ctx.stroke();
      break;
    }
    case 'ugv':
    case 'ifv':
    case 'tank': {
      const L = shape === 'tank' ? 16 : shape === 'ifv' ? 13 : 12;
      const Wd = shape === 'tank' ? 11 : 9;
      ctx.fillStyle = '#0b0f12'; rrect(ctx, -L, -Wd - 2, L * 2, 4, 1.5); ctx.fill(); rrect(ctx, -L, Wd - 2, L * 2, 4, 1.5); ctx.fill();
      ctx.fillStyle = P.body; rrect(ctx, -L + 1, -Wd + 1, L * 2 - 2, Wd * 2 - 2, 3); ctx.fill();
      ctx.strokeStyle = P.main; ctx.lineWidth = 1.5; ctx.stroke();
      if (shape === 'ifv') { ctx.fillStyle = P.dark; rrect(ctx, -L + 3, -4, 8, 8, 1); ctx.fill(); }
      ctx.fillStyle = P.dark; circle(ctx, shape === 'tank' ? -1 : 2, 0, shape === 'tank' ? 6.5 : 4.5); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#d4dade'; ctx.lineWidth = shape === 'tank' ? 3 : 2;
      ctx.beginPath(); ctx.moveTo(shape === 'tank' ? 4 : 5, 0); ctx.lineTo(shape === 'tank' ? 24 : L + 6, 0); ctx.stroke();
      break;
    }
    case 'crawler':
      ctx.fillStyle = '#0b0f12'; rrect(ctx, -11, -10, 22, 4, 1.5); ctx.fill(); rrect(ctx, -11, 6, 22, 4, 1.5); ctx.fill();
      ctx.fillStyle = P.body; rrect(ctx, -10, -7, 20, 14, 3); ctx.fill();
      ctx.strokeStyle = P.main; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#7dffb0'; ctx.fillRect(-1.5, -5, 3, 10); ctx.fillRect(-5, -1.5, 10, 3);
      ctx.strokeStyle = '#cfd6da'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(6, -4); ctx.lineTo(13, -7); ctx.lineTo(15, -3); ctx.stroke();
      break;
    case 'juggernaut': {
      ctx.fillStyle = '#0b0f12'; rrect(ctx, -21, -17, 42, 6, 2); ctx.fill(); rrect(ctx, -21, 11, 42, 6, 2); ctx.fill();
      ctx.fillStyle = P.body; rrect(ctx, -19, -12, 38, 24, 5); ctx.fill();
      ctx.strokeStyle = P.main; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = P.dark; rrect(ctx, -12, -9, 18, 18, 4); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#d4dade'; ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.moveTo(4, -4); ctx.lineTo(30, -4); ctx.moveTo(4, 4); ctx.lineTo(30, 4); ctx.stroke();
      ctx.fillStyle = P.light; circle(ctx, -3, 0, 2.5); ctx.fill();
      break;
    }
    case 'rover':
      ctx.fillStyle = '#0b0f12'; rrect(ctx, -11, -10, 22, 4, 1.5); ctx.fill(); rrect(ctx, -11, 6, 22, 4, 1.5); ctx.fill();
      ctx.fillStyle = P.body; rrect(ctx, -10, -7, 20, 14, 3); ctx.fill();
      ctx.strokeStyle = P.main; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = P.dark; circle(ctx, 0, 0, 5.5); ctx.fill(); ctx.stroke();
      ctx.fillStyle = P.light; circle(ctx, 3, 0, 2.2); ctx.fill();
      break;
    case 'mech': {
      const k = Math.sin(t * 5) * 4;
      ctx.fillStyle = '#0d1114';
      rrect(ctx, -6 + k, -14, 12, 7, 2); ctx.fill(); rrect(ctx, -6 - k, 7, 12, 7, 2); ctx.fill();
      ctx.fillStyle = P.body; circle(ctx, 0, 0, 10); ctx.fill();
      ctx.strokeStyle = P.main; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = P.dark; rrect(ctx, -2, -13, 16, 6, 2); ctx.fill(); ctx.stroke(); rrect(ctx, -2, 7, 16, 6, 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = P.light; circle(ctx, 3, 0, 3); ctx.fill();
      break;
    }
    case 'walker': {
      const k = Math.sin(t * 4) * 4;
      ctx.strokeStyle = '#1a1010'; ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(6, -6); ctx.lineTo(16 + k, -18); ctx.moveTo(6, 6); ctx.lineTo(16 - k, 18);
      ctx.moveTo(-6, -6); ctx.lineTo(-16 - k, -18); ctx.moveTo(-6, 6); ctx.lineTo(-16 + k, 18);
      ctx.stroke();
      ctx.fillStyle = P.body; rrect(ctx, -13, -11, 26, 22, 6); ctx.fill();
      ctx.strokeStyle = P.main; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = P.dark; circle(ctx, 2, 0, 7); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#d4dade'; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(6, -3); ctx.lineTo(26, -3); ctx.moveTo(6, 3); ctx.lineTo(26, 3); ctx.stroke();
      break;
    }
    case 'quad': {
      ctx.strokeStyle = P.main; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(-5, -5); ctx.lineTo(5, 5); ctx.moveTo(-5, 5); ctx.lineTo(5, -5); ctx.stroke();
      rotors(ctx, [[-5, -5], [5, 5], [-5, 5], [5, -5]], 3.6, P, t);
      ctx.fillStyle = P.body; rrect(ctx, -3, -2.5, 6, 5, 1.5); ctx.fill(); ctx.stroke();
      ctx.fillStyle = P.light; circle(ctx, 2.5, 0, 1.2); ctx.fill();
      break;
    }
    case 'fpv': {
      ctx.strokeStyle = P.main; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(-4, -4); ctx.lineTo(4, 4); ctx.moveTo(-4, 4); ctx.lineTo(4, -4); ctx.stroke();
      rotors(ctx, [[-4, -4], [4, 4], [-4, 4], [4, -4]], 2.6, P, t);
      ctx.fillStyle = '#ffb347'; rrect(ctx, 0, -1.5, 6, 3, 1); ctx.fill();
      break;
    }
    case 'wasp': {
      ctx.strokeStyle = P.main; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(-4, -4); ctx.lineTo(4, 4); ctx.moveTo(-4, 4); ctx.lineTo(4, -4); ctx.stroke();
      rotors(ctx, [[-4, -4], [4, 4], [-4, 4], [4, -4]], 3, P, t);
      ctx.fillStyle = '#ffd34a'; rrect(ctx, -2.5, -2.5, 5, 5, 1.5); ctx.fill();
      ctx.strokeStyle = '#cfd6da'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(7, 0); ctx.stroke();
      break;
    }
    case 'stinger': {
      ctx.fillStyle = P.main;
      ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-5, -4); ctx.lineTo(-3, 0); ctx.lineTo(-5, 4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffffff'; circle(ctx, 5, 0, 1.3); ctx.fill();
      break;
    }
    case 'emp': {
      ctx.strokeStyle = P.main; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(-4, -4); ctx.lineTo(4, 4); ctx.moveTo(-4, 4); ctx.lineTo(4, -4); ctx.stroke();
      rotors(ctx, [[-4, -4], [4, 4], [-4, 4], [4, -4]], 2.6, P, t);
      ctx.fillStyle = '#c08cff'; circle(ctx, 0, 0, 3 + Math.sin(t * 8) * 0.8); ctx.fill();
      break;
    }
    case 'bomber': {
      ctx.strokeStyle = P.main; ctx.lineWidth = 1.8;
      const arms = [];
      for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; arms.push([Math.cos(a) * 10, Math.sin(a) * 10]); }
      ctx.beginPath(); for (const [x, y] of arms) { ctx.moveTo(0, 0); ctx.lineTo(x, y); } ctx.stroke();
      rotors(ctx, arms, 3.6, P, t);
      ctx.fillStyle = P.body; circle(ctx, 0, 0, 5.5); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#c9b37a'; circle(ctx, 0, 0, 2.6); ctx.fill();
      break;
    }
    case 'heli': {
      ctx.fillStyle = P.body; rrect(ctx, -10, -4, 20, 8, 4); ctx.fill();
      ctx.strokeStyle = P.main; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.fillStyle = P.dark; ctx.fillRect(-22, -1.5, 13, 3);
      ctx.fillStyle = '#c9b37a'; ctx.fillRect(-3, -8, 8, 2); ctx.fillRect(-3, 6, 8, 2);
      ctx.fillStyle = P.light; circle(ctx, 7, 0, 2); ctx.fill();
      ctx.strokeStyle = 'rgba(220,240,255,0.55)'; ctx.lineWidth = 1.5;
      { const a = t * 30; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 16, Math.sin(a) * 16); ctx.lineTo(-Math.cos(a) * 16, -Math.sin(a) * 16);
        ctx.moveTo(Math.cos(a + 1.57) * 16, Math.sin(a + 1.57) * 16); ctx.lineTo(-Math.cos(a + 1.57) * 16, -Math.sin(a + 1.57) * 16); ctx.stroke(); }
      ctx.fillStyle = 'rgba(200,230,255,0.08)'; circle(ctx, 0, 0, 16); ctx.fill();
      break;
    }
    case 'jet': {
      ctx.fillStyle = P.body;
      ctx.beginPath(); ctx.moveTo(15, 0); ctx.lineTo(2, -3); ctx.lineTo(-4, -12); ctx.lineTo(-9, -12); ctx.lineTo(-7, -3); ctx.lineTo(-13, -5);
      ctx.lineTo(-13, 5); ctx.lineTo(-7, 3); ctx.lineTo(-9, 12); ctx.lineTo(-4, 12); ctx.lineTo(2, 3); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = P.main; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.fillStyle = P.light; rrect(ctx, 3, -1.5, 6, 3, 1.5); ctx.fill();
      ctx.fillStyle = 'rgba(255,170,80,0.85)'; ctx.beginPath(); ctx.moveTo(-13, -2); ctx.lineTo(-18 - Math.random() * 4, 0); ctx.lineTo(-13, 2); ctx.fill();
      break;
    }
    case 'awacs': {
      ctx.fillStyle = P.body; rrect(ctx, -14, -3.5, 28, 7, 3.5); ctx.fill();
      ctx.strokeStyle = P.main; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(2, -3); ctx.lineTo(-4, -17); ctx.lineTo(-8, -17); ctx.lineTo(-5, -3); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(2, 3); ctx.lineTo(-4, 17); ctx.lineTo(-8, 17); ctx.lineTo(-5, 3); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = P.dark; circle(ctx, -2, 0, 7); ctx.fill(); ctx.stroke();
      ctx.save(); ctx.rotate(t * 2); ctx.strokeStyle = P.light; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.stroke(); ctx.restore();
      break;
    }
    case 'wing': {
      ctx.fillStyle = P.body;
      ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-8, -12); ctx.lineTo(-4, 0); ctx.lineTo(-8, 12); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = P.main; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = P.light; circle(ctx, 4, 0, 1.8); ctx.fill();
      ctx.fillStyle = '#c9b37a'; rrect(ctx, -4, -8, 6, 2, 1); ctx.fill(); rrect(ctx, -4, 6, 6, 2, 1); ctx.fill();
      break;
    }
    case 'carrier': {
      ctx.fillStyle = P.body;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; ctx.lineTo(Math.cos(a) * 12, Math.sin(a) * 12); }
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = P.main; ctx.lineWidth = 2; ctx.stroke();
      rotors(ctx, [[-12, -10], [12, -10], [-12, 10], [12, 10]], 6, P, t);
      ctx.fillStyle = P.dark; circle(ctx, 0, 0, 6); ctx.fill();
      ctx.fillStyle = '#ffb347';
      for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.78; circle(ctx, Math.cos(a) * 4, Math.sin(a) * 4, 1.4); ctx.fill(); }
      break;
    }
    case 'gunship': {
      ctx.fillStyle = P.body; rrect(ctx, -14, -4, 28, 8, 4); ctx.fill();
      ctx.strokeStyle = P.main; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.fillStyle = P.dark; rrect(ctx, -4, -14, 6, 28, 2); ctx.fill(); ctx.stroke();
      rotors(ctx, [[-1, -14], [-1, 14]], 9, P, t);
      ctx.fillStyle = P.light; circle(ctx, 10, 0, 2); ctx.fill();
      break;
    }
    default:
      ctx.fillStyle = P.main; circle(ctx, 0, 0, 6); ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Buildings: drawn with the footprint's top-left at origin. size in px.
export function drawBuildingShape(ctx, shape, P, w, h, t = 0, angle = 0, opts = {}) {
  const W = w * TILE, H = h * TILE;
  const cx = W / 2, cy = H / 2;
  const inset = 2;
  ctx.save();
  ctx.lineJoin = 'round';
  // slab
  if (shape !== 'barrier') {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    rrect(ctx, inset + 3, inset + 4, W - inset * 2, H - inset * 2, 5); ctx.fill();
    ctx.fillStyle = P.body;
    rrect(ctx, inset, inset, W - inset * 2, H - inset * 2, 5); ctx.fill();
    // light from the north-west across the roof
    const lit = ctx.createLinearGradient(0, 0, W, H);
    lit.addColorStop(0, 'rgba(255,255,255,0.10)'); lit.addColorStop(0.5, 'rgba(255,255,255,0)'); lit.addColorStop(1, 'rgba(0,0,0,0.22)');
    ctx.fillStyle = lit; ctx.fill();
    ctx.strokeStyle = P.main; ctx.lineWidth = 1.6; ctx.globalAlpha *= 0.9; ctx.stroke(); ctx.globalAlpha /= 0.9;
    // panel lines
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 8; x < W - 4; x += 8) { ctx.moveTo(x, inset + 2); ctx.lineTo(x, inset + 5); ctx.moveTo(x, H - inset - 5); ctx.lineTo(x, H - inset - 2); }
    ctx.stroke();
  }
  const turret = (r, barrel, bw = 3, twin = false) => {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(angle);
    ctx.fillStyle = P.dark; circle(ctx, 0, 0, r); ctx.fill();
    ctx.strokeStyle = P.main; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.strokeStyle = '#d4dade'; ctx.lineWidth = bw;
    ctx.beginPath();
    if (twin) { ctx.moveTo(2, -2.5); ctx.lineTo(barrel, -2.5); ctx.moveTo(2, 2.5); ctx.lineTo(barrel, 2.5); }
    else { ctx.moveTo(2, 0); ctx.lineTo(barrel, 0); }
    ctx.stroke();
    ctx.restore();
  };
  switch (shape) {
    case 'hq': {
      ctx.fillStyle = P.dark; rrect(ctx, 10, 10, W - 20, H - 20, 8); ctx.fill();
      const pulse = 0.6 + Math.sin(t * 2.2) * 0.25;
      const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, 22);
      g.addColorStop(0, P.light); g.addColorStop(0.4, P.main); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha *= pulse; ctx.fillStyle = g; circle(ctx, cx, cy, 22); ctx.fill(); ctx.globalAlpha /= pulse;
      ctx.strokeStyle = P.light; ctx.lineWidth = 1.2;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.arc(cx, cy, 10 + i * 5, t * (1 + i * 0.5) + i, t * (1 + i * 0.5) + i + 2.2); ctx.stroke();
      }
      turret(7, 18, 3, true);
      ctx.fillStyle = P.main;
      for (const [x, y] of [[8, 8], [W - 8, 8], [8, H - 8], [W - 8, H - 8]]) { circle(ctx, x, y, 2.5); ctx.fill(); }
      break;
    }
    case 'barracks':
      ctx.fillStyle = P.dark;
      for (let i = 0; i < 3; i++) { rrect(ctx, 9, 10 + i * 15, W - 18, 9, 2); ctx.fill(); }
      ctx.fillStyle = P.main; rrect(ctx, cx - 6, H - 7, 12, 4, 1); ctx.fill();
      break;
    case 'factory':
      ctx.fillStyle = P.dark; rrect(ctx, 7, 7, W - 14, H - 22, 3); ctx.fill();
      ctx.strokeStyle = 'rgba(255,200,80,0.6)'; ctx.lineWidth = 3;
      ctx.beginPath();
      for (let x = 10; x < W - 10; x += 8) { ctx.moveTo(x, H - 12); ctx.lineTo(x + 5, H - 6); }
      ctx.stroke();
      ctx.strokeStyle = P.main; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(12, 14); ctx.lineTo(W - 12, 14); ctx.moveTo(12 + ((t * 14) % (W - 24)), 14); ctx.lineTo(12 + ((t * 14) % (W - 24)), 26); ctx.stroke();
      break;
    case 'dronebay':
      ctx.strokeStyle = P.main; ctx.lineWidth = 2;
      circle(ctx, cx, cy, Math.min(W, H) / 2 - 8); ctx.stroke();
      ctx.fillStyle = P.dark; circle(ctx, cx, cy, Math.min(W, H) / 2 - 11); ctx.fill();
      ctx.strokeStyle = P.light; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(cx - 8, cy - 8); ctx.lineTo(cx + 8, cy + 8); ctx.moveTo(cx - 8, cy + 8); ctx.lineTo(cx + 8, cy - 8); ctx.stroke();
      ctx.fillStyle = (Math.floor(t * 2) % 2) ? P.main : P.dark;
      for (const [x, y] of [[7, 7], [W - 7, 7], [7, H - 7], [W - 7, H - 7]]) { circle(ctx, x, y, 2); ctx.fill(); }
      break;
    case 'fabricator': {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * 0.8);
      ctx.fillStyle = P.dark;
      for (let i = 0; i < 8; i++) { ctx.rotate(TAU / 8); ctx.fillRect(-3, -19, 6, 8); }
      circle(ctx, 0, 0, 14); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#ffd76a'; circle(ctx, cx, cy, 5 + Math.sin(t * 4)); ctx.fill();
      break;
    }
    case 'logistics':
      ctx.fillStyle = P.dark; ctx.strokeStyle = P.main; ctx.lineWidth = 1;
      for (const [x, y] of [[8, 8], [cx + 2, 8], [8, cy + 2], [cx + 2, cy + 2]]) { rrect(ctx, x, y, cx - 10, cy - 10, 2); ctx.fill(); ctx.stroke(); }
      break;
    case 'lab': {
      ctx.fillStyle = P.dark;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; ctx.lineTo(cx + Math.cos(a) * 20, cy + Math.sin(a) * 20); }
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = P.main; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#b48cff'; circle(ctx, cx, cy, 6 + Math.sin(t * 3) * 1.5); ctx.fill();
      ctx.strokeStyle = 'rgba(180,140,255,0.6)';
      ctx.beginPath(); ctx.ellipse(cx, cy, 14, 5, t, 0, TAU); ctx.stroke();
      break;
    }
    case 'radar': {
      ctx.strokeStyle = P.main; ctx.globalAlpha *= 0.5;
      for (let i = 1; i <= 2; i++) { circle(ctx, cx, cy, i * 9); ctx.stroke(); }
      ctx.globalAlpha /= 0.5;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * 2);
      ctx.strokeStyle = P.light; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-16, -5); ctx.lineTo(16, -5); ctx.stroke();
      ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(0, 4); ctx.stroke();
      ctx.restore();
      break;
    }
    case 'repair':
      ctx.fillStyle = '#7dffb0';
      ctx.fillRect(cx - 3, cy - 12, 6, 24); ctx.fillRect(cx - 12, cy - 3, 24, 6);
      ctx.strokeStyle = 'rgba(125,255,176,0.6)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx, cy, 20, t, t + 4); ctx.stroke();
      break;
    case 'hospital':
      ctx.fillStyle = '#f2f2f2'; ctx.fillRect(cx - 4, cy - 14, 8, 28); ctx.fillRect(cx - 14, cy - 4, 28, 8);
      ctx.fillStyle = '#ff5a6a'; ctx.fillRect(cx - 3, cy - 13, 6, 26); ctx.fillRect(cx - 13, cy - 3, 26, 6);
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(cx, cy, 22, t, t + 1.5); ctx.stroke();
      break;
    case 'helipad':
      ctx.strokeStyle = P.light; ctx.lineWidth = 2;
      circle(ctx, cx, cy, 20); ctx.stroke();
      ctx.font = 'bold 20px sans-serif'; ctx.fillStyle = P.light; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('H', cx, cy + 1);
      ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = (Math.floor(t * 2) % 2) ? '#ffd76a' : P.dark;
      for (const [x, y] of [[6, 6], [W - 6, 6], [6, H - 6], [W - 6, H - 6]]) { circle(ctx, x, y, 2); ctx.fill(); }
      break;
    case 'swarmhive': {
      ctx.fillStyle = P.dark; ctx.strokeStyle = P.main; ctx.lineWidth = 1.2;
      const hex = (x, y, r) => { ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + Math.PI / 6; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } ctx.closePath(); ctx.fill(); ctx.stroke(); };
      for (const [x, y] of [[0, 0], [-15, -8], [15, -8], [-15, 8], [15, 8], [0, -16], [0, 16]]) hex(cx + x * 0.95, cy + y * 0.95, 8);
      ctx.fillStyle = '#ffd34a'; ctx.globalAlpha *= 0.6 + Math.sin(t * 3) * 0.3; circle(ctx, cx, cy, 4); ctx.fill();
      break;
    }
    case 'cyberops': {
      ctx.fillStyle = P.dark;
      for (let i = 0; i < 4; i++) { rrect(ctx, 8 + i * 12, 9, 9, H - 18, 2); ctx.fill(); }
      for (let i = 0; i < 4; i++) for (let k = 0; k < 6; k++) {
        ctx.fillStyle = Math.sin(t * 7 + i * 3 + k * 5) > 0.3 ? '#c08cff' : 'rgba(192,140,255,0.2)';
        ctx.fillRect(10 + i * 12, 13 + k * 7, 5, 2);
      }
      break;
    }
    case 'foundry': {
      ctx.fillStyle = P.dark; rrect(ctx, 6, 6, W - 12, H - 12, 4); ctx.fill();
      ctx.fillStyle = '#ff9a3a'; ctx.globalAlpha *= 0.7 + Math.sin(t * 5) * 0.25;
      rrect(ctx, 12, cy - 5, W - 24, 10, 3); ctx.fill(); ctx.globalAlpha = 1;
      ctx.fillStyle = '#3a4047'; ctx.fillRect(W - 18, 8, 7, 14); ctx.fillRect(W - 28, 8, 7, 10);
      ctx.fillStyle = 'rgba(180,180,180,0.25)'; circle(ctx, W - 14, 6 - ((t * 8) % 6), 4); ctx.fill();
      break;
    }
    case 'airbase': {
      ctx.fillStyle = '#20262c'; ctx.fillRect(8, cy - 10, W - 16, 20);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2; ctx.setLineDash([8, 6]);
      ctx.beginPath(); ctx.moveTo(14, cy); ctx.lineTo(W - 14, cy); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = P.dark; rrect(ctx, 10, 8, 26, 18, 6); ctx.fill(); rrect(ctx, W - 36, H - 26, 26, 18, 6); ctx.fill();
      ctx.strokeStyle = P.main; ctx.lineWidth = 1.2; rrect(ctx, 10, 8, 26, 18, 6); ctx.stroke(); rrect(ctx, W - 36, H - 26, 26, 18, 6); ctx.stroke();
      ctx.fillStyle = (Math.floor(t * 3) % 2) ? '#ffd76a' : '#5a4a2a';
      for (let x = 12; x < W - 10; x += 14) { circle(ctx, x, cy - 12, 1.5); ctx.fill(); circle(ctx, x, cy + 12, 1.5); ctx.fill(); }
      break;
    }
    case 'disruptor': {
      ctx.fillStyle = P.dark; circle(ctx, cx, cy, 10); ctx.fill();
      ctx.strokeStyle = P.main; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#c08cff'; circle(ctx, cx, cy, 4 + Math.sin(t * 5)); ctx.fill();
      ctx.strokeStyle = 'rgba(192,140,255,0.6)';
      for (let i = 0; i < 3; i++) { const a = t * 2 + (i * TAU) / 3; ctx.beginPath(); ctx.arc(cx, cy, 13, a, a + 0.8); ctx.stroke(); }
      break;
    }
    case 'bastion':
      ctx.fillStyle = P.dark;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + Math.PI / 8; ctx.lineTo(cx + Math.cos(a) * 28, cy + Math.sin(a) * 28); }
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = P.main; ctx.lineWidth = 2; ctx.stroke();
      turret(11, 30, 4, true);
      break;
    case 'barrier':
      ctx.fillStyle = '#3a4047'; rrect(ctx, 2, 2, W - 4, H - 4, 3); ctx.fill();
      ctx.strokeStyle = P.main; ctx.globalAlpha *= 0.7; ctx.lineWidth = 1.2; ctx.stroke(); ctx.globalAlpha /= 0.7;
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(6, 6); ctx.lineTo(W - 6, H - 6); ctx.moveTo(W - 6, 6); ctx.lineTo(6, H - 6); ctx.stroke();
      break;
    case 'turret':
      turret(8, 19, 3, opts.enemy);
      break;
    case 'bunker':
      ctx.fillStyle = P.dark; rrect(ctx, 8, 8, W - 16, H - 16, 7); ctx.fill();
      ctx.strokeStyle = P.main; ctx.lineWidth = 2; ctx.stroke();
      turret(9, 26, 4);
      break;
    case 'laser': {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(angle);
      ctx.fillStyle = P.dark; circle(ctx, 0, 0, w > 1 ? 14 : 9); ctx.fill();
      ctx.strokeStyle = P.main; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#d4dade'; rrect(ctx, 0, -3, w > 1 ? 18 : 13, 6, 2); ctx.fill();
      ctx.fillStyle = P.light; circle(ctx, w > 1 ? 18 : 13, 0, 2.5); ctx.fill();
      ctx.restore();
      break;
    }
    case 'sam': {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(angle);
      const s = w > 1 ? 1.4 : 1;
      ctx.fillStyle = P.dark; rrect(ctx, -9 * s, -9 * s, 18 * s, 18 * s, 3); ctx.fill();
      ctx.strokeStyle = P.main; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#d4dade';
      for (const y of [-6, -2, 2, 6]) { ctx.fillRect(-4 * s, y * s - 1.3, 16 * s, 2.6); }
      ctx.restore();
      break;
    }
    case 'launcher': {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(angle);
      ctx.fillStyle = P.dark; rrect(ctx, -16, -13, 30, 26, 3); ctx.fill();
      ctx.strokeStyle = P.main; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#0b0f12';
      for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) { circle(ctx, -6 + c * 8, -5 + r * 10, 3); ctx.fill(); }
      ctx.restore();
      break;
    }
    case 'jammer': {
      ctx.strokeStyle = '#b48cff'; ctx.lineWidth = 1.5;
      const k = (t * 1.5) % 1;
      ctx.globalAlpha *= 1 - k; circle(ctx, cx, cy, 4 + k * 12); ctx.stroke(); ctx.globalAlpha /= Math.max(0.001, 1 - k);
      ctx.strokeStyle = P.light; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx, cy + 9); ctx.lineTo(cx, cy - 9); ctx.moveTo(cx - 6, cy - 5); ctx.lineTo(cx + 6, cy - 5); ctx.stroke();
      break;
    }
    case 'railgun': {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(angle);
      ctx.fillStyle = P.dark; circle(ctx, 0, 0, 14); ctx.fill();
      ctx.strokeStyle = P.main; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#d4dade'; ctx.fillRect(-4, -5, 34, 3); ctx.fillRect(-4, 2, 34, 3);
      ctx.fillStyle = '#7fd1ff'; ctx.globalAlpha *= 0.5 + Math.sin(t * 6) * 0.3; ctx.fillRect(0, -2, 28, 4);
      ctx.restore();
      break;
    }
    case 'silo': {
      ctx.fillStyle = P.dark; circle(ctx, cx, cy, 20); ctx.fill();
      ctx.strokeStyle = P.main; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#0b0f12'; ctx.fillRect(cx - 14, cy - 2, 28, 4);
      ctx.fillStyle = '#ffb347'; circle(ctx, cx, cy, 3); ctx.fill();
      break;
    }
    case 'power': {
      ctx.fillStyle = P.dark; circle(ctx, cx - 9, cy - 6, 10); ctx.fill(); circle(ctx, cx + 9, cy + 6, 10); ctx.fill();
      ctx.strokeStyle = P.main; ctx.lineWidth = 1.5;
      circle(ctx, cx - 9, cy - 6, 10); ctx.stroke(); circle(ctx, cx + 9, cy + 6, 10); ctx.stroke();
      ctx.fillStyle = '#ffd76a'; ctx.globalAlpha *= 0.6 + Math.sin(t * 5) * 0.3;
      circle(ctx, cx - 9, cy - 6, 4); ctx.fill(); circle(ctx, cx + 9, cy + 6, 4); ctx.fill();
      break;
    }
    default: break;
  }
  ctx.restore();
}

// Small icon canvases (cached) for the UI.
const iconCache = new Map();
export function iconFor(kind, def, team = 0, size = 44, color = null) {
  const key = `${kind}:${def.shape}:${def.w || 0}:${team}:${size}:${color || (team === 0 ? playerPalette.main : '')}`;
  let url = iconCache.get(key);
  if (url) return url;
  const c = document.createElement('canvas');
  c.width = size * 2; c.height = size * 2;
  const ctx = c.getContext('2d');
  ctx.scale(2, 2);
  const P = color ? makePalette(color) : teamPalette(team);
  if (kind === 'unit') {
    ctx.translate(size / 2, size / 2);
    ctx.rotate(-Math.PI / 4);
    const s = Math.min(2.2, (size * 0.36) / (def.radius || 8));
    drawUnitShape(ctx, def.shape, P, 0.3, s);
  } else {
    const px = Math.max(def.w, def.h) * TILE;
    const s = (size * 0.9) / px;
    ctx.translate((size - def.w * TILE * s) / 2, (size - def.h * TILE * s) / 2);
    ctx.scale(s, s);
    drawBuildingShape(ctx, def.shape, P, def.w, def.h, 0.5, -Math.PI / 4, { enemy: team === 1 });
  }
  url = c.toDataURL();
  iconCache.set(key, url);
  return url;
}

// Faction emblem: a chevron shield in the faction color around its signature unit.
const emblemCache = new Map();
export function emblemFor(faction, unitDef, size = 64) {
  const key = faction.id + size;
  if (emblemCache.has(key)) return emblemCache.get(key);
  const c = document.createElement('canvas');
  c.width = size * 2; c.height = size * 2;
  const ctx = c.getContext('2d');
  ctx.scale((size * 2) / 64, (size * 2) / 64);
  const P = makePalette(faction.color);
  const shield = () => {
    ctx.beginPath();
    ctx.moveTo(32, 3); ctx.lineTo(58, 12); ctx.lineTo(56, 36); ctx.quadraticCurveTo(50, 52, 32, 61);
    ctx.quadraticCurveTo(14, 52, 8, 36); ctx.lineTo(6, 12); ctx.closePath();
  };
  shield();
  const g = ctx.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, P.dark); g.addColorStop(1, '#05080b');
  ctx.fillStyle = g; ctx.fill();
  ctx.save(); shield(); ctx.clip();
  ctx.strokeStyle = P.glow; ctx.lineWidth = 3;
  for (let x = -64; x < 64; x += 9) { ctx.beginPath(); ctx.moveTo(x, 64); ctx.lineTo(x + 64, 0); ctx.stroke(); }
  ctx.restore();
  shield(); ctx.strokeStyle = P.main; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.save();
  ctx.translate(32, 33); ctx.rotate(-Math.PI / 2);
  const s = Math.min(1.9, 17 / (unitDef.radius || 8));
  drawUnitShape(ctx, unitDef.shape, P, 0.4, s);
  ctx.restore();
  const url = c.toDataURL();
  emblemCache.set(key, url);
  return url;
}
