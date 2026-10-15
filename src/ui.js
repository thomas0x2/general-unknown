// DOM user interface: screens, HUD, command card, research drafts, Chrono Lab.
import {
  UNITS, BUILDINGS, BUILD_ORDER, ARMOR_NAMES, WAVE, TEAM_PLAYER, TEAM_ENEMY, ENEMY_UNITS,
} from './data.js';
import { iconFor, emblemFor } from './shapes.js';
import { BRANCHES, metaNodesFor, nodeById, getProfile, level, nodeCost, nodeAvailable, buyNode, isFactionUnlocked, unlockProgress, unlockSummary } from './meta.js';
import { FACTIONS, FACTION_ORDER } from './factions.js';
import { describeCard } from './upgrades.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const fmtTime = (s) => {
  s = Math.max(0, Math.floor(s));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
// Command card hotkeys (6×2 grid). W A S D are reserved for the camera.
const CARD_KEYS = ['Q', 'E', 'R', 'F', 'T', 'Y', 'Z', 'X', 'C', 'V', 'B', 'N'];
const SLOT_SELL = 10, SLOT_REPAIR = 11;
const TARGETS = { ground: 'Ground', air: 'Air', both: 'Ground + Air' };

// Icon for a Chrono Lab node: the first unit or structure it unlocks.
function nodeIcon(n) {
  const id = n.unlocks?.[0];
  if (!id) return null;
  return UNITS[id] ? ['unit', UNITS[id]] : ['building', BUILDINGS[id]];
}

const INTRO = `14 MARCH 2034 — 03:58 LOCAL

The Hegemony has crossed the border.

Their armored columns, drone swarms and hypersonic missiles outnumber our entire military fifty to one. Every war-game we ever ran ends the same way.

You are the general nobody has heard of. Your name was struck from every record the day they gave you Project LOOKING GLASS: a prototype time machine buried beneath your headquarters.

You cannot win this war. Nobody can.

But each time your headquarters falls, the machine throws your mind back to this first morning — carrying the blueprints, the research and the hard lessons of the timeline that died.

Hold the line as long as you can.
Die. Go back. Try again.

Somewhere in the loop, the impossible becomes possible.`;

const MANUAL = `
<div class="kicker">FIELD MANUAL</div>
<h2>GENERAL UNKNOWN</h2>
<p>You command the military of a small nation against the overwhelming forces of the Hegemony. Waves of enemy troops, armor and drones will come for your <b>Command HQ</b>. When it falls, the timeline collapses — and the time machine sends you back to the start, with <b>Chronons</b> to spend in the Chrono Lab on permanent upgrades.</p>
<h3>Factions</h3>
<p>Six allied nations can hold the line, each with its own doctrine, units, structures, research cards and commander ability, and each keeps its own save: chronons and Chrono Lab unlocks are earned per faction. You start with Valdara; the other nations must be earned. Each needs two demanding goals (some counted over your whole career with any faction, some to be achieved within a single timeline), and the later ones require other factions first. The faction screen shows what each one needs. Valdara fights with combined arms; Iron Guard drowns the enemy in infantry; the Swarm Collective fields cheap drones by the hundred; Ghostnet hacks and stuns the Hegemony's machines and steals them; the Forge Union outbuilds everyone; the Sky Republic rules the air.</p>
<h3>Objectives</h3>
<ul>
<li><b>Survive.</b> Every wave you survive earns Chronons. Waves grow stronger forever.</li>
<li><b>Research.</b> Your research program produces random upgrades of five rarities. Press <kbd>Tab</kbd> when a breakthrough is ready.</li>
<li><b>Mine.</b> Income comes from <b>rare-earth deposits</b>: build a <b>Mine</b> on a deposit and enough <b>Refineries</b> to process the ore (the HQ refines one mine, each Refinery two more). Far deposits need an <b>Outpost</b> first: expensive, but it can be built anywhere you have scouted and extends your build area.</li>
<li><b>Scout.</b> The map is covered by fog of war. Drones and radar reveal it, but drones can only fly within range of your HQ, Drone Bays, Outposts and <b>Uplink Towers</b>. Grab <b>supply caches</b> on the way.</li>
<li><b>Supply and compute.</b> Infantry and aircraft use supply (Logistics Hubs); drones and robots use compute (<b>Data Centers</b>).</li>
<li><b>Strike back.</b> Find the enemy and destroy their <b>Forward Outposts</b> (waves launch from them) and base <b>facilities</b> — each one permanently weakens the enemy for this timeline. Destroying <b>Hegemony Command</b> wins the war.</li>
</ul>
<h3>Controls</h3>
<table>
<tr><td>Left click / drag</td><td>Select units (drag a box). Shift adds to selection. Double-click selects all of a type on screen.</td></tr>
<tr><td>W A S D / arrows</td><td>Move along the map (hold Shift to move faster). Screen edges, middle-drag and the minimap also work; the mouse wheel zooms.</td></tr>
<tr><td>Shift + order</td><td>Queue move, attack-move and attack orders as waypoints.</td></tr>
<tr><td>Right click</td><td>Move / attack. With a production building selected: set rally point.</td></tr>
<tr><td>Q + click</td><td>Attack-move: advance and engage everything on the way.</td></tr>
<tr><td>E / R (or H)</td><td>Stop / hold position.</td></tr>
<tr><td>Q E R F T Y / Z X C V B N</td><td>Command card hotkeys (training units, commands; B recycles and N repairs a building).</td></tr>
<tr><td>Build panel (right)</td><td>Click a structure, then click the map. Shift-click to place several. Right click / Esc cancels.</td></tr>
<tr><td>Ctrl + 1-9 / 1-9</td><td>Assign / recall control groups (press twice to jump the camera).</td></tr>
<tr><td>Ctrl + A</td><td>Select your whole army.</td></tr>
<tr><td>Space</td><td>Jump to the latest alert (or your HQ).</td></tr>
<tr><td>Tab</td><td>Open the research program.</td></tr>
<tr><td>G</td><td>Commander ability (then click a scouted target if it needs one).</td></tr>
<tr><td>N</td><td>Repair the selected building (costs credits over time). The build panel has an auto-repair switch for your whole base.</td></tr>
<tr><td>Shift + M</td><td>Music on/off.</td></tr>
<tr><td>P / Esc</td><td>Pause / command menu. <kbd>+</kbd> <kbd>-</kbd> change game speed, <kbd>M</kbd> mutes.</td></tr>
</table>
<h3>Combat notes</h3>
<ul>
<li>Every weapon has strengths: small arms shred infantry, AT missiles kill vehicles, MANPADS and lasers kill drones. Hover anything to see its stats.</li>
<li>From wave ${WAVE.missileFrom} the enemy fires <b>cruise missiles</b> at your buildings (red tracks). Laser CIWS, Interceptor Arrays, Aegis Rovers and EW Jammers counter them. Destroying their Missile Silo stops them for good.</li>
<li>Your <b>Missile Battery</b> and <b>Railgun</b> can only fire at what you can see: pair them with drones or radar.</li>
<li>The Hegemony's base has a missile shield. Your salvos will be intercepted until you break it.</li>
</ul>`;

