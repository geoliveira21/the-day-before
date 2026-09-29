import { INVENTORY, ITEMS } from '../utils/Constants.js';

const round = (n) => Math.round(n * 1000) / 1000;

/**
 * Weight-limited inventory with a quick-access hotbar.
 * Stacks are unbounded; the only limit is total carried weight.
 */
export class InventorySystem {
  constructor({ maxWeight = INVENTORY.MAX_WEIGHT, hotbarSize = INVENTORY.HOTBAR_SIZE, items = ITEMS } = {}) {
    this.items = items;
    this.maxWeight = maxWeight;
    this.stacks = new Map(); // id -> qty (insertion ordered)
    this.hotbar = new Array(hotbarSize).fill(null);
    this.selectedSlot = 0;
    this.listeners = new Set();
  }

  onChange(cb) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  _emit() {
    for (const cb of this.listeners) cb(this);
  }

  getItem(id) {
    return this.items[id];
  }

  count(id) {
    return this.stacks.get(id) || 0;
  }

  has(id, qty = 1) {
    return this.count(id) >= qty;
  }

  hasAll(requirements) {
    return Object.entries(requirements).every(([id, qty]) => this.has(id, qty));
  }

  getTotalWeight() {
    let w = 0;
    for (const [id, qty] of this.stacks) w += (this.items[id]?.weight || 0) * qty;
    return round(w);
  }

  getFreeWeight() {
    return round(this.maxWeight - this.getTotalWeight());
  }

  getLoadFraction() {
    return this.getTotalWeight() / this.maxWeight;
  }

  /** Largest quantity of `id` that fits in the remaining capacity. */
  maxAddable(id) {
    const item = this.items[id];
    if (!item) return 0;
    if (item.weight <= 0) return Infinity;
    return Math.max(0, Math.floor((this.getFreeWeight() + 1e-6) / item.weight));
  }

  canAdd(id, qty = 1) {
    return this.maxAddable(id) >= qty;
  }

  /**
   * Adds as many items as capacity allows.
   * @returns {number} quantity actually added
   */
  add(id, qty = 1) {
    if (!this.items[id] || qty <= 0) return 0;
    const added = Math.min(qty, this.maxAddable(id));
    if (added <= 0) return 0;
    this.stacks.set(id, this.count(id) + added);
    this._autoAssignHotbar(id);
    this._emit();
    return added;
  }

  /** Removes exactly `qty` items; fails (returns false) if not enough. */
  remove(id, qty = 1) {
    if (qty <= 0) return true;
    const current = this.count(id);
    if (current < qty) return false;
    const left = current - qty;
    if (left === 0) {
      this.stacks.delete(id);
      this.hotbar = this.hotbar.map((slot) => (slot === id ? null : slot));
    } else {
      this.stacks.set(id, left);
    }
    this._emit();
    return true;
  }

  /** Returns an array of { id, qty, item } for UI rendering. */
  list() {
    return [...this.stacks.entries()].map(([id, qty]) => ({ id, qty, item: this.items[id] }));
  }

  _autoAssignHotbar(id) {
    const item = this.items[id];
    if (!item || item.category === 'resource') return;
    if (this.hotbar.includes(id)) return;
    const free = this.hotbar.indexOf(null);
    if (free !== -1) this.hotbar[free] = id;
  }

  assignHotbar(slot, id) {
    if (slot < 0 || slot >= this.hotbar.length) return false;
    if (id !== null && !this.has(id)) return false;
    this.hotbar = this.hotbar.map((s) => (s === id ? null : s));
    this.hotbar[slot] = id;
    this._emit();
    return true;
  }

  selectSlot(slot) {
    const n = this.hotbar.length;
    this.selectedSlot = ((slot % n) + n) % n;
    this._emit();
  }

  cycleSlot(delta) {
    this.selectSlot(this.selectedSlot + delta);
  }

  getSelectedId() {
    return this.hotbar[this.selectedSlot];
  }

  getSelectedItem() {
    const id = this.getSelectedId();
    return id ? this.items[id] : null;
  }

  /** Weapon stats of the selected hotbar item, or null (fists). */
  getEquippedWeapon() {
    const id = this.getSelectedId();
    const item = id ? this.items[id] : null;
    return item?.weapon ? { id, name: item.name, ...item.weapon } : null;
  }

  hasTool(tool) {
    for (const id of this.stacks.keys()) if (this.items[id]?.tool === tool) return true;
    return false;
  }

  clear() {
    this.stacks.clear();
    this.hotbar.fill(null);
    this.selectedSlot = 0;
    this._emit();
  }
}
