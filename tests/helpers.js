// Shared test helpers: loads the DOM-free game modules into Node.
const U = require('../js/util.js');
const B = require('../js/balance.js');
const Physics = require('../js/physics.js');
const AI = require('../js/ai.js');
const Game = require('../js/game.js');

const DT = 1 / 120;

function runUntil(game, pred, maxSeconds = 30, dt = DT) {
  let t = 0;
  while (!pred(game) && t < maxSeconds) {
    game.update(dt);
    t += dt;
  }
  if (!pred(game)) throw new Error(`runUntil timed out in state ${game.state}`);
  return t;
}

function toAiming(game) {
  return runUntil(game, (g) => g.state === 'AIMING');
}

/** Charges the gauge like a human holding the button, releasing at >= power. */
function throwAt(game, power, dt = 1 / 240) {
  if (!game.pressStart()) throw new Error(`pressStart refused in ${game.state}`);
  while (game.charging && game.power < power) game.update(dt);
  game.pressEnd();
}

/** Ideal (centre-of-window) power for the current thrower at the current wind. */
function idealFor(game, kind = 'normal') {
  const ai = new AI('hard', game.turn, B, U.makeRng(1));
  return ai.idealPower(game.wind, kind);
}

/** Plays a whole match. Humans are driven by a noisy "average" bot. */
function playMatch(game, seed = 1, maxSeconds = 900) {
  const bots = [new AI('average', 0, B, U.makeRng(seed)), new AI('average', 1, B, U.makeRng(seed + 1))];
  let target = null;
  let t = 0;
  while (game.state !== 'GAME_OVER' && t < maxSeconds) {
    if (game.state === 'AIMING' && !game.current.isCPU) {
      if (!game.charging) {
        const bot = bots[game.turn];
        const plan = bot.plan({ wind: game.wind, me: game.current, opp: game.opponent, turnCount: game.turnCount });
        if (plan.special && game.specialAvailable(game.turn, plan.special)) game.toggleSpecial(plan.special);
        if (game.selectedSpecial === 'heal') { game.pressStart(); target = null; }
        else { target = plan.power; game.pressStart(); }
      } else if (target !== null && game.power >= target) {
        game.pressEnd();
      }
    }
    game.update(1 / 60);
    t += 1 / 60;
  }
  return t;
}

module.exports = { U, B, Physics, AI, Game, DT, runUntil, toAiming, throwAt, idealFor, playMatch };
