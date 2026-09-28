const test = require('node:test');
const assert = require('node:assert/strict');
const { B, Physics, Game, DT, runUntil, toAiming, throwAt, idealFor, playMatch } = require('./helpers.js');

function newMatch(mode = '2P', diff, seed = 11) {
  const g = new Game({ seed });
  g.startMatch(mode, diff);
  return g;
}

function count(game, type) {
  const box = { n: 0, events: [] };
  game.on(type, (e) => { box.n++; box.events.push(e); });
  return box;
}

/** Aims with calm wind at the ideal power so the throw hits. */
function sureHit(game, kind = 'normal') {
  game.wind = 0;
  throwAt(game, idealFor(game, kind));
}

test('state machine: menu -> round -> turn -> aiming, no input outside AIMING', () => {
  const g = new Game({ seed: 1 });
  assert.equal(g.state, 'MENU');
  g.openModeSelect();
  assert.equal(g.state, 'MODE_SELECT');
  g.openDifficulty();
  assert.equal(g.state, 'DIFFICULTY_SELECT');
  g.startMatch('1P', 'hard');
  assert.equal(g.state, 'ROUND_START');
  assert.equal(g.pressStart(), false);
  runUntil(g, (x) => x.state === 'TURN_START');
  assert.equal(g.pressStart(), false, 'no input during the turn banner');
  toAiming(g);
  assert.equal(g.state, 'AIMING');
});

test('throwing: flight blocks input, then the turn passes and the wind changes', () => {
  const g = newMatch();
  toAiming(g);
  const first = g.turn;
  const wind0 = g.wind;
  throwAt(g, 0.3);
  assert.equal(g.state, 'PROJECTILE_FLYING');
  assert.equal(g.pressStart(), false);
  assert.equal(g.toggleSpecial('power'), false);
  runUntil(g, (x) => x.state === 'TURN_START');
  assert.equal(g.turn, 1 - first);
  assert.notEqual(g.wind, wind0);
});

test('normal hit deals normalDamage; misses deal nothing and trigger a taunt', () => {
  const g = newMatch();
  toAiming(g);
  const target = g.opponent;
  const taunts = count(g, 'taunt');
  sureHit(g);
  runUntil(g, (x) => x.state === 'HIT_RESOLUTION');
  assert.equal(target.hp, B.maxHP - B.normalDamage);
  assert.equal(taunts.n, 0);
  runUntil(g, (x) => x.state === 'AIMING');
  const t2 = g.opponent;
  const hp = t2.hp;
  throwAt(g, 0.2); // into own side / wall
  runUntil(g, (x) => x.state === 'HIT_RESOLUTION');
  assert.equal(t2.hp, hp);
  assert.equal(taunts.n, 1);
});

test('Double Attack fires exactly two projectiles and is then used up', () => {
  const g = newMatch();
  toAiming(g);
  const me = g.turn;
  const spawns = count(g, 'spawn');
  const target = g.opponent;
  assert.equal(g.toggleSpecial('double'), true);
  sureHit(g, 'double');
  runUntil(g, (x) => x.state === 'HIT_RESOLUTION');
  assert.equal(spawns.n, 2);
  assert.equal(target.hp, B.maxHP - 2 * B.doubleShotDamage, 'both shots landed');
  assert.equal(g.players[me].specials.double, false);
  runUntil(g, (x) => x.state === 'AIMING' && x.turn !== me);
  throwAt(g, 0.2);
  runUntil(g, (x) => x.state === 'AIMING' && x.turn === me);
  const denied = count(g, 'denied');
  assert.equal(g.toggleSpecial('double'), false);
  assert.equal(denied.n, 1);
  assert.equal(g.selectedSpecial, null);
});

test('Power Throw and Stink Throw damage values', () => {
  for (const [kind, dmg] of [['power', B.powerThrowDamage], ['stink', B.stinkDamage]]) {
    const g = newMatch();
    toAiming(g);
    const target = g.opponent;
    g.toggleSpecial(kind);
    sureHit(g, kind);
    runUntil(g, (x) => x.state === 'HIT_RESOLUTION');
    assert.equal(target.hp, B.maxHP - dmg, kind);
  }
});

