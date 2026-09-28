/*
 * Visual effects layer: particles, impact markers, fading trajectories, speech
 * bubbles, floating numbers, screen shake, ambient wind (leaves + clouds).
 * Purely cosmetic: listens to game events, never changes game state.
 */
(function (root) {
  'use strict';
  const OTW = root.OTW || (root.OTW = {});
  const U = OTW.Util;
  const TAU = Math.PI * 2;

  class FX {
    constructor(game, opts) {
      this.game = game;
      this.B = game.B;
      this.reducedMotion = !!(opts && opts.reducedMotion);
      this.particles = [];
      this.trails = [];
      this.markers = [];
      this.bubbles = [];
      this.floaters = [];
      this.rings = [];
      this.shakeAmp = 0;
      this.shakeT = 0;
      this.flash = 0;
      this.displayWind = 0;
      this.windPop = 0;
      this.time = 0;
      this.leaves = [];
      const W = this.B.world.width;
      for (let i = 0; i < 18; i++) {
        this.leaves.push({
          x: Math.random() * W, y: 120 + Math.random() * 420,
          phase: Math.random() * TAU, size: 4 + Math.random() * 3,
          color: ['#e0a13a', '#c8642b', '#a8b84a', '#d98a3d'][i % 4],
          speed: 0.7 + Math.random() * 0.6,
        });
      }
      this.clouds = [];
      for (let i = 0; i < 6; i++) {
        this.clouds.push({ x: (i / 6) * 1500 - 100, y: 70 + ((i * 53) % 170), s: 0.6 + ((i * 37) % 50) / 100 });
      }
      this._bind();
    }

    _bind() {
      const g = this.game;
      g.on('impact', (e) => this._onImpact(e));
      g.on('hit', (e) => this._onHit(e));
      g.on('taunt', (e) => this._say(e.player, this._pick(OTW.Characters.LINES[g.players[e.player].charId].taunt), '#fff4d6', 1.0));
      g.on('heal', (e) => this._onHeal(e));
      g.on('timeout', (e) => this._say(e.player, OTW.Characters.LINES[g.players[e.player].charId].timeout, '#ffffff', 0.9));
      g.on('windChange', () => { this.windPop = 1; });
      g.on('spawn', (e) => { if (e.proj.kind === 'power') this.flash = 0.15; });
      g.on('gameOver', (e) => this._onGameOver(e));
      g.on('roundStart', () => this.clear());
      g.on('state', (e) => { if (e.state === 'MODE_SELECT') this.clear(); });
    }

    clear() {
      this.particles.length = 0;
      this.trails.length = 0;
      this.markers.length = 0;
      this.bubbles.length = 0;
      this.floaters.length = 0;
      this.rings.length = 0;
      this.shakeAmp = 0;
    }

    _pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

    _say(playerIndex, text, color, dur) {
      this.bubbles = this.bubbles.filter((b) => b.player !== playerIndex);
      this.bubbles.push({ player: playerIndex, text, color: color || '#ffffff', t: 0, dur: dur || 1 });
    }

    shake(amount) {
      if (this.reducedMotion) return;
      this.shakeAmp = Math.max(this.shakeAmp, amount);
    }

    _keepTrail(proj) {
      this.trails.push({ points: proj.trail.slice(), owner: proj.owner, kind: proj.kind, t: 0 });
    }

    _marker(x, y, color) {
      this.markers.push({ x, y, t: 0, color: color || '#ffffff' });
    }

    _burst(x, y, n, opt) {
      for (let i = 0; i < n; i++) {
        const a = opt.angle !== undefined ? opt.angle + (Math.random() - 0.5) * (opt.spread || TAU) : Math.random() * TAU;
        const sp = (opt.speed || 120) * (0.4 + Math.random() * 0.8);
        this.particles.push({
          type: opt.type || 'dot', x, y,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (opt.lift || 0),
          g: opt.gravity !== undefined ? opt.gravity : 400,
          drag: opt.drag || 0.9,
          life: 0, maxLife: (opt.life || 0.6) * (0.7 + Math.random() * 0.6),
          size: (opt.size || 4) * (0.6 + Math.random() * 0.8),
          color: Array.isArray(opt.color) ? opt.color[i % opt.color.length] : opt.color,
          rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 12,
          grow: opt.grow || 0,
        });
      }
    }

    _onImpact(e) {
      const surface = e.surface;
      this._keepTrail(e.proj);
      if (surface === 'wall') {
        this._burst(e.x, e.y, 12, { type: 'chip', color: ['#b5543c', '#d9785a', '#8f8a86'], speed: 220, gravity: 700, life: 0.7, size: 5, angle: e.proj.vx > 0 ? Math.PI : 0, spread: 2.4 });
        this._burst(e.x, e.y, 6, { type: 'puff', color: 'rgba(230,210,190,0.8)', speed: 50, gravity: -20, life: 0.6, size: 9, grow: 18 });
        this._marker(e.x, e.y, '#ffd23f');
        this.rings.push({ x: e.x, y: e.y, t: 0, dur: 0.35, r: 26, color: '#ffe9b0' });
      } else if (surface === 'ground') {
        const gy = this.B.world.groundY;
        this._burst(e.x, gy - 2, 12, { type: 'puff', color: ['rgba(196,160,110,0.85)', 'rgba(170,135,90,0.8)'], speed: 90, gravity: -10, life: 0.8, size: 8, grow: 20, angle: -Math.PI / 2, spread: 2.6 });
        this._burst(e.x, gy - 2, 6, { type: 'chip', color: ['#7a5236', '#6bab4a'], speed: 160, gravity: 800, life: 0.5, size: 3.5, angle: -Math.PI / 2, spread: 1.6 });
        this._marker(e.x, gy - 4, '#ffffff');
      } else if (surface === 'target') {
        this._burst(e.x, e.y, 6, { type: 'star', color: '#ffd23f', speed: 140, life: 0.5, size: 6 });
      }
      if (e.kind === 'stink' && surface !== 'out') {
        this._burst(e.x, e.y, 10, { type: 'puff', color: ['rgba(140,200,70,0.7)', 'rgba(110,170,50,0.6)'], speed: 40, gravity: -30, life: 1.2, size: 10, grow: 26 });
      }
    }

    _onHit(e) {
      const g = this.game;
      const target = g.players[e.target];
      const cid = target.charId;
      this._keepTrail(e.proj);
      const big = e.kind === 'power' || e.lethal;
      this._burst(e.x, e.y, big ? 16 : 10, { type: 'star', color: ['#ffd23f', '#ffffff', '#ff9f43'], speed: big ? 260 : 190, gravity: 300, life: 0.7, size: big ? 8 : 6 });
      this.rings.push({ x: e.x, y: e.y, t: 0, dur: 0.4, r: big ? 60 : 40, color: '#ffffff' });
      // numbers go on the outer side, speech bubbles on the inner side
      const out = target.index === 0 ? -1 : 1;
      this.floaters.push({ x: target.x + out * 46, y: this.B.world.groundY - 138, text: '-' + e.damage, color: '#ff5b4a', t: 0, dur: 1.1, size: big ? 40 : 32 });
      if (e.kind === 'stink') {
        this._burst(e.x, e.y, 18, { type: 'puff', color: ['rgba(140,200,70,0.75)', 'rgba(110,170,50,0.65)', 'rgba(180,220,90,0.6)'], speed: 70, gravity: -35, life: 1.4, size: 11, grow: 30 });
        this._say(e.target, this._pick(OTW.Characters.LINES[cid].stink), '#e9ffd0', 1.0);
      } else {
        this._say(e.target, this._pick(OTW.Characters.LINES[cid].hit), '#ffffff', 0.8);
      }
      this.shake(e.lethal ? 10 : e.kind === 'power' ? 8 : 4.5);
      if (e.kind === 'power' || e.lethal) this.flash = 0.2;
    }

    _onHeal(e) {
      const p = this.game.players[e.player];
      const gy = this.B.world.groundY;
      this._burst(p.x, gy - 60, 14, { type: 'heart', color: ['#ff5c8a', '#ff8fb0'], speed: 60, gravity: -90, life: 1.1, size: 7 });
      this._burst(p.x, gy - 60, 16, { type: 'spark', color: ['#fff6a8', '#ffffff'], speed: 110, gravity: -40, life: 0.8, size: 4 });
      const out = p.index === 0 ? -1 : 1;
      this.floaters.push({ x: p.x + out * 46, y: gy - 138, text: '+' + e.amount, color: '#62e27a', t: 0, dur: 1.1, size: 34 });
      this._say(e.player, this._pick(OTW.Characters.LINES[p.charId].heal), '#ffe3ee', 0.9);
    }

    _onGameOver(e) {
      const p = this.game.players[e.winner];
      this._say(e.winner, OTW.Characters.LINES[p.charId].win, '#fff4d6', 2.5);
      for (let i = 0; i < 3; i++) {
        this._burst(p.x, 200, 20, { type: 'confetti', color: ['#ffd23f', '#ff5c8a', '#4fa3ff', '#8bc34a', '#ff7a3d'], speed: 260, gravity: 260, life: 2.2, size: 6, drag: 0.8 });
      }
    }

    update(dt) {
      this.time += dt;
      const g = this.game;
      const k = 1 - Math.exp(-dt * 3);
      this.displayWind += (g.wind - this.displayWind) * k;
      this.windPop = Math.max(0, this.windPop - dt * 2.5);
      this.flash = Math.max(0, this.flash - dt);
      if (this.shakeAmp > 0) { this.shakeT += dt; this.shakeAmp = Math.max(0, this.shakeAmp - dt * 30); }

      for (const p of this.particles) {
        p.life += dt;
        p.vx *= Math.pow(p.drag, dt * 10);
        p.vy = p.vy * Math.pow(p.drag, dt * 10) + p.g * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        if (p.type === 'chip' && p.y > this.B.world.groundY - 2) { p.y = this.B.world.groundY - 2; p.vy *= -0.3; p.vx *= 0.6; }
      }
      this.particles = this.particles.filter((p) => p.life < p.maxLife);
      for (const arr of [this.trails, this.markers, this.bubbles, this.floaters, this.rings]) for (const o of arr) o.t += dt;
      this.trails = this.trails.filter((o) => o.t < this.B.trailFadeDuration);
      this.markers = this.markers.filter((o) => o.t < this.B.impactMarkerDuration);
      this.bubbles = this.bubbles.filter((o) => o.t < o.dur);
      this.floaters = this.floaters.filter((o) => o.t < o.dur);
      this.rings = this.rings.filter((o) => o.t < o.dur);

      // stink projectiles leave a green puff trail
      for (const pr of g.projectiles) {
        if (pr.kind === 'stink' && Math.random() < dt * 30) {
          this._burst(pr.x, pr.y, 1, { type: 'puff', color: 'rgba(140,200,70,0.55)', speed: 10, gravity: -15, life: 0.7, size: 5, grow: 12 });
        }
      }

      // ambient leaves follow the (smoothed) wind
      const W = this.B.world.width;
      const wv = this.displayWind * 2.2;
      for (const l of this.leaves) {
        l.phase += dt * 2 * l.speed;
        l.x += (wv * l.speed + Math.sin(l.phase) * 12) * dt;
        l.y += (Math.cos(l.phase * 0.7) * 18 + 10 - Math.abs(wv) * 0.03) * dt;
        if (l.x > W + 20) l.x = -20;
        if (l.x < -20) l.x = W + 20;
        if (l.y > this.B.world.groundY - 10) l.y = 110 + Math.random() * 60;
        if (l.y < 100) l.y = 100;
      }
      for (const c of this.clouds) {
        c.x += (this.displayWind * 0.35 + 5) * c.s * dt;
        if (c.x > 1420) c.x = -160;
        if (c.x < -160) c.x = 1420;
      }
    }

    shakeOffset() {
      if (this.shakeAmp <= 0.05) return { x: 0, y: 0 };
      const a = this.shakeAmp;
      return { x: Math.sin(this.shakeT * 90) * a, y: Math.cos(this.shakeT * 73) * a * 0.6 };
    }

    // --------------------------------------------------------------- drawing
    drawClouds(ctx) {
      for (const c of this.clouds) {
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.scale(c.s, c.s);
        ctx.fillStyle = 'rgba(255, 246, 232, 0.85)';
        ctx.beginPath();
        ctx.arc(-40, 8, 26, 0, TAU);
        ctx.arc(-10, -8, 34, 0, TAU);
        ctx.arc(28, 4, 28, 0, TAU);
        ctx.arc(55, 14, 18, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(246, 205, 170, 0.5)';
        ctx.fillRect(-66, 14, 138, 18);
        ctx.restore();
      }
    }

    drawLeaves(ctx) {
      for (const l of this.leaves) {
        ctx.save();
        ctx.translate(l.x, l.y);
        ctx.rotate(l.phase + this.displayWind * 0.01);
        ctx.fillStyle = l.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, l.size, l.size * 0.5, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    }

    drawTrails(ctx) {
      for (const tr of this.trails) {
        const a = 1 - tr.t / this.B.trailFadeDuration;
        this._dots(ctx, tr.points, a * 0.8, tr.owner);
      }
      for (const pr of this.game.projectiles) this._dots(ctx, pr.trail, 0.8, pr.owner);
    }

    _dots(ctx, pts, alpha, owner) {
      if (alpha <= 0) return;
      ctx.fillStyle = owner === 0 ? `rgba(215, 225, 255, ${alpha})` : `rgba(255, 226, 170, ${alpha})`;
      for (let i = 0; i < pts.length; i += 2) {
        ctx.beginPath();
        ctx.arc(pts[i].x, pts[i].y, 2.2, 0, TAU);
        ctx.fill();
      }
    }

    drawMarkers(ctx) {
      for (const m of this.markers) {
        const u = m.t / this.B.impactMarkerDuration;
        const a = 1 - u;
        ctx.save();
        ctx.translate(m.x, m.y);
        ctx.strokeStyle = `rgba(42, 29, 23, ${a})`;
        ctx.lineWidth = 5;
        const s = 9;
        ctx.beginPath(); ctx.moveTo(-s, -s); ctx.lineTo(s, s); ctx.moveTo(s, -s); ctx.lineTo(-s, s); ctx.stroke();
        ctx.strokeStyle = m.color === '#ffffff' ? `rgba(255,255,255,${a})` : `rgba(255,210,63,${a})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(-s, -s); ctx.lineTo(s, s); ctx.moveTo(s, -s); ctx.lineTo(-s, s); ctx.stroke();
        ctx.restore();
      }
      for (const r of this.rings) {
        const u = r.t / r.dur;
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.r * U.easeOutCubic(u), 0, TAU);
        ctx.strokeStyle = r.color;
        ctx.globalAlpha = 1 - u;
        ctx.lineWidth = 4 * (1 - u) + 1;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    drawParticles(ctx) {
      const Ch = OTW.Characters;
      for (const p of this.particles) {
        const u = p.life / p.maxLife;
        const a = 1 - u;
        ctx.save();
        ctx.globalAlpha = Math.max(0, a);
        ctx.translate(p.x, p.y);
        switch (p.type) {
          case 'puff':
            ctx.fillStyle = p.color;
            ctx.beginPath(); ctx.arc(0, 0, p.size + p.grow * u, 0, TAU); ctx.fill();
            break;
          case 'chip':
          case 'confetti':
            ctx.rotate(p.rot);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * (p.type === 'confetti' ? 0.5 : 0.7));
            break;
          case 'star':
            ctx.rotate(p.rot);
            Ch.drawStar(ctx, 0, 0, p.size, p.color);
            break;
          case 'heart':
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.moveTo(0, p.size * 0.8);
            ctx.bezierCurveTo(-p.size * 1.4, -p.size * 0.2, -p.size * 0.6, -p.size * 1.2, 0, -p.size * 0.4);
            ctx.bezierCurveTo(p.size * 0.6, -p.size * 1.2, p.size * 1.4, -p.size * 0.2, 0, p.size * 0.8);
            ctx.fill();
            break;
          default:
            ctx.fillStyle = p.color;
            ctx.beginPath(); ctx.arc(0, 0, p.size, 0, TAU); ctx.fill();
        }
        ctx.restore();
      }
    }

    drawFloaters(ctx, font) {
      for (const f of this.floaters) {
        const u = f.t / f.dur;
        const y = f.y - U.easeOutCubic(Math.min(1, u * 1.5)) * 40;
        const s = u < 0.15 ? U.easeOutBack(u / 0.15) : 1;
        ctx.save();
        ctx.globalAlpha = u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1;
        ctx.translate(f.x, y);
        ctx.scale(s, s);
        ctx.font = font(f.size);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 7;
        ctx.strokeStyle = '#2a1d17';
        ctx.strokeText(f.text, 0, 0);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, 0, 0);
        ctx.restore();
      }
    }

    drawBubbles(ctx, font) {
      const gy = this.B.world.groundY;
      for (const b of this.bubbles) {
        const p = this.game.players[b.player];
        const u = b.t / b.dur;
        const s = b.t < 0.12 ? U.easeOutBack(b.t / 0.12) : 1;
        const alpha = u > 0.85 ? 1 - (u - 0.85) / 0.15 : 1;
        const dir = p.index === 0 ? 1 : -1;
        const x = p.x + dir * 58;
        const y = gy - 150;
        ctx.save();
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.translate(x, y);
        ctx.scale(s, s);
        ctx.font = font(20);
        const w = Math.max(64, ctx.measureText(b.text).width + 26);
        const h = 38;
        ctx.beginPath();
        roundRect(ctx, -w / 2, -h / 2, w, h, 14);
        ctx.moveTo(-dir * 10, h / 2 - 1);
        ctx.lineTo(-dir * 26, h / 2 + 14);
        ctx.lineTo(-dir * 22, h / 2 - 1);
        ctx.fillStyle = b.color;
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#2a1d17';
        ctx.stroke();
        ctx.fillStyle = '#2a1d17';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(b.text, 0, 1);
        ctx.restore();
      }
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  OTW.FX = FX;
  OTW.roundRect = roundRect;
})(typeof window !== 'undefined' ? window : globalThis);
