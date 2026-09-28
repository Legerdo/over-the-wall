/*
 * Browser bootstrap: canvas sizing, input (mouse / touch / keyboard), audio wiring,
 * screen-reader announcements and the main loop.
 */
(function () {
  'use strict';
  const OTW = window.OTW;
  const S = OTW.Game.States;
  const W = 1280;
  const H = 720;

  const canvas = document.getElementById('game');
  const live = document.getElementById('live');
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const game = new OTW.Game();
  const fx = new OTW.FX(game, { reducedMotion });
  const audio = new OTW.AudioEngine();
  const app = {
    game, fx, audio,
    ui: { hover: null, focusId: null },
    toggleMute() {
      audio.unlock();
      audio.setMuted(!audio.muted);
      announce(audio.muted ? 'Sound off' : 'Sound on');
    },
  };
  const renderer = new OTW.Renderer(canvas, game, fx, app);
  app.renderer = renderer;
  OTW.app = app; // handy for debugging / automated play tests

  // ------------------------------------------------------------------ sizing
  function resize() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const s = Math.min(vw / W, vh / H);
    const cssW = Math.max(1, Math.floor(W * s));
    const cssH = Math.max(1, Math.floor(H * s));
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    renderer.resize(cssW, cssH, Math.min(window.devicePixelRatio || 1, 2));
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  resize();

  // ------------------------------------------------------------------ a11y
  let lastAnnounce = '';
  function announce(msg) {
    if (!live || !msg) return;
    // re-set to force repeated identical messages to be read
    live.textContent = msg === lastAnnounce ? msg + ' ' : msg;
    lastAnnounce = live.textContent;
  }
  const windWords = (w) => (w === 0 ? 'calm' : `${w < 0 ? 'left' : 'right'} ${Math.abs(w)}`);

  // ------------------------------------------------------------------ audio + announcements
  game.on('state', (e) => {
    app.ui.focusId = null;
    if (e.state === S.MODE_SELECT) { renderer.resetHp(); announce('Main menu: 1 Player, 2 Players, How to play.'); }
    if (e.state === S.DIFFICULTY_SELECT) announce('Choose CPU level: Beginner, Average, Hard.');
    if (e.state === S.HOW_TO_PLAY) announce('How to play. Read the wind, hold to charge, release to throw over the wall. Each special once per match. Bring the opponent to 0 HP.');
  });
  game.on('roundStart', () => { renderer.resetHp(); audio.play('select'); });
  game.on('turnStart', (e) => { audio.play('turn'); announce(`${game.turnLabel(e.player)}. Wind ${windWords(e.wind)}.`); });
  game.on('chargeStart', () => audio.startCharge());
  game.on('chargeCancel', () => audio.stopCharge());
  game.on('throw', () => audio.stopCharge());
  game.on('spawn', (e) => audio.play(e.proj.kind === 'power' ? 'throwPower' : 'throw'));
  game.on('impact', (e) => {
    if (e.surface === 'wall') audio.play('wall');
    else if (e.surface === 'ground') audio.play('ground');
    if (e.kind === 'stink' && e.surface !== 'out') audio.play('hitStink');
  });
  game.on('hit', (e) => {
    audio.play(e.kind === 'power' ? 'hitPower' : e.kind === 'stink' ? 'hitStink' : 'hit');
    announce(`Hit! ${game.charName(e.target)} takes ${e.damage}. HP ${e.hp}.`);
  });
  game.on('ko', () => audio.play('ko'));
  game.on('taunt', (e) => {
    audio.play(game.players[e.player].charId === 'rocco' ? 'tauntRocco' : 'tauntHazel');
    announce('Missed.');
  });
  game.on('heal', (e) => { audio.play('heal'); announce(`${game.charName(e.player)} heals ${e.amount}. HP ${e.hp}.`); });
  game.on('timerTick', (e) => audio.play('tick', e.seconds));
  game.on('timeout', () => { audio.stopCharge(); audio.play('timeout'); announce('Time up.'); });
  game.on('select', (e) => {
    audio.play(e.special ? 'select' : 'deselect');
    announce(e.special ? `${OTW.UI.SPECIAL_INFO[e.special].name} selected.` : 'Normal throw.');
  });
  game.on('denied', (e) => { audio.play('denied'); announce(e.reason === 'used' ? 'Already used.' : 'HP is already full.'); });
  game.on('pause', () => { audio.stopCharge(); announce('Paused.'); });
  game.on('resume', () => announce('Resumed.'));
  game.on('gameOver', (e) => {
    const lost = game.mode === '1P' && game.players[e.winner].isCPU;
    audio.play(lost ? 'lose' : 'win');
    announce(`${e.text}. Rematch or main menu.`);
  });

  // ------------------------------------------------------------------ input helpers
  function toLogical(e) {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * W) / r.width, y: ((e.clientY - r.top) * H) / r.height };
  }

  let chargeSource = null; // 'key' or a pointerId

  function activate(b) {
    if (!b) return false;
    if (b.kind === 'special') {
      // only the acting human's own buttons respond; used ones give a "denied" cue
      if (b.player !== game.turn || !game.canHumanAct() || game.charging) return true;
      b.action();
      return true;
    }
    audio.play('ui');
    b.action();
    return true;
  }

  function menuButtons() {
    return OTW.UI.buttons(game, app).filter((b) => b.kind === 'menu');
  }

  function moveFocus(delta) {
    const list = menuButtons();
    if (!list.length) return;
    // no focus yet = the first button is shown as focused (see ensureFocus)
    let i = Math.max(0, list.findIndex((b) => b.id === app.ui.focusId));
    i = (i + delta + list.length) % list.length;
    app.ui.focusId = list[i].id;
    audio.play('ui');
  }

  function activateFocused() {
    const list = menuButtons();
    const b = list.find((x) => x.id === app.ui.focusId) || list[0];
    if (b) activate(b);
  }

  function hasMenu() { return menuButtons().length > 0; }

  // ------------------------------------------------------------------ pointer
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    canvas.focus({ preventScroll: true });
    audio.unlock();
    if (game.state === S.MENU) { audio.play('ui'); game.openModeSelect(); return; }
    const p = toLogical(e);
    const b = OTW.UI.hitTest(OTW.UI.buttons(game, app), p.x, p.y);
    if (b) { activate(b); return; }
    if (game.paused) return;
    // Anywhere else on the field starts charging (if it's a human's turn to aim).
    if (!game.charging && game.pressStart() && game.charging) {
      chargeSource = e.pointerId;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    }
  });

  function pointerRelease(e, cancel) {
    if (chargeSource !== e.pointerId) return;
    chargeSource = null;
    if (cancel) game.cancelCharge(); else game.pressEnd();
  }
  canvas.addEventListener('pointerup', (e) => pointerRelease(e, false));
  canvas.addEventListener('pointercancel', (e) => pointerRelease(e, true));

  canvas.addEventListener('pointermove', (e) => {
    const p = toLogical(e);
    const b = OTW.UI.hitTest(OTW.UI.buttons(game, app), p.x, p.y);
    app.ui.hover = b ? b.id : null;
    if (b && b.kind === 'menu') app.ui.focusId = b.id;
    const clickable = b && (b.kind !== 'special' || b.enabled);
    canvas.style.cursor = clickable || game.state === S.MENU ? 'pointer' : 'default';
  });
  canvas.addEventListener('pointerleave', () => { app.ui.hover = null; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // ------------------------------------------------------------------ keyboard
  const isSpace = (e) => e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar';

  window.addEventListener('keydown', (e) => {
    audio.unlock();
    const key = e.key;
    if (isSpace(e) || key.startsWith('Arrow')) e.preventDefault();
    if (e.repeat) return;

    if (game.state === S.MENU) { audio.play('ui'); game.openModeSelect(); return; }

    if (key === 'm' || key === 'M') { app.toggleMute(); return; }

    if (key === 'Escape' || key === 'p' || key === 'P') {
      if (game.paused) { game.setPaused(false); return; }
      if (game.state === S.DIFFICULTY_SELECT || game.state === S.HOW_TO_PLAY) { audio.play('ui'); game.backToModes(); return; }
      if (game.isMatchState() && game.state !== S.GAME_OVER) { game.setPaused(true); return; }
      return;
    }

    if (game.paused || !game.isMatchState() || game.state === S.GAME_OVER) {
      if (key === 'ArrowDown' || key === 'ArrowRight' || key === 'Tab') { if (key === 'Tab') e.preventDefault(); moveFocus(1); return; }
      if (key === 'ArrowUp' || key === 'ArrowLeft') { moveFocus(-1); return; }
      if ((key === 'Enter' || isSpace(e)) && hasMenu()) { activateFocused(); return; }
      return;
    }

    // in-match controls
    if (isSpace(e)) {
      if (!game.charging && game.pressStart() && game.charging) chargeSource = 'key';
      return;
    }
    const idx = ['1', '2', '3', '4'].indexOf(key);
    if (idx >= 0) game.toggleSpecial(OTW.UI.SPECIAL_ORDER[idx]);
  });

  window.addEventListener('keyup', (e) => {
    if (isSpace(e) && chargeSource === 'key') {
      e.preventDefault();
      chargeSource = null;
      game.pressEnd();
    }
  });

  // Losing focus mid-charge would leave the button "stuck": cancel and pause instead.
  function suspend() {
    if (chargeSource !== null) { chargeSource = null; game.cancelCharge(); }
    if (game.isMatchState() && game.state !== S.GAME_OVER) game.setPaused(true);
  }
  window.addEventListener('blur', suspend);
  document.addEventListener('visibilitychange', () => { if (document.hidden) suspend(); });

  // ------------------------------------------------------------------ loop
  function ensureFocus() {
    const list = menuButtons();
    if (list.length && !list.some((b) => b.id === app.ui.focusId)) app.ui.focusId = list[0].id;
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    game.update(dt);
    if (!game.paused) fx.update(dt);
    if (game.charging) audio.setChargePower(game.power);
    else if (audio.charge) audio.stopCharge();
    if (chargeSource !== null && !game.charging) chargeSource = null; // CPU/timeout released it
    ensureFocus();
    renderer.draw(game.paused ? 0 : dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  canvas.focus({ preventScroll: true });
})();
