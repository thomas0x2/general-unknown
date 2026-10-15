// Mouse / keyboard input: selection, orders, placement, camera.
import { TILE, BUILDINGS, TEAM_PLAYER, TEAM_ENEMY, MAP_W } from './data.js';

export class Input {
  constructor(app) {
    this.app = app;
    this.canvas = app.renderer.canvas;
    this.mouse = { x: 0, y: 0, inside: false };
    this.keys = new Set();
    this.drag = null;
    this.pan = null;
    this.placing = null;
    this.mode = null;
    this.groups = {};
    this.lastGroupKey = null;
    this.lastGroupT = 0;
    this.lastClick = { t: 0, id: null };
    this.bind();
  }

  get game() { return this.app.game; }
  get R() { return this.app.renderer; }
  get active() { return this.game && !this.game.over && !this.app.modal; }

  bind() {
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('mousedown', (e) => this.onDown(e));
    window.addEventListener('mousemove', (e) => this.onMove(e));
    window.addEventListener('mouseup', (e) => this.onUp(e));
    c.addEventListener('mouseenter', () => { this.overCanvas = true; });
    c.addEventListener('mouseleave', () => { this.overCanvas = false; });
    window.addEventListener('mouseout', (e) => { if (!e.relatedTarget) this.mouse.inside = false; });
    c.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); this.keys.delete(e.key); });
    window.addEventListener('blur', () => this.keys.clear());

    const mm = document.getElementById('minimap');
    const mmMove = (e) => {
      if (!this.game) return;
      const r = mm.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * MAP_W * TILE;
      const y = ((e.clientY - r.top) / r.height) * MAP_W * TILE;
      return { x, y };
    };
    mm.addEventListener('contextmenu', (e) => e.preventDefault());
    mm.addEventListener('mousedown', (e) => {
      const p = mmMove(e);
      if (!p) return;
      if (e.button === 2 && this.active) { this.issueRight(p.x, p.y, e.shiftKey); return; }
      this.R.cam.x = p.x; this.R.cam.y = p.y; this.R.clampCam();
      this.mmDrag = true;
    });
    mm.addEventListener('mousemove', (e) => {
      if (!this.mmDrag || !(e.buttons & 1)) { this.mmDrag = false; return; }
      const p = mmMove(e);
      if (p) { this.R.cam.x = p.x; this.R.cam.y = p.y; this.R.clampCam(); }
    });
  }

  worldMouse() { return this.R.toWorld(this.mouse.x, this.mouse.y); }

  // Entity under a world point. Prefers units, then buildings. Hidden enemies are ignored.
  pick(wx, wy) {
    const g = this.game;
    let best = null, bd = Infinity;
    for (const u of g.units) {
      if (u.dead || (u.team === TEAM_ENEMY && !g.isVisible(u))) continue;
      const d = Math.hypot(u.x - wx, u.y - wy);
      if (d < u.radius + 6 / this.R.cam.zoom && d < bd) { bd = d; best = u; }
    }
    if (best) return best;
    const tx = Math.floor(wx / TILE), ty = Math.floor(wy / TILE);
    for (const b of g.buildings) {
      if (b.dead || (b.team === TEAM_ENEMY && !b.discovered)) continue;
      if (tx >= b.tx && tx < b.tx + b.w && ty >= b.ty && ty < b.ty + b.h) return b;
    }
    return null;
  }

  setMode(m) {
    this.mode = m;
    this.canvas.classList.toggle('amove', m === 'amove' || m === 'ability');
    if (m !== 'ability') this.R.abilityAim = null;
  }

  // Commander ability: untargeted abilities fire at once, targeted ones enter aim mode.
  triggerAbility() {
    const g = this.game;
    if (!g || !this.active) return;
    if (g.ability.cd > 0) {
      this.app.ui.notice(`${g.ability.name} recharging (${Math.ceil(g.ability.cd)}s)`, 'warn');
      this.app.audio.play('error');
      return;
    }
    if (!g.ability.target) { this.fireAbility(0, 0); return; }
    this.stopPlacing();
    this.setMode(this.mode === 'ability' ? null : 'ability');
  }

  fireAbility(x, y) {
    const r = this.game.useAbility(x, y);
    if (!r.ok) {
      if (r.reason) this.app.ui.notice(r.reason, 'warn');
      this.app.audio.play('error');
      return false;
    }
    this.setMode(null);
    return true;
  }

  startPlacing(type) {
    if (!this.game) return;
    if (!this.game.isUnlocked(type)) return;
    this.placing = { type };
    this.R.placing = this.placing;
    this.setMode(null);
    this.updatePlacing();
  }

  stopPlacing() {
    this.placing = null;
    this.R.placing = null;
  }

  updatePlacing() {
    const p = this.placing;
    if (!p || !this.game) return;
    const def = BUILDINGS[p.type];
    const w = this.worldMouse();
    p.tx = Math.round(w.x / TILE - def.w / 2);
    p.ty = Math.round(w.y / TILE - def.h / 2);
    const c = this.game.canPlace(p.type, p.tx, p.ty);
    p.ok = c.ok;
    p.reason = c.reason;
  }

  onDown(e) {
    this.mouse.x = e.clientX - this.R.view.ox; this.mouse.y = e.clientY - this.R.view.oy;
    this.app.audio.ensure();
    if (!this.game) return;
    if (e.button === 1) { this.pan = { x: e.clientX, y: e.clientY, cx: this.R.cam.x, cy: this.R.cam.y }; e.preventDefault(); return; }
    if (!this.active) return;
    const w = this.worldMouse();
    if (e.button === 2) {
      if (this.placing) { this.stopPlacing(); return; }
      if (this.mode) { this.setMode(null); return; }
      this.issueRight(w.x, w.y, e.shiftKey);
      return;
    }
    if (e.button !== 0) return;
    if (this.placing) {
      this.updatePlacing();
      const res = this.game.placeBuilding(this.placing.type, this.placing.tx, this.placing.ty);
      if (!res.ok) { this.app.audio.play('error'); return; }
      if (!e.shiftKey) this.stopPlacing();
      return;
    }
    if (this.mode === 'ability') { this.fireAbility(w.x, w.y); return; }
    if (this.mode === 'amove') {
      const t = this.pick(w.x, w.y);
      const units = this.myUnits();
      if (t && t.team === TEAM_ENEMY) this.game.orderAttack(units, t, e.shiftKey);
      else this.game.orderMove(units, w.x, w.y, true, e.shiftKey);
      this.R.moveMarker = { x: w.x, y: w.y, t: 0, attack: true };
      if (!e.shiftKey) this.setMode(null);
      return;
    }
    this.drag = { x0: this.mouse.x, y0: this.mouse.y, x1: this.mouse.x, y1: this.mouse.y, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey };
  }

  myUnits() { return this.game.selection.filter((e) => e.kind === 'unit' && e.team === TEAM_PLAYER); }

  issueRight(wx, wy, queue = false) {
    const g = this.game;
    const units = this.myUnits();
    if (units.length) {
      const t = this.pick(wx, wy);
      if (t && t.team === TEAM_ENEMY) {
        g.orderAttack(units, t, queue);
        this.R.moveMarker = { x: t.x, y: t.y, t: 0, attack: true };
      } else {
        g.orderMove(units, wx, wy, false, queue);
        this.R.moveMarker = { x: wx, y: wy, t: 0, attack: false };
      }
      this.app.audio.play('click', 0.5);
      return;
    }
    const b = g.selection.find((e) => e.kind === 'building' && e.team === TEAM_PLAYER && e.def.trains);
    if (b) {
      g.setRally(b, wx, wy);
      this.R.moveMarker = { x: wx, y: wy, t: 0, attack: false };
    }
  }

  onMove(e) {
    this.mouse.x = e.clientX - this.R.view.ox; this.mouse.y = e.clientY - this.R.view.oy;
    this.mouse.inside = true;
    if (this.pan) {
      const z = this.R.cam.zoom;
      this.R.cam.x = this.pan.cx - (e.clientX - this.pan.x) / z;
      this.R.cam.y = this.pan.cy - (e.clientY - this.pan.y) / z;
      this.R.clampCam();
    }
    if (this.drag) {
      this.drag.x1 = this.mouse.x; this.drag.y1 = this.mouse.y;
      if (Math.hypot(this.drag.x1 - this.drag.x0, this.drag.y1 - this.drag.y0) > 6) this.R.dragBox = this.drag;
    }
  }

  onUp(e) {
    if (e.button === 1) { this.pan = null; return; }
    if (e.button !== 0 || !this.drag) return;
    const d = this.drag;
    this.drag = null;
    this.R.dragBox = null;
    if (!this.game) return;
    const g = this.game;
    if (Math.hypot(d.x1 - d.x0, d.y1 - d.y0) > 6) {
      const a = this.R.toWorld(Math.min(d.x0, d.x1), Math.min(d.y0, d.y1));
      const b = this.R.toWorld(Math.max(d.x0, d.x1), Math.max(d.y0, d.y1));
      const inBox = g.units.filter((u) => u.team === TEAM_PLAYER && !u.dead && u.x >= a.x && u.x <= b.x && u.y >= a.y && u.y <= b.y);
      if (inBox.length) {
        g.selection = d.shift ? [...new Set([...this.myUnits(), ...inBox])] : inBox;
      } else if (!d.shift) g.selection = [];
      return;
    }
    // click
    const w = this.R.toWorld(d.x0, d.y0);
    const t = this.pick(w.x, w.y);
    const now = performance.now();
    if (t && t.kind === 'unit' && t.team === TEAM_PLAYER && (d.ctrl || (this.lastClick.id === t.id && now - this.lastClick.t < 350))) {
      // select all of this type on screen
      const tl = this.R.toWorld(0, 0), br = this.R.toWorld(this.R.view.w, this.R.view.h);
      g.selection = g.units.filter((u) => u.team === TEAM_PLAYER && u.type === t.type && u.x >= tl.x && u.x <= br.x && u.y >= tl.y && u.y <= br.y);
    } else if (t && d.shift && t.kind === 'unit' && t.team === TEAM_PLAYER) {
      const mine = this.myUnits();
      g.selection = mine.includes(t) ? mine.filter((u) => u !== t) : [...mine, t];
    } else g.selection = t ? [t] : [];
    this.lastClick = { t: now, id: t?.id };
  }

  onWheel(e) {
    e.preventDefault();
    if (!this.game) return;
    const before = this.worldMouse();
    const z = this.R.cam.zoom * Math.pow(1.0015, -e.deltaY);
    this.R.cam.zoom = Math.max(0.45, Math.min(1.9, z));
    const after = this.worldMouse();
    this.R.cam.x += before.x - after.x;
    this.R.cam.y += before.y - after.y;
    this.R.clampCam();
  }

  onKey(e) {
    const ui = this.app.ui;
    const key = e.key;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
    if (!this.game || this.game.over) return;
    // modals first
    if (ui.researchOpen) {
      if (key === 'Escape' || key === 'Tab') ui.closeResearch();
      else if (/^[1-9]$/.test(key)) ui.pickCard(+key - 1);
      else if (key.toLowerCase() === 'r' && !e.ctrlKey) document.getElementById('btn-reroll').click();
      e.preventDefault();
      return;
    }
    if (!document.getElementById('modal-info').hidden) {
      if (key === 'Escape') document.getElementById('modal-info').hidden = true;
      return;
    }
    if (ui.pauseOpen) {
      if (key === 'Escape' || key === 'p' || key === 'P') ui.closePause();
      return;
    }
    this.keys.add(e.code);
    const g = this.game;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code) && !e.ctrlKey && !e.metaKey && !e.altKey) return; // camera
    const lower = key.toLowerCase();

    if (key === 'Escape') {
      if (this.placing) this.stopPlacing();
      else if (this.mode) this.setMode(null);
      else if (g.selection.length) g.selection = [];
      else ui.openPause();
      return;
    }
    if (lower === 'p' || key === 'Pause') { this.app.togglePause(); return; }
    if (key === 'Tab') { e.preventDefault(); ui.openResearch(); return; }
    if (lower === 'm' && e.shiftKey) { ui.toggleMusic(); return; }
    if (lower === 'm' && !e.ctrlKey) { ui.toggleMute(); return; }
    if (lower === 'g') { this.triggerAbility(); return; }
    if (key === '+' || key === '=') { this.app.setSpeed(Math.min(3, this.app.speed + 1)); return; }
    if (key === '-' || key === '_') { this.app.setSpeed(Math.max(1, this.app.speed - 1)); return; }
    if (key === ' ') {
      e.preventDefault();
      const p = ui.lastAlert || g.hq;
      if (p) { this.R.cam.x = p.x; this.R.cam.y = p.y; this.R.clampCam(); }
      ui.lastAlert = null;
      return;
    }
    if ((e.ctrlKey || e.metaKey) && lower === 'a') {
      e.preventDefault();
      g.selection = g.units.filter((u) => u.team === TEAM_PLAYER && u.def.weapon && !u.spawned);
      return;
    }
    if (/^[0-9]$/.test(key)) {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        this.groups[key] = g.selection.filter((x) => x.team === TEAM_PLAYER);
        ui.notice(`Group ${key} assigned (${this.groups[key].length})`, 'info');
      } else if (this.groups[key]) {
        const list = this.groups[key].filter((x) => !x.dead);
        this.groups[key] = list;
        if (!list.length) return;
        const now = performance.now();
        if (this.lastGroupKey === key && now - this.lastGroupT < 400) {
          const cx = list.reduce((a, u) => a + u.x, 0) / list.length, cy = list.reduce((a, u) => a + u.y, 0) / list.length;
          this.R.cam.x = cx; this.R.cam.y = cy; this.R.clampCam();
        }
        g.selection = [...list];
        this.lastGroupKey = key; this.lastGroupT = now;
      }
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // unit shortcuts
    if (this.myUnits().length) {
      if (lower === 'h') { g.orderHold(this.myUnits()); return; }
    }
    if (key.length === 1 && ui.hotkey(key)) e.preventDefault();
  }

  update(dt) {
    if (!this.game) return;
    const R = this.R;
    const k = this.keys;
    let ix = 0, iy = 0;
    const typing = this.app.modal;
    if (!typing) {
      if (k.has('KeyA') || k.has('ArrowLeft')) ix -= 1;
      if (k.has('KeyD') || k.has('ArrowRight')) ix += 1;
      if (k.has('KeyW') || k.has('ArrowUp')) iy -= 1;
      if (k.has('KeyS') || k.has('ArrowDown')) iy += 1;
    }
    const edge = 10;
    if (this.overCanvas && !this.pan && !this.drag && document.hasFocus()) {
      if (this.mouse.x <= edge) ix -= 1;
      if (this.mouse.x >= R.view.w - edge) ix += 1;
      if (this.mouse.y <= edge) iy -= 1;
      if (this.mouse.y >= R.view.h - edge) iy += 1;
    }
    // eased camera velocity: quick to start, glides to a stop
    const len = Math.hypot(ix, iy) || 1;
    const top = (k.has('ShiftLeft') || k.has('ShiftRight') ? 1700 : 950) / R.cam.zoom;
    const tx = (ix / len) * top, ty = (iy / len) * top;
    this.vel ??= { x: 0, y: 0 };
    const ease = 1 - Math.exp(-dt * (ix || iy ? 14 : 9));
    this.vel.x += (tx - this.vel.x) * ease;
    this.vel.y += (ty - this.vel.y) * ease;
    if (Math.abs(this.vel.x) > 1 || Math.abs(this.vel.y) > 1) {
      R.cam.x += this.vel.x * dt; R.cam.y += this.vel.y * dt; R.clampCam();
    } else { this.vel.x = 0; this.vel.y = 0; }
    if (this.placing) this.updatePlacing();
    if (this.mode === 'ability') { const w = this.worldMouse(); R.abilityAim = { x: w.x, y: w.y }; }
    if (this.overCanvas) {
      const w = this.worldMouse();
      R.hover = this.pick(w.x, w.y);
    } else R.hover = null;
    // drop dead entries in mode
    if (this.mode === 'amove' && !this.myUnits().length) this.setMode(null);
  }
}
