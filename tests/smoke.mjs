// Browser smoke test: loads the game in headless Chromium, plays a bit, screenshots, fails on JS errors.
// Usage: node tests/smoke.mjs [outDir] [--dist]
import { chromium } from 'playwright';
import { serve } from '../tools/serve.mjs';
import fs from 'node:fs';

const out = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'screenshots';
const useDist = process.argv.includes('--dist');
fs.mkdirSync(out, { recursive: true });
const server = await serve(5199, useDist ? 'dist' : '.');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
page.on('pageerror', (e) => errors.push(e.stack || String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text()) && !/ERR_/.test(m.text())) errors.push(m.text()); });

await page.goto('http://localhost:5199/');
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/01-title.png` });
await page.click('#btn-play');
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/02-intro.png` });
await page.click('#btn-intro-skip');
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/03a-factions.png` });
await page.click('[data-faction="ghostnet"]');
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/03b-lab.png` });
await page.click('#btn-lab-back');
await page.click('[data-faction="valdara"]');
await page.click('#btn-begin');
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/03-game-start.png` });

// Play: build some stuff via the real UI
const clickBuild = async (type, dx, dy) => {
  await page.click(`[data-build="${type}"]`);
  const p = await page.evaluate(([dx, dy]) => {
    const g = window.app.game, R = window.app.renderer;
    const s = R.toScreen(g.hq.x + dx, g.hq.y + dy);
    return s;
  }, [dx, dy]);
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y);
};
await clickBuild('barracks', 140, -40);
await clickBuild('sentry', 60, -130);
await clickBuild('sentry', 170, 60);
await page.waitForTimeout(300);
// select HQ and train a rifle squad via hotkey
const hq = await page.evaluate(() => { const g = window.app.game; return window.app.renderer.toScreen(g.hq.x, g.hq.y); });
await page.mouse.click(hq.x, hq.y);
await page.keyboard.press('q');
await page.waitForTimeout(200);
await page.screenshot({ path: `${out}/04-hq-selected.png` });
// box select starting units & move them
await page.mouse.move(hq.x - 200, hq.y - 250);
await page.mouse.down();
await page.mouse.move(hq.x + 250, hq.y + 150, { steps: 5 });
await page.mouse.up();
await page.mouse.click(hq.x + 300, hq.y - 200, { button: 'right' });
await page.evaluate(() => { window.app.setSpeed(3); });
// fast-forward the simulation a few minutes of game time
await page.evaluate(() => { const g = window.app.game; for (let i = 0; i < 30 * 125; i++) g.step(1 / 30); });
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/05-wave1.png` });
await page.evaluate(() => { const g = window.app.game; g.research.ready = Math.max(1, g.research.ready); });
await page.keyboard.press('t');
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/06-research.png` });
await page.keyboard.press('1');
await page.keyboard.press('Escape');
// commander ability via hotkey + targeted click
await page.evaluate(() => { const g = window.app.game, R = window.app.renderer; g.ability.cd = 0; R.cam.x = g.hq.x + 150; R.cam.y = g.hq.y - 100; });
await page.keyboard.press('g');
const aim = await page.evaluate(() => { const g = window.app.game; return window.app.renderer.toScreen(g.hq.x + 250, g.hq.y - 150); });
await page.mouse.move(aim.x, aim.y);
await page.waitForTimeout(200);
await page.screenshot({ path: `${out}/06b-ability-aim.png` });
await page.mouse.click(aim.x, aim.y);
await page.waitForTimeout(1500);
const used = await page.evaluate(() => window.app.game.ability.cd > 0);
if (!used) errors.push('ability was not used');
await page.screenshot({ path: `${out}/06c-ability-fired.png` });
// jump camera to the enemy base with recon (cheat reveal for a screenshot)
await page.evaluate(() => {
  const g = window.app.game, R = window.app.renderer;
  g.revealArea(g.enemyBase.x, g.enemyBase.y, 14);
  for (const b of g.buildings) if (b.team === 1) b.discovered = true;
  R.cam.x = g.enemyBase.x; R.cam.y = g.enemyBase.y; R.cam.zoom = 0.8; R.clampCam();
});
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/07-enemy-base.png` });
await page.evaluate(() => { const g = window.app.game; for (let i = 0; i < 30 * 600 && !g.over; i++) g.step(1 / 30); const R = window.app.renderer; R.cam.x = g.hq.x; R.cam.y = g.hq.y; R.cam.zoom = 1; });
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/08-late.png` });
// end the run via the time machine
await page.evaluate(() => window.app.game && !window.app.game.over && window.app.game.retreat());
await page.waitForTimeout(5000);
await page.screenshot({ path: `${out}/09-over.png` });
await page.click('#btn-over-lab');
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/10-lab.png` });

await browser.close();
server.close();
if (errors.length) { console.log('ERRORS:\n' + errors.join('\n---\n')); process.exit(1); }
console.log('smoke ok, screenshots in', out);
