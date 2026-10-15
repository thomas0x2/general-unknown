// Bootstrap + main loop.
import { Game } from './game.js';
import { Renderer } from './render.js';
import { UI } from './ui.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { Music } from './music.js';
import { loadMeta, saveMeta, computeReward, encodeMemory, getProfile, isFactionUnlocked, unlockWatchList, recordMilestones } from './meta.js';
import { FACTIONS } from './factions.js';
import { setPlayerColor } from './shapes.js';
import { randomSeed } from './rng.js';

const STEP = 1 / 30;

class App {
  constructor() {
    this.meta = loadMeta();
    this.factionId = FACTIONS[this.meta.faction] && isFactionUnlocked(this.meta, this.meta.faction) ? this.meta.faction : 'valdara';
    this.applyFactionLook();
    this.audio = new Audio();
    this.music = new Music(this.audio);
    try { this.autoRepair = localStorage.getItem('gu-autorepair') === '1'; } catch { this.autoRepair = false; }
    // browsers only allow audio after a user gesture: start the score on the first one
    const kick = () => { this.music.start(); window.removeEventListener('pointerdown', kick); window.removeEventListener('keydown', kick); };
    window.addEventListener('pointerdown', kick);
    window.addEventListener('keydown', kick);
    this.renderer = new Renderer(document.getElementById('world'));
    this.game = null;
    this.speed = 1;
    this.paused = false;
    this.modal = false;
    this.acc = 0;
    this.now = 0;
    this.overAt = null;
    this.input = new Input(this);
    this.ui = new UI(this);
    window.addEventListener('resize', () => { this.renderer.resize(); this.renderer.clampCam(); });
    this.renderer.resize();
    this.ui.showTitle();
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  saveMeta() { saveMeta(this.meta); }

  get profile() { return getProfile(this.meta, this.factionId); }

  setFaction(fid) {
    if (!isFactionUnlocked(this.meta, fid)) return false;
    this.factionId = fid;
    this.meta.faction = fid;
    getProfile(this.meta, fid);
    this.saveMeta();
    this.applyFactionLook();
    return true;
  }

  applyFactionLook() {
    const f = FACTIONS[this.factionId];
    setPlayerColor(f.color);
    document.documentElement.style.setProperty('--faction', f.color);
  }

  startRun(opts = {}) {
    const m = this.profile;
    if (opts.newMap) { m.seed = randomSeed(); m.memory = ''; }
    if (opts.escalation != null) m.escalation = Math.min(opts.escalation, m.maxEscalation);
    this.saveMeta();
    this.game = new Game({ profile: m, faction: this.factionId, seed: m.seed, escalation: m.escalation });
    this.game.unlockWatch = unlockWatchList(this.meta);
    this.game.autoRepair = this.autoRepair;
    this.renderer.setGame(this.game);
    this.renderer.resize();
    this.renderer.clampCam();
    this.input.stopPlacing();
    this.input.setMode(null);
    this.input.groups = {};
    this.paused = false;
    this.modal = false;
    this.overAt = null;
    this.setSpeed(1);
    this.ui.enterGame();
    if (this.game.research.ready > 0) setTimeout(() => this.ui.openResearch(), 600);
  }

  setSpeed(s) {
    this.speed = s;
    for (const b of document.querySelectorAll('[data-speed]')) b.classList.toggle('on', +b.dataset.speed === s);
  }

  togglePause() { this.paused = !this.paused; }

  setAutoRepair(on) {
    this.autoRepair = on;
    if (this.game) this.game.autoRepair = on;
    try { localStorage.setItem('gu-autorepair', on ? '1' : '0'); } catch { /* ignore */ }
  }

  // Music intensity follows the battle: calm → enemies near the base → HQ in danger.
  musicIntensity() {
    const g = this.game;
    if (!g || g.over) return 0;
    const hq = g.hq;
    let near = 0;
    for (const u of g.units) {
      if (u.team !== 1 || u.garrison || u.dead) continue;
      if (Math.hypot(u.x - hq.x, u.y - hq.y) < 1500) near++;
    }
    const recentHit = g.buildings.some((b) => b.team === 0 && g.time - b.lastHit < 6);
    if ((near || recentHit) && hq.hp < hq.st.maxHp * 0.4) return 3;
    if (near >= 3 || recentHit) return 2;
    return 1;
  }

  endRun() {
    const g = this.game;
    const m = getProfile(this.meta, g.faction.id);
    const reward = computeReward(g);
    m.runs++;
    m.chronons += reward.total;
    m.lifetime += reward.total;
    m.bestWave = Math.max(m.bestWave, g.wave.n);
    m.bestTime = Math.max(m.bestTime, Math.floor(g.time));
    if (g.over.victory) {
      m.victories++;
      if (g.escalation >= m.maxEscalation) m.maxEscalation = g.escalation + 1;
    }
    if (g.seed === m.seed) m.memory = encodeMemory(g.explored);
    m.history = [{ wave: g.wave.n, time: Math.floor(g.time), victory: !!g.over.victory, chronons: reward.total }, ...(m.history || [])].slice(0, 20);
    const unlocked = recordMilestones(this.meta, g);
    this.saveMeta();
    this.ui.showOver(g.over, reward, g, unlocked);
  }

  frame(t) {
    const dt = Math.min(0.1, (t - this.last) / 1000);
    this.last = t;
    this.now += dt;
    const g = this.game;
    if (g) {
      const running = !this.paused && !this.modal && !g.over;
      if (running) {
        this.acc += dt * this.speed;
        let n = 0;
        while (this.acc >= STEP && n < 12) { g.step(STEP); this.acc -= STEP; n++; }
        if (n >= 12) this.acc = 0;
      }
      this.input.update(dt);
      this.renderer.draw(running ? dt : 0);
      this.ui.update(dt);
      this.musicT = (this.musicT || 0) - dt;
      if (this.musicT <= 0) { this.musicT = 1; this.music.setIntensity(this.musicIntensity()); }
      if (g.over && this.overAt == null) {
        this.overAt = this.now;
        this.input.stopPlacing();
        this.ui.banner(g.over.victory ? 'HEGEMONY COMMAND DESTROYED' : g.over.retreat ? 'TEMPORAL JUMP' : 'HQ DESTROYED', g.over.victory ? 'The impossible has happened' : 'Initiating LOOKING GLASS…');
        setTimeout(() => {
          const f = document.getElementById('flash');
          f.hidden = false;
          this.audio.play('timejump');
        }, g.over.victory ? 2500 : 1200);
      }
      if (g.over && this.overAt != null && this.now - this.overAt > (g.over.victory ? 4.8 : 3.4) && !this.overShown) {
        this.overShown = true;
        document.getElementById('flash').hidden = true;
        this.endRun();
        this.game = null;
        this.music.setIntensity(0);
        this.overShown = false;
      }
    }
    requestAnimationFrame((tt) => this.frame(tt));
  }
}

window.app = new App();
