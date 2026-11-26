// audio.js — every sound in Meridian Run is synthesized with WebAudio.
// No audio files, no network: an engine hum whose pitch follows the
// throttle, wind noise that grows with speed, and short beeps and chimes
// for rings, landings and warnings. Audio starts only after a user
// gesture, as browsers require.

/** The sound engine. Call ensure() from a user gesture, then the rest is safe. */
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.windSrc = null;
    this.windGain = null;
    this.windFilter = null;
    this.enabled = true;
  }

  /** Create the context and the always-on engine/wind nodes (idempotent). */
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;

    // Engine: two detuned oscillators through a low-pass, gain by throttle.
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 58;
    const osc2 = ctx.createOscillator();
    osc2.type = 'square';
    osc2.frequency.value = 29;
    const g2 = ctx.createGain();
    g2.gain.value = 0.4;
    this.engineOsc.connect(filter);
    osc2.connect(g2);
    g2.connect(filter);
    filter.connect(this.engineGain);
    this.engineGain.connect(ctx.destination);
    this.engineOsc.start();
    osc2.start();
    this.engineOsc2 = osc2;

    // Wind: looped noise buffer through a band-pass filter.
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.windSrc = ctx.createBufferSource();
    this.windSrc.buffer = buf;
    this.windSrc.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 700;
    this.windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    this.windSrc.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(ctx.destination);
    this.windSrc.start();
  }

  /** Continuous engine + wind levels from the plane's state. */
  update(throttle, speed, airborne) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const engineLevel = airborne || throttle > 0.05 ? 0.05 + throttle * 0.075 : 0;
    this.engineGain.gain.setTargetAtTime(engineLevel, t, 0.1);
    this.engineOsc.frequency.setTargetAtTime(52 + throttle * 68, t, 0.1);
    this.engineOsc2.frequency.setTargetAtTime(26 + throttle * 34, t, 0.1);
    const wind = Math.min(1, speed / 96) * 0.11;
    this.windGain.gain.setTargetAtTime(airborne ? wind : 0, t, 0.15);
    this.windFilter.frequency.setTargetAtTime(500 + speed * 9, t, 0.15);
  }

  /** Short sine beep. */
  beep(freq, dur = 0.12, vol = 0.16, when = 0) {
    if (!this.ctx || !this.enabled) return;
    const t0 = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g);
    g.connect(this.ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  ring() {
    this.beep(880, 0.1, 0.18);
    this.beep(1318, 0.16, 0.14, 0.09);
  }

  chime() {
    this.beep(523, 0.14, 0.16);
    this.beep(659, 0.14, 0.16, 0.12);
    this.beep(784, 0.22, 0.16, 0.24);
  }

  thud() {
    if (!this.ctx || !this.enabled) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(110, t0);
    osc.frequency.exponentialRampToValueAtTime(38, t0 + 0.25);
    g.gain.setValueAtTime(0.3, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.3);
    osc.connect(g);
    g.connect(this.ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.35);
  }

  warn() {
    this.beep(220, 0.18, 0.14);
    this.beep(220, 0.18, 0.14, 0.2);
  }

  /** Mute or unmute everything (kept for the pause screen toggle). */
  setEnabled(on) {
    this.enabled = on;
    if (this.ctx && this.engineGain) {
      this.engineGain.gain.setTargetAtTime(on ? 0.05 : 0, this.ctx.currentTime, 0.05);
      this.windGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    }
  }
}
