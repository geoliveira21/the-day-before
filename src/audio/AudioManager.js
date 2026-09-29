/**
 * Fully procedural audio (Web Audio API) — no asset files required.
 * Provides generative day/night/combat ambience plus one-shot sound effects.
 */
const A_MINOR = [220, 246.94, 261.63, 293.66, 329.63, 349.23, 392];
const NIGHT_SCALE = [110, 116.54, 130.81, 146.83, 155.56, 174.61];

export class AudioManager {
  constructor(settings = {}) {
    this.ctx = null;
    this.volumes = { master: settings.masterVolume ?? 0.8, music: settings.musicVolume ?? 0.5, sfx: settings.sfxVolume ?? 0.8 };
    this.mode = 'day';
    this.combat = false;
    this.rainLevel = 0;
    this.musicTimer = 0;
    this.heartbeatTimer = 0;
    this.lastFootstep = 0;
  }

  get ready() {
    return !!this.ctx;
  }

  /** Must be called from a user gesture (browser autoplay policy). */
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.musicBus = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    this.setVolumes(this.volumes);

    // Shared white noise buffer.
    const len = ctx.sampleRate * 2;
    this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    // Ambient layers: wind (day), dark drone (night), rain.
    this.wind = this._loopNoise('bandpass', 400, 0.6);
    this.windGain = this._layer(this.wind, this.musicBus, 0.12);
    this._lfo(this.wind.filter.frequency, 0.07, 250);

    const drone = ctx.createOscillator();
    drone.type = 'sawtooth';
    drone.frequency.value = 55;
    const drone2 = ctx.createOscillator();
    drone2.type = 'sine';
    drone2.frequency.value = 82.4;
    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 180;
    drone.connect(droneFilter);
    drone2.connect(droneFilter);
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0;
    droneFilter.connect(this.droneGain).connect(this.musicBus);
    drone.start();
    drone2.start();
    this._lfo(droneFilter.frequency, 0.05, 80);

