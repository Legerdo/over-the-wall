/*
 * Canvas renderer: scene, characters, projectiles, HUD, banners and screens.
 * Everything is drawn in a fixed logical 1280x720 space and uniformly scaled,
 * so the layout never breaks at other window sizes.
 */
(function (root) {
  'use strict';
  const OTW = root.OTW || (root.OTW = {});
  const U = OTW.Util;
  const TAU = Math.PI * 2;
  const OUT = '#2a1d17';
  const INK = '#fff4e0';
  const YELLOW = '#ffd23f';
  const W = 1280;
  const H = 720;

  const FONT_BODY = '"Trebuchet MS", "Segoe UI", "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
  const FONT_HEAVY = '"Arial Black", "Segoe UI Black", "Trebuchet MS", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
  const font = (size, heavy) => (heavy ? `900 ${size}px ${FONT_HEAVY}` : `700 ${size}px ${FONT_BODY}`);

  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); OTW.roundRect(ctx, x, y, w, h, r); }

  function text(ctx, str, x, y, o) {
    o = o || {};
    ctx.font = font(o.size || 20, o.heavy);
    ctx.textAlign = o.align || 'center';
    ctx.textBaseline = o.baseline || 'middle';
    if (o.stroke) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = o.lw || 6;
      ctx.strokeStyle = o.stroke;
      ctx.strokeText(str, x, y);
    }
    ctx.fillStyle = o.color || INK;
    ctx.fillText(str, x, y);
  }

  class Renderer {
    constructor(canvas, game, fx, app) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.game = game;
      this.fx = fx;
      this.app = app;
      this.B = game.B;
      this.scale = 1;
      this.bgSky = null;
      this.bgScene = null;
      this.hpShown = [this.B.maxHP, this.B.maxHP];
      this.hpTrail = [this.B.maxHP, this.B.maxHP];
      this.trailHold = [0, 0];
      this.time = 0;
    }

    resize(cssW, cssH, dpr) {
      const pw = Math.max(1, Math.round(cssW * dpr));
      const ph = Math.max(1, Math.round(cssH * dpr));
      this.canvas.width = pw;
      this.canvas.height = ph;
      this.scale = pw / W;
      this.bgSky = this._layer(pw, ph, (c) => this._drawSky(c));
      this.bgScene = this._layer(pw, ph, (c) => this._drawScene(c));
    }

    _layer(pw, ph, fn) {
      const c = document.createElement('canvas');
      c.width = pw;
      c.height = ph;
      const ctx = c.getContext('2d');
      ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
      fn(ctx);
      return c;
    }

    // ================================================================ static layers
    _drawSky(ctx) {
      const g = ctx.createLinearGradient(0, 0, 0, 600);
      g.addColorStop(0, '#5d9bd1');
      g.addColorStop(0.45, '#a8c7da');
      g.addColorStop(0.8, '#f6c89a');
      g.addColorStop(1, '#fbe0b4');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      const sg = ctx.createRadialGradient(270, 340, 10, 270, 340, 220);
      sg.addColorStop(0, 'rgba(255, 248, 215, 1)');
      sg.addColorStop(0.25, 'rgba(255, 232, 170, 0.8)');
      sg.addColorStop(1, 'rgba(255, 220, 150, 0)');
      ctx.fillStyle = sg;
      ctx.fillRect(0, 100, 560, 500);
      ctx.beginPath(); ctx.arc(270, 340, 46, 0, TAU); ctx.fillStyle = '#fff3cc'; ctx.fill();
    }

    _drawScene(ctx) {
      const B = this.B;
      const gy = B.world.groundY;
      const rng = U.makeRng(7);

      // far skyline
      for (const layer of [{ c: '#d2adbf', y: 430, hmin: 40, hmax: 150, wmin: 40, wmax: 90 }, { c: '#b590b0', y: 470, hmin: 30, hmax: 110, wmin: 50, wmax: 110 }]) {
        let x = -20;
        ctx.fillStyle = layer.c;
        while (x < W + 20) {
          const w = layer.wmin + rng() * (layer.wmax - layer.wmin);
          const h = layer.hmin + rng() * (layer.hmax - layer.hmin);
          ctx.fillRect(x, layer.y - h, w + 1, gy - layer.y + h);
          if (rng() < 0.3) ctx.fillRect(x + w * 0.4, layer.y - h - 18, 4, 18); // antenna
          x += w;
        }
      }
      // distant windows glow
      ctx.fillStyle = 'rgba(255, 236, 190, 0.55)';
      for (let i = 0; i < 70; i++) {
        const x = rng() * W;
        const y = 380 + rng() * 180;
        ctx.fillRect(x, y, 4, 5);
      }
      // backyard fence line (behind everything, low)
      ctx.fillStyle = '#c99a6b';
      ctx.fillRect(0, gy - 70, W, 70);
      for (let x = 0; x < W; x += 26) {
        ctx.fillStyle = (x / 26) % 2 ? '#d4a676' : '#c1915f';
        ctx.beginPath();
        ctx.moveTo(x, gy); ctx.lineTo(x, gy - 76); ctx.lineTo(x + 12, gy - 84); ctx.lineTo(x + 24, gy - 76); ctx.lineTo(x + 24, gy);
        ctx.fill();
        ctx.strokeStyle = 'rgba(90, 55, 30, 0.45)'; ctx.lineWidth = 2; ctx.stroke();
      }
      ctx.fillStyle = 'rgba(90, 55, 30, 0.35)';
      ctx.fillRect(0, gy - 58, W, 6);
      ctx.fillRect(0, gy - 26, W, 6);

      // left: alley building + trash can + box (Rocco's turf)
      this._bricks(ctx, 0, 120, 64, gy - 120, 22, 12, ['#9c4a3a', '#a55240', '#8f4334'], '#6d3025', rng);
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(52, 120, 12, gy - 120);
      ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.strokeRect(-2, 120, 66, gy - 120);
      // drainpipe
      ctx.fillStyle = '#7c8791'; ctx.fillRect(40, 120, 9, gy - 120);
      ctx.strokeRect(40, 120, 9, gy - 120);
      // cardboard box
      ctx.fillStyle = '#c8955a'; ctx.fillRect(66, gy - 38, 44, 38);
      ctx.strokeRect(66, gy - 38, 44, 38);
      ctx.fillStyle = '#a7773f'; ctx.fillRect(66, gy - 38, 44, 7);
      ctx.strokeRect(66, gy - 38, 44, 7);
      // trash can
      this._trashCan(ctx, 104, gy);

      // right: tree (Hazel's turf)
      this._tree(ctx, gy);

      // the central wall
      this._wall(ctx);

      // ground
      ctx.fillStyle = '#7a5236';
      ctx.fillRect(0, gy, W, H - gy);
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      for (let i = 0; i < 90; i++) {
        ctx.beginPath();
        ctx.ellipse(rng() * W, gy + 20 + rng() * 110, 2 + rng() * 4, 1.5 + rng() * 2, 0, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = '#6bab4a';
      ctx.fillRect(0, gy - 4, W, 16);
      ctx.fillStyle = '#5a9a3c';
      for (let x = 0; x < W; x += 7) {
        const h = 6 + rng() * 9;
        ctx.beginPath(); ctx.moveTo(x, gy + 2); ctx.lineTo(x + 3, gy - h); ctx.lineTo(x + 6, gy + 2); ctx.fill();
      }
      ctx.fillStyle = '#4f8a35';
      ctx.fillRect(0, gy + 10, W, 3);

      // bottom HUD plate
      rr(ctx, 8, 614, W - 16, 100, 16);
      ctx.fillStyle = 'rgba(33, 21, 15, 0.62)';
      ctx.fill();
    }

    _bricks(ctx, x, y, w, h, bw, bh, colors, mortar, rng) {
      ctx.fillStyle = mortar;
      ctx.fillRect(x, y, w, h);
      for (let row = 0; row * bh < h; row++) {
        const off = (row % 2) * (bw / 2);
        for (let bx = -off; bx < w; bx += bw) {
          const x0 = Math.max(x, x + bx + 1.5);
          const x1 = Math.min(x + w, x + bx + bw - 1.5);
          if (x1 <= x0) continue;
          const y0 = y + row * bh + 1.5;
          const hh = Math.min(bh - 3, y + h - y0);
          if (hh <= 0) continue;
          ctx.fillStyle = colors[Math.floor(rng() * colors.length)];
          ctx.fillRect(x0, y0, x1 - x0, hh);
        }
      }
    }

    _trashCan(ctx, x, gy) {
      ctx.save();
      ctx.lineWidth = 3;
      ctx.strokeStyle = OUT;
      ctx.beginPath();
      ctx.moveTo(x - 24, gy); ctx.lineTo(x - 28, gy - 58); ctx.lineTo(x + 28, gy - 58); ctx.lineTo(x + 24, gy); ctx.closePath();
      ctx.fillStyle = '#8e99a3'; ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(42,29,23,0.45)'; ctx.lineWidth = 2;
      for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(x + i * 10, gy - 54); ctx.lineTo(x + i * 9, gy - 4); ctx.stroke(); }
      ctx.lineWidth = 3; ctx.strokeStyle = OUT;
      ctx.beginPath(); ctx.ellipse(x + 2, gy - 62, 32, 7, -0.12, 0, TAU); ctx.fillStyle = '#a7b1ba'; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(x + 2, gy - 70, 8, 4, -0.12, 0, TAU); ctx.fillStyle = '#7c8791'; ctx.fill(); ctx.stroke();
      // a banana peel peeking out
      ctx.beginPath(); ctx.moveTo(x - 18, gy - 64); ctx.quadraticCurveTo(x - 30, gy - 80, x - 22, gy - 88); ctx.quadraticCurveTo(x - 16, gy - 76, x - 10, gy - 66);
      ctx.fillStyle = '#f2d04a'; ctx.fill(); ctx.stroke();
      ctx.restore();
    }

    _tree(ctx, gy) {
      ctx.save();
      ctx.lineWidth = 3;
      ctx.strokeStyle = OUT;
      // trunk
      ctx.beginPath();
      ctx.moveTo(1190, gy + 2);
      ctx.quadraticCurveTo(1205, gy - 120, 1198, gy - 300);
      ctx.lineTo(1262, gy - 300);
      ctx.quadraticCurveTo(1250, gy - 120, 1280, gy + 2);
      ctx.closePath();
      ctx.fillStyle = '#80522f'; ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(42,29,23,0.4)'; ctx.lineWidth = 2;
      for (const [x0, y0, y1] of [[1215, gy - 20, gy - 140], [1238, gy - 60, gy - 240], [1224, gy - 170, gy - 290]]) {
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(x0 + 6, (y0 + y1) / 2, x0 - 2, y1); ctx.stroke();
      }
      // knot hole
      ctx.beginPath(); ctx.ellipse(1228, gy - 200, 11, 15, 0, 0, TAU); ctx.fillStyle = '#3a2416'; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.stroke();
      // foliage
      const blobs = [[1180, 250, 58], [1240, 210, 70], [1130, 300, 42], [1275, 290, 50], [1200, 175, 52], [1150, 225, 40]];
      for (const [x, y, r] of blobs) { ctx.beginPath(); ctx.arc(x, y, r + 3, 0, TAU); ctx.fillStyle = OUT; ctx.fill(); }
      const cols = ['#5c9a43', '#6fae4f', '#4f8a3a', '#78b857', '#62a247', '#58963f'];
      blobs.forEach(([x, y, r], i) => { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = cols[i]; ctx.fill(); });
      ctx.fillStyle = 'rgba(255, 240, 180, 0.25)';
      for (const [x, y, r] of blobs) { ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.35, r * 0.4, 0, TAU); ctx.fill(); }
      // acorns on the ground
      OTW.Characters.drawProjectile(ctx, 'hazel', 'normal', 1170, gy - 6, 0.4, 0.8);
      OTW.Characters.drawProjectile(ctx, 'hazel', 'normal', 1152, gy - 5, -1.2, 0.7);
      ctx.restore();
    }

    _wall(ctx) {
      const wr = OTW.Physics.wallRect(this.B);
      const rng = U.makeRng(31);
      this._bricks(ctx, wr.x, wr.y, wr.w, wr.h, 21, 14, ['#b5543c', '#c05e44', '#a84c36', '#b95a41'], '#7e3526', rng);
      ctx.fillStyle = 'rgba(255, 230, 190, 0.18)';
      ctx.fillRect(wr.x, wr.y, 10, wr.h);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.fillRect(wr.x + wr.w - 12, wr.y, 12, wr.h);
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = OUT;
      ctx.strokeRect(wr.x, wr.y, wr.w, wr.h);
      // cap stone
      rr(ctx, wr.x - 8, wr.y - 12, wr.w + 16, 16, 4);
      ctx.fillStyle = '#a39c96'; ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillRect(wr.x - 5, wr.y - 10, wr.w + 10, 4);
    }

    // ================================================================ frame
    draw(dt) {
      this.time += dt;
      const ctx = this.ctx;
      const g = this.game;
      const S = OTW.Game.States;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#1a100b';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);

      this._updateHp(dt);
      const sh = this.fx.shakeOffset();
      ctx.save();
      ctx.translate(sh.x, sh.y);
      // sky layer is pre-rendered in device pixels
      ctx.save(); ctx.setTransform(1, 0, 0, 1, sh.x * this.scale, sh.y * this.scale); ctx.drawImage(this.bgSky, 0, 0); ctx.restore();
      this.fx.drawClouds(ctx);
      ctx.save(); ctx.setTransform(1, 0, 0, 1, sh.x * this.scale, sh.y * this.scale); ctx.drawImage(this.bgScene, 0, 0); ctx.restore();
      this._drawFlag(ctx);
      this.fx.drawLeaves(ctx);
      this.fx.drawTrails(ctx);
      this.fx.drawMarkers(ctx);
      this._drawCharacters(ctx);
      this._drawProjectiles(ctx);
      this.fx.drawParticles(ctx);
      ctx.restore();

      this.fx.drawFloaters(ctx, (s) => font(s, true));
      this.fx.drawBubbles(ctx, (s) => font(s, true));
      if (this.fx.flash > 0) {
        ctx.fillStyle = `rgba(255, 250, 235, ${Math.min(0.45, this.fx.flash * 2)})`;
        ctx.fillRect(0, 0, W, H);
      }

      const list = OTW.UI.buttons(g, this.app);
      if (g.isMatchState()) {
        this._drawHud(ctx);
        this._drawBanners(ctx);
      }
      switch (g.state) {
        case S.MENU: this._drawTitle(ctx); break;
        case S.MODE_SELECT: this._drawModeSelect(ctx, list); break;
        case S.DIFFICULTY_SELECT: this._drawDifficulty(ctx, list); break;
        case S.HOW_TO_PLAY: this._drawHowTo(ctx, list); break;
        case S.GAME_OVER: this._drawGameOver(ctx, list); break;
        default: break;
      }
      if (g.paused) this._drawPause(ctx, list);
      this._drawIcons(ctx, list);
    }

    _updateHp(dt) {
      const g = this.game;
      for (let i = 0; i < 2; i++) {
        const hp = g.players[i].hp;
        const k = 1 - Math.exp(-dt * 10);
        this.hpShown[i] += (hp - this.hpShown[i]) * k;
        if (Math.abs(hp - this.hpShown[i]) < 0.05) this.hpShown[i] = hp;
        if (hp > this.hpTrail[i]) { this.hpTrail[i] = this.hpShown[i]; this.trailHold[i] = 0; }
        else if (hp < this.hpTrail[i]) {
          this.trailHold[i] += dt;
          if (this.trailHold[i] > 0.45) this.hpTrail[i] = Math.max(hp, this.hpTrail[i] - dt * 60);
        } else this.trailHold[i] = 0;
      }
    }

    resetHp() {
      this.hpShown = [this.B.maxHP, this.B.maxHP];
      this.hpTrail = [this.B.maxHP, this.B.maxHP];
    }

    // ================================================================ world pieces
    _drawFlag(ctx) {
      const wl = this.B.world.wall;
      const x = wl.centerX;
      const top = wl.topY - 12;
      const poleTop = top - 64;
      const w = this.fx.displayWind;
      const aw = Math.abs(w);
      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = OUT; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, poleTop); ctx.stroke();
      ctx.strokeStyle = '#d9d2c8'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, poleTop); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, poleTop - 2, 4.5, 0, TAU); ctx.fillStyle = YELLOW; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke();

      // flag: droops when calm, streams out with strength
      const dir = w >= 0 ? 1 : -1;
      const strength = Math.min(1, aw / this.B.maxWind);
      const len = 30 + strength * 34;
      const droop = 1 - Math.min(1, aw / 18);
      const hgt = 20;
      const N = 10;
      const freq = 5 + strength * 9;
      const amp = 2 + strength * 4;
      const pts = [];
      for (let i = 0; i <= N; i++) {
        const u = i / N;
        const wave = Math.sin(this.time * freq - u * 5) * amp * u;
        // blend between hanging down the pole and flying horizontally
        const fx0 = x + dir * u * len;
        const fy0 = poleTop + 2 + wave;
        const hx = x + dir * (3 + wave * 0.3);
        const hy = poleTop + 2 + u * len * 0.8;
        pts.push({ x: U.lerp(fx0, hx, droop), y: U.lerp(fy0, hy, droop) });
      }
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (const p of pts) ctx.lineTo(p.x, p.y);
      for (let i = N; i >= 0; i--) {
        const u = i / N;
        const hh = hgt * (1 - u * 0.55);
        const p = pts[i];
        ctx.lineTo(p.x + droop * dir * hh, p.y + (1 - droop) * hh);
      }
      ctx.closePath();
      ctx.fillStyle = YELLOW; ctx.fill();
      ctx.lineWidth = 2.5; ctx.strokeStyle = OUT; ctx.stroke();
      // stripe
      ctx.beginPath();
      for (let i = 0; i <= N; i++) {
        const u = i / N;
        const hh = hgt * (1 - u * 0.55) * 0.5;
        const p = pts[i];
        const px = p.x + droop * dir * hh;
        const py = p.y + (1 - droop) * hh;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = '#e0453a'; ctx.lineWidth = 4; ctx.stroke();
      ctx.restore();
    }

    _lookFor(p) {
      const g = this.game;
      const facing = p.index === 0 ? 1 : -1;
      const hx = p.x;
      const hy = this.B.world.groundY - 84;
      let tx, ty;
      if (g.projectiles.length) { tx = g.projectiles[0].x; ty = g.projectiles[0].y; }
      else { const o = g.players[1 - p.index]; tx = o.x; ty = hy; }
      const dx = (tx - hx) * facing;
      const dy = ty - hy;
      const d = Math.hypot(dx, dy) || 1;
      return { x: dx / d, y: dy / d };
    }

    _drawCharacters(ctx) {
      const g = this.game;
      const gy = this.B.world.groundY;
      const Ch = OTW.Characters;
      const S = OTW.Game.States;
      ctx.save();
      ctx.beginPath();
      ctx.rect(-50, -200, W + 100, gy + 214); // never draw into the HUD strip
      ctx.clip();
      for (const p of g.players) {
        const facing = p.index === 0 ? 1 : -1;
        const pose = Ch.computePose(p, g, this.time + p.index * 0.9, this._lookFor(p));
        Ch.drawCharacter(ctx, p.charId, p.x, gy, facing, pose, this.time);
      }
      ctx.restore();
      // current-turn marker
      if (g.isMatchState() && (g.state === S.TURN_START || g.state === S.AIMING) && !g.paused) {
        const p = g.current;
        const y = gy - 148 + Math.sin(this.time * 6) * 4;
        const thinking = g.state === S.AIMING && p.isCPU && g.cpu && g.cpu.phase === 'think';
        if (thinking) {
          rr(ctx, p.x - 30, y - 20, 60, 30, 14);
          ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.stroke();
          for (let i = 0; i < 3; i++) {
            const a = 0.35 + 0.65 * Math.max(0, Math.sin(this.time * 6 - i * 0.8));
            ctx.beginPath(); ctx.arc(p.x - 14 + i * 14, y - 5, 4, 0, TAU);
            ctx.fillStyle = `rgba(42,29,23,${a})`; ctx.fill();
          }
        } else {
          ctx.beginPath();
          ctx.moveTo(p.x - 13, y - 12); ctx.lineTo(p.x + 13, y - 12); ctx.lineTo(p.x, y + 4); ctx.closePath();
          ctx.fillStyle = YELLOW; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.lineJoin = 'round'; ctx.stroke();
          text(ctx, g.tagOf(p.index), p.x, y - 26, { size: 18, heavy: true, color: YELLOW, stroke: OUT, lw: 5 });
        }
      }
    }

    _drawProjectiles(ctx) {
      const g = this.game;
      const Ch = OTW.Characters;
      for (const pr of g.projectiles) {
        const cid = g.players[pr.owner].charId;
        const kind = pr.kind === 'double' ? 'normal' : pr.kind;
        if (pr.kind === 'power') {
          ctx.beginPath(); ctx.arc(pr.x, pr.y, pr.r + 8, 0, TAU);
          ctx.fillStyle = 'rgba(255, 150, 60, 0.28)'; ctx.fill();
        }
        Ch.drawProjectile(ctx, cid, kind, pr.x, pr.y, pr.spin, 1);
      }
    }

    // ================================================================ HUD
    _drawHud(ctx) {
      const g = this.game;
      for (let i = 0; i < 2; i++) this._drawPlayerPanel(ctx, i);
      this._drawWind(ctx);
      this._drawTimer(ctx);
      this._drawGauge(ctx);
      for (const b of OTW.UI.specialButtons(g)) this._drawSpecialButton(ctx, b);
      // off-screen (above the top) projectile indicator
      for (const pr of g.projectiles) {
        if (pr.y < -8) {
          const x = U.clamp(pr.x, 20, W - 20);
          const y = 100;
          ctx.beginPath(); ctx.moveTo(x, y - 12); ctx.lineTo(x + 10, y + 4); ctx.lineTo(x - 10, y + 4); ctx.closePath();
          ctx.fillStyle = 'rgba(255, 244, 224, 0.9)'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = OUT; ctx.stroke();
        }
      }
    }

    _drawPlayerPanel(ctx, i) {
      const g = this.game;
      const B = this.B;
      const p = g.players[i];
      const x = i === 0 ? 16 : W - 16 - 440;
      const y = 12;
      const w = 440;
      const h = 74;
      const S = OTW.Game.States;
      const isTurn = g.turn === i && g.state !== S.GAME_OVER && g.state !== S.ROUND_START;
      rr(ctx, x, y, w, h, 14);
      ctx.fillStyle = 'rgba(33, 21, 15, 0.85)'; ctx.fill();
      ctx.lineWidth = isTurn ? 4 : 3;
      ctx.strokeStyle = isTurn ? YELLOW : OUT;
      ctx.stroke();

      // portrait
      const px = i === 0 ? x + 40 : x + w - 40;
      const py = y + 37;
      ctx.save();
      ctx.beginPath(); ctx.arc(px, py, 29, 0, TAU);
      ctx.fillStyle = i === 0 ? '#4c6b8a' : '#6b8a4c'; ctx.fill();
      ctx.clip();
      const s = 0.72;
      const facing = i === 0 ? 1 : -1;
      const pose = {
        bob: 0, lean: 0, squash: 1, offX: 0, jump: 0, rot: 0, headTilt: 0,
        arm: OTW.Characters.REST, arm2: 1.6, eyes: p.hp <= 0 ? 'x' : 'open', eyes2: null,
        mouth: p.hp <= B.maxHP * 0.3 ? 'frown' : 'smile', look: { x: 1, y: 0 }, holding: null,
        tint: null, tailPuff: 1, tailWag: 0, stars: false,
      };
      OTW.Characters.drawCharacter(ctx, p.charId, px - facing * s * 6, py + 6 + s * 80, facing, pose, this.time, s);
      ctx.restore();
      ctx.beginPath(); ctx.arc(px, py, 29, 0, TAU); ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.stroke();

      // name + tag
      const nameX = i === 0 ? x + 80 : x + w - 80;
      const align = i === 0 ? 'left' : 'right';
      text(ctx, g.charName(i), nameX, y + 22, { size: 20, heavy: true, align, color: INK });
      ctx.font = font(20, true);
      const nw = ctx.measureText(g.charName(i)).width;
      const tag = g.tagOf(i);
      const tagX = i === 0 ? nameX + nw + 10 : nameX - nw - 10;
      ctx.font = font(14, true);
      const tw = ctx.measureText(tag).width + 14;
      const tx0 = i === 0 ? tagX : tagX - tw;
      rr(ctx, tx0, y + 12, tw, 21, 8);
      ctx.fillStyle = tag === 'CPU' ? '#9aa4b1' : i === 0 ? '#7fb2ff' : '#ffb36b'; ctx.fill();
      text(ctx, tag, tx0 + tw / 2, y + 23, { size: 14, heavy: true, color: OUT });
      if (isTurn) {
        const tt = 'TURN';
        const bx = i === 0 ? tx0 + tw + 8 : tx0 - 8;
        ctx.font = font(14, true);
        const ttw = ctx.measureText(tt).width + 16;
        const bx0 = i === 0 ? bx : bx - ttw;
        const pulse = 0.75 + 0.25 * Math.sin(this.time * 6);
        rr(ctx, bx0, y + 12, ttw, 21, 8);
        ctx.fillStyle = `rgba(255, 210, 63, ${pulse})`; ctx.fill();
        text(ctx, tt, bx0 + ttw / 2, y + 23, { size: 14, heavy: true, color: OUT });
      }
      // HP number
      const hpX = i === 0 ? x + w - 16 : x + 16;
      text(ctx, `${Math.ceil(this.hpShown[i])}`, hpX, y + 23, { size: 22, heavy: true, align: i === 0 ? 'right' : 'left', color: INK });
      text(ctx, 'HP', i === 0 ? hpX - 44 : hpX + 44, y + 25, { size: 12, heavy: true, align: i === 0 ? 'right' : 'left', color: '#c9b8a6' });

      // HP bar (anchored at the portrait side)
      const bx = i === 0 ? x + 80 : x + 16;
      const bw = w - 96;
      const by = y + 42;
      const bh = 20;
      rr(ctx, bx, by, bw, bh, 7);
      ctx.fillStyle = '#3b2a22'; ctx.fill();
      const fillW = (v) => (bw - 4) * U.clamp(v / B.maxHP, 0, 1);
      const trailW = fillW(this.hpTrail[i]);
      const hpW = fillW(this.hpShown[i]);
      const ratio = this.hpShown[i] / B.maxHP;
      const col = ratio > 0.5 ? '#6fd35b' : ratio > 0.25 ? '#ffc93c' : '#ff5b4a';
      ctx.save();
      rr(ctx, bx + 2, by + 2, bw - 4, bh - 4, 5); ctx.clip();
      if (i === 0) {
        ctx.fillStyle = '#fff0c2'; ctx.fillRect(bx + 2, by + 2, trailW, bh - 4);
        ctx.fillStyle = col; ctx.fillRect(bx + 2, by + 2, hpW, bh - 4);
        ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(bx + 2, by + 3, hpW, 4);
      } else {
        const r0 = bx + bw - 2;
        ctx.fillStyle = '#fff0c2'; ctx.fillRect(r0 - trailW, by + 2, trailW, bh - 4);
        ctx.fillStyle = col; ctx.fillRect(r0 - hpW, by + 2, hpW, bh - 4);
        ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(r0 - hpW, by + 3, hpW, 4);
      }
      // segment ticks every 10 HP
      ctx.fillStyle = 'rgba(42,29,23,0.35)';
      for (let k = 1; k < 10; k++) ctx.fillRect(bx + 2 + ((bw - 4) * k) / 10 - 0.75, by + 2, 1.5, bh - 4);
      ctx.restore();
      rr(ctx, bx, by, bw, bh, 7);
      ctx.lineWidth = 2.5; ctx.strokeStyle = OUT; ctx.stroke();
    }

    _drawWind(ctx) {
      const g = this.game;
      const w = g.wind;
      const aw = Math.abs(w);
      const x = 540, y = 10, bw = 200, bh = 58;
      const pop = 1 + this.fx.windPop * 0.22;
      ctx.save();
      ctx.translate(x + bw / 2, y + bh / 2);
      ctx.scale(pop, pop);
      rr(ctx, -bw / 2, -bh / 2, bw, bh, 14);
      ctx.fillStyle = 'rgba(33, 21, 15, 0.85)'; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.stroke();
      text(ctx, 'WIND', 0, -16, { size: 13, heavy: true, color: '#c9b8a6' });
      const n = aw === 0 ? 0 : aw <= 33 ? 1 : aw <= 66 ? 2 : 3;
      const col = n === 1 ? '#bfe3ff' : n === 2 ? YELLOW : '#ff7a3d';
      const dir = w < 0 ? -1 : 1;
      if (n === 0) {
        text(ctx, '0', 0, 10, { size: 28, heavy: true, color: INK });
        text(ctx, 'CALM', 44, 12, { size: 13, heavy: true, color: '#c9b8a6' });
      } else {
        // reads like "WIND <- 35" / "WIND -> 72": arrows first, then the strength
        text(ctx, String(aw), 40, 10, { size: 28, heavy: true, color: col });
        const xs = dir > 0 ? [-26, -44, -62] : [-62, -44, -26]; // tip first
        for (let k = 0; k < 3; k++) {
          const cx = xs[k];
          const on = k < n;
          const wob = on ? Math.sin(this.time * (4 + n * 2) - k) * 2 * dir : 0;
          ctx.beginPath();
          ctx.moveTo(cx - dir * 8 + wob, 0);
          ctx.lineTo(cx + dir * 6 + wob, 10);
          ctx.lineTo(cx - dir * 8 + wob, 20);
          ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          ctx.strokeStyle = on ? col : 'rgba(255,244,224,0.15)';
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    _drawTimer(ctx) {
      const g = this.game;
      const B = this.B;
      const S = OTW.Game.States;
      const x = 640, y = 106, r = 24;
      const active = g.state === S.AIMING;
      const frac = active ? g.timer / B.turnDuration : g.state === S.TURN_START || g.state === S.ROUND_START ? 1 : g.timer / B.turnDuration;
      const warn = active && g.timer <= B.timerWarningAt;
      const pulse = warn ? 1 + Math.max(0, Math.sin(this.time * 12)) * 0.08 : 1;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(pulse, pulse);
      ctx.beginPath(); ctx.arc(0, 0, r + 3, 0, TAU); ctx.fillStyle = 'rgba(33, 21, 15, 0.88)'; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, r - 3, -Math.PI / 2, -Math.PI / 2 + TAU * U.clamp(frac, 0, 1));
      ctx.lineWidth = 6; ctx.lineCap = 'round';
      ctx.strokeStyle = warn ? '#ff5b4a' : active ? INK : 'rgba(255,244,224,0.35)';
      ctx.stroke();
      const secs = active ? Math.ceil(g.timer) : Math.ceil(B.turnDuration * U.clamp(frac, 0, 1));
      text(ctx, String(secs), 0, 1, { size: 20, heavy: true, color: warn ? '#ff8a7a' : active ? INK : 'rgba(255,244,224,0.5)' });
      ctx.restore();
    }

    _drawGauge(ctx) {
      const g = this.game;
      const B = this.B;
      const S = OTW.Game.States;
      const L = OTW.UI.L.gauge;
      const cur = g.current;
      const aiming = g.state === S.AIMING;
      const human = !cur.isCPU;

      // caption above the gauge
      let caption = '';
      let capColor = INK;
      const sel = g.selectedSpecial;
      if (g.state === S.AIMING || g.state === S.TURN_START) {
        if (sel) { caption = sel === 'heal' ? 'HEAL SELECTED - PRESS TO HEAL' : OTW.UI.SPECIAL_INFO[sel].name; capColor = OTW.UI.SPECIAL_INFO[sel].color; }
        else caption = 'NORMAL THROW';
      } else if (g.state === S.PROJECTILE_FLYING && g.turnResult) {
        caption = g.turnResult.kind === 'normal' ? 'NORMAL THROW' : OTW.UI.SPECIAL_INFO[g.turnResult.kind].name;
        if (g.turnResult.kind !== 'normal') capColor = OTW.UI.SPECIAL_INFO[g.turnResult.kind].color;
      }
      if (caption) text(ctx, caption, L.x + L.w / 2, 632, { size: 17, heavy: true, color: capColor, stroke: OUT, lw: 5 });
      const hintY = 704;
      if (aiming && human && !g.charging && !g.paused) {
        const a = 0.6 + 0.4 * Math.sin(this.time * 5);
        ctx.globalAlpha = a;
        text(ctx, sel === 'heal' ? 'CLICK / TAP / SPACE' : 'HOLD CLICK / TAP / SPACE - RELEASE TO THROW', L.x + L.w / 2, hintY, { size: 13, heavy: true, color: '#e8d7c2' });
        ctx.globalAlpha = 1;
      } else if (aiming && cur.isCPU) {
        text(ctx, 'CPU IS AIMING...', L.x + L.w / 2, hintY, { size: 13, heavy: true, color: '#c9b8a6' });
      }

      // bar
      text(ctx, 'POWER', L.x + 2, L.y - 13, { size: 11, heavy: true, align: 'left', color: '#c9b8a6' });
      text(ctx, 'MAX', L.x + L.w - 2, L.y - 13, { size: 11, heavy: true, align: 'right', color: '#c9b8a6' });
      rr(ctx, L.x - 4, L.y - 4, L.w + 8, L.h + 8, 10);
      ctx.fillStyle = OUT; ctx.fill();
      rr(ctx, L.x, L.y, L.w, L.h, 7);
      ctx.fillStyle = '#4a3a31'; ctx.fill();
      const showPower = g.state === S.AIMING || g.state === S.PROJECTILE_FLYING || (g.state === S.HIT_RESOLUTION && g.turnResult && g.turnResult.kind !== 'heal');
      const p = showPower ? g.power : 0;
      if (p > 0) {
        ctx.save();
        rr(ctx, L.x, L.y, L.w, L.h, 7); ctx.clip();
        const gr = ctx.createLinearGradient(L.x, 0, L.x + L.w, 0);
        gr.addColorStop(0, '#6fd35b');
        gr.addColorStop(0.5, '#ffd23f');
        gr.addColorStop(1, '#ff5b4a');
        ctx.fillStyle = gr;
        ctx.fillRect(L.x, L.y, L.w * p, L.h);
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillRect(L.x, L.y + 2, L.w * p, 6);
        ctx.restore();
        // needle
        const nx = L.x + L.w * p;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(nx - 2, L.y - 3, 4, L.h + 6);
      }
      // ticks
      for (let k = 1; k < 10; k++) {
        const tx = L.x + (L.w * k) / 10;
        ctx.fillStyle = k === 5 ? 'rgba(42,29,23,0.8)' : 'rgba(42,29,23,0.5)';
        const th = k === 5 ? L.h : L.h * 0.45;
        ctx.fillRect(tx - 1, L.y + L.h - th, 2, th);
      }
      // last power marker for the current player
      if (B.showLastPowerMark && cur.lastPower !== null && (g.state === S.AIMING || g.state === S.TURN_START || g.state === S.PROJECTILE_FLYING)) {
        const mx = L.x + L.w * cur.lastPower;
        ctx.beginPath();
        ctx.moveTo(mx, L.y - 2); ctx.lineTo(mx - 7, L.y - 13); ctx.lineTo(mx + 7, L.y - 13); ctx.closePath();
        ctx.fillStyle = '#bfe3ff'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke();
        text(ctx, 'LAST', mx, L.y - 19, { size: 10, heavy: true, color: '#bfe3ff', stroke: OUT, lw: 3 });
      }
    }

    _drawSpecialButton(ctx, b) {
      const g = this.game;
      const p = g.players[b.player];
      const info = OTW.UI.SPECIAL_INFO[b.key];
      const used = !p.specials[b.key];
      const selected = g.turn === b.player && g.selectedSpecial === b.key && (g.state === OTW.Game.States.AIMING);
      const hover = this.app.ui.hover === b.id && b.enabled;
      const mineNow = g.turn === b.player && g.canHumanAct();
      const fullHp = b.key === 'heal' && p.hp >= this.B.maxHP;
      let y = b.y;
      if (hover && !selected) y -= 3;
      if (selected) y -= 5;
      ctx.save();
      if (!used && !mineNow && !selected) ctx.globalAlpha = 0.6;
      if (selected) {
        const pulse = 0.5 + 0.5 * Math.sin(this.time * 8);
        rr(ctx, b.x - 6, y - 6, b.w + 12, b.h + 12, 16);
        ctx.fillStyle = `rgba(255, 210, 63, ${0.35 + pulse * 0.35})`; ctx.fill();
      }
      rr(ctx, b.x, y, b.w, b.h, 12);
      ctx.fillStyle = used ? '#4a3d36' : info.color;
      ctx.fill();
      ctx.lineWidth = selected ? 4 : 3;
      ctx.strokeStyle = selected ? YELLOW : OUT;
      ctx.stroke();
      if (!used) {
        rr(ctx, b.x + 4, y + 4, b.w - 8, 22, 9);
        ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fill();
      }
      // icon
      const cx = b.x + b.w / 2;
      const cy = y + 30;
      if (used) ctx.globalAlpha *= 0.4;
      this._specialIcon(ctx, p.charId, b.key, cx, cy);
      if (used) ctx.globalAlpha /= 0.4;
      // label
      text(ctx, used ? 'USED' : fullHp && mineNow ? 'FULL' : info.label, cx, y + b.h - 12, { size: 12, heavy: true, color: used ? '#b8a898' : '#ffffff', stroke: used ? null : OUT, lw: 4 });
      if (used) {
        ctx.strokeStyle = 'rgba(255, 91, 74, 0.9)'; ctx.lineWidth = 5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(b.x + 16, y + 12); ctx.lineTo(b.x + b.w - 16, y + b.h - 26);
        ctx.moveTo(b.x + b.w - 16, y + 12); ctx.lineTo(b.x + 16, y + b.h - 26); ctx.stroke();
      }
      // key hint for the acting player
      if (mineNow && !used) {
        rr(ctx, b.x - 5, y - 7, 20, 20, 6);
        ctx.fillStyle = INK; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke();
        text(ctx, info.key, b.x + 5, y + 3, { size: 12, heavy: true, color: OUT });
      }
      if (selected) {
        rr(ctx, b.x + b.w - 26, y - 9, 32, 18, 7);
        ctx.fillStyle = YELLOW; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke();
        text(ctx, 'ON', b.x + b.w - 10, y, { size: 11, heavy: true, color: OUT });
      }
      ctx.restore();
    }

    _specialIcon(ctx, charId, key, cx, cy) {
      const Ch = OTW.Characters;
      if (key === 'double') {
        Ch.drawProjectile(ctx, charId, 'normal', cx - 11, cy + 1, -0.3, 1);
        Ch.drawProjectile(ctx, charId, 'normal', cx + 11, cy - 1, 0.3, 1);
        text(ctx, 'x2', cx + 19, cy + 12, { size: 12, heavy: true, color: '#ffffff', stroke: OUT, lw: 3 });
      } else if (key === 'power') {
        Ch.drawProjectile(ctx, charId, 'power', cx, cy, 0.2, 0.95);
      } else if (key === 'stink') {
        Ch.drawProjectile(ctx, charId, 'stink', cx, cy + 3, 0.2, 1.05);
        ctx.strokeStyle = '#3f6b1d'; ctx.lineWidth = 2; ctx.lineCap = 'round';
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          const sx = cx + i * 8;
          ctx.moveTo(sx, cy - 8);
          ctx.quadraticCurveTo(sx + 4, cy - 12, sx, cy - 16);
          ctx.quadraticCurveTo(sx - 4, cy - 20, sx, cy - 24);
          ctx.stroke();
        }
      } else {
        const s = 12;
        ctx.beginPath();
        ctx.moveTo(cx, cy + s * 0.9);
        ctx.bezierCurveTo(cx - s * 1.5, cy - s * 0.1, cx - s * 0.7, cy - s * 1.3, cx, cy - s * 0.45);
        ctx.bezierCurveTo(cx + s * 0.7, cy - s * 1.3, cx + s * 1.5, cy - s * 0.1, cx, cy + s * 0.9);
        ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = OUT; ctx.stroke();
        ctx.fillStyle = '#ff5c8a';
        ctx.fillRect(cx - 2, cy - 7, 4, 11);
        ctx.fillRect(cx - 5.5, cy - 3.5, 11, 4);
      }
    }

    _drawIcons(ctx, list) {
      for (const b of list) {
        if (b.kind !== 'icon') continue;
        const cx = b.x + b.w / 2;
        const cy = b.y + b.h / 2;
        const r = b.w / 2;
        const hover = this.app.ui.hover === b.id;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU);
        ctx.fillStyle = hover ? 'rgba(80, 55, 40, 0.95)' : 'rgba(33, 21, 15, 0.85)'; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.stroke();
        ctx.fillStyle = INK; ctx.strokeStyle = INK;
        if (b.icon === 'pause') {
          ctx.fillRect(cx - 7, cy - 8, 5, 16);
          ctx.fillRect(cx + 2, cy - 8, 5, 16);
        } else {
          ctx.beginPath();
          ctx.moveTo(cx - 9, cy - 4); ctx.lineTo(cx - 4, cy - 4); ctx.lineTo(cx + 2, cy - 9); ctx.lineTo(cx + 2, cy + 9); ctx.lineTo(cx - 4, cy + 4); ctx.lineTo(cx - 9, cy + 4); ctx.closePath();
          ctx.fill();
          ctx.lineWidth = 2; ctx.lineCap = 'round';
          if (b.icon === 'muted') {
            ctx.beginPath(); ctx.moveTo(cx + 5, cy - 5); ctx.lineTo(cx + 11, cy + 5); ctx.moveTo(cx + 11, cy - 5); ctx.lineTo(cx + 5, cy + 5); ctx.stroke();
          } else {
            ctx.beginPath(); ctx.arc(cx + 3, cy, 5, -0.9, 0.9); ctx.stroke();
            ctx.beginPath(); ctx.arc(cx + 3, cy, 9, -0.9, 0.9); ctx.stroke();
          }
        }
      }
    }

    // ================================================================ banners
    _drawBanners(ctx) {
      const g = this.game;
      const S = OTW.Game.States;
      const t = g.stateTime;
      if (g.state === S.ROUND_START) {
        const d = this.B.roundStartDuration;
        const first = t < d * 0.62;
        const k = U.easeOutBack(Math.min(1, (first ? t : t - d * 0.62) / 0.3));
        ctx.save();
        ctx.translate(W / 2, 250);
        ctx.scale(k, k);
        if (first) {
          text(ctx, `${g.charName(0)}  VS  ${g.charName(1)}`, 0, -20, { size: 54, heavy: true, color: YELLOW, stroke: OUT, lw: 12 });
          const who = g.mode === '1P' ? (g.players[g.turn].isCPU ? 'CPU THROWS FIRST' : 'YOU THROW FIRST') : `PLAYER ${g.turn + 1} THROWS FIRST`;
          text(ctx, who, 0, 34, { size: 24, heavy: true, color: INK, stroke: OUT, lw: 7 });
        } else {
          text(ctx, 'THROW!', 0, 0, { size: 78, heavy: true, color: YELLOW, stroke: OUT, lw: 14 });
        }
        ctx.restore();
      } else if (g.state === S.TURN_START) {
        const d = this.B.turnBannerDuration;
        const inK = U.easeOutCubic(Math.min(1, t / 0.2));
        const outK = t > d - 0.2 ? (t - (d - 0.2)) / 0.2 : 0;
        const dir = g.turn === 0 ? -1 : 1;
        const x = W / 2 + dir * (1 - inK) * 400 - dir * outK * 400;
        ctx.save();
        ctx.globalAlpha = 1 - outK;
        ctx.fillStyle = 'rgba(33, 21, 15, 0.75)';
        ctx.fillRect(0, 214, W, 76);
        ctx.fillStyle = g.turn === 0 ? '#7fb2ff' : '#ffb36b';
        ctx.fillRect(0, 214, W, 4);
        ctx.fillRect(0, 286, W, 4);
        text(ctx, g.turnLabel(g.turn), x, 244, { size: 40, heavy: true, color: YELLOW, stroke: OUT, lw: 10 });
        const w = g.wind;
        const ws = w === 0 ? 'WIND 0 (CALM)' : `WIND ${w < 0 ? '\u2190' : '\u2192'} ${Math.abs(w)}`;
        text(ctx, ws, x, 275, { size: 16, heavy: true, color: INK });
        ctx.restore();
      } else if (g.state === S.TURN_END && g.endReason === 'timeout') {
        const k = U.easeOutBack(Math.min(1, t / 0.25));
        ctx.save();
        ctx.translate(W / 2, 250);
        ctx.scale(k, k);
        text(ctx, 'TIME UP!', 0, 0, { size: 60, heavy: true, color: '#ff8a7a', stroke: OUT, lw: 12 });
        ctx.restore();
      } else if (g.state === S.HIT_RESOLUTION && g.winner !== null) {
        const k = U.easeOutBack(Math.min(1, t / 0.3));
        ctx.save();
        ctx.translate(W / 2, 240);
        ctx.scale(k, k);
        ctx.rotate(-0.05);
        text(ctx, 'K.O.!', 0, 0, { size: 96, heavy: true, color: YELLOW, stroke: OUT, lw: 16 });
        ctx.restore();
      }
    }

    // ================================================================ screens
    _dim(ctx, a) { ctx.fillStyle = `rgba(20, 12, 8, ${a})`; ctx.fillRect(0, 0, W, H); }

    _logo(ctx, y, s) {
      ctx.save();
      ctx.translate(W / 2, y);
      ctx.scale(s, s);
      ctx.rotate(-0.03);
      text(ctx, 'OVER THE WALL', 4, 6, { size: 84, heavy: true, color: 'rgba(42,29,23,0.6)' });
      text(ctx, 'OVER THE WALL', 0, 0, { size: 84, heavy: true, color: YELLOW, stroke: OUT, lw: 16 });
      ctx.rotate(0.03);
      rr(ctx, -170, 52, 340, 34, 12);
      ctx.fillStyle = '#e0453a'; ctx.fill(); ctx.lineWidth = 3.5; ctx.strokeStyle = OUT; ctx.stroke();
      text(ctx, 'BACKYARD ARTILLERY DUEL', 0, 70, { size: 17, heavy: true, color: INK });
      ctx.restore();
    }

    _drawTitle(ctx) {
      this._dim(ctx, 0.25);
      this._logo(ctx, 190 + Math.sin(this.time * 1.5) * 4, 1);
      const a = 0.55 + 0.45 * Math.sin(this.time * 4);
      ctx.globalAlpha = a;
      text(ctx, 'CLICK, TAP OR PRESS ANY KEY', W / 2, 420, { size: 26, heavy: true, color: INK, stroke: OUT, lw: 7 });
      ctx.globalAlpha = 1;
      text(ctx, 'ROCCO the raccoon  vs  HAZEL the squirrel', W / 2, 470, { size: 17, color: INK, stroke: OUT, lw: 5 });
    }

    _menuButton(ctx, b) {
      const focused = this.app.ui.focusId === b.id;
      const small = b.small;
      const y = b.y - (focused ? 3 : 0);
      rr(ctx, b.x + 3, b.y + 5, b.w, b.h, 16);
      ctx.fillStyle = 'rgba(42,29,23,0.55)'; ctx.fill();
      rr(ctx, b.x, y, b.w, b.h, 16);
      ctx.fillStyle = focused ? YELLOW : small ? '#d8c8b4' : '#fff4e0';
      ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = OUT; ctx.stroke();
      if (b.sub) {
        text(ctx, b.label, b.x + b.w / 2, y + 23, { size: 24, heavy: true, color: OUT });
        text(ctx, b.sub, b.x + b.w / 2, y + 46, { size: 14, color: '#6b5242' });
      } else {
        text(ctx, b.label, b.x + b.w / 2, y + b.h / 2 + 1, { size: small ? 20 : 24, heavy: true, color: OUT });
      }
      if (focused) {
        const ax = b.x - 22 + Math.sin(this.time * 8) * 3;
        ctx.beginPath();
        ctx.moveTo(ax, y + b.h / 2 - 10); ctx.lineTo(ax + 14, y + b.h / 2); ctx.lineTo(ax, y + b.h / 2 + 10); ctx.closePath();
        ctx.fillStyle = YELLOW; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.stroke();
      }
    }

    _card(ctx, x, y, w, h) {
      rr(ctx, x + 5, y + 7, w, h, 22);
      ctx.fillStyle = 'rgba(20, 12, 8, 0.45)'; ctx.fill();
      rr(ctx, x, y, w, h, 22);
      ctx.fillStyle = 'rgba(49, 33, 24, 0.94)'; ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = OUT; ctx.stroke();
      rr(ctx, x + 6, y + 6, w - 12, h - 12, 18);
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255, 210, 63, 0.35)'; ctx.stroke();
    }

    _drawModeSelect(ctx, list) {
      this._dim(ctx, 0.25);
      this._logo(ctx, 150, 0.95);
      this._card(ctx, 420, 290, 440, 256);
      for (const b of list) if (b.kind === 'menu') this._menuButton(ctx, b);
      text(ctx, 'ARROWS + ENTER  /  CLICK  /  TAP', W / 2, 580, { size: 14, heavy: true, color: INK, stroke: OUT, lw: 5 });
    }

    _drawDifficulty(ctx, list) {
      this._dim(ctx, 0.35);
      text(ctx, 'CHOOSE CPU LEVEL', W / 2, 150, { size: 44, heavy: true, color: YELLOW, stroke: OUT, lw: 10 });
      text(ctx, 'You play HAZEL (right).  CPU plays ROCCO (left).', W / 2, 200, { size: 18, color: INK, stroke: OUT, lw: 5 });
      this._card(ctx, 410, 234, 460, 342);
      for (const b of list) if (b.kind === 'menu') this._menuButton(ctx, b);
    }

    _drawHowTo(ctx, list) {
      this._dim(ctx, 0.45);
      const x = 140, y = 72, w = 1000, h = 636;
      this._card(ctx, x, y, w, h);
      text(ctx, 'HOW TO PLAY', W / 2, y + 40, { size: 36, heavy: true, color: YELLOW, stroke: OUT, lw: 8 });
      const rules = [
        '바람을 확인하라.  (상단 WIND 숫자 · 담장 위 깃발)',
        '버튼을 누르고 있으면 힘이 증가한다.',
        '원하는 힘에서 손을 떼면 투척한다.',
        '담장을 넘겨 상대를 맞혀라.',
        '각 특수능력은 한 번만 사용할 수 있다.',
        '상대 HP를 먼저 0으로 만들면 승리한다.',
      ];
      rules.forEach((r, i) => {
        const ry = y + 92 + i * 36;
        ctx.beginPath(); ctx.arc(x + 70, ry, 14, 0, TAU); ctx.fillStyle = YELLOW; ctx.fill();
        ctx.lineWidth = 2.5; ctx.strokeStyle = OUT; ctx.stroke();
        text(ctx, String(i + 1), x + 70, ry + 1, { size: 15, heavy: true, color: OUT });
        text(ctx, r, x + 98, ry + 1, { size: 21, align: 'left', color: INK });
      });
      // controls
      const cy = y + 316;
      rr(ctx, x + 50, cy, w - 100, 74, 12);
      ctx.fillStyle = 'rgba(255, 244, 224, 0.08)'; ctx.fill();
      text(ctx, '마우스·터치 누르기 또는 SPACE 홀드  →  떼면 투척', x + 72, cy + 22, { size: 18, align: 'left', color: INK });
      text(ctx, '1~4 키 또는 버튼: 특수능력 선택 (다시 누르면 취소)   ·   ESC: 일시정지   ·   M: 소리', x + 72, cy + 52, { size: 16, align: 'left', color: '#e8d7c2' });
      // specials legend
      const B = this.B;
      const items = [
        ['double', '같은 힘으로 두 발 연속'],
        ['power', `큰 투척물 · 피해 ${B.powerThrowDamage}`],
        ['stink', `냄새 폭탄 · 피해 ${B.stinkDamage}`],
        ['heal', `HP ${B.healAmount} 회복 (턴 사용)`],
      ];
      const ly = y + 410;
      items.forEach(([key, desc], i) => {
        const ix = x + 70 + i * 225;
        const info = OTW.UI.SPECIAL_INFO[key];
        rr(ctx, ix, ly, 52, 52, 10);
        ctx.fillStyle = info.color; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.stroke();
        ctx.save(); ctx.translate(ix + 26, ly + 26); ctx.scale(0.8, 0.8); this._specialIcon(ctx, 'hazel', key, 0, 0); ctx.restore();
        text(ctx, info.name, ix + 62, ly + 16, { size: 15, heavy: true, align: 'left', color: info.color });
        text(ctx, desc, ix + 62, ly + 38, { size: 14, align: 'left', color: INK });
      });
      text(ctx, `일반 투척 피해 ${B.normalDamage}  ·  제한시간 ${B.turnDuration}초  ·  빗나간 곳의 X 표시와 게이지의 LAST 표시를 보고 힘을 보정하라.`, W / 2, y + 496, { size: 15, color: '#c9b8a6' });
      for (const b of list) if (b.kind === 'menu') this._menuButton(ctx, b);
    }

    _drawGameOver(ctx, list) {
      const g = this.game;
      const t = g.stateTime;
      const k = U.easeOutBack(Math.min(1, t / 0.4));
      this._dim(ctx, Math.min(0.35, t * 0.5));
      ctx.save();
      ctx.translate(W / 2, 330);
      ctx.scale(k, k);
      ctx.translate(-W / 2, -330);
      this._card(ctx, 360, 170, 560, 340);
      const res = g.resultText();
      const lose = res === 'YOU LOSE';
      text(ctx, res, W / 2, 238, { size: 62, heavy: true, color: lose ? '#ff8a7a' : YELLOW, stroke: OUT, lw: 12 });
      const wp = g.players[g.winner];
      text(ctx, `${g.charName(g.winner)} wins with ${wp.hp} HP left`, W / 2, 292, { size: 19, color: INK });
      for (let i = 0; i < 2; i++) {
        const st = g.players[i].stats;
        const pct = st.throws ? Math.round((100 * st.hits) / st.throws) : 0;
        const sx = i === 0 ? W / 2 - 130 : W / 2 + 130;
        text(ctx, `${g.tagOf(i)} · ${g.charName(i)}`, sx, 334, { size: 15, heavy: true, color: i === 0 ? '#7fb2ff' : '#ffb36b' });
        text(ctx, `HITS ${st.hits}/${st.throws}  (${pct}%)`, sx, 360, { size: 17, color: INK });
        text(ctx, `DAMAGE ${st.damage}`, sx, 384, { size: 14, color: '#c9b8a6' });
      }
      ctx.restore();
      for (const b of list) if (b.kind === 'menu') this._menuButton(ctx, b);
    }

    _drawPause(ctx, list) {
      this._dim(ctx, 0.55);
      this._card(ctx, 430, 220, 420, 290);
      text(ctx, 'PAUSED', W / 2, 280, { size: 44, heavy: true, color: YELLOW, stroke: OUT, lw: 10 });
      for (const b of list) if (b.kind === 'menu') this._menuButton(ctx, b);
    }
  }

  OTW.Renderer = Renderer;
  OTW.font = font;
})(typeof window !== 'undefined' ? window : globalThis);
