import { describe, expect, it } from 'vitest';
import { angleDiff, clamp, createRNG, formatTime, loadSettings, rollLoot, saveSettings } from '../src/utils/Helpers.js';
import { DEFAULT_SETTINGS, LOOT_TABLES, SETTINGS_STORAGE_KEY } from '../src/utils/Constants.js';

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
  };
}

describe('Helpers', () => {
  it('clamps values', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(clamp(0.5, 0, 1)).toBe(0.5);
  });

  it('computes shortest angle difference', () => {
    expect(angleDiff(0, Math.PI / 2)).toBeCloseTo(Math.PI / 2);
    expect(Math.abs(angleDiff(Math.PI - 0.1, -Math.PI + 0.1))).toBeCloseTo(0.2);
  });

  it('creates deterministic RNGs', () => {
    const a = createRNG(42);
    const b = createRNG(42);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).toEqual(seqB);
    for (const v of seqA) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    const r = createRNG(7);
    for (let i = 0; i < 100; i++) {
      const n = r.int(2, 4);
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(4);
    }
  });

  it('always rolls at least one loot stack', () => {
    const rng = createRNG(3);
    for (const table of Object.values(LOOT_TABLES)) {
      for (let i = 0; i < 20; i++) {
        const loot = rollLoot(table, rng);
        expect(loot.length).toBeGreaterThan(0);
        for (const stack of loot) expect(stack.qty).toBeGreaterThan(0);
      }
    }
  });

  it('formats in-game time', () => {
    expect(formatTime(0)).toBe('00:00');
    expect(formatTime(13.5)).toBe('13:30');
    expect(formatTime(23.99)).toBe('23:59');
    expect(formatTime(13.9999999)).toBe('13:59');
    expect(formatTime(24.5)).toBe('00:30');
  });

  it('persists and validates settings', () => {
    const storage = memoryStorage();
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
    saveSettings({ ...DEFAULT_SETTINGS, masterVolume: 0.25 }, storage);
    expect(loadSettings(storage).masterVolume).toBe(0.25);
    storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ masterVolume: 'loud', quality: 'low' }));
    const loaded = loadSettings(storage);
    expect(loaded.masterVolume).toBe(DEFAULT_SETTINGS.masterVolume);
    expect(loaded.quality).toBe('low');
    storage.setItem(SETTINGS_STORAGE_KEY, '{broken');
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
  });
});
