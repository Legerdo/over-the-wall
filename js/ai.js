/*
 * CPU opponent. It plays by the same rules as a human:
 *  - it "reads" the wind (with a difficulty-dependent misjudgment),
 *  - estimates the ideal power using the real physics,
 *  - has a persistent power "feel" offset plus per-throw execution error,
 *  - watches where its last throw landed and corrects the next one
 *    (partially forgetting that correction when the wind changes a lot).
 * No DOM.
 */
(function (root) {
  'use strict';
  const OTW = root.OTW || (root.OTW = {});
  const U = OTW.Util || require('./util.js');
  const Physics = OTW.Physics || require('./physics.js');

  class AI {
    constructor(difficulty, side, B, rng) {
      this.difficulty = difficulty;
      this.side = side;
      this.B = B;
      this.rng = rng || Math.random;
      this.profile = B.ai[difficulty];
      const errKey = { beginner: 'aiBeginnerError', average: 'aiAverageError', hard: 'aiHardError' }[difficulty];
      this.error = B[errKey];
      this.reset();
    }

    reset() {
      this.calibOffset = U.clamp(U.gaussian(this.rng) * this.profile.calibrationSD, -0.15, 0.15);
      this.learned = 0;
      this.lastWind = null;
      this.lastMiss = null;
      this.lastHit = false;
      this.shots = 0;
      this.hits = 0;
      this.lastPlan = null;
    }

    /**
     * Power (0..1) whose trajectory hits the target's centre of tolerance for the given
     * wind. Scans the power range, takes the widest hitting window and returns its middle.
     */
    idealPower(wind, kind) {
      const B = this.B;
      const side = this.side;
      const hit = (p) => Physics.simulate(side, p, wind, kind, B).outcome === 'target';
      const N = 100;
      let best = null;
      let run = null;
      for (let i = 0; i <= N; i++) {
        const p = i / N;
        if (hit(p)) {
          if (!run) run = { lo: i, hi: i };
          else run.hi = i;
        } else if (run) {
          if (!best || run.hi - run.lo > best.hi - best.lo) best = run;
          run = null;
        }
      }
      if (run && (!best || run.hi - run.lo > best.hi - best.lo)) best = run;

      if (best) {
        // Refine both edges by bisection for a precise centre.
        const edge = (inside, outside) => {
          for (let k = 0; k < 7; k++) {
            const m = (inside + outside) / 2;
            if (hit(m)) inside = m; else outside = m;
          }
          return inside;
        };
        const lo = best.lo > 0 ? edge(best.lo / N, (best.lo - 1) / N) : 0;
        const hi = best.hi < N ? edge(best.hi / N, (best.hi + 1) / N) : 1;
        return (lo + hi) / 2;
      }

      // Nothing hits (should not happen with default balance): minimise |miss|.
      let bestP = 0.5;
      let bestMiss = Infinity;
      for (let i = 0; i <= N; i++) {
        const p = i / N;
        const m = Math.abs(Physics.missDistance(side, Physics.simulate(side, p, wind, kind, B), B));
        if (m < bestMiss) { bestMiss = m; bestP = p; }
      }
      return bestP;
    }

    /** px of landing shift per 1.0 of power, around power p (always positive). */
    sensitivity(p, wind, kind) {
      const B = this.B;
      const d = 0.02;
      const a = Physics.simulate(this.side, U.clamp(p - d, 0, 1), wind, kind, B, { ignoreTarget: true });
      const b = Physics.simulate(this.side, U.clamp(p + d, 0, 1), wind, kind, B, { ignoreTarget: true });
      const s = Math.abs((b.crossX - a.crossX) / (2 * d));
      return Math.max(400, s);
    }

    /** "Am I dialled in?" — last throw close and wind not wildly different. */
    confident(wind) {
      if (this.lastMiss === null) return false;
      const windOk = this.lastWind === null || Math.abs(wind - this.lastWind) <= this.profile.forgetWindDelta;
      return windOk && (this.lastHit || Math.abs(this.lastMiss) < 70);
    }

    chooseSpecial(ctx) {
      const B = this.B;
      const r = this.rng;
      const me = ctx.me;
      const opp = ctx.opp;
      const has = (k) => me.specials[k];
      const canHeal = has('heal') && me.hp < B.maxHP;
      const attackSpecials = ['double', 'power', 'stink'].filter(has);
      const conf = this.confident(ctx.wind);

      if (this.difficulty === 'beginner') {
        if (canHeal && me.hp <= 30 && r() < 0.5) return 'heal';
        if (attackSpecials.length && ctx.turnCount >= 2 && r() < 0.22) {
          return attackSpecials[Math.floor(r() * attackSpecials.length)];
        }
        return null;
      }

      if (this.difficulty === 'average') {
        if (canHeal && me.hp <= 40 && me.hp <= opp.hp && r() < 0.75) return 'heal';
        if (has('power') && opp.hp <= B.powerThrowDamage && opp.hp > B.normalDamage && r() < 0.7) return 'power';
        if (has('double') && conf && r() < 0.5) return 'double';
        if (attackSpecials.length && ctx.turnCount >= 4 && r() < 0.18) {
          return attackSpecials[Math.floor(r() * attackSpecials.length)];
        }
        return null;
      }

      // hard
      if (opp.hp <= B.normalDamage) return null; // a normal hit finishes it; save nothing, keep it simple
      if (has('stink') && opp.hp <= B.stinkDamage) return 'stink';
      if (has('power') && opp.hp <= B.powerThrowDamage) return 'power';
      if (has('double') && opp.hp <= 2 * B.doubleShotDamage && conf) return 'double';
      if (canHeal && (me.hp <= 30 || (me.hp <= 45 && opp.hp > me.hp)) && r() < 0.85) return 'heal';
      if (conf && has('double') && opp.hp >= 40 && r() < 0.45) return 'double';
      if (conf && has('power') && r() < 0.35) return 'power';
      if (has('stink') && ctx.turnCount >= 3 && r() < 0.25) return 'stink';
      return null;
    }

    /** Decide this turn's action. Returns { special, kind, power, thinkTime }. */
    plan(ctx) {
      const pr = this.profile;
      const r = this.rng;
      if (this.lastWind !== null && Math.abs(ctx.wind - this.lastWind) > pr.forgetWindDelta) {
        this.learned *= pr.forgetFactor;
      }
      const special = this.chooseSpecial(ctx);
      const kind = special && special !== 'heal' ? special : 'normal';
      const perceived = ctx.wind * U.lerp(pr.windJudgeMin, pr.windJudgeMax, r()) + U.gaussian(r) * pr.windNoise;
      const ideal = this.idealPower(U.clamp(perceived, -this.B.maxWind * 1.2, this.B.maxWind * 1.2), kind);
      const power = U.clamp(ideal + this.calibOffset + this.learned + U.gaussian(r) * this.error, 0, 1);
      const thinkTime = U.lerp(pr.thinkMin, pr.thinkMax, r());
      this.lastPlan = { special, kind, power, thinkTime, ideal, perceived };
      return this.lastPlan;
    }

    /** Called after the CPU's throw resolves. It saw the flight, so it can judge short/long. */
    observe(result) {
      const B = this.B;
      const pr = this.profile;
      const sim = Physics.simulate(this.side, result.power, result.wind, result.kind, B, { ignoreTarget: true });
      const miss = Physics.missDistance(this.side, sim, B);
      const sens = this.sensitivity(result.power, result.wind, result.kind);
      let corr = U.clamp(-miss / sens, -pr.maxCorrection, pr.maxCorrection);
      if (result.hit) corr *= 0.5; // already on target: only nudge toward the centre
      this.learned = U.clamp(this.learned + pr.learnRate * corr, -0.3, 0.3);
      this.lastWind = result.wind;
      this.lastMiss = result.hit ? 0 : miss;
      this.lastHit = !!result.hit;
      this.shots++;
      if (result.hit) this.hits++;
    }
  }

  OTW.AI = AI;
  if (typeof module !== 'undefined' && module.exports) module.exports = AI;
})(typeof window !== 'undefined' ? window : globalThis);
