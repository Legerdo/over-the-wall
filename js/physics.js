/*
 * Projectile physics + collision. Pure functions, no DOM.
 * The live game and the CPU both use exactly these functions, with the same fixed
 * step, so the CPU never has a "cheat" trajectory.
 *
 * side 0 = left character (throws to the right), side 1 = right character (throws left).
 */
(function (root) {
  'use strict';
  const OTW = root.OTW || (root.OTW = {});
  const U = OTW.Util || require('./util.js');

  const Physics = {
    dirOf(side) { return side === 0 ? 1 : -1; },

    speedFromPower(power, B) {
      const p = U.clamp(power, 0, 1);
      return B.minThrowPower + (B.maxThrowPower - B.minThrowPower) * p;
    },

    /** Projectile state at the moment of release. */
    launch(side, power, kind, B) {
      const w = B.world;
      const dir = Physics.dirOf(side);
      const a = (B.throwAngleDeg * Math.PI) / 180;
      const s = Physics.speedFromPower(power, B);
      const spec = B.projectiles[kind] || B.projectiles.normal;
      return {
        x: w.playerX[side] + dir * w.launchOffset.forward,
        y: w.groundY - w.launchOffset.up,
        vx: dir * s * Math.cos(a),
        vy: -s * Math.sin(a),
        r: spec.radius,
      };
    },

    windAccel(wind, B) { return wind * B.windMultiplier; },

    /** One semi-implicit Euler step. Wind acts for the whole flight. */
    integrate(p, wind, dt, B) {
      p.vx += Physics.windAccel(wind, B) * dt;
      p.vy += B.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    },

    targetRect(side, B) {
      const w = B.world;
      const hb = w.hitbox;
      return { x: w.playerX[side] - hb.width / 2, y: w.groundY - hb.height, w: hb.width, h: hb.height };
    },

    wallRect(B) {
      const wl = B.world.wall;
      return { x: wl.centerX - wl.width / 2, y: wl.topY, w: wl.width, h: B.world.groundY - wl.topY };
    },

    targetCenterY(B) { return B.world.groundY - B.world.hitbox.height / 2; },

    circleRect(cx, cy, r, rc) {
      const nx = U.clamp(cx, rc.x, rc.x + rc.w);
      const ny = U.clamp(cy, rc.y, rc.y + rc.h);
      const dx = cx - nx;
      const dy = cy - ny;
      return dx * dx + dy * dy <= r * r;
    },

    /**
     * Returns 'target' | 'wall' | 'ground' | 'out' | null.
     * The thrower's own body is ignored (no self-damage in this design).
     */
    collide(p, targetSide, B) {
      const w = B.world;
      if (targetSide >= 0 && Physics.circleRect(p.x, p.y, p.r, Physics.targetRect(targetSide, B))) return 'target';
      if (Physics.circleRect(p.x, p.y, p.r, Physics.wallRect(B))) return 'wall';
      if (p.y + p.r >= w.groundY) return 'ground';
      const m = w.outOfBoundsMargin;
      if (p.x < -m || p.x > w.width + m || p.y > w.height + m) return 'out';
      return null;
    },

    /**
     * Full deterministic flight simulation.
     * crossX = x where the projectile descends through the target's mid-height
     * (or where it stopped, if it never got there). Used to measure "short / long".
     * opts.ignoreTarget: fly through the target (used to measure pure distance).
     */
    simulate(side, power, wind, kind, B, opts) {
      opts = opts || {};
      const p = Physics.launch(side, power, kind, B);
      const targetSide = 1 - side;
      const step = B.physicsStep;
      const cy = Physics.targetCenterY(B);
      const maxT = opts.maxTime || 10;
      const path = opts.recordPath ? [{ x: p.x, y: p.y }] : null;
      let t = 0;
      let outcome = null;
      let crossX = null;
      let prevX = p.x;
      let prevY = p.y;
      let n = 0;
      while (t < maxT) {
        Physics.integrate(p, wind, step, B);
        t += step;
        if (crossX === null && p.vy > 0 && prevY < cy && p.y >= cy) {
          const f = (cy - prevY) / (p.y - prevY);
          crossX = prevX + (p.x - prevX) * f;
        }
        prevX = p.x;
        prevY = p.y;
        if (path && (++n % 4 === 0)) path.push({ x: p.x, y: p.y });
        outcome = Physics.collide(p, opts.ignoreTarget ? -1 : targetSide, B);
        if (outcome) break;
      }
      if (!outcome) outcome = 'out';
      if (crossX === null) crossX = p.x;
      if (path) path.push({ x: p.x, y: p.y });
      return { outcome, x: p.x, y: p.y, time: t, crossX, path };
    },

    /** Signed miss along the throw direction: + = too long, − = too short. */
    missDistance(side, sim, B) {
      return (sim.crossX - B.world.playerX[1 - side]) * Physics.dirOf(side);
    },

    /**
     * New wind for the next turn. Mostly drifts from the previous value (so reading the
     * change matters), sometimes rerolls, occasionally goes calm. Mean reversion keeps
     * extreme values from repeating.
     */
    generateWind(prev, rng, B) {
      const W = B.maxWind;
      let w = 0;
      for (let i = 0; i < 8; i++) {
        if (rng() < B.windCalmChance) w = 0;
        else if (prev === null || prev === undefined || rng() < B.windRerollChance) w = U.triangular(rng) * W;
        else w = prev * B.windMeanReversion + U.triangular(rng) * B.windMaxStep;
        w = U.clamp(Math.round(w), -W, W);
        if (prev === null || prev === undefined || Math.abs(w - prev) >= B.windMinChange) break;
      }
      return w;
    },
  };

  OTW.Physics = Physics;
  if (typeof module !== 'undefined' && module.exports) module.exports = Physics;
})(typeof window !== 'undefined' ? window : globalThis);
