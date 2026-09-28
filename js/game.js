/*
 * Game rules + state machine. No DOM: the browser layer (main.js) feeds input and
 * dt, and renders from this object's public fields. Presentation (particles, audio)
 * listens to emitted events.
 *
 * States:
 *   MENU -> MODE_SELECT -> (DIFFICULTY_SELECT | HOW_TO_PLAY) -> ROUND_START
 *   ROUND_START -> TURN_START -> AIMING -> PROJECTILE_FLYING -> HIT_RESOLUTION -> TURN_END -> TURN_START ...
 *   AIMING -> HIT_RESOLUTION (heal)    AIMING -> TURN_END (time out)
 *   HIT_RESOLUTION -> GAME_OVER (someone reached 0 HP)
 */
(function (root) {
  'use strict';
  const OTW = root.OTW || (root.OTW = {});
  const U = OTW.Util || require('./util.js');
  const Physics = OTW.Physics || require('./physics.js');
  const AI = OTW.AI || require('./ai.js');
  const DefaultBalance = OTW.Balance || require('./balance.js');

  const S = Object.freeze({
    MENU: 'MENU',
    MODE_SELECT: 'MODE_SELECT',
    DIFFICULTY_SELECT: 'DIFFICULTY_SELECT',
    HOW_TO_PLAY: 'HOW_TO_PLAY',
    ROUND_START: 'ROUND_START',
    TURN_START: 'TURN_START',
    AIMING: 'AIMING',
    PROJECTILE_FLYING: 'PROJECTILE_FLYING',
    HIT_RESOLUTION: 'HIT_RESOLUTION',
    TURN_END: 'TURN_END',
    GAME_OVER: 'GAME_OVER',
  });

  const SPECIALS = ['double', 'power', 'stink', 'heal'];
  const MATCH_STATES = new Set([S.ROUND_START, S.TURN_START, S.AIMING, S.PROJECTILE_FLYING, S.HIT_RESOLUTION, S.TURN_END, S.GAME_OVER]);
  const CHAR_IDS = ['rocco', 'hazel'];
  const CHAR_NAMES = { rocco: 'ROCCO', hazel: 'HAZEL' };

  const ANIM_DUR = { idle: 0, windup: 0, throw: 0.35, hit: 0.8, stinkHit: 1.1, taunt: 1.1, heal: 1.0, confused: 0.9, win: 0, lose: 0 };

  class Game {
    constructor(opts) {
      opts = opts || {};
      this.B = opts.balance || DefaultBalance;
      this.rng = opts.rng || (opts.seed !== undefined ? U.makeRng(opts.seed) : Math.random);
      this.listeners = {};
      this.state = S.MENU;
      this.prevState = null;
      this.stateTime = 0;
      this.time = 0;
      this.mode = null;        // '1P' | '2P'
      this.difficulty = null;  // 'beginner' | 'average' | 'hard'
      this.paused = false;
      this.players = [this._makePlayer(0), this._makePlayer(1)];
      this._clearMatch();
    }

    // ---------------------------------------------------------------- events
    on(type, fn) { (this.listeners[type] || (this.listeners[type] = [])).push(fn); return this; }
    emit(type, data) {
      const ls = this.listeners[type];
      if (ls) for (const fn of ls) fn(data || {}, this);
      const all = this.listeners['*'];
      if (all) for (const fn of all) fn(Object.assign({ type }, data || {}), this);
    }

    setState(s) {
      this.prevState = this.state;
      this.state = s;
      this.stateTime = 0;
      this.emit('state', { state: s, prev: this.prevState });
    }

    // ---------------------------------------------------------------- setup
    _makePlayer(i) {
      return {
        index: i,
        charId: CHAR_IDS[i],
        x: this.B.world.playerX[i],
        hp: this.B.maxHP,
        specials: { double: true, power: true, stink: true, heal: true },
        isCPU: false,
        ai: null,
        lastPower: null,
        stats: { throws: 0, hits: 0, damage: 0 },
        anim: { name: 'idle', t: 0, dur: 0 },
      };
    }

    _clearMatch() {
      this.turn = 0;
      this.turnCount = 0;
      this.wind = 0;
      this.timer = this.B.turnDuration;
      this.lastTick = null;
      this.power = 0;
      this.powerDir = 1;
      this.charging = false;
      this.selectedSpecial = null;
      this.projectiles = [];
      this.pendingShots = [];
      this.physAcc = 0;
      this.turnResult = null;
      this.resolveDuration = 0;
      this.winner = null;
      this.endReason = null;
      this.cpu = null;
      this.lastImpact = null;
      this._pid = 0;
    }

    // ---------------------------------------------------------------- menus
    openModeSelect() {
      this.paused = false;
      this._clearMatch();
      for (const p of this.players) { p.isCPU = false; p.ai = null; p.hp = this.B.maxHP; this._anim(p, 'idle'); }
      this.mode = null;
      this.setState(S.MODE_SELECT);
    }
    openDifficulty() { this.setState(S.DIFFICULTY_SELECT); }
    openHowTo() { this.setState(S.HOW_TO_PLAY); }
    backToModes() { this.setState(S.MODE_SELECT); }
    toMainMenu() { this.openModeSelect(); }

    /** mode: '1P' | '2P'. In 1P the human plays the right character, the CPU the left. */
    startMatch(mode, difficulty) {
      const B = this.B;
      this.mode = mode;
      this.difficulty = mode === '1P' ? (difficulty || 'average') : null;
      this.paused = false;
      this._clearMatch();
      this.players = [this._makePlayer(0), this._makePlayer(1)];
      if (mode === '1P') {
        const cpu = this.players[0];
        cpu.isCPU = true;
        cpu.ai = new AI(this.difficulty, 0, B, this.rng);
      }
      this.wind = Physics.generateWind(null, this.rng, B);
      this.turn = this.rng() < 0.5 ? 0 : 1;
      this.setState(S.ROUND_START);
      this.emit('roundStart', { first: this.turn, wind: this.wind });
    }

    rematch() { this.startMatch(this.mode, this.difficulty); }

    // ---------------------------------------------------------------- queries
    get current() { return this.players[this.turn]; }
    get opponent() { return this.players[1 - this.turn]; }
    isMatchState() { return MATCH_STATES.has(this.state); }
    isHumanTurn() { return this.isMatchState() && !this.current.isCPU; }
    canHumanAct() { return this.state === S.AIMING && !this.paused && this.isHumanTurn(); }
    charName(i) { return CHAR_NAMES[this.players[i].charId]; }
    tagOf(i) {
      if (this.mode === '1P') return this.players[i].isCPU ? 'CPU' : 'YOU';
      return i === 0 ? 'P1' : 'P2';
    }
    turnLabel(i) {
      if (this.mode === '1P') return this.players[i].isCPU ? 'CPU TURN' : 'YOUR TURN';
      return `PLAYER ${i + 1} TURN`;
    }
    resultText() {
      if (this.winner === null) return '';
      if (this.mode === '1P') return this.players[this.winner].isCPU ? 'YOU LOSE' : 'YOU WIN';
      return `PLAYER ${this.winner + 1} WINS`;
    }
    damageFor(kind) {
      const B = this.B;
      if (kind === 'power') return B.powerThrowDamage;
      if (kind === 'stink') return B.stinkDamage;
      if (kind === 'double') return B.doubleShotDamage;
      return B.normalDamage;
    }
    specialAvailable(i, key) {
      const p = this.players[i];
      if (!p.specials[key]) return false;
      if (key === 'heal' && p.hp >= this.B.maxHP) return false;
      return true;
    }

    // ---------------------------------------------------------------- input API
    /** Press/hold began (mouse, touch or Space). */
    pressStart() {
      if (!this.canHumanAct() || this.charging) return false;
      if (this.selectedSpecial === 'heal') return this._doHeal();
      this._beginCharge();
      return true;
    }

    /** Press released: throw with the current gauge value. */
    pressEnd() {
      if (this.state === S.AIMING && this.charging && this.isHumanTurn() && !this.paused) {
        this._release();
        return true;
      }
      return false;
    }

    /** Drop an in-progress charge without throwing (e.g. window lost focus). */
    cancelCharge() {
      if (this.state === S.AIMING && this.charging && this.isHumanTurn()) {
        this.charging = false;
        this.power = 0;
        this.powerDir = 1;
        this._anim(this.current, 'idle');
        this.emit('chargeCancel', { player: this.turn });
      }
    }

    /** Select / deselect a special for this turn. Only one can be selected. */
    toggleSpecial(key) {
      if (!this.canHumanAct() || this.charging) return false;
      return this._select(key);
    }

    setPaused(p) {
      p = !!p;
      if (p === this.paused) return;
      if (p && (!this.isMatchState() || this.state === S.GAME_OVER)) return;
      if (p) this.cancelCharge();
      this.paused = p;
      this.emit(p ? 'pause' : 'resume', {});
    }

    // ---------------------------------------------------------------- update
    update(dt) {
      dt = U.clamp(dt || 0, 0, 0.1);
      if (this.paused) return;
      this.time += dt;
      this.stateTime += dt;
      for (const p of this.players) this._updateAnim(p, dt);

      const B = this.B;
      switch (this.state) {
        case S.ROUND_START:
          if (this.stateTime >= B.roundStartDuration) this._beginTurn(true);
          break;
        case S.TURN_START:
          if (this.stateTime >= B.turnBannerDuration) {
            this.setState(S.AIMING);
            this.emit('aimStart', { player: this.turn });
            if (this.current.isCPU) this._cpuBegin();
          }
          break;
        case S.AIMING:
          this._updateAiming(dt);
          break;
        case S.PROJECTILE_FLYING:
          this._updateFlight(dt);
          break;
        case S.HIT_RESOLUTION:
          if (this.stateTime >= this.resolveDuration) {
            if (this.winner !== null) this._gameOver();
            else this.setState(S.TURN_END);
          }
          break;
        case S.TURN_END: {
          const d = this.endReason === 'timeout' ? B.timeoutDelay : B.turnEndDelay;
          if (this.stateTime >= d) {
            this.turn = 1 - this.turn;
            this.turnCount++;
            this._beginTurn(false);
          }
          break;
        }
        default:
          break;
      }
    }

    _updateAiming(dt) {
      const B = this.B;
      if (this.current.isCPU) this._cpuUpdate(dt);
      if (this.state !== S.AIMING) return; // CPU may have healed

      if (this.charging) {
        let p = this.power + this.powerDir * B.powerChargeSpeed * dt;
        if (this.cpu && this.cpu.phase === 'charge' && p >= this.cpu.plan.power) {
          this.power = this.cpu.plan.power;
          this._release();
          return;
        }
        if (p >= 1) {
          if (B.powerPingPong) { p = 2 - p; this.powerDir = -1; } else p = 1;
        }
        if (p <= 0) { p = -p; this.powerDir = 1; }
        this.power = U.clamp(p, 0, 1);
      }

      this.timer -= dt;
      const sec = Math.ceil(this.timer);
      if (sec > 0 && sec <= B.timerWarningAt && sec !== this.lastTick) {
        this.lastTick = sec;
        this.emit('timerTick', { seconds: sec });
      }
      if (this.timer <= 0) {
        this.timer = 0;
        if (this.charging) this._release(); // committed to a throw: let it fly
        else this._timeout();
      }
    }

    _updateFlight(dt) {
      const B = this.B;
      for (let i = this.pendingShots.length - 1; i >= 0; i--) {
        const s = this.pendingShots[i];
        s.delay -= dt;
        if (s.delay <= 0) {
          this.pendingShots.splice(i, 1);
          if (this.winner === null) {
            this._anim(this.current, 'throw');
            this._spawn(s.kind, s.power);
          }
        }
      }

      const step = B.physicsStep;
      this.physAcc += dt;
      while (this.physAcc >= step) {
        this.physAcc -= step;
        for (const pr of this.projectiles) {
          if (!pr.alive) continue;
          Physics.integrate(pr, this.wind, step, B);
          pr.age += step;
          pr.spin += step * (pr.vx >= 0 ? 1 : -1) * (pr.kind === 'power' ? 6 : 11);
          if (++pr.steps % 4 === 0) pr.trail.push({ x: pr.x, y: pr.y });
          const outcome = Physics.collide(pr, 1 - pr.owner, B);
          if (outcome) this._resolveProjectile(pr, outcome);
        }
      }
      this.projectiles = this.projectiles.filter((p) => p.alive);
      if (this.projectiles.length === 0 && this.pendingShots.length === 0) this._finishFlight();
    }

    // ---------------------------------------------------------------- turn flow
    _beginTurn(first) {
      if (!first) {
        const prev = this.wind;
        this.wind = Physics.generateWind(prev, this.rng, this.B);
        this.emit('windChange', { wind: this.wind, prev });
      }
      this.selectedSpecial = null;
      this.charging = false;
      this.power = 0;
      this.powerDir = 1;
      this.timer = this.B.turnDuration;
      this.lastTick = null;
      this.endReason = null;
      this.cpu = null;
      this.turnResult = null;
      this.setState(S.TURN_START);
      this.emit('turnStart', { player: this.turn, wind: this.wind });
    }

    _beginCharge() {
      this.charging = true;
      this.power = 0;
      this.powerDir = 1;
      this._anim(this.current, 'windup');
      this.emit('chargeStart', { player: this.turn });
    }

    _select(key) {
      const pl = this.current;
      if (SPECIALS.indexOf(key) < 0) return false;
      if (this.selectedSpecial === key) {
        this.selectedSpecial = null;
        this.emit('select', { player: this.turn, special: null });
        return true;
      }
      if (!pl.specials[key]) { this.emit('denied', { player: this.turn, special: key, reason: 'used' }); return false; }
      if (key === 'heal' && pl.hp >= this.B.maxHP) { this.emit('denied', { player: this.turn, special: key, reason: 'fullhp' }); return false; }
      this.selectedSpecial = key;
      this.emit('select', { player: this.turn, special: key });
      return true;
    }

    _release() {
      const B = this.B;
      const pl = this.current;
      const special = this.selectedSpecial && this.selectedSpecial !== 'heal' ? this.selectedSpecial : null;
      const kind = special || 'normal';
      const power = U.clamp(this.power, 0, 1);
      this.charging = false;
      if (special) pl.specials[special] = false;
      this.selectedSpecial = null;
      pl.lastPower = power;
      this.turnResult = { kind, power, wind: this.wind, hits: 0, shots: 0, damage: 0 };
      this.physAcc = 0;
      this._anim(pl, 'throw');
      this.setState(S.PROJECTILE_FLYING);
      this.emit('throw', { player: this.turn, kind, power });
      this._spawn(kind, power);
      if (kind === 'double') {
        const d = B.projectiles.double;
        for (let i = 1; i < d.count; i++) {
          const jitter = (this.rng() * 2 - 1) * d.powerJitter;
          this.pendingShots.push({ delay: d.delay * i, kind, power: U.clamp(power + jitter, 0, 1) });
        }
      }
    }

    _spawn(kind, power) {
      const l = Physics.launch(this.turn, power, kind, this.B);
      const pr = {
        id: ++this._pid, owner: this.turn, kind, power,
        x: l.x, y: l.y, vx: l.vx, vy: l.vy, r: l.r,
        age: 0, spin: 0, steps: 0, alive: true,
        trail: [{ x: l.x, y: l.y }],
      };
      this.projectiles.push(pr);
      this.turnResult.shots++;
      this.current.stats.throws++;
      this.emit('spawn', { proj: pr });
      return pr;
    }

    _resolveProjectile(pr, outcome) {
      pr.alive = false;
      pr.trail.push({ x: pr.x, y: pr.y });
      const target = this.players[1 - pr.owner];
      const thrower = this.players[pr.owner];
      this.lastImpact = { x: pr.x, y: pr.y, surface: outcome, owner: pr.owner, time: this.time };
      if (outcome === 'target' && this.winner === null) {
        const dmg = this.damageFor(pr.kind);
        target.hp = Math.max(0, target.hp - dmg);
        thrower.stats.hits++;
        thrower.stats.damage += dmg;
        this.turnResult.hits++;
        this.turnResult.damage += dmg;
        this._anim(target, pr.kind === 'stink' ? 'stinkHit' : 'hit');
        const lethal = target.hp <= 0;
        this.emit('hit', { proj: pr, target: target.index, damage: dmg, hp: target.hp, x: pr.x, y: pr.y, kind: pr.kind, lethal });
        if (lethal) {
          this.winner = pr.owner;
          this.pendingShots = [];
          this.emit('ko', { winner: this.winner, loser: target.index });
        }
      } else {
        this.emit('impact', { proj: pr, surface: outcome, x: pr.x, y: pr.y, kind: pr.kind });
      }
    }

    _finishFlight() {
      const B = this.B;
      const tr = this.turnResult;
      const thrower = this.current;
      const opp = this.opponent;
      if (thrower.ai) thrower.ai.observe({ power: tr.power, wind: tr.wind, kind: tr.kind, hit: tr.hits > 0 });
      if (this.winner !== null) {
        this.resolveDuration = B.finalBlowDuration;
      } else if (tr.hits > 0) {
        this.resolveDuration = B.hitResolveDuration;
      } else {
        this._anim(opp, 'taunt');
        this.emit('taunt', { player: opp.index });
        this.resolveDuration = B.tauntDuration;
      }
      this.emit('flightEnd', { player: this.turn, hits: tr.hits, shots: tr.shots });
      this.setState(S.HIT_RESOLUTION);
    }

    _doHeal() {
      const B = this.B;
      const pl = this.current;
      if (!pl.specials.heal || pl.hp >= B.maxHP) return false;
      pl.specials.heal = false;
      this.selectedSpecial = null;
      this.charging = false;
      const before = pl.hp;
      pl.hp = Math.min(B.maxHP, pl.hp + B.healAmount);
      this.turnResult = { kind: 'heal', hits: 0, shots: 0, damage: 0 };
      this._anim(pl, 'heal');
      this.resolveDuration = B.healDuration;
      this.setState(S.HIT_RESOLUTION);
      this.emit('heal', { player: this.turn, amount: pl.hp - before, hp: pl.hp });
      return true;
    }

    _timeout() {
      this.charging = false;
      this.selectedSpecial = null;
      this.endReason = 'timeout';
      this._anim(this.current, 'confused');
      this._anim(this.opponent, 'taunt');
      this.emit('timeout', { player: this.turn });
      this.emit('taunt', { player: this.opponent.index });
      this.setState(S.TURN_END);
    }

    _gameOver() {
      const w = this.players[this.winner];
      const l = this.players[1 - this.winner];
      this._anim(w, 'win');
      this._anim(l, 'lose');
      this.projectiles = [];
      this.pendingShots = [];
      this.charging = false;
      this.setState(S.GAME_OVER);
      this.emit('gameOver', { winner: this.winner, text: this.resultText() });
    }

    // ---------------------------------------------------------------- CPU driver
    _cpuBegin() {
      const me = this.current;
      const plan = me.ai.plan({ wind: this.wind, me, opp: this.opponent, turnCount: this.turnCount });
      // Never pick something that isn't allowed (defensive; AI already checks).
      if (plan.special && !this.specialAvailable(this.turn, plan.special)) {
        plan.special = null;
        plan.kind = 'normal';
      }
      this.cpu = { phase: 'think', t: 0, plan };
      this.emit('cpuThink', { player: this.turn });
    }

    _cpuUpdate(dt) {
      const c = this.cpu;
      if (!c) return;
      c.t += dt;
      if (c.phase === 'think' && c.t >= c.plan.thinkTime) {
        if (c.plan.special) {
          this._select(c.plan.special);
          c.phase = 'select';
          c.t = 0;
        } else {
          c.phase = 'charge';
          this._beginCharge();
        }
      } else if (c.phase === 'select' && c.t >= 0.55) {
        if (c.plan.special === 'heal') {
          c.phase = 'done';
          this._doHeal();
        } else {
          c.phase = 'charge';
          this._beginCharge();
        }
      }
    }

    // ---------------------------------------------------------------- anim
    _anim(p, name) {
      p.anim = { name, t: 0, dur: ANIM_DUR[name] !== undefined ? ANIM_DUR[name] : 0 };
      if (name === 'taunt') p.anim.dur = this.B.tauntDuration;
      if (name === 'heal') p.anim.dur = this.B.healDuration;
    }

    _updateAnim(p, dt) {
      p.anim.t += dt;
      if (p.anim.dur > 0 && p.anim.t >= p.anim.dur) {
        const keepWindup = this.state === S.AIMING && this.charging && p.index === this.turn;
        p.anim = { name: keepWindup ? 'windup' : 'idle', t: 0, dur: 0 };
      }
    }
  }

  Game.States = S;
  Game.SPECIALS = SPECIALS;
  OTW.Game = Game;
  if (typeof module !== 'undefined' && module.exports) module.exports = Game;
})(typeof window !== 'undefined' ? window : globalThis);
