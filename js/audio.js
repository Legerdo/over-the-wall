/*
 * Synthesized sound effects (Web Audio API) - no audio files.
 * The context is created on the first user gesture (browser autoplay rules).
 */
(function (root) {
  'use strict';
  const OTW = root.OTW || (root.OTW = {});

  class AudioEngine {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.noiseBuf = null;
      this.charge = null;
      let m = false;
      try { m = root.localStorage && root.localStorage.getItem('otw-muted') === '1'; } catch (e) { m = false; }
      this.muted = m;
    }

    unlock() {
      if (!this.ctx) {
        const AC = root.AudioContext || root.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.55;
        this.master.connect(this.ctx.destination);
        const len = this.ctx.sampleRate;
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    }

    setMuted(m) {
      this.muted = !!m;
      try { root.localStorage && root.localStorage.setItem('otw-muted', this.muted ? '1' : '0'); } catch (e) { /* ignore */ }
      if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.55, this.ctx.currentTime, 0.02);
    }

    get ready() { return !!this.ctx && this.ctx.state === 'running'; }

    tone(o) {
      if (!this.ready) return;
      const c = this.ctx;
      const t0 = c.currentTime + (o.delay || 0);
      const dur = o.dur || 0.1;
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = o.type || 'sine';
      osc.frequency.setValueAtTime(o.f0 || 440, t0);
      if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t0 + dur);
      const v = o.vol === undefined ? 0.3 : o.vol;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t0 + (o.attack || 0.005));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(this.master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    }

    noise(o) {
      if (!this.ready) return;
      const c = this.ctx;
      const t0 = c.currentTime + (o.delay || 0);
      const dur = o.dur || 0.15;
      const src = c.createBufferSource();
      src.buffer = this.noiseBuf;
      const f = c.createBiquadFilter();
      f.type = o.filter || 'lowpass';
      f.frequency.setValueAtTime(o.f0 || 800, t0);
      if (o.f1) f.frequency.exponentialRampToValueAtTime(Math.max(30, o.f1), t0 + dur);
      f.Q.value = o.q || 1;
      const g = c.createGain();
      const v = o.vol === undefined ? 0.3 : o.vol;
      g.gain.setValueAtTime(Math.max(0.0002, v), t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start(t0, Math.random() * 0.5);
      src.stop(t0 + dur + 0.02);
    }

    play(name, arg) {
      if (!this.ready) return;
      switch (name) {
        case 'ui': this.tone({ type: 'square', f0: 660, dur: 0.05, vol: 0.08 }); break;
        case 'select': this.tone({ type: 'triangle', f0: 520, f1: 900, dur: 0.1, vol: 0.2 }); break;
        case 'deselect': this.tone({ type: 'triangle', f0: 700, f1: 380, dur: 0.1, vol: 0.18 }); break;
        case 'denied': this.tone({ type: 'square', f0: 170, f1: 130, dur: 0.14, vol: 0.12 }); break;
        case 'turn': this.tone({ type: 'triangle', f0: 440, f1: 660, dur: 0.12, vol: 0.14 }); break;
        case 'throw':
          this.noise({ filter: 'bandpass', f0: 500, f1: 2200, q: 2, dur: 0.2, vol: 0.35 });
          this.tone({ type: 'triangle', f0: 260, f1: 520, dur: 0.1, vol: 0.12 });
          break;
        case 'throwPower':
          this.noise({ filter: 'bandpass', f0: 300, f1: 1400, q: 1.5, dur: 0.3, vol: 0.5 });
          this.tone({ type: 'sawtooth', f0: 110, f1: 220, dur: 0.18, vol: 0.12 });
          break;
        case 'hit':
          this.tone({ type: 'sine', f0: 190, f1: 55, dur: 0.24, vol: 0.7 });
          this.noise({ filter: 'lowpass', f0: 1800, f1: 300, dur: 0.14, vol: 0.45 });
          this.tone({ type: 'square', f0: 900, f1: 260, dur: 0.09, vol: 0.07, delay: 0.02 });
          break;
        case 'hitPower':
          this.tone({ type: 'sine', f0: 150, f1: 38, dur: 0.42, vol: 0.9 });
          this.noise({ filter: 'lowpass', f0: 2200, f1: 200, dur: 0.3, vol: 0.6 });
          this.tone({ type: 'square', f0: 600, f1: 120, dur: 0.16, vol: 0.08, delay: 0.03 });
          break;
        case 'hitStink':
          this.noise({ filter: 'lowpass', f0: 900, f1: 200, dur: 0.25, vol: 0.5 });
          this.tone({ type: 'sawtooth', f0: 140, f1: 70, dur: 0.45, vol: 0.14 });
          this.tone({ type: 'sawtooth', f0: 147, f1: 74, dur: 0.45, vol: 0.12 });
          break;
        case 'wall':
          this.noise({ filter: 'highpass', f0: 1400, dur: 0.09, vol: 0.4 });
          this.tone({ type: 'square', f0: 240, f1: 160, dur: 0.08, vol: 0.12 });
          this.tone({ type: 'triangle', f0: 1200, f1: 700, dur: 0.06, vol: 0.08 });
          break;
        case 'ground':
          this.noise({ filter: 'lowpass', f0: 600, f1: 150, dur: 0.22, vol: 0.4 });
          break;
        case 'tauntRocco':
          this.tone({ type: 'square', f0: 430, f1: 380, dur: 0.09, vol: 0.09 });
          this.tone({ type: 'square', f0: 400, f1: 350, dur: 0.09, vol: 0.09, delay: 0.15 });
          this.tone({ type: 'square', f0: 380, f1: 320, dur: 0.11, vol: 0.09, delay: 0.3 });
          break;
        case 'tauntHazel':
          this.tone({ type: 'triangle', f0: 780, f1: 520, dur: 0.14, vol: 0.18 });
          this.tone({ type: 'triangle', f0: 740, f1: 480, dur: 0.18, vol: 0.18, delay: 0.18 });
          break;
        case 'heal':
          [523, 659, 784, 1047].forEach((f, i) => this.tone({ type: 'sine', f0: f, dur: 0.18, vol: 0.2, delay: i * 0.07 }));
          break;
        case 'tick':
          this.tone({ type: 'square', f0: arg === 1 ? 1100 : 880, dur: 0.05, vol: 0.1 });
          break;
        case 'timeout':
          this.tone({ type: 'square', f0: 320, f1: 140, dur: 0.35, vol: 0.14 });
          break;
        case 'ko':
          this.tone({ type: 'sine', f0: 110, f1: 30, dur: 0.7, vol: 0.8 });
          this.noise({ filter: 'lowpass', f0: 1200, f1: 100, dur: 0.6, vol: 0.5 });
          break;
        case 'win':
          [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone({ type: 'triangle', f0: f, dur: i === 4 ? 0.5 : 0.16, vol: 0.2, delay: 0.25 + i * 0.11 }));
          break;
        case 'lose':
          [392, 330, 262, 196].forEach((f, i) => this.tone({ type: 'triangle', f0: f, dur: i === 3 ? 0.5 : 0.2, vol: 0.18, delay: 0.25 + i * 0.16 }));
          break;
        default: break;
      }
    }

    startCharge() {
      if (!this.ready) return;
      this.stopCharge();
      const c = this.ctx;
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = 'triangle';
      osc.frequency.value = 200;
      g.gain.setValueAtTime(0.0001, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.06, c.currentTime + 0.05);
      osc.connect(g); g.connect(this.master);
      osc.start();
      this.charge = { osc, g };
    }

    /** Rising pitch = rising power: an audible cue to help repeat a power. */
    setChargePower(p) {
      if (!this.charge) return;
      this.charge.osc.frequency.setTargetAtTime(200 + p * 700, this.ctx.currentTime, 0.015);
    }

    stopCharge() {
      if (!this.charge) return;
      const { osc, g } = this.charge;
      const t = this.ctx.currentTime;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      osc.stop(t + 0.06);
      this.charge = null;
    }
  }

  OTW.AudioEngine = AudioEngine;
})(typeof window !== 'undefined' ? window : globalThis);
