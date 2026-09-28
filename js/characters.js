/*
 * Original characters, drawn procedurally with Canvas 2D (no image assets).
 *   ROCCO - alley raccoon, throws tin cans / a trash bag / an old fish.
 *   HAZEL - park squirrel, throws acorns / a giant pinecone / a rotten egg.
 * Both have identical gameplay; personality comes from art, poses and reactions.
 * Local drawing space: origin at the feet, facing right (+x), y up is negative.
 */
(function (root) {
  'use strict';
  const OTW = root.OTW || (root.OTW = {});
  const U = OTW.Util;
  const OUT = '#2a1d17';
  const TAU = Math.PI * 2;
  const REST = 1.25;   // throwing-arm rest angle (radians, 0 = forward, + = down)
  const REST2 = 1.6;   // far arm rest angle

  const PALETTE = {
    rocco: { fur: '#8d91a0', dark: '#4b4e5b', light: '#e4dfd4', mask: '#2a2b33', nose: '#1b1b20', inner: '#d9a7a2', accent: '#ffd23f' },
    hazel: { fur: '#d9822b', dark: '#9a5418', light: '#f8e3bf', mask: '#9a5418', nose: '#4d260f', inner: '#f0b48a', accent: '#ff9f43' },
  };

  const LINES = {
    rocco: { taunt: ['HA HA!', 'MISSED!', 'HEH HEH', 'NOPE!'], hit: ['OOF!', 'ACK!', 'OUCH!'], stink: ['EWW!', 'BLEH!'], heal: ['AHH~', 'SNACK!'], win: 'TRASH KING!', timeout: '...?' },
    hazel: { taunt: ['NYAH~', 'TOO SLOW!', 'HEE HEE', 'MISS!'], hit: ['EEK!', 'OW!', 'YIPE!'], stink: ['GROSS!', 'PEE-YOO!'], heal: ['YUM~', 'NUTS!'], win: 'NUTTY WIN!', timeout: '...?' },
  };

  // ------------------------------------------------------------------ helpers
  function ellipse(ctx, x, y, rx, ry, fill, lw) {
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, TAU);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (lw !== 0) { ctx.lineWidth = lw || 3; ctx.strokeStyle = OUT; ctx.stroke(); }
  }

  function circle(ctx, x, y, r, fill, lw) { ellipse(ctx, x, y, r, r, fill, lw); }

  /** Draws an outlined limb; returns the hand position. Hand drawn separately. */
  function limb(ctx, x, y, angle, len, width, color) {
    const ex = x + Math.cos(angle) * len;
    const ey = y + Math.sin(angle) * len;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey);
    ctx.strokeStyle = OUT; ctx.lineWidth = width + 6; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey);
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
    return { x: ex, y: ey };
  }

  function drawEye(ctx, x, y, r, type, look) {
    ctx.lineCap = 'round';
    switch (type) {
      case 'closed':
        ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y);
        ctx.strokeStyle = OUT; ctx.lineWidth = 2.5; ctx.stroke();
        break;
      case 'happy':
        ctx.beginPath(); ctx.arc(x, y + r * 0.45, r * 0.85, Math.PI * 1.15, Math.PI * 1.85);
        ctx.strokeStyle = OUT; ctx.lineWidth = 2.8; ctx.stroke();
        break;
      case 'x':
        ctx.beginPath();
        ctx.moveTo(x - r * 0.8, y - r * 0.8); ctx.lineTo(x + r * 0.8, y + r * 0.8);
        ctx.moveTo(x + r * 0.8, y - r * 0.8); ctx.lineTo(x - r * 0.8, y + r * 0.8);
        ctx.strokeStyle = OUT; ctx.lineWidth = 2.6; ctx.stroke();
        break;
      case 'swirl': {
        circle(ctx, x, y, r, '#fffdf5', 2);
        ctx.beginPath();
        for (let i = 0; i <= 20; i++) {
          const a = i * 0.7;
          const rr = (i / 20) * r * 0.85;
          const px = x + Math.cos(a) * rr;
          const py = y + Math.sin(a) * rr;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.strokeStyle = '#5a8f2a'; ctx.lineWidth = 1.6; ctx.stroke();
        break;
      }
      default: { // open
        circle(ctx, x, y, r, '#fffdf5', 2);
        const lx = look ? look.x : 0;
        const ly = look ? look.y : 0;
        circle(ctx, x + lx * r * 0.42, y + ly * r * 0.42, r * 0.52, OUT, 0);
        circle(ctx, x + lx * r * 0.42 + r * 0.18, y + ly * r * 0.42 - r * 0.2, r * 0.16, '#ffffff', 0);
      }
    }
  }

  function drawMouth(ctx, x, y, type, s) {
    s = s || 1;
    ctx.lineCap = 'round';
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 2.4;
    switch (type) {
      case 'laugh':
        ctx.beginPath(); ctx.arc(x, y - 1, 6.5 * s, 0.05 * Math.PI, 0.95 * Math.PI); ctx.closePath();
        ctx.fillStyle = '#6b1f1f'; ctx.fill(); ctx.stroke();
        ellipse(ctx, x, y + 3.5 * s, 3.4 * s, 1.8 * s, '#ff7b8a', 0);
        break;
      case 'tongue':
        ctx.beginPath(); ctx.arc(x, y - 2, 5 * s, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
        ellipse(ctx, x + 1, y + 4 * s, 3.6 * s, 5 * s, '#ff6f87', 2);
        break;
      case 'ouch':
      case 'o':
        ellipse(ctx, x, y + 1, (type === 'ouch' ? 4.2 : 3) * s, (type === 'ouch' ? 5.4 : 3.4) * s, '#6b1f1f', 2.2);
        break;
      case 'gag':
        ctx.beginPath();
        ctx.moveTo(x - 6, y);
        for (let i = 1; i <= 4; i++) ctx.lineTo(x - 6 + i * 3, y + (i % 2 ? -2.5 : 2));
        ctx.strokeStyle = '#3f6b1d'; ctx.stroke();
        break;
      case 'frown':
        ctx.beginPath(); ctx.arc(x, y + 5, 5 * s, 1.2 * Math.PI, 1.8 * Math.PI); ctx.stroke();
        break;
      default: // smile
        ctx.beginPath(); ctx.arc(x, y - 3, 5 * s, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();
    }
  }

  function quadPoint(p0, p1, p2, t) {
    const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
    return { x: a * p0.x + b * p1.x + c * p2.x, y: a * p0.y + b * p1.y + c * p2.y };
  }

  function cubicPoint(p0, p1, p2, p3, t) {
    const mt = 1 - t;
    const a = mt * mt * mt, b = 3 * mt * mt * t, c = 3 * mt * t * t, d = t * t * t;
    return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y };
  }

  // ------------------------------------------------------------------ projectiles
  function drawProjectile(ctx, charId, kind, x, y, spin, scale) {
    scale = scale || 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(spin || 0);
    ctx.scale(scale, scale);
    if (charId === 'rocco') {
      if (kind === 'power') {
        // stuffed trash bag
        ctx.beginPath();
        ctx.moveTo(0, -17);
        ctx.bezierCurveTo(14, -16, 19, -2, 16, 9);
        ctx.bezierCurveTo(12, 18, -12, 18, -16, 9);
        ctx.bezierCurveTo(-19, -2, -14, -16, 0, -17);
        ctx.fillStyle = '#2f3a33'; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-6, -4); ctx.quadraticCurveTo(-2, 4, -8, 10);
        ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2.5; ctx.stroke();
        ellipse(ctx, 0, -18, 5, 3.5, '#ffd23f', 2);
      } else if (kind === 'stink') {
        // old fish
        ctx.beginPath();
        ctx.moveTo(13, 0);
        ctx.quadraticCurveTo(4, -9, -8, -2);
        ctx.lineTo(-15, -8); ctx.lineTo(-13, 0); ctx.lineTo(-15, 8); ctx.lineTo(-8, 2);
        ctx.quadraticCurveTo(4, 9, 13, 0);
        ctx.fillStyle = '#9fb58a'; ctx.fill();
        ctx.lineWidth = 2.5; ctx.strokeStyle = OUT; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(5, -3.5); ctx.lineTo(8, -0.5); ctx.moveTo(8, -3.5); ctx.lineTo(5, -0.5);
        ctx.lineWidth = 1.6; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-2, -4); ctx.lineTo(-2, 4); ctx.moveTo(1.5, -5); ctx.lineTo(1.5, 5);
        ctx.strokeStyle = 'rgba(42,29,23,0.5)'; ctx.stroke();
      } else {
        // tin can
        ctx.beginPath(); ctx.rect(-7, -9, 14, 18);
        ctx.fillStyle = '#b9c0c8'; ctx.fill();
        ctx.fillStyle = '#e0453a'; ctx.fillRect(-7, -3.5, 14, 7);
        ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(-4.5, -9, 2.5, 18);
        ctx.lineWidth = 2.5; ctx.strokeStyle = OUT; ctx.strokeRect(-7, -9, 14, 18);
        ellipse(ctx, 0, -9, 7, 2.2, '#d7dce1', 2);
      }
    } else {
      if (kind === 'power') {
        // giant pinecone
        ellipse(ctx, 0, 0, 13, 17, '#8a5a2b', 3);
        ctx.fillStyle = '#b07a3c';
        ctx.strokeStyle = OUT; ctx.lineWidth = 1.8;
        for (let row = -2; row <= 2; row++) {
          for (let col = -1; col <= 1; col++) {
            const sx = col * 7 + (row % 2 ? 3.5 : 0);
            const sy = row * 6;
            if (Math.abs(sx) > 10 - Math.abs(row) * 1.5) continue;
            ctx.beginPath();
            ctx.moveTo(sx - 3.5, sy - 2);
            ctx.quadraticCurveTo(sx, sy + 5, sx + 3.5, sy - 2);
            ctx.fill(); ctx.stroke();
          }
        }
        ellipse(ctx, 0, -17, 3, 2, '#5a3a1a', 1.5);
      } else if (kind === 'stink') {
        // rotten egg
        ellipse(ctx, 0, 1, 8.5, 10.5, '#e8ecc4', 2.5);
        ctx.beginPath(); ctx.moveTo(-7, -1); ctx.lineTo(-3, 2); ctx.lineTo(0, -2); ctx.lineTo(3, 2); ctx.lineTo(7, -1);
        ctx.strokeStyle = OUT; ctx.lineWidth = 1.8; ctx.stroke();
        ellipse(ctx, -3, 6, 2.2, 1.6, '#9bbf4a', 0);
        ellipse(ctx, 3.5, -5, 1.8, 1.4, '#9bbf4a', 0);
      } else {
        // acorn
        ellipse(ctx, 0, 2.5, 7, 8, '#d0913f', 2.5);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.beginPath(); ctx.ellipse(-2.5, 3, 1.8, 3.5, 0, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.ellipse(0, -3.5, 8.5, 4.5, 0, Math.PI, TAU); ctx.closePath();
        ctx.fillStyle = '#6b4423'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = OUT; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, -7.5); ctx.lineTo(1.5, -11);
        ctx.lineWidth = 2.5; ctx.stroke();
      }
    }
    ctx.restore();
  }

  // ------------------------------------------------------------------ poses
  /**
   * Builds a pose from the player's animation state.
   * look: {x,y} unit-ish vector for the pupils, in local (facing-right) space.
   */
  function computePose(player, game, time, look) {
    const a = player.anim;
    const t = a.t;
    const cid = player.charId;
    const phase = player.index * 1.7;
    const pose = {
      bob: Math.sin(time * (cid === 'rocco' ? 2.2 : 3.1) + phase) * 1.6,
      lean: 0, squash: 1, offX: 0, jump: 0, rot: 0, headTilt: 0,
      arm: REST + Math.sin(time * 2 + phase) * 0.05,
      arm2: REST2 + Math.sin(time * 2 + phase + 1) * 0.05,
      eyes: 'open', eyes2: null, mouth: 'smile',
      look: look || { x: 1, y: 0 },
      holding: null, tint: null, tailPuff: 1, tailWag: Math.sin(time * (cid === 'rocco' ? 1.8 : 3.4) + phase),
      stars: false,
    };
    // blink
    if (((time + phase) % 3.7) < 0.12) pose.eyes = 'closed';
    // squirrel tail flick every ~2.6s
    if (cid === 'hazel' && ((time + phase) % 2.6) < 0.25) pose.tailWag += Math.sin(((time + phase) % 2.6) * 25) * 1.5;

    const isTurn = game.isMatchState() && game.turn === player.index;
    const holdingState = isTurn && (game.state === 'TURN_START' || game.state === 'AIMING');
    if (holdingState && game.selectedSpecial !== 'heal') pose.holding = game.selectedSpecial || 'normal';

    switch (a.name) {
      case 'windup': {
        const base = U.easeOutCubic(Math.min(1, t * 6));
        const target = 3.3 + game.power * 0.75;
        pose.arm = U.lerp(REST, target, base) + Math.sin(time * 40) * 0.03 * game.power;
        pose.arm2 = U.lerp(REST2, -0.35, base);
        pose.lean = -0.08 * base - game.power * 0.05;
        pose.squash = 1 - game.power * 0.05;
        pose.mouth = game.power > 0.7 ? 'o' : 'smile';
        if (pose.eyes === 'closed') pose.eyes = 'open';
        break;
      }
      case 'throw': {
        const u = t / 0.35;
        if (u < 0.3) pose.arm = U.lerp(4.0, 6.1, u / 0.3);
        else pose.arm = U.lerp(6.1, REST + TAU, U.easeOutCubic((u - 0.3) / 0.7));
        pose.arm2 = U.lerp(-0.35, REST2, Math.min(1, u * 1.5));
        pose.lean = Math.sin(Math.min(1, u * 1.6) * Math.PI) * 0.16;
        pose.mouth = 'o';
        pose.holding = null;
        break;
      }
      case 'hit': {
        const u = Math.min(1, t / 0.8);
        const k = (1 - u) * (1 - u);
        pose.lean = -0.38 * k;
        pose.offX = -12 * k;
        pose.squash = 1 - 0.14 * Math.sin(u * Math.PI);
        pose.eyes = u < 0.65 ? 'x' : 'open';
        pose.mouth = 'ouch';
        pose.arm = 4.3 + Math.sin(t * 32) * 0.35 * k;
        pose.arm2 = -1.0 + Math.sin(t * 29 + 1) * 0.35 * k;
        pose.tailPuff = 1 + 0.35 * k;
        pose.headTilt = -0.2 * k;
        break;
      }
      case 'stinkHit': {
        const u = Math.min(1, t / 1.1);
        const k = 1 - u;
        pose.lean = -0.25 * k * k + Math.sin(t * 8) * 0.07 * k;
        pose.offX = -8 * k * k;
        pose.eyes = 'swirl';
        pose.mouth = 'gag';
        pose.tint = 'rgba(120, 190, 50, ' + (0.45 * k + 0.1).toFixed(3) + ')';
        pose.arm = 4.0 + Math.sin(t * 26) * 0.3 * k;
        pose.arm2 = -0.5 + Math.sin(t * 18) * 0.45;
        pose.tailPuff = 1 + 0.25 * k;
        break;
      }
      case 'taunt': {
        if (cid === 'rocco') {
          pose.lean = -0.14;
          pose.bob = Math.abs(Math.sin(t * 15)) * 3;
          pose.eyes = 'happy';
          pose.mouth = 'laugh';
          pose.arm = 1.0 + Math.sin(t * 15) * 0.1;   // hand on belly
          pose.arm2 = -0.15 + Math.sin(t * 15) * 0.08; // pointing at the thrower
          pose.headTilt = -0.12 + Math.sin(t * 15) * 0.05;
        } else {
          pose.jump = Math.abs(Math.sin(t * 9)) * 7;
          pose.eyes = 'closed';
          pose.eyes2 = 'happy';
          pose.mouth = 'tongue';
          pose.arm = -1.95 + Math.sin(t * 22) * 0.3;  // hands at the ears, waggling
          pose.arm2 = -1.75 + Math.sin(t * 22 + 1) * 0.3;
          pose.tailWag = Math.sin(t * 20) * 2;
          pose.headTilt = Math.sin(t * 9) * 0.1;
        }
        break;
      }
      case 'heal': {
        const u = Math.min(1, t / 1.0);
        pose.jump = Math.sin(u * Math.PI) * 8;
        pose.eyes = 'happy';
        pose.mouth = 'smile';
        pose.arm = -1.2 + Math.sin(t * 10) * 0.1;
        pose.arm2 = -1.4 + Math.sin(t * 10 + 1) * 0.1;
        break;
      }
      case 'confused': {
        pose.mouth = 'o';
        if (pose.eyes === 'closed') pose.eyes = 'open';
        pose.arm2 = -2.1 + Math.sin(t * 14) * 0.2; // scratching head
        pose.headTilt = 0.15;
        pose.look = { x: 0, y: -1 };
        break;
      }
      case 'win': {
        pose.jump = Math.abs(Math.sin(t * 6)) * 18;
        pose.eyes = 'happy';
        pose.mouth = 'laugh';
        pose.arm = -1.75 + Math.sin(t * 12) * 0.25;
        pose.arm2 = -1.45 + Math.sin(t * 12 + 1.5) * 0.25;
        pose.squash = 1 + Math.sin(t * 12) * 0.03;
        pose.holding = null;
        break;
      }
      case 'lose': {
        const k = U.easeOutCubic(Math.min(1, t * 2.2));
        pose.rot = -1.45 * k;
        pose.jump = 22 * k; // lying on its back: lift so the body rests on the grass
        pose.eyes = 'x';
        pose.mouth = 'o';
        pose.arm = REST + 0.6 * k;
        pose.arm2 = REST2 - 0.4 * k;
        pose.stars = k > 0.8;
        pose.bob = 0;
        pose.holding = null;
        break;
      }
      default:
        break;
    }
    return pose;
  }

  // ------------------------------------------------------------------ bodies
  function drawRocco(ctx, pose, time) {
    const C = PALETTE.rocco;
    // ringed tail
    const p0 = { x: -18, y: -32 }, p1 = { x: -54, y: -26 }, p2 = { x: -60, y: -62 + pose.tailWag * 4 };
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const q = quadPoint(p0, p1, p2, t);
      pts.push({ x: q.x, y: q.y, r: (11.5 - 4 * t) * pose.tailPuff, band: Math.floor(t * 5.5) % 2 });
    }
    for (const q of pts) circle(ctx, q.x, q.y, q.r + 3, OUT, 0);
    for (const q of pts) circle(ctx, q.x, q.y, q.r, q.band ? C.mask : C.fur, 0);

    // far arm
    const h2 = limb(ctx, -6, -60, pose.arm2, 24, 9, C.dark);
    circle(ctx, h2.x, h2.y, 6, C.dark, 2.5);

    // legs
    ellipse(ctx, -11, -8, 8, 11, C.dark, 3);
    ellipse(ctx, 11, -8, 8, 11, C.dark, 3);
    ellipse(ctx, -9, -1, 10, 4.5, C.mask, 2.5);
    ellipse(ctx, 14, -1, 10, 4.5, C.mask, 2.5);

    // body + belly
    ellipse(ctx, 0, -44, 27, 29, C.fur, 3);
    ellipse(ctx, 6, -40, 16, 20, C.light, 0);

    // head
    ctx.save();
    ctx.translate(4, -80);
    ctx.rotate(pose.headTilt);
    // ears
    circle(ctx, -14, -18, 8.5, C.fur, 3);
    circle(ctx, -14, -18, 4.2, C.inner, 0);
    circle(ctx, 10, -21, 8.5, C.fur, 3);
    circle(ctx, 10, -21, 4.2, C.inner, 0);
    circle(ctx, 0, 0, 23, C.fur, 3);
    // light face + brows
    ellipse(ctx, 10, 4, 16, 12, C.light, 0);
    ellipse(ctx, 6, -10, 14, 5, C.light, 0);
    // bandit mask
    ctx.beginPath();
    ctx.ellipse(10, -3, 19, 8.5, -0.08, 0, TAU);
    ctx.fillStyle = C.mask; ctx.fill();
    // eyes
    drawEye(ctx, 4, -3, 5.3, pose.eyes, pose.look);
    drawEye(ctx, 17, -4, 5.3, pose.eyes2 || pose.eyes, pose.look);
    // snout
    ellipse(ctx, 23, 7, 11, 7.5, '#efe9df', 2.5);
    circle(ctx, 32, 4, 4.2, C.nose, 0);
    drawMouth(ctx, 23, 13, pose.mouth, 0.9);
    // whiskers
    ctx.beginPath();
    ctx.moveTo(27, 9); ctx.lineTo(38, 8); ctx.moveTo(27, 11); ctx.lineTo(37, 13);
    ctx.strokeStyle = 'rgba(42,29,23,0.55)'; ctx.lineWidth = 1.2; ctx.stroke();
    if (pose.tint) { circle(ctx, 0, 0, 23, pose.tint, 0); ellipse(ctx, 23, 7, 11, 7.5, pose.tint, 0); }
    ctx.restore();

    // throwing arm + held item
    const h = limb(ctx, 9, -58, pose.arm, 27, 10, C.fur);
    if (pose.holding) drawProjectile(ctx, 'rocco', pose.holding, h.x + 2, h.y - 4, 0.3, 0.9);
    circle(ctx, h.x, h.y, 6.5, C.dark, 2.5);
    if (pose.stars) drawDizzy(ctx, 4, -112, time);
  }

  function drawHazel(ctx, pose, time) {
    const C = PALETTE.hazel;
    // big bushy tail
    const w = pose.tailWag;
    const p0 = { x: -12, y: -24 }, p1 = { x: -74, y: -40 }, p2 = { x: -72 + w * 3, y: -132 }, p3 = { x: -26 + w * 5, y: -128 + Math.abs(w) * 2 };
    const pts = [];
    for (let i = 0; i <= 18; i++) {
      const t = i / 18;
      const q = cubicPoint(p0, p1, p2, p3, t);
      pts.push({ x: q.x, y: q.y, r: (9 + 14 * Math.sin(Math.PI * Math.min(1, t * 1.05)) + (t > 0.9 ? 3 : 0)) * pose.tailPuff });
    }
    for (const q of pts) circle(ctx, q.x, q.y, q.r + 3, OUT, 0);
    for (const q of pts) circle(ctx, q.x, q.y, q.r, C.fur, 0);
    for (let i = 3; i < pts.length; i++) {
      const q = pts[i];
      circle(ctx, q.x + 3, q.y + 1, q.r * 0.5, '#eba65a', 0);
    }

    // far arm
    const h2 = limb(ctx, -4, -58, pose.arm2, 22, 8, C.dark);
    circle(ctx, h2.x, h2.y, 5.5, C.dark, 2.5);

    // legs (big feet)
    ellipse(ctx, -9, -9, 8, 11, C.fur, 3);
    ellipse(ctx, 9, -9, 8, 11, C.fur, 3);
    ellipse(ctx, -6, -1, 11, 4.5, C.dark, 2.5);
    ellipse(ctx, 13, -1, 11, 4.5, C.dark, 2.5);

    // body
    ellipse(ctx, 0, -43, 22, 28, C.fur, 3);
    ellipse(ctx, 6, -40, 13, 19, C.light, 0);

    // head
    ctx.save();
    ctx.translate(5, -80);
    ctx.rotate(pose.headTilt);
    // pointy ears with tufts
    for (const ex of [-10, 7]) {
      ctx.beginPath();
      ctx.moveTo(ex - 7, -12); ctx.lineTo(ex + 1, -34); ctx.lineTo(ex + 8, -12); ctx.closePath();
      ctx.fillStyle = C.fur; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ex - 3, -15); ctx.lineTo(ex + 1, -27); ctx.lineTo(ex + 4, -15); ctx.closePath();
      ctx.fillStyle = C.inner; ctx.fill();
      ctx.beginPath(); ctx.moveTo(ex + 1, -34); ctx.lineTo(ex - 2, -40); ctx.moveTo(ex + 1, -34); ctx.lineTo(ex + 4, -40);
      ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.stroke();
    }
    circle(ctx, 0, 0, 21, C.fur, 3);
    ellipse(ctx, 14, 7, 12, 9, C.light, 0);          // cheek / muzzle
    ellipse(ctx, 0, 9, 7, 5, 'rgba(255,140,120,0.35)', 0); // blush
    drawEye(ctx, 3, -4, 6.3, pose.eyes, pose.look);
    drawEye(ctx, 16, -5, 6.3, pose.eyes2 || pose.eyes, pose.look);
    circle(ctx, 25, 3, 3.6, C.nose, 0);
    // buck teeth
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = OUT; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.rect(19, 10, 4, 5.5); ctx.rect(23, 10, 4, 5.5); ctx.fill(); ctx.stroke();
    drawMouth(ctx, 21, 9, pose.mouth === 'smile' ? 'smile' : pose.mouth, 0.85);
    if (pose.tint) circle(ctx, 0, 0, 21, pose.tint, 0);
    ctx.restore();

    // throwing arm + held item
    const h = limb(ctx, 8, -56, pose.arm, 25, 9, C.fur);
    if (pose.holding) drawProjectile(ctx, 'hazel', pose.holding, h.x + 2, h.y - 4, 0.2, 0.9);
    circle(ctx, h.x, h.y, 6, C.dark, 2.5);
    if (pose.stars) drawDizzy(ctx, 5, -112, time);
  }

  function drawDizzy(ctx, x, y, time) {
    for (let i = 0; i < 3; i++) {
      const a = time * 3 + (i * TAU) / 3;
      drawStar(ctx, x + Math.cos(a) * 22, y + Math.sin(a) * 7, 6, '#ffd23f');
    }
  }

  function drawStar(ctx, x, y, r, color) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const rr = i % 2 ? r * 0.45 : r;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const px = x + Math.cos(a) * rr;
      const py = y + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = color; ctx.fill();
    ctx.lineWidth = 1.8; ctx.strokeStyle = OUT; ctx.stroke();
  }

  /**
   * Draws a character at world position. facing: +1 right, -1 left.
   */
  function drawCharacter(ctx, charId, x, groundY, facing, pose, time, scale) {
    scale = scale || 1;
    ctx.save();
    ctx.translate(x + pose.offX * facing, groundY - pose.jump - pose.bob * 0.4);
    ctx.scale(facing * scale, scale);
    // soft shadow (not rotated)
    ctx.save();
    ctx.scale(1, 1);
    ctx.beginPath();
    ctx.ellipse(0, pose.jump + pose.bob * 0.4 + 1, 34 - Math.min(14, pose.jump * 0.5), 6, 0, 0, TAU);
    ctx.fillStyle = 'rgba(40, 25, 15, 0.28)';
    ctx.fill();
    ctx.restore();
    ctx.rotate(pose.lean + pose.rot);
    ctx.scale(1 / Math.sqrt(pose.squash), pose.squash);
    if (charId === 'rocco') drawRocco(ctx, pose, time); else drawHazel(ctx, pose, time);
    ctx.restore();
  }

  function headAnchor(charId) {
    // approximate head-top position (local, facing right) for bubbles / markers
    return { x: 4, y: -118 };
  }

  OTW.Characters = {
    PALETTE, LINES, REST,
    computePose, drawCharacter, drawProjectile, drawStar, headAnchor,
    names: { rocco: 'ROCCO', hazel: 'HAZEL' },
  };
})(typeof window !== 'undefined' ? window : globalThis);