export class UI {
  constructor(app) {
    this.app = app;
    this.hudT = 0;
    this.miniT = 0;
    this.cardSig = '';
    this.cardSlots = [];
    this.selHTML = '';
    this.sellArm = -Infinity;
    this.lastAlert = null;
    this.notices = [];
    this.previewT = 0;
    this.minimap = $('minimap');
    this.minimap.width = 340; this.minimap.height = 340;
    this.mctx = this.minimap.getContext('2d');
    this.mctx.scale(2, 2);
    this.bind();
  }

  get game() { return this.app.game; }
  get meta() { return this.app.meta; }
  get faction() { return FACTIONS[this.app.factionId]; }
  get profile() { return getProfile(this.meta, this.app.factionId); }

  // ---------------------------------------------------------------- binding
  bind() {
    $('btn-play').onclick = () => { this.app.audio.ensure(); this.click(); this.meta.seenIntro ? this.showFactions() : this.showIntro(); };
    $('btn-manual').onclick = () => this.showInfo(MANUAL);
    $('btn-intro-go').onclick = () => { this.meta.seenIntro = true; this.app.saveMeta(); this.showFactions(); };
    $('btn-intro-skip').onclick = () => { this.meta.seenIntro = true; this.app.saveMeta(); this.showFactions(); };
    $('btn-lab-back').onclick = () => this.showFactions();
    $('btn-fac-back').onclick = () => this.showTitle();
    $('btn-ability').onclick = () => this.app.input.triggerAbility();
    $('fac-grid').addEventListener('click', (e) => {
      const c = e.target.closest('[data-faction]');
      if (!c) return;
      this.app.audio.ensure();
      if (!this.app.setFaction(c.dataset.faction)) {
        this.app.audio.play('error');
        c.classList.remove('denied'); void c.offsetWidth; c.classList.add('denied');
        return;
      }
      this.click();
      this.showLab();
    });
    $('btn-begin').onclick = () => { this.app.audio.ensure(); this.app.startRun({ newMap: $('chk-newmap').checked, escalation: +($('sel-esc').value || 0) }); };
    $('btn-over-lab').onclick = () => (this.overNext === 'factions' ? this.showFactions() : this.showLab());
    $('btn-research').onclick = () => this.openResearch();
    $('btn-reroll').onclick = () => { this.game.rerollDraft(); this.click(); this.renderDraft(); };
    $('btn-research-later').onclick = () => this.closeResearch();
    $('btn-pause').onclick = () => this.app.togglePause();
    $('btn-mute').onclick = () => this.toggleMute();
    $('btn-menu').onclick = () => this.openPause();
    $('btn-resume').onclick = () => this.closePause();
    $('btn-pause-manual').onclick = () => this.showInfo(MANUAL);
    $('btn-picks').onclick = () => this.showPicks();
    $('btn-timejump').onclick = () => this.confirmTimeJump();
    $('btn-info-close').onclick = () => { $('modal-info').hidden = true; };
    for (const b of document.querySelectorAll('[data-speed]')) b.onclick = () => this.app.setSpeed(+b.dataset.speed);
    $('btn-mute').textContent = this.app.audio.muted ? '✕' : '♪';
    for (const id of ['btn-music', 'btn-music-title']) $(id).onclick = () => this.toggleMusic();
    this.syncMusicButtons();

    $('buildpanel').addEventListener('click', (e) => {
      if (e.target.closest('#btn-autorepair')) { this.app.setAutoRepair(!this.game.autoRepair); this.click(); this.renderBuildPanel(); return; }
      const btn = e.target.closest('[data-build]');
      if (!btn || btn.classList.contains('locked')) return;
      this.app.input.startPlacing(btn.dataset.build);
    });
    $('cmdcard').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-slot]');
      if (btn) this.runSlot(+btn.dataset.slot);
    });
    $('selinfo').addEventListener('click', (e) => {
      const q = e.target.closest('[data-q]');
      if (q && this.game) { this.game.cancelTrain(this.game.selection[0], +q.dataset.q); this.click(); return; }
      const m = e.target.closest('[data-mtype]');
      if (m && this.game) {
        const t = m.dataset.mtype;
        this.game.selection = e.shiftKey ? this.game.selection.filter((u) => u.type !== t) : this.game.selection.filter((u) => u.type === t);
      }
    });
    $('lab-branches').addEventListener('click', (e) => {
      const n = e.target.closest('[data-node]');
      if (!n) return;
      if (buyNode(this.meta, this.app.factionId, n.dataset.node)) {
        this.app.audio.ensure();
        this.app.audio.play('upgrade');
        this.renderLab(n.dataset.node);
      } else this.app.audio.play('error');
    });
    $('research-cards').addEventListener('click', (e) => {
      const c = e.target.closest('[data-card]');
      if (c) this.pickCard(+c.dataset.card);
    });

    // tooltips
    const tip = $('tooltip');
    document.addEventListener('mouseover', (e) => {
      const el = e.target.closest('[data-tip],[data-build],[data-slot],[data-node],[data-mtype],[data-q]');
      if (!el) { tip.hidden = true; this.tipEl = null; return; }
      this.tipEl = el;
      const html = this.tooltipFor(el);
      if (!html) { tip.hidden = true; return; }
      tip.innerHTML = html;
      tip.hidden = false;
    });
    document.addEventListener('mousemove', (e) => {
      if (tip.hidden) return;
      const r = tip.getBoundingClientRect();
      let x = e.clientX + 16, y = e.clientY + 16;
      if (x + r.width > window.innerWidth - 4) x = e.clientX - r.width - 12;
      if (y + r.height > window.innerHeight - 4) y = e.clientY - r.height - 12;
      tip.style.left = x + 'px'; tip.style.top = y + 'px';
    });
  }

  click() { this.app.audio.play('click'); }
  toggleMusic() {
    this.app.music.toggle();
    this.syncMusicButtons();
  }

  syncMusicButtons() {
    const on = this.app.music.enabled;
    $('btn-music').classList.toggle('off', !on);
    $('btn-music-title').textContent = on ? '♫ Music on' : '♫ Music off';
    $('btn-music-title').classList.toggle('off', !on);
  }

  toggleMute() { $('btn-mute').textContent = this.app.audio.toggleMute() ? '✕' : '♪'; }

  // ---------------------------------------------------------------- screens
  showScreen(id) {
    for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
    $('hud').hidden = id !== null;
    if (id === null) $('hud').hidden = false;
    $('tooltip').hidden = true;
  }

  showTitle() {
    this.showScreen('screen-title');
    const ps = Object.values(this.meta.profiles);
    const runs = ps.reduce((a, p) => a + p.runs, 0);
    const best = Math.max(0, ...ps.map((p) => p.bestWave));
    const wins = ps.reduce((a, p) => a + p.victories, 0);
    const played = Object.entries(this.meta.profiles).filter(([, p]) => p.runs).length;
    $('title-stats').innerHTML = runs
      ? `Timelines lived: ${runs} across ${played} faction${played === 1 ? '' : 's'} &nbsp;·&nbsp; Best: wave ${best} &nbsp;·&nbsp; Victories: ${wins}`
      : 'No previous timelines detected.';
    $('btn-play').textContent = runs ? 'RETURN TO THE LOOP' : 'TAKE COMMAND';
  }

  showIntro() {
    this.showScreen('screen-intro');
    const el = $('intro-text');
    let i = 0;
    clearInterval(this.introTimer);
    $('btn-intro-go').hidden = true;
    this.introTimer = setInterval(() => {
      i += 2;
      el.innerHTML = esc(INTRO.slice(0, i)) + '<span class="cursor"></span>';
      if (i >= INTRO.length) { clearInterval(this.introTimer); $('btn-intro-go').hidden = false; }
    }, 22);
  }

  showFactions() {
    clearInterval(this.introTimer);
    this.showScreen('screen-factions');
    const relocked = this.meta.relocked || [];
    $('fac-relock').hidden = !relocked.length;
    if (relocked.length) {
      $('fac-relock').innerHTML = `<b>Faction unlocks reset to the new rules.</b> Re-locked: ${relocked.map((fid) => FACTIONS[fid].name).join(', ')}. Their chronons and Chrono Lab upgrades are kept for when you earn them back.`;
      this.meta.relocked = [];
      this.app.saveMeta();
    }
    const open = FACTION_ORDER.filter((fid) => isFactionUnlocked(this.meta, fid)).length;
    $('fac-count').textContent = `${open} of ${FACTION_ORDER.length} factions unlocked`;
    $('fac-grid').innerHTML = FACTION_ORDER.map((fid) => {
      const f = FACTIONS[fid];
      const p = this.meta.profiles[fid];
      const sig = f.units.filter((u) => !['rifle', 'recon', 'at_team', 'manpads'].includes(u)).slice(0, 8);
      const diff = `<span class="diff" title="Difficulty">${[1, 2, 3].map((i) => `<i class="${i <= f.difficulty ? 'on' : ''}"></i>`).join('')}</span>`;
      const progress = p?.runs ? `Timelines <b>${p.runs}</b> · best wave <b>${p.bestWave}</b> · <b>${p.chronons}</b> ⧗` : 'No timelines yet';
      if (!isFactionUnlocked(this.meta, fid)) {
        const u = unlockProgress(this.meta, fid);
        return `<button class="fac-card locked" data-faction="${fid}" style="--fc:${f.color}" aria-label="${f.name} (locked)">
        <div class="fac-top"><img class="emblem" src="${emblemFor(f, UNITS[f.emblem])}" alt="">
          <div><div class="fac-name">${f.name}</div><div class="fac-nation">${f.nation}</div><div class="fac-doc">${f.doctrine}</div></div></div>
        <div class="fac-motto">“${f.motto}”</div>
        <div class="fac-desc">${f.desc}</div>
        <div class="fac-lock">
          <div class="fac-lock-head"><span class="lock-badge">LOCKED</span><span class="fac-lock-hint">${f.unlock.hint}</span></div>
          ${u.requires.map((r) => `<div class="fac-req ${r.done ? 'done' : ''}">${r.done ? '✓' : '🔒'} Unlock <b>${r.name}</b> first</div>`).join('')}
          ${u.goals.map((gl) => `<div class="fac-goal ${gl.done ? 'done' : ''}">
            <div class="fac-goal-row"><b>${gl.done ? '✓ ' : ''}${gl.text}</b><span class="fac-scope">${gl.single ? 'one timeline' : 'lifetime'}</span></div>
            <div class="fac-lock-bar"><div style="width:${gl.frac * 100}%"></div></div>
            <div class="fac-lock-num">${gl.have} / ${gl.need}</div>
          </div>`).join('')}
        </div>
        <div class="fac-foot"><span>Ability: ${f.ability.name}</span>${diff}</div>
      </button>`;
      }
      return `<button class="fac-card ${this.meta.faction === fid ? 'last' : ''}" data-faction="${fid}" style="--fc:${f.color}">
        <div class="fac-top"><img class="emblem" src="${emblemFor(f, UNITS[f.emblem])}" alt="">
          <div><div class="fac-name">${f.name}</div><div class="fac-nation">${f.nation}</div><div class="fac-doc">${f.doctrine}</div></div></div>
        <div class="fac-motto">“${f.motto}”</div>
        <div class="fac-desc">${f.desc}</div>
        <ul>${f.playstyle.map((x) => `<li>${x}</li>`).join('')}</ul>
        <div class="fac-units">${sig.map((u) => `<img src="${iconFor('unit', UNITS[u], 0, 44, f.color)}" alt="${UNITS[u].name}" title="${UNITS[u].name}">`).join('')}</div>
        <div class="fac-foot"><span>${progress}</span>${diff}</div>
      </button>`;
    }).join('');
  }

  showLab() {
    clearInterval(this.introTimer);
    this.showScreen('screen-lab');
    this.renderLab();
  }

  renderLab(flash) {
    const m = this.profile;
    const f = this.faction;
    $('lab-kicker').textContent = `${f.name.toUpperCase()} · ${f.doctrine.toUpperCase()}`;
    $('lab-emblem').src = emblemFor(f, UNITS[f.emblem]);
    $('lab-chronons').textContent = m.chronons;
    $('lab-stats').innerHTML = [
      ['Timelines lived', m.runs], ['Best wave', m.bestWave], ['Longest timeline', fmtTime(m.bestTime)],
      ['Victories', m.victories], ['Lifetime chronons', m.lifetime], ['Sector', `#${(m.seed % 100000).toString().padStart(5, '0')}`],
    ].map(([k, v]) => `<span>${k}: <b>${v}</b></span>`).join('');
    let html = '';
    for (const br of BRANCHES) {
      html += `<div class="branch ${br.id}"><h3>${br.name.toUpperCase()}</h3><p>${br.desc}</p>`;
      const nodes = metaNodesFor(f.id).filter((n) => n.branch === br.id);
      const groups = [...new Set(nodes.map((n) => n.group || ''))];
      for (const gname of groups) {
        if (gname) html += `<h4>${gname.toUpperCase()}</h4>`;
        html += '<div class="nodes">';
        for (const n of nodes.filter((x) => (x.group || '') === gname)) html += this.nodeHTML(n, flash === n.id);
        html += '</div>';
      }
      html += '</div>';
    }
    $('lab-branches').innerHTML = html;
    $('btn-begin').textContent = `BEGIN TIMELINE #${m.runs + 1}`;
    $('esc-wrap').hidden = m.maxEscalation <= 0;
    if (m.maxEscalation > 0) {
      const sel = $('sel-esc');
      sel.innerHTML = Array.from({ length: m.maxEscalation + 1 }, (_, i) =>
        `<option value="${i}" ${i === m.escalation ? 'selected' : ''}>${i === 0 ? 'None' : `Level ${i} (+${i * 20}% enemy, +${i * 25}% chronons)`}</option>`).join('');
    }
  }

  nodeHTML(n, flash) {
    const m = this.profile;
    const lv = level(m, n.id), max = n.cost.length;
    const cost = nodeCost(m, n);
    const avail = nodeAvailable(m, n);
    const cls = ['node'];
    if (lv >= max) cls.push('maxed');
    else if (!avail) cls.push('req');
    else if (cost > m.chronons) cls.push('poor');
    if (flash) cls.push('bought');
    const ic = nodeIcon(n);
    const img = ic ? `<img src="${iconFor(ic[0], ic[1])}" alt="">` : n.faction ? `<img src="${emblemFor(this.faction, UNITS[this.faction.emblem])}" alt="">` : '';
    const pips = max > 1 ? `<div class="pips">${Array.from({ length: max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</div>` : '';
    const right = lv >= max ? (max > 1 ? 'MAX' : '✓') : avail ? `${cost} ⧗` : '🔒';
    return `<div class="${cls.join(' ')}" data-node="${n.id}">${img}<div class="nb"><div class="nn">${n.name}</div><div class="nd">${n.desc}</div>${pips}</div><div class="nc">${right}</div></div>`;
  }

  showOver(result, reward, game, unlocked = []) {
    this.closeResearch(true);
    $('modal-pause').hidden = true;
    this.showScreen('screen-over');
    const n = this.profile.runs;
    const v = result.victory, r = result.retreat;
    $('over-kicker').textContent = `${game.faction.name.toUpperCase()} · TIMELINE #${n} — ${v ? 'RESOLVED' : r ? 'ABANDONED' : 'COLLAPSED'}`;
    const t = $('over-title');
    t.textContent = v ? 'IMPOSSIBLE VICTORY' : r ? 'TEMPORAL JUMP' : 'HQ DESTROYED';
    t.className = v ? 'victory' : 'defeat';
    const flav = v
      ? 'Hegemony Command is rubble. Their war machine grinds to a halt, and for the first time in a thousand loops, the morning after the invasion actually comes. The Hegemony will remember this timeline — next time they will hit harder. Escalation unlocked.'
      : r
        ? 'You pulled the lever before the end. The world dissolves into white noise, and you wake up at 03:58 on the first morning — again.'
        : ['The Hegemony\'s banners rise over the capital. Beneath the ruins of your headquarters, LOOKING GLASS hums to life one last time…',
          'Your last transmission is cut mid-sentence. Somewhere below, a capacitor bank discharges, and the timeline folds in on itself.',
          'They came in numbers no doctrine could answer. But you remember everything now — every mistake, every blueprint.'][n % 3];
    $('over-flavor').textContent = flav;
    const s = game.stats;
    $('over-stats').innerHTML = [
      ['Waves faced', game.wave.n], ['Time in theater', fmtTime(game.time)], ['Enemies destroyed', s.kills],
      ['Units lost', s.lost], ['Outposts destroyed', s.outposts], ['Facilities destroyed', s.facilities],
      ['Research breakthroughs', game.research.picks.length], ['Credits earned', Math.floor(s.earned)],
    ].map(([k, v2]) => `<div><span>${k}</span><b>${v2}</b></div>`).join('');
    $('over-reward').innerHTML = '<div class="hint" style="border:none">CHRONONS EARNED</div>' + reward.parts.map(([k, v2]) => `<div><span>${k}</span><b>+${v2}</b></div>`).join('') +
      (reward.mult !== 1 ? `<div class="mult"><span>Multiplier</span><b>×${reward.mult.toFixed(2)}</b></div>` : '') +
      `<div class="total"><span>CHRONONS</span><b>+${reward.total}</b></div>`;
    $('over-unlocks').innerHTML = unlocked.map((fid) => {
      const f = FACTIONS[fid];
      return `<div class="unlock-card" style="--fc:${f.color}"><img class="emblem" src="${emblemFor(f, UNITS[f.emblem])}" alt="">
        <div><div class="kicker">NEW FACTION UNLOCKED</div><div class="fac-name">${f.name}</div><div class="fac-nation">${f.doctrine} · ${unlockSummary(fid)}</div></div></div>`;
    }).join('');
    $('btn-over-lab').textContent = unlocked.length ? 'CHOOSE YOUR NEXT FACTION' : 'ENTER THE CHRONO LAB';
    this.overNext = unlocked.length ? 'factions' : 'lab';
  }

  showInfo(html) {
    $('info-content').innerHTML = html;
    $('modal-info').hidden = false;
  }

  showPicks() {
    const picks = this.game?.research.picks || [];
    const html = `<div class="kicker">RESEARCH LOG</div><h2>${picks.length} BREAKTHROUGHS</h2>` + (picks.length
      ? `<div class="picklist">${picks.map((p) => {
        const d = describeCard(p);
        return `<div class="pick" style="--rc:${d.rarity.color}"><b>${d.card.name}</b><span>${d.rarity.name} · ${esc(d.text)}</span></div>`;
      }).join('')}</div>`
      : '<p>No research completed yet in this timeline.</p>');
    this.showInfo(html);
  }

  // ------------------------------------------------------------------- game
  enterGame() {
    this.showScreen(null);
    this.cardSig = '';
    this.selHTML = '';
    this.lastAlert = null;
    $('notices').innerHTML = '';
    this.notices = [];
    this.renderBuildPanel();
    this.updateHUD(true);
    const f = this.game.faction;
    $('t-timeline').textContent = `${f.short.toUpperCase()} · T${this.profile.runs + 1}`;
    $('t-ability').textContent = f.ability.name;
    this.banner('TIMELINE ' + (this.profile.runs + 1), `${f.name}: ${f.motto}`);
  }

  renderBuildPanel() {
    const g = this.game;
    const sec = (title, cat) => `<h4>${title}</h4>` + BUILD_ORDER.filter((t) => BUILDINGS[t].cat === cat && g.inRoster(t)).map((t) => {
      const def = BUILDINGS[t];
      const locked = !g.available(t);
      return `<button class="bbtn ${locked ? 'locked' : ''}" data-build="${t}"><img src="${iconFor('building', def)}" alt=""><span class="nm">${def.name}</span><span class="cost">${locked ? '🔒' : g.costOf(t, true)}</span></button>`;
    }).join('');
    $('buildpanel').innerHTML = `<button id="btn-autorepair" class="autorepair ${g.autoRepair ? 'on' : ''}" data-tip="autorepair">🔧 Auto-repair <b>${g.autoRepair ? 'ON' : 'OFF'}</b></button>` +
      sec('BASE', 'base') + sec('DEFENSE', 'defense');
  }

  banner(text, sub = '') {
    const b = $('banner');
    b.hidden = true;
    void b.offsetWidth;
    b.innerHTML = `${esc(text)}${sub ? `<small>${esc(sub)}</small>` : ''}`;
    b.hidden = false;
    clearTimeout(this.bannerT);
    this.bannerT = setTimeout(() => { b.hidden = true; }, 2700);
  }

  notice(text, level) {
    const el = document.createElement('div');
    el.className = `notice ${level}`;
    el.textContent = text;
    $('notices').appendChild(el);
    this.notices.push({ el, t: 0 });
    while (this.notices.length > 5) this.notices.shift().el.remove();
  }

  // Process game events: notifications, sounds, pings.
  handleEvents() {
    const g = this.game, R = this.app.renderer;
    for (const ev of g.events) {
      if (ev.type === 'notify') {
        this.notice(ev.text, ev.level);
        if (ev.pos) {
          R.ping(ev.pos.x, ev.pos.y, ev.level === 'good' ? '#5fdc7a' : ev.level === 'danger' ? '#ff4d3a' : '#ffc93c');
          if (ev.level === 'danger' || ev.level === 'warn') this.lastAlert = { x: ev.pos.x, y: ev.pos.y };
        }
      } else if (ev.type === 'sfx') {
        let vol = 1;
        if (ev.x != null) {
          const d = Math.hypot(ev.x - R.cam.x, ev.y - R.cam.y);
          const range = Math.hypot(R.view.w, R.view.h) / R.cam.zoom * 0.75;
          vol = Math.max(0, 1 - d / range) * Math.min(1, R.cam.zoom * 1.2);
        }
        this.app.audio.play(ev.name, vol);
      } else if (ev.type === 'wave') {
        this.banner(`WAVE ${ev.n}`, ev.pos ? `Inbound from the ${g.directionName(ev.pos)}` : 'Hostiles inbound');
      }
    }
    g.events.length = 0;
  }

  update(dt) {
    const g = this.game;
    if (!g) return;
    this.handleEvents();
    for (const n of this.notices) {
      n.t += dt;
      if (n.t > 6 && !n.el.classList.contains('fade')) n.el.classList.add('fade');
    }
    this.notices = this.notices.filter((n) => { if (n.t > 7) { n.el.remove(); return false; } return true; });
    this.hudT -= dt;
    if (this.hudT <= 0) { this.hudT = 0.1; this.updateHUD(); }
    this.miniT -= dt;
    if (this.miniT <= 0) { this.miniT = 1 / 20; this.app.renderer.drawMinimap(this.mctx, 170); }
  }

  updateHUD(force) {
    const g = this.game;
    $('t-credits').textContent = Math.floor(g.credits);
    $('t-income').textContent = `+${g.income.toFixed(1)}/s`;
    const sup = $('t-supply');
    sup.textContent = `${g.supplyUsed}/${g.supplyCap}`;
    sup.style.color = g.supplyUsed >= g.supplyCap ? 'var(--danger)' : '';
    const cmp = $('t-compute');
    cmp.textContent = `${g.computeUsed}/${g.computeCap}`;
    cmp.style.color = g.computeUsed >= g.computeCap ? 'var(--danger)' : '';
    const mn = $('t-mines');
    mn.textContent = `${g.mines.refined}/${g.mines.total}`;
    mn.style.color = g.mines.total > g.mines.refined ? 'var(--warn)' : '';
    const R = g.research;
    $('t-rbar').style.width = `${Math.min(100, (R.points / R.needed) * 100)}%`;
    $('btn-research').hidden = R.ready <= 0;
    $('t-rready').textContent = R.ready > 1 ? `×${R.ready}` : '';
    const left = g.wave.next - g.time;
    $('t-wave').textContent = g.wave.n ? `WAVE ${g.wave.n}` : 'FIRST CONTACT';
    $('t-wavetimer').textContent = `next wave in ${fmtTime(left)}`;
    const span = g.wave.n === 0 ? WAVE.first : WAVE.interval;
    $('t-wavebar').style.width = `${Math.max(0, Math.min(100, (1 - left / span) * 100))}%`;
    $('t-time').textContent = fmtTime(g.time);
    const A = g.ability, abBtn = $('btn-ability');
    const cdTotal = g.abilityCooldown();
    $('t-abfill').style.height = `${A.cd > 0 ? (1 - A.cd / cdTotal) * 100 : 100}%`;
    abBtn.classList.toggle('ready', A.cd <= 0);
    abBtn.classList.toggle('armed', this.app.input.mode === 'ability');
    $('t-abcd').textContent = g.overdrive() ? `active ${Math.ceil(A.activeUntil - g.time)}s` : A.cd > 0 ? `${Math.ceil(A.cd)}s` : this.app.input.mode === 'ability' ? 'pick a target' : 'READY';
    $('paused-flag').hidden = !this.app.paused;
    $('btn-pause').textContent = this.app.paused ? '▶' : '❚❚';

    this.previewT -= 0.1;
    if (g.earlyWarning && (this.previewT <= 0 || force)) {
      this.previewT = 1;
      const { comp } = g.waveComposition(g.wave.n + 1);
      $('t-preview').innerHTML = Object.entries(comp).sort((a, b) => b[1] - a[1])
        .map(([id, c]) => `<span>${c}× ${ENEMY_UNITS[id].name.replace('Hegemony ', '')}</span>`).join('');
    } else if (!g.earlyWarning) $('t-preview').innerHTML = '';

    // build panel affordability
    for (const b of document.querySelectorAll('#buildpanel [data-build]')) {
      const t = b.dataset.build;
      b.classList.toggle('poor', g.credits < g.costOf(t, true));
      b.classList.toggle('active', this.app.input.placing?.type === t);
    }
    this.updateCommandCard();
    this.updateSelInfo();
  }

  // ----------------------------------------------------------- command card
  updateCommandCard() {
    const g = this.game;
    const sel = g.selection;
    const sig = sel.map((e) => e.id).join(',') + '|' + (sel[0]?.built ? 1 : 0);
    if (sig !== this.cardSig) {
      this.cardSig = sig;
      this.cardSlots = this.buildSlots(sel);
      $('cmdcard').innerHTML = this.cardSlots.map((s, i) => s
        ? `<button class="cbtn ${s.cls || ''}" data-slot="${i}" ${s.disabled ? 'disabled' : ''}>${s.html}<kbd>${CARD_KEYS[i]}</kbd></button>`
        : `<button class="cbtn empty" tabindex="-1"></button>`).join('');
    }
    // refresh affordability + sell arm state
    const btns = $('cmdcard').children;
    this.cardSlots.forEach((s, i) => {
      if (!s) return;
      if (s.cost != null) btns[i].classList.toggle('poor', g.credits < s.cost());
      if (s.id === 'sell') btns[i].querySelector('.glyph + span').textContent = this.app.now - this.sellArm < 2.5 ? 'CONFIRM?' : 'Recycle';
      if (s.id === 'repair') {
        const b = g.selection[0];
        btns[i].classList.toggle('on', !!b?.repairing);
        btns[i].querySelector('.glyph + span').textContent = b?.repairing ? 'Repairing' : b && b.hp >= b.st.maxHp ? 'Intact' : 'Repair';
      }
    });
  }

  buildSlots(sel) {
    const g = this.game;
    const slots = new Array(CARD_KEYS.length).fill(null);
    if (!sel.length) return slots;
    const mine = sel.filter((e) => e.team === TEAM_PLAYER);
    const units = mine.filter((e) => e.kind === 'unit');
    if (units.length) {
      slots[0] = { id: 'amove', html: '<span class="glyph">⌖</span><span>Attack-move</span>', run: () => this.app.input.setMode('amove') };
      slots[1] = { id: 'stop', html: '<span class="glyph">■</span><span>Stop</span>', run: () => g.orderStop(units) };
      slots[2] = { id: 'hold', html: '<span class="glyph">⛊</span><span>Hold</span>', run: () => g.orderHold(units) };
      return slots;
    }
    const b = mine.length === 1 && mine[0].kind === 'building' ? mine[0] : null;
    if (!b) return slots;
    if (b.built && b.def.trains) {
      let i = 0;
      for (const t of g.trainsFor(b)) {
        const def = UNITS[t];
        const locked = !g.available(t);
        slots[i++] = {
          id: 'train:' + t, train: t, cls: locked ? 'locked' : '', disabled: locked,
          html: `<img src="${iconFor('unit', def)}" alt=""><span class="cost">${locked ? '🔒' : g.costOf(t, false)}</span>`,
          cost: () => g.costOf(t, false),
          run: () => { if (!locked && g.train(b, t)) this.click(); },
        };
      }
    }
    if (b.built) {
      slots[SLOT_REPAIR] = {
        id: 'repair', html: '<span class="glyph">🔧</span><span>Repair</span>',
        run: () => { g.toggleRepair(b); this.click(); },
      };
    }
    if (b.type !== 'hq') {
      slots[SLOT_SELL] = {
        id: 'sell', cls: 'danger', html: '<span class="glyph">♻</span><span>Recycle</span>',
        run: () => {
          if (this.app.now - this.sellArm < 2.5) { g.sell(b); this.sellArm = -Infinity; this.cardSig = ''; }
          else this.sellArm = this.app.now;
        },
      };
    }
    return slots;
  }

  runSlot(i) {
    const s = this.cardSlots[i];
    if (s && !s.disabled) { s.run(); this.updateCommandCard(); }
  }

  hotkey(key) {
    const i = CARD_KEYS.indexOf(key.toUpperCase());
    if (i < 0) return false;
    const s = this.cardSlots[i];
    if (!s) return false;
    this.runSlot(i);
    return true;
  }

  // ------------------------------------------------------------- sel info
  updateSelInfo() {
    const g = this.game;
    const sel = g.selection;
    let html = '';
    if (!sel.length) {
      html = `<div class="empty-sel"><b>No selection.</b> Drag to select units · right-click to move or attack · build from the panel on the right.<br>` +
        `Wave ${g.wave.n + 1} arrives in <b>${fmtTime(g.wave.next - g.time)}</b>. Research: <b>${g.researchRate().toFixed(2)}</b>/s.` +
        `${g.research.ready ? ' <b style="color:var(--violet)">Breakthrough ready — press Tab.</b>' : ''}</div>`;
    } else if (sel.length === 1) {
      html = this.entityInfo(sel[0]);
    } else {
      const groups = new Map();
      for (const e of sel) {
        const k = e.type;
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(e);
      }
      html = `<div class="sel-name">${sel.length} UNITS SELECTED</div><div class="multi">` + [...groups.entries()].map(([t, list]) => {
        const hp = list.reduce((a, u) => a + u.hp / u.st.maxHp, 0) / list.length;
        return `<div class="mitem" data-mtype="${t}"><img src="${iconFor('unit', list[0].def, list[0].team)}" alt=""><b>${list.length}</b><div class="mhp" style="width:${hp * 100}%"></div></div>`;
      }).join('') + '</div><div class="hint" style="margin-top:6px">Click a group to select only that type (Shift-click removes it).</div>';
    }
    if (html !== this.selHTML) { this.selHTML = html; $('selinfo').innerHTML = html; }
  }

  entityInfo(e) {
    const g = this.game;
    const hostile = e.team === TEAM_ENEMY;
    const kind = e.kind === 'unit' ? 'unit' : 'building';
    const hpFrac = e.hp / e.st.maxHp;
    const w = e.def.weapon;
    const stats = [];
    stats.push(`HP <b>${Math.ceil(e.hp)}/${Math.round(e.st.maxHp)}</b>`);
    if (w) {
      stats.push(`DMG <b>${e.st.dmg.toFixed(0)}${w.salvo ? `×${w.salvo + (hostile ? 0 : g.mods.flags.salvo || 0)}` : ''}</b>`);
      stats.push(`RATE <b>${(1 / e.st.cd).toFixed(2)}/s</b>`);
      stats.push(`RANGE <b>${Math.round(e.st.range)}</b>`);
      stats.push(`HITS <b>${TARGETS[w.targets]}</b>`);
    }
    if (e.kind === 'unit') stats.push(`SPEED <b>${Math.round(e.st.speed)}</b>`);
    stats.push(`ARMOR <b>${ARMOR_NAMES[e.armor]}</b>`);
    if (e.st.dr) stats.push(`DMG TAKEN <b>-${Math.round(e.st.dr * 100)}%</b>`);
    if (e.def.income) stats.push(`INCOME <b>+${(e.def.income * (1 + g.mods.income)).toFixed(1)}/s</b>`);
    if (e.kind === 'building' && e.def.supply && !hostile) stats.push(`SUPPLY <b>+${e.def.supply}</b>`);
    if (e.kind === 'unit' && !hostile) stats.push(`SUPPLY <b>${e.spawned ? 'free' : g.supplyOf(e.type)}</b>`);
    if (e.def.healer) stats.push(`HEALS <b>${(e.def.healer.rate * 100).toFixed(1)}%/s</b>`);
    if (hostile && e.hackPts > 0) stats.push(`<span style="color:var(--violet)">HACKED <b>${Math.floor((e.hackPts / (e.st.maxHp * 0.6)) * 100)}%</b></span>`);
    if (e.stunUntil > g.time) stats.push('<span style="color:var(--violet)">STUNNED</span>');
    let extra = '';
    if (e.kind === 'unit' && !hostile) {
      const o = e.order.type;
      extra = `<div class="hint">${{ idle: 'Standing by', move: 'Moving', amove: 'Attack-moving', attack: 'Attacking target', hold: 'Holding position' }[o] || o}${e.target ? ' · engaging' : ''}</div>`;
    }
    if (e.kind === 'building' && !hostile && e.built && g.wantsRepair(e) && e.hp < e.st.maxHp) {
      stats.push(`<span style="color:var(--good)">REPAIRING <b>${e.repairActive ? `−${(e.st.maxHp * 0.03 * g.repairCostPerHp(e)).toFixed(1)} cr/s` : 'paused: no credits'}</b></span>`);
    }
    if (e.kind === 'building' && !hostile) {
      if (!e.built) extra = `<div class="hint">Under construction: ${Math.floor(e.progress * 100)}%</div>`;
      else if (e.def.trains) {
        extra = `<div class="queue">${e.queue.map((q, i) => `<div class="qitem ${q.blocked ? 'blocked' : ''}" data-q="${i}"><img src="${iconFor('unit', UNITS[q.type])}" alt="">${i === 0 ? `<div class="qp" style="width:${(q.t / g.timeOf(q.type, false)) * 100}%"></div>` : ''}</div>`).join('')}</div>`;
        extra += `<div class="hint">${e.queue.some((q) => q.blocked) ? '<span style="color:var(--warn)">Supply blocked — build a Logistics Hub.</span> ' : ''}Right-click the map to set a rally point. Click queue items to cancel.</div>`;
      }
    }
    if (hostile && e.kind === 'building' && e.def.desc) extra = `<div class="sel-desc">${e.def.desc}</div>`;
    const desc = !hostile && e.def.desc && e.kind === 'unit' ? `<div class="sel-desc">${e.def.desc}</div>` : '';
    return `<div class="sel-head"><img src="${iconFor(kind, e.def, e.team)}" alt=""><div>
      <div class="sel-name">${e.def.name}<span class="tag ${hostile ? 'hostile' : ''}">${hostile ? 'HOSTILE' : e.kind === 'unit' ? e.def.cls.toUpperCase() : 'STRUCTURE'}</span></div>
      <div class="hpbar"><div style="width:${hpFrac * 100}%;background:${hostile ? 'var(--danger)' : hpFrac > 0.6 ? 'var(--good)' : hpFrac > 0.3 ? 'var(--warn)' : 'var(--danger)'}"></div></div>
      </div></div><div class="sel-stats">${stats.map((s) => `<span>${s}</span>`).join('')}</div>${extra}${desc}`;
  }

  // ------------------------------------------------------------- tooltips
  unitStatsLine(def, isBuilding) {
    const g = this.game;
    const fake = { kind: isBuilding ? 'building' : 'unit', def, team: 0, tags: g ? g.tagsFor(isBuilding ? 'building' : 'unit', Object.keys(isBuilding ? BUILDINGS : UNITS).find((k) => (isBuilding ? BUILDINGS : UNITS)[k] === def), def, 0) : [] };
    const st = g ? g.computeStats(fake) : { maxHp: def.hp, dmg: def.weapon?.dmg, range: def.weapon?.range, cd: def.weapon?.cd, speed: def.speed };
    const parts = [`HP ${Math.round(st.maxHp)}`];
    if (def.weapon && def.weapon.type !== 'hack') {
      const w = def.weapon;
      parts.push(`DMG ${Math.round(st.dmg)}${w.salvo ? '×' + w.salvo : ''}${w.splash ? ' (splash)' : ''}`, `RNG ${Math.round(st.range)}`, `${(1 / st.cd).toFixed(1)}/s`, `hits ${TARGETS[w.targets]}`);
      const best = Object.entries(w.vs).filter(([k, v]) => v >= 1.2 && k !== 'missile').map(([k]) => ARMOR_NAMES[k]);
      if (best.length) parts.push(`strong vs ${best.join(', ')}`);
      if (w.intercept) parts.push('intercepts missiles');
      if (w.emp) parts.push(`EMP stun ${w.emp}s`);
    }
    if (def.weapon?.type === 'hack') parts.push(`RNG ${def.weapon.range}`, 'hacks vehicles, robots and drones to your side');
    if (def.healer) parts.push(`heals ${def.healer.only === 'mech' ? 'robots and buildings' : def.healer.only} ${(def.healer.rate * 100).toFixed(1)}%/s`);
    if (!isBuilding) parts.push(`SPD ${Math.round(st.speed || def.speed)}`, ARMOR_NAMES[def.armor]);
    return parts.join(' · ');
  }

  repairTip() {
    const g = this.game, b = g?.selection[0];
    if (!b || b.kind !== 'building') return '';
    const full = Math.ceil((b.st.maxHp - b.hp) * g.repairCostPerHp(b));
    const rate = (b.st.maxHp * 0.03 * g.repairCostPerHp(b)).toFixed(1);
    return `<h5>Repair <kbd>N</kbd></h5><div class="tt-cost">${full ? `${full} credits to fully repair · ${rate} credits/s` : 'Undamaged'}</div><p>Restores 3% of max HP per second, paid as you go. Stops when the building is fully repaired or you run out of credits. Press again to cancel.</p>${g.faction.id === 'forge' ? '<p>Forge Union repairs cost half.</p>' : ''}`;
  }

  lockNote(id) {
    const node = nodeById(this.game.faction.id, this.game.locks[id]);
    return `<div class="tt-lock">🔒 Unlock in the ${this.game.faction.short} Chrono Lab: ${node?.name || '?'}</div>`;
  }

  tooltipFor(el) {
    const g = this.game;
    if (el.dataset.build) {
      const t = el.dataset.build, def = BUILDINGS[t];
      const locked = g && !g.available(t);
      return `<h5>${def.name}</h5><div class="tt-cost">${g ? g.costOf(t, true) : def.cost} credits · ${Math.round(g ? g.timeOf(t, true) : def.time)}s · ${def.w}×${def.h}</div>` +
        `<div class="tt-stats">${this.unitStatsLine(def, true)}</div><p>${def.desc}</p>${def.trains ? `<p>Trains: ${def.trains.map((u) => UNITS[u].name).join(', ')}</p>` : ''}` +
        (locked ? this.lockNote(t) : '');
    }
    if (el.dataset.slot != null) {
      const s = this.cardSlots[+el.dataset.slot];
      if (!s) return '';
      if (s.train) {
        const def = UNITS[s.train];
        const locked = !g.available(s.train);
        return `<h5>${def.name} <kbd>${CARD_KEYS[+el.dataset.slot]}</kbd></h5><div class="tt-cost">${g.costOf(s.train, false)} credits · ${g.timeOf(s.train, false).toFixed(1)}s · ${def.supply} supply</div>` +
          `<div class="tt-stats">${this.unitStatsLine(def, false)}</div><p>${def.desc}</p>` +
          (locked ? this.lockNote(s.train) : '');
      }
      return {
        amove: '<h5>Attack-move <kbd>Q</kbd></h5><p>Then click: units advance and engage every hostile on the way.</p>',
        stop: '<h5>Stop <kbd>E</kbd></h5><p>Cancel orders. Units will still defend themselves.</p>',
        hold: '<h5>Hold position <kbd>R</kbd> or <kbd>H</kbd></h5><p>Units stay put and only fire at targets in range.</p>',
        repair: this.repairTip(),
        sell: '<h5>Recycle <kbd>B</kbd></h5><p>Dismantle for 50% of the cost (scaled by damage). Under-construction buildings are fully refunded. Press twice to confirm.</p>',
      }[s.id] || '';
    }
    if (el.dataset.node) {
      const n = nodeById(this.app.factionId, el.dataset.node);
      const ic = nodeIcon(n);
      const lv = level(this.profile, n.id);
      let body = `<h5>${n.name}</h5><div class="tt-cost">Level ${lv}/${n.cost.length}${lv < n.cost.length ? ` · next: ${n.cost[lv]} chronons` : ''}</div><p>${n.desc}</p>`;
      if (ic) body += `<div class="tt-stats">${ic[1].name}: ${this.unitStatsLine(ic[1], ic[0] !== 'unit')}</div><p>${ic[1].desc}</p>`;
      if (n.req && !nodeAvailable(this.profile, n)) body += `<div class="tt-lock">Requires: ${n.req.map((r) => nodeById(this.app.factionId, r).name).join(', ')}</div>`;
      return body;
    }
    if (el.dataset.mtype) {
      const e = g?.selection.find((u) => u.type === el.dataset.mtype);
      return e ? `<h5>${e.def.name}</h5><div class="tt-stats">${this.unitStatsLine(e.def, false)}</div>` : '';
    }
    if (el.dataset.q != null) return '<p>Click to cancel and refund.</p>';
    const k = el.dataset.tip;
    if (!g && !['newmap', 'escalation'].includes(k)) return '';
    switch (k) {
      case 'credits': return `<h5>Credits</h5><p>Income: HQ ${BUILDINGS.hq.income}/s plus +4/s for every refined rare-earth mine. Current: <b>${g.income.toFixed(1)}/s</b>.</p>`;
      case 'supply': return '<h5>Supply</h5><p>Infantry and aircraft need supply. HQ provides 12, each Logistics Hub +8.</p>';
      case 'compute': return '<h5>Compute</h5><p>Drones and robots need compute to run. HQ provides 6, each Data Center +8.</p>';
      case 'mines': return `<h5>Rare-earth mines: ${g.mines.refined} refined / ${g.mines.total} built</h5><p>Build Mines on rare-earth deposits. Ore only pays once refined: your HQ refines 1 mine, each Refinery 2 more (capacity now ${g.mines.capacity}). Each refined mine adds +4 credits/s. Far deposits need an Outpost nearby before you can build there.</p>`;
      case 'research': return `<h5>Research program</h5><p>Breakthrough #${g.research.level + 1}: ${Math.floor(g.research.points)}/${Math.ceil(g.research.needed)}. Rate ${g.researchRate().toFixed(2)}/s plus kills. Labs speed it up. Each breakthrough lets you pick one of ${g.draftSize} random upgrades.</p>`;
      case 'wave': return `<h5>Enemy waves</h5><p>A new wave launches every ${WAVE.interval}s from the closest Forward Outpost (or their base). Destroy outposts to push the launch point back, and facilities to weaken waves.</p>${g.earlyWarning ? '<p>Early Warning shows the next wave\'s composition.</p>' : ''}`;
      case 'timeline': return '<h5>Timeline</h5><p>How many times you have looped, and how long this one has lasted.</p>';
      case 'pause': return '<h5>Pause <kbd>P</kbd></h5>';
      case 'mute': return '<h5>Sound <kbd>M</kbd></h5>';
      case 'autorepair': return '<h5>Auto-repair</h5><p>When on, every damaged building repairs itself automatically (3% HP per second, paid in credits as it goes). Repair a single building with <kbd>N</kbd>.</p>';
      case 'music': return `<h5>Music <kbd>Shift</kbd>+<kbd>M</kbd></h5><p>${this.app.music.enabled ? 'On' : 'Off'}. The score follows the battle: it builds up as waves approach and goes all-out when your HQ is in danger.</p>`;
      case 'ability': {
        const A = g.ability;
        return `<h5>${A.name} <kbd>G</kbd></h5><div class="tt-cost">Cooldown ${Math.round(g.abilityCooldown())}s${A.cd > 0 ? ` · ready in ${Math.ceil(A.cd)}s` : ' · READY'}</div><p>${A.desc}</p>${A.target ? '<p>Click a target in scouted territory after pressing G.</p>' : ''}`;
      }
      case 'menu': return '<h5>Command menu <kbd>Esc</kbd></h5><p>Field manual, research log, and the time machine.</p>';
      case 'newmap': return '<h5>Divergent timeline</h5><p>Jump to a different branch of history: a brand new map. Your Chrono Cartography memory of the old map is lost.</p>';
      case 'escalation': return '<h5>Escalation</h5><p>After a victory, the Hegemony remembers. Each level: enemy +20% HP and damage, +15% wave size, +25% chronons.</p>';
      default: return '';
    }
  }

  // ------------------------------------------------------------- research
  openResearch() {
    const g = this.game;
    if (!g || g.over || g.research.ready <= 0) return;
    g.openDraft();
    this.app.modal = true;
    $('modal-research').hidden = false;
    $('research-title').textContent = `BREAKTHROUGH #${g.research.picks.length + 1}`;
    this.renderDraft();
    this.app.audio.play('research');
  }

  renderDraft() {
    const g = this.game;
    const d = g.research.draft || [];
    $('research-cards').innerHTML = d.map((p, i) => {
      const x = describeCard(p);
      return `<button class="card ${x.rarity.id}" data-card="${i}" style="--rc:${x.rarity.color};animation-delay:${i * 0.07}s">
        <div class="rar">${x.rarity.name}</div><div class="ctag">${x.card.tag}</div><div class="cname">${x.card.name}</div>
        <div class="ctext">${esc(x.text)}</div><div class="ckey">press ${i + 1}</div></button>`;
    }).join('');
    $('reroll-n').textContent = `(${g.research.rerolls})`;
    $('btn-reroll').disabled = g.research.rerolls <= 0;
  }

  pickCard(i) {
    const g = this.game;
    if (!g?.research.draft?.[i]) return;
    const p = g.research.draft[i];
    g.pickDraft(i);
    const d = describeCard(p);
    this.notice(`Research complete: ${d.card.name} (${d.rarity.name})`, 'good');
    this.renderBuildPanel();
    this.cardSig = '';
    if (g.research.ready > 0) this.openResearch();
    else this.closeResearch();
  }

  closeResearch(silent) {
    $('modal-research').hidden = true;
    if (!silent) this.app.modal = !$('modal-pause').hidden;
  }

  get researchOpen() { return !$('modal-research').hidden; }
  get pauseOpen() { return !$('modal-pause').hidden; }

  openPause() {
    if (!this.game || this.game.over) return;
    this.app.modal = true;
    $('modal-pause').hidden = false;
    $('btn-timejump').textContent = 'ACTIVATE TIME MACHINE';
    this.jumpArm = false;
  }

  closePause() {
    $('modal-pause').hidden = true;
    $('modal-info').hidden = true;
    this.app.modal = this.researchOpen;
  }

  confirmTimeJump() {
    if (!this.jumpArm) {
      this.jumpArm = true;
      $('btn-timejump').textContent = 'CONFIRM: END THIS TIMELINE';
      return;
    }
    $('modal-pause').hidden = true;
    this.app.modal = false;
    this.game.retreat();
  }
}
