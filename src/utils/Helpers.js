import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY } from './Constants.js';

export const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (edge0, edge1, x) => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};
/** Frame-rate independent exponential smoothing factor. */
export const damp = (lambda, dt) => 1 - Math.exp(-lambda * dt);

/** Shortest signed difference between two angles (radians). */
export const angleDiff = (a, b) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

export const distance2D = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

/**
 * Deterministic seeded pseudo random generator (mulberry32).
 */
export function createRNG(seed = 1) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    weighted: (entries) => {
      const total = entries.reduce((sum, e) => sum + e.weight, 0);
      let r = next() * total;
      for (const e of entries) {
        r -= e.weight;
        if (r <= 0) return e;
      }
      return entries[entries.length - 1];
    },
  };
}

/**
 * Rolls a loot table. Always returns at least one stack so containers never feel empty.
 * @returns {{id: string, qty: number}[]}
 */
export function rollLoot(table, rng) {
  const result = [];
  for (const entry of table) {
    if (rng.next() < entry.chance) {
      result.push({ id: entry.id, qty: rng.int(entry.min, entry.max) });
    }
  }
  if (result.length === 0 && table.length > 0) {
    const first = table[0];
    result.push({ id: first.id, qty: first.min });
  }
  return result;
}

/** Formats an in-game hour (0-24, fractional) as HH:MM. */
export function formatTime(hours) {
  const totalMinutes = ((Math.floor(hours * 60) % 1440) + 1440) % 1440;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function loadSettings(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    const merged = { ...DEFAULT_SETTINGS };
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      if (key in parsed && typeof parsed[key] === typeof DEFAULT_SETTINGS[key]) merged[key] = parsed[key];
    }
    return merged;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings, storage = globalThis.localStorage) {
  try {
    storage?.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage may be unavailable (private mode); settings simply won't persist.
  }
}

/** Resolves on the next animation frame (or immediately outside browsers). */
export const nextFrame = () =>
  new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });

/** Creates a DOM element with optional class name, attributes and children. */
export function el(tag, className, props = {}, children = []) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const [k, v] of Object.entries(props)) {
    if (k === 'text') node.textContent = v;
    else if (k === 'style') Object.assign(node.style, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const child of children) if (child) node.appendChild(child);
  return node;
}