test('Heal never exceeds max HP, is refused at full HP and ends the turn', () => {
  const g = newMatch();
  toAiming(g);
  const me = g.current;
  const denied = count(g, 'denied');
  assert.equal(g.toggleSpecial('heal'), false, 'full HP: refused');
  assert.equal(denied.n, 1);
  me.hp = 90;
  assert.equal(g.toggleSpecial('heal'), true);
  assert.equal(g.pressStart(), true);
  assert.equal(me.hp, B.maxHP);
  assert.equal(me.specials.heal, false);
  assert.equal(g.state, 'HIT_RESOLUTION');
  const who = g.turn;
  runUntil(g, (x) => x.state === 'TURN_START');
  assert.equal(g.turn, 1 - who);
});

test('only one special per turn; selecting again cancels it', () => {
  const g = newMatch();
  toAiming(g);
  const me = g.current;
  g.toggleSpecial('double');
  g.toggleSpecial('power');
  assert.equal(g.selectedSpecial, 'power');
  g.toggleSpecial('power');
  assert.equal(g.selectedSpecial, null);
  g.toggleSpecial('stink');
  throwAt(g, 0.3);
  assert.equal(g.pressStart(), false);
  assert.deepEqual(me.specials, { double: true, power: true, stink: false, heal: true });
  assert.equal(g.turnResult.kind, 'stink');
});

test('specials cannot be switched while charging', () => {
  const g = newMatch();
  toAiming(g);
  g.pressStart();
  assert.equal(g.toggleSpecial('power'), false);
  g.pressEnd();
});

test('turn timer expiry passes the turn without an attack', () => {
  const g = newMatch();
  toAiming(g);
  const who = g.turn;
  const spawns = count(g, 'spawn');
  const timeouts = count(g, 'timeout');
  g.toggleSpecial('power');
  runUntil(g, (x) => x.state === 'TURN_END', B.turnDuration + 1);
  assert.equal(timeouts.n, 1);
  assert.equal(spawns.n, 0);
  assert.equal(g.players[who].specials.power, true, 'unused special is kept');
  runUntil(g, (x) => x.state === 'TURN_START');
  assert.equal(g.turn, 1 - who);
});

test('holding the button past the time limit still throws', () => {
  const g = newMatch();
  toAiming(g);
  g.timer = 0.2;
  g.pressStart();
  runUntil(g, (x) => x.state !== 'AIMING', 1);
  assert.equal(g.state, 'PROJECTILE_FLYING');
});

test('pause freezes the timer and input', () => {
  const g = newMatch();
  toAiming(g);
  const t = g.timer;
  g.setPaused(true);
  for (let i = 0; i < 600; i++) g.update(DT);
  assert.equal(g.timer, t);
  assert.equal(g.pressStart(), false);
  g.setPaused(false);
  g.update(DT);
  assert.ok(g.timer < t);
});

test('live flight equals the physics simulation (CPU and humans share one model)', () => {
  const g = newMatch('1P', 'hard', 21);
  const records = [];
  g.on('throw', (e) => records.push({ player: e.player, power: e.power, wind: g.wind, kind: e.kind }));
  const impacts = [];
  g.on('impact', (e) => impacts.push(e));
  g.on('hit', (e) => impacts.push(Object.assign({ surface: 'target' }, e)));
  playMatch(g, 3);
  assert.ok(records.length > 4);
  // check the first projectile of every non-double throw
  let k = 0;
  for (const r of records) {
    const sim = Physics.simulate(r.player, r.power, r.wind, r.kind, B);
    const imp = impacts[k];
    assert.equal(imp.surface, sim.outcome);
    assert.ok(Math.abs(imp.x - sim.x) < 1e-6 && Math.abs(imp.y - sim.y) < 1e-6);
    k += r.kind === 'double' ? 2 : 1;
    if (g.winner !== null && k >= impacts.length) break;
  }
});

test('CPU misses sometimes, even on Hard', () => {
  let throws = 0;
  let hits = 0;
  for (let s = 0; s < 6; s++) {
    const g = newMatch('1P', 'hard', 100 + s);
    playMatch(g, 50 + s);
    throws += g.players[0].stats.throws;
    hits += g.players[0].stats.hits;
  }
  assert.ok(throws > 20);
  assert.ok(hits < throws, 'not 100% accurate');
  assert.ok(hits / throws < 0.8);
});

