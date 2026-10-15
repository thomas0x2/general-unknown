// Canvas renderer: terrain, entities, effects, fog of war, overlays, minimap.
import { TILE, MAP_W, MAP_H, TEAM_PLAYER, TEAM_ENEMY, BUILDINGS } from './data.js';
import { T_PLAIN, T_FOREST, T_WATER, T_ROCK } from './map.js';
import { drawUnitShape, drawBuildingShape, teamPalette } from './shapes.js';
import { BUILD_RADIUS } from './game.js';

const WORLD_W = MAP_W * TILE, WORLD_H = MAP_H * TILE;
const TERRAIN_RGB = {
  [T_PLAIN]: [40, 54, 41],
  [T_FOREST]: [25, 46, 31],
  [T_WATER]: [14, 36, 56],
  [T_ROCK]: [58, 60, 66],
};
const P0 = teamPalette(0), P1 = teamPalette(1);

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
    this.hover = null;
    this.placing = null; // {type, tx, ty, ok}
    this.dragBox = null;
    this.time = 0;
  }

  setGame(game) {
    this.game = game;
    this.terrain = this.renderTerrain(game.map);
    this.miniTerrain = this.renderMiniTerrain(game.map);
    this.fogVersion = -1;
    this.pings = [];
    this.cam.x = game.hq.x + 120;
    this.cam.y = game.hq.y - 100;
    this.cam.zoom = 1.15;
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth, h = window.innerHeight;
    this.view = { w, h, dpr };
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
  }

  // ------------------------------------------------------------ coordinates
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
    const padTop = 60 / z, padBottom = 190 / z;
    this.cam.x = Math.max(Math.min(hw, WORLD_W / 2), Math.min(WORLD_W - Math.min(hw, WORLD_W / 2), this.cam.x));
    this.cam.y = Math.max(Math.min(hh - padTop, WORLD_H / 2), Math.min(WORLD_H - Math.min(hh - padBottom, WORLD_H / 2), this.cam.y));
  }

  ping(x, y, color = '#ff4d3a', life = 3) { this.pings.push({ x, y, color, t: 0, life }); }

  // -------------------------------------------------------------- terrain
  renderTerrain(map) {
    const c = document.createElement('canvas');
    c.width = WORLD_W; c.height = WORLD_H;
    const ctx = c.getContext('2d');
    // 1) smooth base colours: one pixel per tile, upscaled with bilinear filtering
    const small = document.createElement('canvas');
    small.width = MAP_W; small.height = MAP_H;
    const sctx = small.getContext('2d');
    const img = sctx.createImageData(MAP_W, MAP_H);
    for (let i = 0; i < MAP_W * MAP_H; i++) {
      const [r, g, b] = TERRAIN_RGB[map.tiles[i]];
      const v = (map.variant[i] / 255 - 0.5) * 6;
      img.data[i * 4] = r + v; img.data[i * 4 + 1] = g + v; img.data[i * 4 + 2] = b + v; img.data[i * 4 + 3] = 255;
    }
    sctx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(small, 0, 0, WORLD_W, WORLD_H);

    const rnd = (i, k) => ((map.variant[i] * 9301 + k * 49297) % 233280) / 233280;
    // 2) speckle noise
    for (let n = 0; n < 26000; n++) {
      const x = Math.random() * WORLD_W, y = Math.random() * WORLD_H;
      ctx.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.06)';
      ctx.fillRect(x, y, 2, 2);
    }
    // 3) roads
    ctx.lineCap = 'round';
    const roadPass = (width, color) => {
      ctx.strokeStyle = color; ctx.lineWidth = width;
      ctx.beginPath();
      for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
        if (!map.road[y * MAP_W + x]) continue;
        const cx = (x + 0.5) * TILE, cy = (y + 0.5) * TILE;
        for (const [dx, dy] of [[1, 0], [0, 1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < MAP_W && ny < MAP_H && map.road[ny * MAP_W + nx]) { ctx.moveTo(cx, cy); ctx.lineTo((nx + 0.5) * TILE, (ny + 0.5) * TILE); }
        }
      }
      ctx.stroke();
    };
    roadPass(15, 'rgba(70,62,46,0.55)');
    roadPass(9, 'rgba(92,82,62,0.45)');
    ctx.setLineDash([6, 10]);
    roadPass(1.2, 'rgba(200,190,150,0.15)');
    ctx.setLineDash([]);
    // 4) per-tile details
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      const i = y * MAP_W + x, t = map.tiles[i];
      const px = x * TILE, py = y * TILE;
      if (t === T_FOREST) {
        for (let k = 0; k < 3; k++) {
          const tx = px + 6 + rnd(i, k) * 20, ty = py + 6 + rnd(i, k + 7) * 20, r = 5 + rnd(i, k + 3) * 5;
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          ctx.beginPath(); ctx.arc(tx + 2, ty + 3, r, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = `rgb(${24 + rnd(i, k) * 14},${52 + rnd(i, k + 1) * 20},${30 + rnd(i, k + 2) * 10})`;
          ctx.beginPath(); ctx.arc(tx, ty, r, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = 'rgba(120,200,120,0.08)';
          ctx.beginPath(); ctx.arc(tx - r * 0.3, ty - r * 0.3, r * 0.5, 0, Math.PI * 2); ctx.fill();
        }
      } else if (t === T_ROCK) {
        for (let k = 0; k < 2; k++) {
          const tx = px + 4 + rnd(i, k) * 22, ty = py + 4 + rnd(i, k + 5) * 22, s = 6 + rnd(i, k + 2) * 8;
          ctx.fillStyle = `rgba(${90 + rnd(i, k) * 30},${92 + rnd(i, k) * 30},${98 + rnd(i, k) * 30},0.35)`;
          ctx.beginPath(); ctx.moveTo(tx, ty - s * 0.6); ctx.lineTo(tx + s * 0.7, ty); ctx.lineTo(tx + s * 0.2, ty + s * 0.6); ctx.lineTo(tx - s * 0.6, ty + s * 0.2); ctx.closePath(); ctx.fill();
        }
      } else if (t === T_WATER) {
        if (rnd(i, 1) < 0.45) {
          ctx.strokeStyle = 'rgba(120,180,220,0.09)'; ctx.lineWidth = 1.2;
          const tx = px + rnd(i, 2) * 18, ty = py + 6 + rnd(i, 3) * 20;
          ctx.beginPath(); ctx.moveTo(tx, ty); ctx.quadraticCurveTo(tx + 6, ty - 3, tx + 12, ty); ctx.stroke();
        }
      } else if (rnd(i, 4) < 0.3) {
        ctx.fillStyle = 'rgba(140,170,110,0.10)';
        ctx.fillRect(px + rnd(i, 5) * 28, py + rnd(i, 6) * 28, 2, 3);
      }
      // shoreline / cliff edges
      if (t === T_WATER || t === T_ROCK) {
        for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
          const nt = map.tiles[ny * MAP_W + nx];
          if (nt === t) continue;
          ctx.strokeStyle = t === T_WATER ? 'rgba(130,190,230,0.10)' : 'rgba(0,0,0,0.25)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          const ex = dx === 1 ? px + TILE : px, ey = dy === 1 ? py + TILE : py;
          if (dx) { ctx.moveTo(ex, py + 2); ctx.lineTo(ex, py + TILE - 2); } else { ctx.moveTo(px + 2, ey); ctx.lineTo(px + TILE - 2, ey); }
          ctx.stroke();
        }
      }
    }
    // 5) tactical grid
    ctx.strokeStyle = 'rgba(120,200,255,0.035)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= MAP_W; x++) { ctx.moveTo(x * TILE + 0.5, 0); ctx.lineTo(x * TILE + 0.5, WORLD_H); }
    for (let y = 0; y <= MAP_H; y++) { ctx.moveTo(0, y * TILE + 0.5); ctx.lineTo(WORLD_W, y * TILE + 0.5); }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(120,200,255,0.07)';
    ctx.beginPath();
    for (let x = 0; x <= MAP_W; x += 8) { ctx.moveTo(x * TILE + 0.5, 0); ctx.lineTo(x * TILE + 0.5, WORLD_H); }
    for (let y = 0; y <= MAP_H; y += 8) { ctx.moveTo(0, y * TILE + 0.5); ctx.lineTo(WORLD_W, y * TILE + 0.5); }
    ctx.stroke();
    // grid labels
    ctx.fillStyle = 'rgba(120,200,255,0.16)'; ctx.font = '10px monospace';
    for (let x = 0; x < MAP_W; x += 8) for (let y = 0; y < MAP_H; y += 8) ctx.fillText(`${String.fromCharCode(65 + x / 8)}${y / 8 + 1}`, x * TILE + 4, y * TILE + 12);
    return c;
  }

  renderMiniTerrain(map) {
    const c = document.createElement('canvas');
    c.width = MAP_W; c.height = MAP_H;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(MAP_W, MAP_H);
    for (let i = 0; i < MAP_W * MAP_H; i++) {
      let [r, g, b] = TERRAIN_RGB[map.tiles[i]];
      if (map.road[i]) { r = 70; g = 64; b = 50; }
      img.data[i * 4] = r * 1.5; img.data[i * 4 + 1] = g * 1.5; img.data[i * 4 + 2] = b * 1.5; img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  updateFogImage() {
    const g = this.game;
    if (this.fogVersion === g.fogVersion) return;
    this.fogVersion = g.fogVersion;
    const d = this.fogImg.data;
    for (let i = 0; i < MAP_W * MAP_H; i++) {
      d[i * 4] = 3; d[i * 4 + 1] = 6; d[i * 4 + 2] = 9;
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
    ctx.setTransform(z * dpr, 0, 0, z * dpr, (w / 2 - this.cam.x * z) * dpr, (h / 2 - this.cam.y * z) * dpr);

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

    // selection rings under units
    const sel = new Set(g.selection);
    for (const e of g.selection) {
      if (e.kind !== 'unit') continue;
      ctx.strokeStyle = 'rgba(120,255,170,0.9)'; ctx.lineWidth = 1.5 / z + 0.5;
      ctx.beginPath(); ctx.ellipse(e.x, e.y + (e.air ? 10 : 2), e.radius + 4, (e.radius + 4) * 0.7, 0, 0, Math.PI * 2); ctx.stroke();
    }

    // buildings
    for (const b of g.buildings) {
      if (b.dead || !onScreen(b, 80)) continue;
      if (b.team === TEAM_ENEMY && !b.discovered) continue;
      this.drawBuilding(ctx, b, sel.has(b));
    }

    // ground units
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
    this.drawEffects(ctx, g, onScreen, false);

    // air units (with shadows)
    for (const u of g.units) {
      if (!u.air || !onScreen(u)) continue;
      if (u.team === TEAM_ENEMY && !g.isVisible(u)) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(u.x + 6, u.y + 12, u.radius * 0.9, u.radius * 0.5, 0, 0, Math.PI * 2); ctx.fill();
      this.drawUnit(ctx, u);
    }
    this.drawEffects(ctx, g, onScreen, true);

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
      if (!b.built) this.drawBar(ctx, b.x, b.y - b.h * TILE / 2 - 1, b.w * TILE * 0.8, b.progress, 2);
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
      if (e.def.jammer || e.def.repair) {
        const r = (e.def.jammer || e.def.repair).radius;
        ctx.strokeStyle = e.def.jammer ? 'rgba(180,140,255,0.3)' : 'rgba(125,255,176,0.3)';
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
      if (e.kind === 'unit' && (e.order.type === 'move' || e.order.type === 'amove')) {
        ctx.strokeStyle = e.order.type === 'amove' ? 'rgba(255,120,90,0.35)' : 'rgba(120,255,170,0.3)';
        ctx.lineWidth = 1 / z;
        ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.order.x, e.order.y); ctx.stroke();
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

    // screen space: drag box
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
    else if (team === TEAM_ENEMY) color = '#ff5a45';
    else color = frac > 0.6 ? '#5fdc7a' : frac > 0.3 ? '#ffc93c' : '#ff5a45';
    ctx.fillStyle = color;
    ctx.fillRect(x - w / 2, y, w * frac, hgt);
  }

  drawUnit(ctx, u) {
    const P = u.team === TEAM_PLAYER ? P0 : P1;
    ctx.save();
    const bob = u.air ? Math.sin(this.time * 3 + u.bob) * 1.5 : 0;
    ctx.translate(u.x, u.y + bob);
    if (u.flash > 0) { ctx.shadowColor = '#fff'; ctx.shadowBlur = 10; }
    ctx.rotate(u.angle);
    drawUnitShape(ctx, u.def.shape, P, this.time + u.bob, 1);
    ctx.restore();
    if (u.slowUntil > this.game.time) {
      ctx.strokeStyle = 'rgba(180,140,255,0.6)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(u.x, u.y, u.radius + 3 + Math.sin(this.time * 20), 0, Math.PI * 2); ctx.stroke();
    }
  }

  drawBuilding(ctx, b, selected) {
    const P = b.team === TEAM_PLAYER ? P0 : P1;
    ctx.save();
    ctx.translate(b.tx * TILE, b.ty * TILE);
    if (!b.built) ctx.globalAlpha = 0.45 + 0.35 * b.progress;
    if (b.flash > 0) { ctx.shadowColor = '#fff'; ctx.shadowBlur = 8; }
    drawBuildingShape(ctx, b.def.shape, P, b.w, b.h, this.time + b.id, b.angle, { enemy: b.team === TEAM_ENEMY });
    if (!b.built) {
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = '#ffd76a'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let k = -b.h * TILE; k < b.w * TILE; k += 8) { ctx.moveTo(k, b.h * TILE); ctx.lineTo(k + b.h * TILE, 0); }
      ctx.stroke();
    }
    ctx.restore();
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
      if (e.type === 'scorch' || !onScreen(e, 200)) continue;
      const k = e.t / e.life;
      if (airLayer !== (e.type === 'text' || !!e.air)) continue;
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
          const c = e.heavy ? '200,235,255' : e.team === TEAM_PLAYER ? '90,230,255' : '255,90,140';
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
          ctx.strokeStyle = `rgba(255,220,160,${0.5 * (1 - k)})`; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(e.x, e.y, e.size * (0.5 + k * 1.3), 0, Math.PI * 2); ctx.stroke();
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

  drawSites(ctx, g) {
    for (const s of g.sites) {
      const i = g.tileIdx(s.x, s.y);
      if (!g.explored[i]) continue;
      const col = s.owner === TEAM_PLAYER ? '57,213,255' : s.owner === TEAM_ENEMY ? '255,77,58' : '216,194,106';
      ctx.fillStyle = `rgba(${col},0.08)`;
      ctx.beginPath(); ctx.arc(s.x, s.y, 3 * TILE, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(${col},0.45)`; ctx.lineWidth = 1.5; ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.arc(s.x, s.y, 3 * TILE, this.time * 0.2, this.time * 0.2 + Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      // crystal deposit
      ctx.fillStyle = `rgba(${col},0.9)`;
      for (let k = 0; k < 5; k++) {
        const a = k * 1.3, r = 6 + (k % 2) * 6;
        const x = s.x + Math.cos(a) * r, y = s.y + Math.sin(a) * r;
        ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x + 3, y); ctx.lineTo(x, y + 4); ctx.lineTo(x - 3, y); ctx.closePath(); ctx.fill();
      }
      // capture progress
      if (Math.abs(s.progress) > 0.01 && Math.abs(s.progress) < 1) {
        ctx.strokeStyle = s.progress > 0 ? '#39d5ff' : '#ff4d3a'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(s.x, s.y, 24, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.abs(s.progress)); ctx.stroke();
      }
    }
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

  drawPlacement(ctx, g) {
    const p = this.placing;
    if (p.tx == null) return;
    const def = BUILDINGS[p.type];
    const x = p.tx * TILE, y = p.ty * TILE;
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.translate(x, y);
    drawBuildingShape(ctx, def.shape, P0, def.w, def.h, this.time, -Math.PI / 4);
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
    mctx.imageSmoothingEnabled = false;
    mctx.clearRect(0, 0, size, size);
    mctx.drawImage(this.miniTerrain, 0, 0, size, size);
    mctx.imageSmoothingEnabled = true;
    mctx.drawImage(this.fogBig, 0, 0, size, size);
    const k = s / TILE;
    for (const site of g.sites) {
      if (!g.explored[g.tileIdx(site.x, site.y)]) continue;
      mctx.fillStyle = site.owner === TEAM_PLAYER ? '#39d5ff' : site.owner === TEAM_ENEMY ? '#ff4d3a' : '#d8c26a';
      mctx.beginPath(); mctx.arc(site.x * k, site.y * k, 2.5, 0, Math.PI * 2); mctx.fill();
    }
    for (const b of g.buildings) {
      if (b.dead || (b.team === TEAM_ENEMY && !b.discovered)) continue;
      mctx.fillStyle = b.team === TEAM_PLAYER ? '#39d5ff' : '#ff4d3a';
      mctx.fillRect(b.tx * s, b.ty * s, Math.max(2, b.w * s), Math.max(2, b.h * s));
    }
    for (const u of g.units) {
      if (u.team === TEAM_ENEMY && !g.isVisible(u)) continue;
      mctx.fillStyle = u.team === TEAM_PLAYER ? '#9ff0ff' : '#ff7a66';
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