    this.rain = this._loopNoise('lowpass', 2500, 0.3);
    this.rainGain = this._layer(this.rain, this.sfxBus, 0);
  }

  _loopNoise(type, freq, q) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    src.connect(filter);
    src.start();
    return { src, filter };
  }

  _layer(node, bus, level) {
    const g = this.ctx.createGain();
    g.gain.value = level;
    node.filter.connect(g).connect(bus);
    return g;
  }

  _lfo(param, rate, depth) {
    const osc = this.ctx.createOscillator();
    osc.frequency.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = depth;
    osc.connect(g).connect(param);
    osc.start();
  }

  resume() {
    if (this.ctx?.state === 'suspended') this.ctx.resume();
  }

  suspend() {
    if (this.ctx?.state === 'running') this.ctx.suspend();
  }

  setVolumes({ master, music, sfx }) {
    if (master !== undefined) this.volumes.master = master;
    if (music !== undefined) this.volumes.music = music;
    if (sfx !== undefined) this.volumes.sfx = sfx;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.volumes.master, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.volumes.music, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.volumes.sfx, t, 0.05);
  }

  // ------------------------------------------------------------ primitives
  _noise({ duration = 0.2, type = 'bandpass', freq = 1000, freqEnd = null, q = 1, gain = 0.5, attack = 0.005, rate = 1, bus = this.sfxBus, when = 0 }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = rate;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    if (freqEnd) filter.frequency.exponentialRampToValueAtTime(freqEnd, t + duration);
    filter.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter).connect(g).connect(bus);
    src.start(t, Math.random() * 1.5);
    src.stop(t + duration + 0.05);
  }

  _tone({ freq = 440, freqEnd = null, duration = 0.3, type = 'sine', gain = 0.3, attack = 0.01, bus = this.sfxBus, when = 0, filterFreq = null }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, t + duration);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    let node = osc;
    if (filterFreq) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filterFreq;
      osc.connect(f);
      node = f;
    }
    node.connect(g).connect(bus);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  // ------------------------------------------------------------ SFX
  playFootstep(running = false, wet = false) {
    this._noise({ duration: running ? 0.12 : 0.09, type: 'lowpass', freq: wet ? 1800 : 700, q: 0.7, gain: running ? 0.35 : 0.22, rate: 0.6 + Math.random() * 0.4 });
    if (wet) this._noise({ duration: 0.08, type: 'highpass', freq: 3000, gain: 0.08, when: 0.02 });
  }

  playJump() {
    this._noise({ duration: 0.15, type: 'bandpass', freq: 500, freqEnd: 900, gain: 0.12 });
  }

  playLand(intensity = 1) {
    this._noise({ duration: 0.18, type: 'lowpass', freq: 400, gain: Math.min(0.5, 0.2 * intensity), rate: 0.5 });
  }

  /** Whoosh of a swing (heard on every attack, i.e. also a miss). */
  playSwing(weight = 1) {
    this._noise({ duration: 0.22, type: 'bandpass', freq: 600, freqEnd: 2400, q: 1.5, gain: 0.25 * weight, attack: 0.04 });
  }

  /** Impact on an enemy. */
  playHit(killed = false) {
    this._noise({ duration: 0.15, type: 'lowpass', freq: 900, gain: 0.6, rate: 0.5 });
    this._tone({ freq: 140, freqEnd: 50, duration: 0.18, type: 'triangle', gain: 0.5 });
    this._tone({ freq: killed ? 300 : 420, freqEnd: killed ? 90 : 200, duration: killed ? 0.7 : 0.35, type: 'sawtooth', gain: 0.12, when: 0.03, filterFreq: 900 });
  }

  playPlayerHurt() {
    this._tone({ freq: 90, freqEnd: 40, duration: 0.25, type: 'sine', gain: 0.6 });
    this._noise({ duration: 0.12, type: 'lowpass', freq: 600, gain: 0.4 });
  }

  /** Enemy detects the player. `volume` is 0..1 based on distance. */
  playScream(volume = 1) {
    const base = 500 + Math.random() * 200;
    this._tone({ freq: base, freqEnd: base * 0.45, duration: 0.9, type: 'sawtooth', gain: 0.18 * volume, attack: 0.05, filterFreq: 1800 });
    this._tone({ freq: base * 1.02, freqEnd: base * 0.5, duration: 0.85, type: 'square', gain: 0.06 * volume, attack: 0.05, filterFreq: 1200 });
  }

  playGroan(volume = 1) {
    if (volume < 0.03) return;
    const base = 90 + Math.random() * 40;
    this._tone({ freq: base, freqEnd: base * 0.8, duration: 1.2, type: 'sawtooth', gain: 0.12 * volume, attack: 0.2, filterFreq: 400 });
  }

  playPickup() {
    this._tone({ freq: 660, duration: 0.08, type: 'triangle', gain: 0.2 });
    this._tone({ freq: 990, duration: 0.12, type: 'triangle', gain: 0.18, when: 0.07 });
  }

  playSearch() {
    this._noise({ duration: 0.35, type: 'bandpass', freq: 1200, q: 0.8, gain: 0.18, rate: 0.8 });
  }

  playCraft() {
    this._noise({ duration: 0.1, type: 'highpass', freq: 2000, gain: 0.3 });
    this._noise({ duration: 0.1, type: 'highpass', freq: 2500, gain: 0.3, when: 0.15 });
    this._tone({ freq: 523.25, duration: 0.4, type: 'triangle', gain: 0.2, when: 0.3 });
    this._tone({ freq: 783.99, duration: 0.5, type: 'triangle', gain: 0.18, when: 0.4 });
  }

  playConsume() {
    this._noise({ duration: 0.25, type: 'bandpass', freq: 500, q: 2, gain: 0.25, rate: 0.4 });
  }

  playError() {
    this._tone({ freq: 180, duration: 0.15, type: 'square', gain: 0.1, filterFreq: 800 });
  }

  playUI() {
    this._tone({ freq: 880, duration: 0.05, type: 'sine', gain: 0.1 });
  }

  playThunder() {
    this._noise({ duration: 2.5, type: 'lowpass', freq: 300, freqEnd: 80, gain: 0.7, attack: 0.05, rate: 0.3 });
  }

  playDeath() {
    this._tone({ freq: 220, freqEnd: 55, duration: 2, type: 'sawtooth', gain: 0.25, bus: this.musicBus, filterFreq: 600 });
  }

  // ------------------------------------------------------------ ambience
  setAmbientMode(isNight, inCombat) {
    this.mode = isNight ? 'night' : 'day';
    this.combat = inCombat;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.windGain.gain.setTargetAtTime(isNight ? 0.05 : 0.12, t, 2);
    this.droneGain.gain.setTargetAtTime(isNight ? 0.09 : inCombat ? 0.05 : 0.0, t, 2);
  }

  setRain(level) {
    this.rainLevel = level;
    if (!this.ctx) return;
    this.rainGain.gain.setTargetAtTime(level * 0.22, this.ctx.currentTime, 0.5);
  }

  /** Schedules generative music notes. Call every frame. */
  update(dt) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    this.musicTimer -= dt;
    if (this.musicTimer <= 0) {
      if (this.mode === 'day') {
        // Soft, sparse minor pad chord.
        const root = A_MINOR[Math.floor(Math.random() * 3)];
        for (const [i, mult] of [1, 1.2, 1.5].entries()) {
          this._tone({ freq: root * mult * 0.5, duration: 5, type: 'triangle', gain: 0.05, attack: 1.8, bus: this.musicBus, when: i * 0.15, filterFreq: 900 });
        }
        this.musicTimer = 6 + Math.random() * 5;
      } else {
        // Low bell tones at night.
        const f = NIGHT_SCALE[Math.floor(Math.random() * NIGHT_SCALE.length)];
        this._tone({ freq: f * 2, duration: 4, type: 'sine', gain: 0.07, attack: 0.01, bus: this.musicBus });
        this._tone({ freq: f * 4.02, duration: 2.5, type: 'sine', gain: 0.025, attack: 0.01, bus: this.musicBus });
        this.musicTimer = 4 + Math.random() * 6;
      }
    }
    if (this.combat) {
      this.heartbeatTimer -= dt;
      if (this.heartbeatTimer <= 0) {
        this._tone({ freq: 60, freqEnd: 40, duration: 0.18, type: 'sine', gain: 0.35, bus: this.musicBus });
        this._tone({ freq: 55, freqEnd: 38, duration: 0.18, type: 'sine', gain: 0.25, bus: this.musicBus, when: 0.22 });
        this.heartbeatTimer = 0.75;
      }
    }
  }
}
