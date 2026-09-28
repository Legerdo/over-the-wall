const test = require('node:test');
const assert = require('node:assert/strict');
const { U, B, Physics, AI } = require('./helpers.js');

function hitRate(diff, games = 80, shots = 10) {
  let hits = 0;
  let total = 0;
  const firstErr = [];
  const lateErr = [];
  for (let g = 0; g < games; g++) {
    const rng = U.makeRng(4242 + g * 31);
    const side = g % 2;
    const ai = new AI(diff, side, B, rng);
    let wind = Physics.generateWind(null, rng, B);
    for (let s = 0; s < shots; s++) {
      const plan = ai.plan({ wind, me: { hp: 100, specials: {} }, opp: { hp: 100, specials: {} }, turnCount: s * 2 });
      const hit = Physics.simulate(side, plan.power, wind, 'normal', B).outcome === 'target';
      const err = Math.abs(plan.power - ai.idealPower(wind, 'normal'));
      (s === 0 ? firstErr : s >= 4 ? lateErr : []).push(err);
      ai.observe({ power: plan.power, wind, kind: 'normal', hit });
      if (hit) hits++;
      total++;
      wind = Physics.generateWind(Physics.generateWind(wind, rng, B), rng, B);
    }
  }
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  return { rate: hits / total, firstErr: mean(firstErr), lateErr: mean(lateErr) };
}

test('ideal power actually hits for a spread of winds', () => {
  for (const side of [0, 1]) {
    const ai = new AI('hard', side, B, U.makeRng(3));
    for (let wind = -100; wind <= 100; wind += 25) {
      for (const kind of ['normal', 'power', 'stink']) {
        const p = ai.idealPower(wind, kind);
        assert.equal(Physics.simulate(side, p, wind, kind, B).outcome, 'target', `side ${side} wind ${wind} ${kind}`);
      }
    }
  }
});

test('difficulty levels differ and even Hard is not an aimbot', () => {
  const b = hitRate('beginner');
  const a = hitRate('average');
  const h = hitRate('hard');
  assert.ok(b.rate < a.rate && a.rate < h.rate, `rates ${b.rate} ${a.rate} ${h.rate}`);
  assert.ok(b.rate > 0.1 && b.rate < 0.35, `beginner ${b.rate}`);
  assert.ok(h.rate > 0.45 && h.rate < 0.75, `hard ${h.rate}`);
});

test('CPU corrects itself from its previous landing (later throws are closer)', () => {
  for (const diff of ['average', 'hard']) {
    const r = hitRate(diff, 120);
    assert.ok(r.lateErr < r.firstErr, `${diff}: first ${r.firstErr.toFixed(3)} late ${r.lateErr.toFixed(3)}`);
  }
});

test('big wind changes make the CPU partially forget its correction', () => {
  const ai = new AI('hard', 0, B, U.makeRng(5));
  ai.observe({ power: 0.3, wind: -40, kind: 'normal', hit: false }); // way short -> learns "throw harder"
  const learned = ai.learned;
  assert.ok(learned > 0);
  ai.plan({ wind: 60, me: { hp: 100, specials: {} }, opp: { hp: 100, specials: {} }, turnCount: 2 });
  assert.ok(Math.abs(ai.learned) < Math.abs(learned));
});

test('plans are always legal: power in range, only available specials, no heal at full HP', () => {
  const rng = U.makeRng(77);
  for (const diff of ['beginner', 'average', 'hard']) {
    for (let i = 0; i < 300; i++) {
      const ai = new AI(diff, i % 2, B, rng);
      const specials = { double: rng() < 0.5, power: rng() < 0.5, stink: rng() < 0.5, heal: rng() < 0.5 };
      const me = { hp: Math.ceil(rng() * 100), specials };
      const opp = { hp: Math.ceil(rng() * 100), specials: {} };
      const plan = ai.plan({ wind: Math.round((rng() * 2 - 1) * 100), me, opp, turnCount: Math.floor(rng() * 20) });
      assert.ok(plan.power >= 0 && plan.power <= 1);
      if (plan.special) assert.ok(specials[plan.special], `${diff} picked unavailable ${plan.special}`);
      if (plan.special === 'heal') assert.ok(me.hp < B.maxHP);
      assert.ok(plan.thinkTime + 0.6 + 1 / B.powerChargeSpeed < B.turnDuration, 'CPU always acts in time');
    }
  }
});

test('Hard goes for the kill with a finisher when one is enough', () => {
  const ai = new AI('hard', 0, B, U.makeRng(8));
  const all = { double: true, power: true, stink: true, heal: true };
  const plan = ai.plan({ wind: 0, me: { hp: 100, specials: all }, opp: { hp: 30, specials: {} }, turnCount: 6 });
  assert.equal(plan.special, 'power');
});
