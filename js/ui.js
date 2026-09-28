/*
 * UI layout + clickable buttons for each state. Shared by the renderer (drawing)
 * and main.js (pointer hit-testing and keyboard focus). Logical 1280x720 space.
 */
(function (root) {
  'use strict';
  const OTW = root.OTW || (root.OTW = {});
  const W = 1280;

  const L = {
    special: { size: 72, gap: 10, y: 630, left: 20, right: W - 20 - (4 * 72 + 3 * 10) },
    gauge: { x: 390, y: 668, w: 500, h: 26 },
    pause: { x: 493, y: 40, r: 19 },
    mute: { x: 787, y: 40, r: 19 },
    menuBtn: { w: 380, h: 60 },
  };

  const SPECIAL_ORDER = ['double', 'power', 'stink', 'heal'];
  const SPECIAL_INFO = {
    double: { label: 'DOUBLE', name: 'DOUBLE ATTACK', key: '1', color: '#4fa3ff' },
    power: { label: 'POWER', name: 'POWER THROW', key: '2', color: '#ff7a3d' },
    stink: { label: 'STINK', name: 'STINK THROW', key: '3', color: '#8bc34a' },
    heal: { label: 'HEAL', name: 'HEAL', key: '4', color: '#ff5c8a' },
  };

  function specialRect(playerIndex, idx) {
    const s = L.special;
    const x0 = playerIndex === 0 ? s.left : s.right;
    return { x: x0 + idx * (s.size + s.gap), y: s.y, w: s.size, h: s.size };
  }

  function menuButton(id, label, cx, y, action, extra) {
    return Object.assign({ id, kind: 'menu', label, x: cx - L.menuBtn.w / 2, y, w: L.menuBtn.w, h: L.menuBtn.h, enabled: true, action }, extra || {});
  }

  /**
   * All interactive elements for the current frame, top-most first.
   * Each: { id, kind: 'menu'|'special'|'icon', x, y, w, h, label, enabled, action() }
   */
  function buttons(game, app) {
    const S = OTW.Game.States;
    const list = [];
    const st = game.state;
    const cx = W / 2;

    const icons = () => {
      list.push({ id: 'mute', kind: 'icon', icon: app.audio && app.audio.muted ? 'muted' : 'sound', x: L.mute.x - L.mute.r, y: L.mute.y - L.mute.r, w: L.mute.r * 2, h: L.mute.r * 2, enabled: true, label: 'Sound', action: () => app.toggleMute() });
    };

    if (game.paused) {
      list.push(menuButton('resume', 'RESUME', cx, 330, () => game.setPaused(false)));
      list.push(menuButton('menu', 'MAIN MENU', cx, 405, () => game.toMainMenu()));
      icons();
      return list;
    }

    switch (st) {
      case S.MODE_SELECT:
        list.push(menuButton('1p', '1 PLAYER', cx, 318, () => game.openDifficulty(), { sub: 'vs CPU' }));
        list.push(menuButton('2p', '2 PLAYERS', cx, 392, () => game.startMatch('2P'), { sub: 'same device' }));
        list.push(menuButton('howto', 'HOW TO PLAY', cx, 466, () => game.openHowTo()));
        icons();
        break;
      case S.DIFFICULTY_SELECT:
        list.push(menuButton('beginner', 'BEGINNER', cx, 262, () => game.startMatch('1P', 'beginner'), { sub: 'Misjudges the wind often' }));
        list.push(menuButton('average', 'AVERAGE', cx, 336, () => game.startMatch('1P', 'average'), { sub: 'Reads the wind fairly well' }));
        list.push(menuButton('hard', 'HARD', cx, 410, () => game.startMatch('1P', 'hard'), { sub: 'Sharp, but still misses' }));
        list.push(menuButton('back', 'BACK', cx, 500, () => game.backToModes(), { small: true }));
        icons();
        break;
      case S.HOW_TO_PLAY:
        list.push(menuButton('back', 'BACK', cx, 614, () => game.backToModes(), { small: true }));
        icons();
        break;
      case S.GAME_OVER:
        if (game.stateTime >= game.B.gameOverInputDelay) {
          list.push(menuButton('rematch', 'REMATCH', cx - 145, 424, () => game.rematch(), { w: 270, x: cx - 145 - 135 }));
          list.push(menuButton('menu', 'MAIN MENU', cx + 145, 424, () => game.toMainMenu(), { w: 270, x: cx + 145 - 135 }));
        }
        icons();
        break;
      default:
        if (game.isMatchState()) {
          for (const b of specialButtons(game)) list.push(b);
          list.push({ id: 'pause', kind: 'icon', icon: 'pause', x: L.pause.x - L.pause.r, y: L.pause.y - L.pause.r, w: L.pause.r * 2, h: L.pause.r * 2, enabled: true, label: 'Pause', action: () => game.setPaused(true) });
          icons();
        }
        break;
    }
    return list;
  }

  /** The 8 special buttons (both players). Only the acting human's are enabled. */
  function specialButtons(game) {
    const list = [];
    const canAct = game.canHumanAct() && !game.charging;
    for (let pi = 0; pi < 2; pi++) {
      SPECIAL_ORDER.forEach((key, idx) => {
        const r = specialRect(pi, idx);
        const mine = canAct && game.turn === pi;
        list.push({
          id: `sp-${pi}-${key}`, kind: 'special', player: pi, key, x: r.x, y: r.y, w: r.w, h: r.h,
          label: SPECIAL_INFO[key].label, enabled: mine && game.specialAvailable(pi, key),
          action: () => game.toggleSpecial(key),
        });
      });
    }
    return list;
  }

  function hitTest(list, x, y) {
    for (const b of list) {
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
    }
    return null;
  }

  OTW.UI = { L, SPECIAL_ORDER, SPECIAL_INFO, specialRect, buttons, specialButtons, hitTest };
})(typeof window !== 'undefined' ? window : globalThis);
