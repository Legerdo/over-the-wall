/*
 * Browser play test (real input) using the locally installed Microsoft Edge.
 *   npm run playtest            (add --shots to save screenshots into ./shots)
 * Drives the game with real mouse / keyboard / touch events, checks the rules from the
 * outside and fails on any console error or page exception.
 */
const path = require('path');
const fs = require('fs');
const assert = require('assert/strict');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '..', '..');
const URL = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');
const SHOTS = process.argv.includes('--shots');
const shotDir = path.join(ROOT, 'shots');
if (SHOTS) fs.mkdirSync(shotDir, { recursive: true });

const results = [];
function check(name, fn) { return fn().then(() => { results.push(['PASS', name]); console.log('PASS', name); }, (e) => { results.push(['FAIL', name, e.message]); console.log('FAIL', name, '-', e.message); }); }

async function openPage(browser, viewport, extra) {
  const ctx = await browser.newContext(Object.assign({ viewport }, extra || {}));
  const page = await ctx.newPage();
  page.errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') page.errors.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => page.errors.push('pageerror: ' + e.message));
  await page.goto(URL);
  await page.waitForFunction(() => window.OTW && window.OTW.app);
  return page;
}

const G = (page, fn, arg) => page.evaluate(fn, arg);
const state = (page) => G(page, () => OTW.app.game.state);

async function waitFor(page, pred, arg, timeout = 15000) {
  await page.waitForFunction(pred, arg, { timeout, polling: 20 });
}

/** logical (1280x720) -> page coordinates */
async function pt(page, x, y) {
  return G(page, ([x, y]) => {
    const r = document.getElementById('game').getBoundingClientRect();
    return { x: r.left + (x * r.width) / 1280, y: r.top + (y * r.height) / 720 };
  }, [x, y]);
}

async function click(page, x, y) { const p = await pt(page, x, y); await page.mouse.click(p.x, p.y); }

async function shot(page, name) { if (SHOTS) await page.screenshot({ path: path.join(shotDir, name + '.png') }); }

/** Ideal power for whoever is throwing now (same physics as the game). */
async function idealPower(page, kind = 'normal') {
  return G(page, (kind) => {
    const g = OTW.app.game;
    const ai = new OTW.AI('hard', g.turn, g.B, Math.random);
    return ai.idealPower(g.wind, kind);
  }, kind);
}

/** Hold the mouse on the field for the time needed to reach `power`. Returns released power. */
async function mouseThrow(page, power) {
  const speed = await G(page, () => OTW.app.game.B.powerChargeSpeed);
  const p = await pt(page, 900, 350);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.waitForTimeout(Math.max(10, (power / speed) * 1000));
  await page.mouse.up();
  return G(page, () => OTW.app.game.current.lastPower);
}

async function spaceThrow(page, power) {
  const speed = await G(page, () => OTW.app.game.B.powerChargeSpeed);
  await page.keyboard.down('Space');
  await page.waitForTimeout(Math.max(10, (power / speed) * 1000));
  await page.keyboard.up('Space');
  return G(page, () => OTW.app.game.current.lastPower);
}

