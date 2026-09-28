/*
 * GameBalance - every tunable number lives here.
 * Change values in this file to rebalance the game; no other code needs to change.
 *
 * Units: logical canvas pixels (1280x720 world) and seconds.
 * Wind is a normalized balance value in [-maxWind, +maxWind] (negative = blowing left).
 * None of these numbers are taken from any existing game; they are tuned for this one.
 */
(function (root) {
  'use strict';
  const OTW = root.OTW || (root.OTW = {});

  OTW.Balance = {
    // ---- World layout ------------------------------------------------------
    world: {
      width: 1280,
      height: 720,
      groundY: 590,
      playerX: [170, 1110],                        // [left, right] foot position
      wall: { centerX: 640, width: 64, topY: 285 }, // central obstacle
      hitbox: { width: 54, height: 96 },            // bottom-aligned on groundY
      launchOffset: { forward: 30, up: 104 },       // hand position at release
      outOfBoundsMargin: 80,
    },

    // ---- Physics -----------------------------------------------------------
    gravity: 900,            // px/s^2
    throwAngleDeg: 55,       // fixed launch angle for both characters
    minThrowPower: 450,      // launch speed (px/s) at 0% power
    maxThrowPower: 1250,     // launch speed (px/s) at 100% power
    powerChargeSpeed: 0.53,  // gauge fraction per second (~1.9 s from 0 to 100%)
    powerPingPong: true,     // gauge bounces back down after reaching 100%
    physicsStep: 1 / 240,    // fixed simulation step -> identical results at any frame rate

    // ---- Wind --------------------------------------------------------------
    maxWind: 100,
    windMultiplier: 2.3,     // horizontal acceleration (px/s^2) per wind unit
    windCalmChance: 0.07,    // chance that a new turn is dead calm (0)
    windRerollChance: 0.3,   // chance of a completely fresh wind instead of a drift
    windMeanReversion: 0.65, // drift: previous wind is pulled toward 0 by this factor
    windMaxStep: 55,         // drift: max random change per turn
    windMinChange: 6,        // new wind always differs from the previous one by at least this

    // ---- HP / damage -------------------------------------------------------
    maxHP: 100,
    normalDamage: 20,
    doubleShotDamage: 20,    // per projectile (two projectiles)
    powerThrowDamage: 35,
    stinkDamage: 25,         // normal damage + small bonus
    healAmount: 25,

    projectiles: {
      normal: { radius: 9 },
      double: { radius: 9, count: 2, delay: 0.3, powerJitter: 0.004 },
      power: { radius: 16 },
      stink: { radius: 10 },
    },

    // ---- Turn flow / timings (seconds) -------------------------------------
    turnDuration: 10,
    timerWarningAt: 3,
    roundStartDuration: 1.8,
    turnBannerDuration: 0.9,
    turnEndDelay: 0.35,
    timeoutDelay: 0.9,
    hitResolveDuration: 0.95,
    tauntDuration: 1.1,
    healDuration: 1.0,
    finalBlowDuration: 1.4,
    gameOverInputDelay: 1.2,

    // ---- Presentation helpers ---------------------------------------------
    showLastPowerMark: true, // small tick on the gauge at this player's previous power
    impactMarkerDuration: 1.2,
    trailFadeDuration: 1.2,

    // ---- CPU ---------------------------------------------------------------
    // ai*Error       : per-throw execution error (std-dev, power fraction)
    // calibrationSD  : persistent "feel" offset drawn at round start (learned away over time)
    // windJudge      : wind is perceived as wind * U(min,max) + N(0, windNoise)
    // learnRate      : how much of the last throw's miss is corrected next throw
    // forgetWindDelta: if the wind changed more than this, the learned correction decays
    // Measured normal-throw hit rates: ~25% / ~42% / ~59% (bounds checked in tests/ai.test.js)
    aiBeginnerError: 0.1,
    aiAverageError: 0.062,
    aiHardError: 0.042,
    ai: {
      beginner: {
        calibrationSD: 0.08, windJudgeMin: 0.2, windJudgeMax: 0.7, windNoise: 12,
        learnRate: 0.3, forgetWindDelta: 30, forgetFactor: 0.4, maxCorrection: 0.12,
        thinkMin: 1.2, thinkMax: 2.2,
      },
      average: {
        calibrationSD: 0.055, windJudgeMin: 0.65, windJudgeMax: 1.0, windNoise: 6,
        learnRate: 0.5, forgetWindDelta: 30, forgetFactor: 0.5, maxCorrection: 0.12,
        thinkMin: 1.0, thinkMax: 1.8,
      },
      hard: {
        calibrationSD: 0.04, windJudgeMin: 0.9, windJudgeMax: 1.08, windNoise: 3,
        learnRate: 0.6, forgetWindDelta: 35, forgetFactor: 0.6, maxCorrection: 0.1,
        thinkMin: 0.8, thinkMax: 1.5,
      },
    },
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = OTW.Balance;
})(typeof window !== 'undefined' ? window : globalThis);
