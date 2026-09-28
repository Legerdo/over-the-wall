const test = require('node:test');
const assert = require('node:assert/strict');
const { U, B, Physics } = require('./helpers.js');

const wallX = B.world.wall.centerX;

function hitWindow(side, wind, kind = 'normal') {
  let lo = null;
  let hi = null;
  for (let i = 0; i <= 1000; i++) {
    const p = i / 1000;
    if (Physics.simulate(side, p, wind, kind, B).outcome === 'target') {
      if (lo === null) lo = p;
      hi = p;
    }
  }
  return lo === null ? null : { lo, hi, width: hi - lo };
}

test('near-zero power still launches and lands on the thrower\'s own side', () => {
  for (const side of [0, 1]) {
    const s = Physics.simulate(side, 0.01, 0, 'normal', B);
    assert.equal(s.outcome, 'ground');
    assert.ok(s.time > 0.2, 'projectile actually flew');
    if (side === 0) assert.ok(s.x < wallX); else assert.ok(s.x > wallX);
  }
});

test('max power keeps the physics finite and flies off the far side', () => {
  for (const side of [0, 1]) {
    for (const wind of [-100, 0, 100]) {
      const s = Physics.simulate(side, 1, wind, 'normal', B, { recordPath: true });
      for (const p of s.path) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
      assert.ok(['out', 'ground'].includes(s.outcome));
      assert.ok(s.time < 5);
    }
  }
});

test('left wind pushes trajectories left, right wind pushes them right', () => {
  const p = 0.58;
  for (const side of [0, 1]) {
    const calm = Physics.simulate(side, p, 0, 'normal', B, { ignoreTarget: true }).crossX;
    const left = Physics.simulate(side, p, -50, 'normal', B, { ignoreTarget: true }).crossX;
    const right = Physics.simulate(side, p, 50, 'normal', B, { ignoreTarget: true }).crossX;
    assert.ok(left < calm - 60, `left wind visibly shifts left (side ${side})`);
    assert.ok(right > calm + 60, `right wind visibly shifts right (side ${side})`);
  }
});

test('calm wind: identical power gives identical result', () => {
  const a = Physics.simulate(0, 0.6123, 0, 'normal', B);
  const b = Physics.simulate(0, 0.6123, 0, 'normal', B);
  assert.deepEqual(a, b);
});

test('the wall blocks low throws; a clear-over throw passes its top', () => {
  const low = Physics.simulate(0, 0.35, 0, 'normal', B);
  assert.equal(low.outcome, 'wall');
  const wr = Physics.wallRect(B);
  assert.ok(low.x >= wr.x - 10 && low.x <= wr.x + wr.w + 10);
  const ok = Physics.simulate(0, 0.58, 0, 'normal', B);
  assert.notEqual(ok.outcome, 'wall');
});

test('circle-vs-wall collision is exact at the edge', () => {
  const wr = Physics.wallRect(B);
  const r = 9;
  assert.equal(Physics.collide({ x: wr.x - r - 0.5, y: wr.y + 50, r }, 1, B), null);
  assert.equal(Physics.collide({ x: wr.x - r + 0.5, y: wr.y + 50, r }, 1, B), 'wall');
  assert.equal(Physics.collide({ x: wallX, y: wr.y - r - 0.5, r }, 1, B), null);
  assert.equal(Physics.collide({ x: wallX, y: wr.y - r + 0.5, r }, 1, B), 'wall');
});

test('character hitbox is neither tiny nor huge (5%..12% of the power range at calm)', () => {
  for (const side of [0, 1]) {
    const w = hitWindow(side, 0);
    assert.ok(w, 'target reachable');
    assert.ok(w.width > 0.05 && w.width < 0.12, `window width ${w.width}`);
    assert.ok(w.lo > 0.45 && w.hi < 0.75, 'calm hit power sits mid-gauge, leaving room for wind');
  }
});

test('every wind value leaves at least one hitting power for both sides', () => {
  for (let wind = -100; wind <= 100; wind += 10) {
    for (const side of [0, 1]) {
      for (const kind of ['normal', 'power']) {
        assert.ok(hitWindow(side, wind, kind), `wind ${wind} side ${side} ${kind}`);
      }
    }
  }
});

test('sides are mirror-symmetric', () => {
  for (const wind of [-70, -20, 0, 35, 90]) {
    const a = hitWindow(0, wind);
    const b = hitWindow(1, -wind);
    assert.ok(Math.abs(a.lo - b.lo) < 0.002 && Math.abs(a.hi - b.hi) < 0.002);
  }
});

test('wind generation: in range, changes every turn, not dominated by extremes', () => {
  const rng = U.makeRng(99);
  let w = null;
  let absSum = 0;
  let extreme = 0;
  const N = 5000;
  for (let i = 0; i < N; i++) {
    const nw = Physics.generateWind(w, rng, B);
    assert.ok(Number.isInteger(nw) && nw >= -B.maxWind && nw <= B.maxWind);
    if (w !== null) assert.ok(Math.abs(nw - w) >= B.windMinChange, 'wind changes each turn');
    absSum += Math.abs(nw);
    if (Math.abs(nw) > 80) extreme++;
    w = nw;
  }
  assert.ok(absSum / N > 15 && absSum / N < 40, `mean |wind| ${absSum / N}`);
  assert.ok(extreme / N < 0.05, 'strong extremes are rare');
});