test('knockout: game over, a Double\'s second shot after the KO deals no damage', () => {
  const g = newMatch();
  toAiming(g);
  const spawns = count(g, 'spawn');
  const hits = count(g, 'hit');
  const target = g.opponent;
  const me = g.turn;
  target.hp = 15;
  g.toggleSpecial('double');
  sureHit(g, 'double');
  runUntil(g, (x) => x.state === 'GAME_OVER');
  assert.equal(target.hp, 0);
  assert.equal(g.winner, me);
  assert.equal(spawns.n, 2, 'second shot was already airborne');
  assert.equal(hits.n, 1, 'only the lethal shot counts');
  assert.equal(g.players[me].stats.damage, B.doubleShotDamage);
  assert.equal(g.resultText(), `PLAYER ${me + 1} WINS`);
  // nothing more can happen
  const hpA = g.players.map((p) => p.hp);
  assert.equal(g.pressStart(), false);
  assert.equal(g.toggleSpecial('power'), false);
  for (let i = 0; i < 1200; i++) g.update(DT);
  assert.equal(spawns.n, 2);
  assert.equal(hits.n, 1);
  assert.deepEqual(g.players.map((p) => p.hp), hpA);
  assert.equal(g.state, 'GAME_OVER');
});

test('a KO before the second Double shot leaves it unthrown', () => {
  const g = newMatch();
  toAiming(g);
  const spawns = count(g, 'spawn');
  g.opponent.hp = 15;
  g.toggleSpecial('double');
  sureHit(g, 'double');
  // force the first projectile's impact right away (before the 0.3 s follow-up)
  g.update(DT);
  const pr = g.projectiles[0];
  const tr = Physics.targetRect(1 - g.turn, B);
  pr.x = tr.x + tr.w / 2; pr.y = tr.y + tr.h / 2; pr.vx = 0; pr.vy = 0;
  runUntil(g, (x) => x.state === 'GAME_OVER');
  assert.equal(spawns.n, 1);
});

test('1P result text is YOU WIN / YOU LOSE', () => {
  const g = newMatch('1P', 'beginner', 5);
  runUntil(g, (x) => x.state === 'AIMING' && !x.current.isCPU, 60);
  g.opponent.hp = 10;
  sureHit(g);
  runUntil(g, (x) => x.state === 'GAME_OVER');
  assert.equal(g.resultText(), 'YOU WIN');
  const h = newMatch('1P', 'beginner', 5);
  runUntil(h, (x) => x.state === 'AIMING' && !x.current.isCPU, 60);
  h.current.hp = 0.0001;
  h.winner = 0;
  assert.equal(h.resultText(), 'YOU LOSE');
});

test('rematch resets HP, specials, wind, turn, timer, stats and CPU state', () => {
  const g = newMatch('1P', 'average', 9);
  playMatch(g, 9);
  assert.equal(g.state, 'GAME_OVER');
  const oldAi = g.players[0].ai;
  g.rematch();
  assert.equal(g.state, 'ROUND_START');
  for (const p of g.players) {
    assert.equal(p.hp, B.maxHP);
    assert.deepEqual(p.specials, { double: true, power: true, stink: true, heal: true });
    assert.deepEqual(p.stats, { throws: 0, hits: 0, damage: 0 });
    assert.equal(p.lastPower, null);
    assert.equal(p.anim.name, 'idle');
  }
  assert.notEqual(g.players[0].ai, oldAi);
  assert.equal(g.players[0].ai.shots, 0);
  assert.equal(g.players[0].ai.learned, 0);
  assert.equal(g.winner, null);
  assert.equal(g.turnCount, 0);
  assert.equal(g.timer, B.turnDuration);
  assert.equal(g.projectiles.length, 0);
  assert.equal(g.selectedSpecial, null);
  assert.equal(g.mode, '1P');
  assert.equal(g.difficulty, 'average');
});

test('full matches finish in both modes and every CPU level, in a sensible time', () => {
  const setups = [['2P'], ['1P', 'beginner'], ['1P', 'average'], ['1P', 'hard']];
  for (const [mode, diff] of setups) {
    for (let s = 0; s < 4; s++) {
      const g = newMatch(mode, diff, 300 + s);
      const t = playMatch(g, 700 + s);
      assert.equal(g.state, 'GAME_OVER', `${mode} ${diff} finished`);
      assert.ok(g.players.some((p) => p.hp === 0));
      assert.ok(t > 40 && t < 420, `${mode} ${diff} took ${t.toFixed(0)}s`);
    }
  }
});

test('main menu from a match clears it', () => {
  const g = newMatch('1P', 'hard');
  toAiming(g);
  g.setPaused(true);
  g.toMainMenu();
  assert.equal(g.state, 'MODE_SELECT');
  assert.equal(g.paused, false);
  assert.equal(g.projectiles.length, 0);
  assert.equal(g.players[0].isCPU, false);
});
