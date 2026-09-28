/* Small shared helpers (no DOM). */
(function (root) {
  'use strict';
  const OTW = root.OTW || (root.OTW = {});

  const Util = {
    clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; },
    lerp(a, b, t) { return a + (b - a) * t; },
    easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); },
    easeOutBack(t) { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },

    /** Seeded PRNG (mulberry32). Returns a function producing floats in [0, 1). */
    makeRng(seed) {
      let a = (seed >>> 0) || 0x9e3779b9;
      return function () {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },

    /** Standard normal sample (Box–Muller) from a uniform rng. */
    gaussian(rng) {
      let u = 0;
      while (u === 0) u = rng();
      const v = rng();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },

    /** Triangular sample in [-1, 1], peaked at 0. */
    triangular(rng) { return rng() + rng() - 1; },
  };

  OTW.Util = Util;
  if (typeof module !== 'undefined' && module.exports) module.exports = Util;
})(typeof window !== 'undefined' ? window : globalThis);
