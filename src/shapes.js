// Vector art for units and buildings. Everything is drawn around the origin, facing +x.
import { TILE } from './data.js';
import { drawUnitArt, drawBuildingArt, BUILDING_MARGIN } from './art.js';

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

// Units and buildings are drawn by the realistic art module; these wrappers keep the old API.
export function drawUnitShape(ctx, shape, P, t = 0, scale = 1) {
  ctx.save();
  ctx.scale(scale, scale);
  drawUnitArt(ctx, shape, P, t);
  ctx.restore();
}

// Footprint's top-left at the origin; walls rise above it (up to BUILDING_MARGIN.up px).
export function drawBuildingShape(ctx, shape, P, w, h, t = 0, angle = 0) {
  ctx.save();
  drawBuildingArt(ctx, shape, P, w, h, t, angle);
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
    // include the walls rising above the footprint
    const up = BUILDING_MARGIN.up * 0.55;
    const pw = def.w * TILE, ph = def.h * TILE + up;
    const s = (size * 0.94) / Math.max(pw, ph);
    ctx.translate((size - pw * s) / 2, (size - ph * s) / 2 + up * s);
    ctx.scale(s, s);
    drawBuildingShape(ctx, def.shape, P, def.w, def.h, 0.5, -Math.PI / 4);
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