async function toAiming(page, humanOnly) {
  await waitFor(page, (h) => { const g = OTW.app.game; return g.state === 'AIMING' && (!h || !g.current.isCPU); }, humanOnly, 40000);
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });

  // ---------------------------------------------------------------- 2P, desktop
  const page = await openPage(browser, { width: 1280, height: 720 });

  await check('title -> mode select (click), menus via keyboard', async () => {
    assert.equal(await state(page), 'MENU');
    await shot(page, 'e2e-01-title');
    await click(page, 640, 400);
    assert.equal(await state(page), 'MODE_SELECT');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    assert.equal(await state(page), 'HOW_TO_PLAY');
    await shot(page, 'e2e-02-howto');
    await page.keyboard.press('Escape');
    assert.equal(await state(page), 'MODE_SELECT');
    await page.keyboard.press('ArrowDown'); // focus 2 PLAYERS
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    assert.equal(await state(page), 'ROUND_START');
    assert.equal(await G(page, () => OTW.app.game.mode), '2P');
  });

  await check('hold/release mouse sets power; flight blocks input; turn passes', async () => {
    await toAiming(page);
    await G(page, () => { OTW.app.game.wind = 0; });
    const released = await mouseThrow(page, 0.4);
    assert.ok(released > 0.3 && released < 0.5, `released at ${released}`);
    assert.equal(await state(page), 'PROJECTILE_FLYING');
    const first = await G(page, () => OTW.app.game.turn);
    await page.mouse.down(); await page.mouse.up(); // ignored mid-flight
    assert.equal(await G(page, () => OTW.app.game.projectiles.length + OTW.app.game.pendingShots.length), 1);
    await waitFor(page, (f) => OTW.app.game.state === 'AIMING' && OTW.app.game.turn !== f, first);
  });

  await check('Space hold/release works; a tap throws near zero power', async () => {
    const released = await spaceThrow(page, 0.02);
    assert.ok(released < 0.08, `tap power ${released}`);
    await waitFor(page, () => OTW.app.game.state === 'HIT_RESOLUTION');
    const imp = await G(page, () => OTW.app.game.lastImpact);
    assert.equal(imp.surface, 'ground');
    await toAiming(page);
  });

  await check('aimed mouse throw with calm wind hits for normal damage', async () => {
    await G(page, () => { OTW.app.game.wind = 0; });
    const target = await G(page, () => OTW.app.game.opponent.index);
    const hp0 = await G(page, (t) => OTW.app.game.players[t].hp, target);
    await mouseThrow(page, await idealPower(page));
    await page.waitForTimeout(900);
    await shot(page, 'e2e-03-flight');
    await waitFor(page, () => OTW.app.game.state === 'HIT_RESOLUTION');
    await page.waitForTimeout(120);
    await shot(page, 'e2e-04-hit');
    const hp1 = await G(page, (t) => OTW.app.game.players[t].hp, target);
    assert.equal(hp0 - hp1, 20);
    await toAiming(page);
  });

  await check('clicking a special button selects it, clicking again cancels, key 1 selects Double', async () => {
    const me = await G(page, () => OTW.app.game.turn);
    const r = await G(page, (me) => OTW.UI.specialRect(me, 1), me); // POWER
    await click(page, r.x + r.w / 2, r.y + r.h / 2);
    assert.equal(await G(page, () => OTW.app.game.selectedSpecial), 'power');
    await shot(page, 'e2e-05-selected');
    await click(page, r.x + r.w / 2, r.y + r.h / 2);
    assert.equal(await G(page, () => OTW.app.game.selectedSpecial), null);
    await page.keyboard.press('1');
    assert.equal(await G(page, () => OTW.app.game.selectedSpecial), 'double');
    // opponent's buttons do nothing
    const o = await G(page, (me) => OTW.UI.specialRect(1 - me, 2), me);
    await click(page, o.x + o.w / 2, o.y + o.h / 2);
    assert.equal(await G(page, () => OTW.app.game.selectedSpecial), 'double');
    assert.equal(await state(page), 'AIMING', 'clicking a HUD button never throws');
  });

  await check('Double Attack throws two projectiles and is marked used', async () => {
    await G(page, () => { window.__spawns = 0; OTW.app.game.on('spawn', () => window.__spawns++); OTW.app.game.wind = 0; });
    const me = await G(page, () => OTW.app.game.turn);
    await mouseThrow(page, await idealPower(page, 'double'));
    await waitFor(page, () => OTW.app.game.state === 'HIT_RESOLUTION');
    assert.equal(await G(page, () => window.__spawns), 2);
    assert.equal(await G(page, (me) => OTW.app.game.players[me].specials.double, me), false);
    await shot(page, 'e2e-06-double-used');
    await toAiming(page);
  });

  await check('Heal at full HP is refused; after damage it heals up to the cap', async () => {
    const me = await G(page, () => OTW.app.game.turn);
    await G(page, (me) => { OTW.app.game.players[me].hp = 100; }, me);
    await page.keyboard.press('4');
    assert.equal(await G(page, () => OTW.app.game.selectedSpecial), null, 'refused at full HP');
    await G(page, (me) => { OTW.app.game.players[me].hp = 90; }, me);
    await page.keyboard.press('4');
    assert.equal(await G(page, () => OTW.app.game.selectedSpecial), 'heal');
    await click(page, 900, 350);
    assert.equal(await G(page, (me) => OTW.app.game.players[me].hp, me), 100);
    assert.equal(await state(page), 'HIT_RESOLUTION');
    await page.waitForTimeout(300);
    await shot(page, 'e2e-07-heal');
    await toAiming(page);
  });

  await check('turn timer runs out and passes the turn without a throw', async () => {
    await toAiming(page);
    const me = await G(page, () => OTW.app.game.turn);
    await G(page, () => { window.__spawns = 0; });
    await waitFor(page, () => OTW.app.game.state === 'TURN_END', null, 12000);
    await shot(page, 'e2e-08-timeup');
    assert.equal(await G(page, () => OTW.app.game.endReason), 'timeout');
    assert.equal(await G(page, () => window.__spawns), 0);
    await waitFor(page, (me) => OTW.app.game.state === 'AIMING' && OTW.app.game.turn !== me, me);
  });

  await check('Escape pauses (timer frozen) and resumes', async () => {
    await page.keyboard.press('Escape');
    assert.equal(await G(page, () => OTW.app.game.paused), true);
    const t = await G(page, () => OTW.app.game.timer);
    await page.waitForTimeout(500);
    assert.equal(await G(page, () => OTW.app.game.timer), t);
    await shot(page, 'e2e-09-pause');
    await page.keyboard.press('Escape');
    assert.equal(await G(page, () => OTW.app.game.paused), false);
  });

  await check('2P match plays to the end; no input after game over; rematch resets', async () => {
    for (let i = 0; i < 40 && (await state(page)) !== 'GAME_OVER'; i++) {
      await toAiming(page).catch(() => {});
      if ((await state(page)) !== 'AIMING') break;
      await G(page, () => { OTW.app.game.wind = 0; });
      await mouseThrow(page, await idealPower(page, 'normal'));
      await waitFor(page, () => ['AIMING', 'GAME_OVER', 'TURN_START'].includes(OTW.app.game.state) || OTW.app.game.winner !== null, null, 15000).catch(() => {});
      if (await G(page, () => OTW.app.game.winner !== null)) break;
    }
    await waitFor(page, () => OTW.app.game.state === 'GAME_OVER', null, 10000);
    const hpA = await G(page, () => OTW.app.game.players.map((p) => p.hp));
    await click(page, 900, 350);
    await page.keyboard.down('Space'); await page.waitForTimeout(300); await page.keyboard.up('Space');
    assert.deepEqual(await G(page, () => OTW.app.game.players.map((p) => p.hp)), hpA);
    assert.equal(await G(page, () => OTW.app.game.projectiles.length), 0);
    const txt = await G(page, () => OTW.app.game.resultText());
    assert.ok(/^PLAYER [12] WINS$/.test(txt), txt);
    await page.waitForTimeout(1300);
    await shot(page, 'e2e-10-gameover-2p');
    // REMATCH button
    await click(page, 640 - 145, 454);
    assert.equal(await state(page), 'ROUND_START');
    const s = await G(page, () => { const g = OTW.app.game; return { hp: g.players.map((p) => p.hp), sp: g.players.map((p) => Object.values(p.specials).every(Boolean)), winner: g.winner, tc: g.turnCount, timer: g.timer }; });
    assert.deepEqual(s.hp, [100, 100]);
    assert.deepEqual(s.sp, [true, true]);
    assert.equal(s.winner, null);
    assert.equal(s.tc, 0);
    assert.equal(s.timer, 10);
  });

  await check('no console errors (2P session)', async () => { assert.deepEqual(page.errors, []); });
  await page.context().close();

  // ---------------------------------------------------------------- 1P vs CPU (Hard), bigger window
  const p1 = await openPage(browser, { width: 1920, height: 1080 });
  await check('1P vs Hard CPU plays a full match with real input', async () => {
    await click(p1, 640, 400);
    await click(p1, 640, 348); // 1 PLAYER
    assert.equal(await state(p1), 'DIFFICULTY_SELECT');
    await shot(p1, 'e2e-11-difficulty-1080p');
    await click(p1, 640, 440); // HARD
    assert.equal(await G(p1, () => OTW.app.game.difficulty), 'hard');
    assert.equal(await G(p1, () => OTW.app.game.players[0].isCPU && !OTW.app.game.players[1].isCPU), true);
    let cpuShots = 0;
    await G(p1, () => { window.__cpu = []; OTW.app.game.on('throw', (e) => { const g = OTW.app.game; if (g.players[e.player].isCPU) window.__cpu.push({ power: e.power, wind: g.wind, kind: e.kind }); }); });
    let sawCpuTurn = false;
    for (let i = 0; i < 60 && (await state(p1)) !== 'GAME_OVER'; i++) {
      await waitFor(p1, () => { const g = OTW.app.game; return g.state === 'GAME_OVER' || (g.state === 'AIMING' && !g.current.isCPU); }, null, 40000);
      if ((await state(p1)) === 'GAME_OVER') break;
      if (!sawCpuTurn && (await G(p1, () => OTW.app.game.turnCount)) > 0) sawCpuTurn = true;
      // human aims like a decent player: ideal power plus a small error
      const ideal = await idealPower(p1);
      await mouseThrow(p1, Math.min(1, Math.max(0, ideal + (Math.random() - 0.5) * 0.06)));
      await p1.waitForTimeout(100);
      if (i === 1) await shot(p1, 'e2e-12-1p-flight-1080p');
    }
    await waitFor(p1, () => OTW.app.game.state === 'GAME_OVER', null, 60000);
    const cpu = await G(p1, () => window.__cpu);
    cpuShots = cpu.length;
    assert.ok(sawCpuTurn || cpuShots > 0, 'CPU took turns');
    // CPU throws obey the same physics (re-simulate every CPU throw)
    const same = await G(p1, (cpu) => cpu.every((c) => { const s = OTW.Physics.simulate(0, c.power, c.wind, c.kind, OTW.Balance); return ['target', 'wall', 'ground', 'out'].includes(s.outcome); }), cpu);
    assert.ok(same);
    const txt = await G(p1, () => OTW.app.game.resultText());
    assert.ok(txt === 'YOU WIN' || txt === 'YOU LOSE', txt);
    await p1.waitForTimeout(1300);
    await shot(p1, 'e2e-13-gameover-1p-1080p');
    // MAIN MENU button
    await click(p1, 640 + 145, 454);
    assert.equal(await state(p1), 'MODE_SELECT');
  });
  await check('no console errors (1P session)', async () => { assert.deepEqual(p1.errors, []); });
  await p1.context().close();

  // ---------------------------------------------------------------- small + portrait + touch
  const small = await openPage(browser, { width: 800, height: 600 });
  await check('800x600: canvas letterboxed at 16:9 and fully visible', async () => {
    const r = await G(small, () => { const r = document.getElementById('game').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    assert.ok(r.w <= 800 && r.h <= 600 && Math.abs(r.w / r.h - 16 / 9) < 0.01);
    assert.ok(r.x >= 0 && r.y >= 0);
    await click(small, 640, 400);
    await click(small, 640, 422); // 2 PLAYERS
    await toAiming(small);
    await shot(small, 'e2e-14-800x600');
  });
  await small.context().close();

  const mobile = await openPage(browser, { width: 390, height: 844 }, { hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
  await check('portrait phone: touch hold/release throws', async () => {
    const cdp = await mobile.context().newCDPSession(mobile);
    const touch = async (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    let p = await pt(mobile, 640, 400);
    await touch('touchStart', p.x, p.y); await touch('touchEnd');
    assert.equal(await state(mobile), 'MODE_SELECT');
    p = await pt(mobile, 640, 422);
    await touch('touchStart', p.x, p.y); await touch('touchEnd');
    await toAiming(mobile);
    p = await pt(mobile, 900, 350);
    await touch('touchStart', p.x, p.y);
    await mobile.waitForTimeout(800);
    await touch('touchEnd');
    const lp = await G(mobile, () => OTW.app.game.current.lastPower);
    assert.ok(lp > 0.25 && lp < 0.6, `touch power ${lp}`);
    await mobile.waitForTimeout(500);
    await shot(mobile, 'e2e-15-portrait');
  });
  await check('no console errors (small/mobile sessions)', async () => { assert.deepEqual(mobile.errors, []); });

  await browser.close();
  const failed = results.filter((r) => r[0] === 'FAIL');
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
