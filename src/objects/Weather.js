import * as THREE from 'three';
import { WEATHER } from '../utils/Constants.js';
import { lerp } from '../utils/Helpers.js';

const AREA = 60;
const HEIGHT = 40;

/**
 * Dynamic weather: clear / fog / rain with smooth transitions, rain streaks
 * following the camera and occasional lightning during storms.
 */
export class Weather {
  constructor(scene, rng = Math) {
    this.rng = rng;
    this.type = 'clear';
    this.rainIntensity = 0;
    this.fogDensity = WEATHER.FOG_DENSITY.clear;
    this.timer = this._randomDuration();
    this.flash = 0;
    this.lightningTimer = 8;
    this.listeners = new Set();

    const count = WEATHER.RAIN_DROPS;
    this.drops = new Float32Array(count * 3);
    this.speeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      this.drops[i * 3] = (Math.random() - 0.5) * AREA;
      this.drops[i * 3 + 1] = Math.random() * HEIGHT;
      this.drops[i * 3 + 2] = (Math.random() - 0.5) * AREA;
      this.speeds[i] = 22 + Math.random() * 10;
    }
    this.linePositions = new Float32Array(count * 6);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.linePositions, 3).setUsage(THREE.DynamicDrawUsage));
    this.rain = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({ color: 0xa8bccf, transparent: true, opacity: 0, depthWrite: false }),
    );
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    scene.add(this.rain);
  }

  _randomDuration() {
    const r = typeof this.rng.next === 'function' ? this.rng.next() : Math.random();
    return lerp(WEATHER.MIN_DURATION, WEATHER.MAX_DURATION, r);
  }

  onChange(cb) {
    this.listeners.add(cb);
  }

  setType(type) {
    if (!WEATHER.TYPES.includes(type) || type === this.type) return;
    this.type = type;
    this.timer = this._randomDuration();
    for (const cb of this.listeners) cb(type);
  }

  get label() {
    return { clear: 'Clear', fog: 'Foggy', rain: 'Rain' }[this.type];
  }

  get icon() {
    return { clear: '☀️', fog: '🌫️', rain: '🌧️' }[this.type];
  }

  update(dt, cameraPos) {
    this.timer -= dt;
    if (this.timer <= 0) {
      const r = Math.random();
      this.setType(r < 0.45 ? 'clear' : r < 0.72 ? 'fog' : 'rain');
      this.timer = this._randomDuration();
    }

    const targetFog = WEATHER.FOG_DENSITY[this.type];
    this.fogDensity = lerp(this.fogDensity, targetFog, Math.min(1, dt * 0.25));
    const targetRain = this.type === 'rain' ? 1 : 0;
    this.rainIntensity = lerp(this.rainIntensity, targetRain, Math.min(1, dt * 0.35));

    // Lightning
    this.flash = Math.max(0, this.flash - dt * 4);
    this.thunder = false;
    if (this.type === 'rain' && this.rainIntensity > 0.7) {
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) {
        this.flash = 1;
        this.thunder = true;
        this.lightningTimer = 10 + Math.random() * 20;
      }
    }

    this.rain.visible = this.rainIntensity > 0.02;
    if (!this.rain.visible) return;
    this.rain.material.opacity = 0.35 * this.rainIntensity;
    this.rain.position.set(cameraPos.x, 0, cameraPos.z);
    const activeCount = Math.floor(this.speeds.length * this.rainIntensity);
    const lp = this.linePositions;
    for (let i = 0; i < this.speeds.length; i++) {
      const o = i * 3;
      if (i >= activeCount) {
        lp.fill(0, i * 6, i * 6 + 6);
        continue;
      }
      this.drops[o + 1] -= this.speeds[i] * dt;
      if (this.drops[o + 1] < 0) {
        this.drops[o + 1] += HEIGHT;
        this.drops[o] = (Math.random() - 0.5) * AREA;
        this.drops[o + 2] = (Math.random() - 0.5) * AREA;
      }
      const x = this.drops[o];
      const y = this.drops[o + 1];
      const z = this.drops[o + 2];
      lp[i * 6] = x;
      lp[i * 6 + 1] = y;
      lp[i * 6 + 2] = z;
      lp[i * 6 + 3] = x + 0.05;
      lp[i * 6 + 4] = y + 0.7;
      lp[i * 6 + 5] = z;
    }
    this.rain.geometry.attributes.position.needsUpdate = true;
  }
}
