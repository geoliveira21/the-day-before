import { ITEMS, PLAYER } from '../utils/Constants.js';
import { el } from '../utils/Helpers.js';

const MINIMAP_SIZE = 180;
const MINIMAP_RANGE = 70; // world units from centre to edge
const MAP_SCALE = 2; // pixels per world unit on the pre-rendered map

/**
 * Heads-up display: survival bars, clock, minimap, hotbar, prompts and notifications.
 */
export class HUD {
  constructor(root) {
    this.root = el('div', 'hud hidden');
    root.appendChild(this.root);
    this._cache = {};

    const bar = (key, icon, cls) => {
      const fill = el('div', `bar-fill ${cls}`);
      const value = el('span', 'bar-value');
      const node = el('div', 'hud-bar', { title: key }, [el('span', 'bar-icon', { text: icon }), el('div', 'bar-track', {}, [fill]), value]);
      return { node, fill, value };
    };
    this.bars = {
      health: bar('Health', '❤', 'health'),
      stamina: bar('Stamina', '⚡', 'stamina'),
      hunger: bar('Hunger', '🍖', 'hunger'),
      thirst: bar('Thirst', '💧', 'thirst'),
    };
    this.stats = el('div', 'hud-stats', {}, Object.values(this.bars).map((b) => b.node));

    this.clockTime = el('div', 'clock-time');
    this.clockInfo = el('div', 'clock-info');
    this.threat = el('div', 'clock-threat');
    this.clock = el('div', 'hud-clock panel', {}, [this.clockTime, this.clockInfo, this.threat]);

    this.minimapCanvas = el('canvas', 'minimap-canvas');
    this.minimapCanvas.width = MINIMAP_SIZE;
    this.minimapCanvas.height = MINIMAP_SIZE;
    this.minimapCtx = this.minimapCanvas.getContext('2d');
    this.minimap = el('div', 'hud-minimap', {}, [this.minimapCanvas, el('div', 'minimap-north', { text: 'N' })]);

    this.hotbarSlots = [];
    this.hotbar = el('div', 'hud-hotbar');
    for (let i = 0; i < 5; i++) {
      const icon = el('span', 'slot-icon');
      const qty = el('span', 'slot-qty');
      const slot = el('div', 'hotbar-slot', {}, [el('span', 'slot-key', { text: String(i + 1) }), icon, qty]);
      this.hotbar.appendChild(slot);
      this.hotbarSlots.push({ slot, icon, qty });
    }
    this.equipped = el('div', 'hud-equipped');
    this.weight = el('div', 'hud-weight');
    this.bottom = el('div', 'hud-bottom', {}, [this.equipped, this.hotbar, this.weight]);

    this.prompt = el('div', 'hud-prompt hidden');
    this.crosshair = el('div', 'hud-crosshair');
    this.notifications = el('div', 'hud-notifications');
    this.damage = el('div', 'hud-damage');
    this.hint = el('div', 'hud-hint hidden', { text: 'Click to capture the mouse' });
    this.fps = el('div', 'hud-fps hidden');
    this.combatBanner = el('div', 'hud-combat hidden', { text: '⚠ HOSTILES NEARBY' });
    this.controlsHint = el('div', 'hud-controls', {
      text: 'WASD move · Shift sprint · Space jump · LMB attack/use · E interact · Tab inventory · C craft · F flashlight · Esc pause',
    });

    this.root.append(
      this.damage,
      this.stats,
      this.clock,
      this.minimap,
      this.bottom,
      this.prompt,
      this.crosshair,
      this.notifications,
      this.hint,
      this.fps,
      this.combatBanner,
      this.controlsHint,
    );
    setTimeout(() => this.controlsHint.classList.add('fade'), 12000);
  }

  setVisible(v) {
    this.root.classList.toggle('hidden', !v);
  }

  _set(key, value, apply) {
    if (this._cache[key] === value) return;
    this._cache[key] = value;
    apply(value);
  }

  /** Pre-renders the city layout onto an offscreen canvas for the minimap. */
  setMapLayout(layout) {
    this.layout = layout;
    const c = document.createElement('canvas');
    c.width = Math.ceil(layout.width * MAP_SCALE);
    c.height = Math.ceil(layout.depth * MAP_SCALE);
    const g = c.getContext('2d');
    g.fillStyle = '#23262a';
    g.fillRect(0, 0, c.width, c.height);
    const tx = (x) => (x - layout.bounds.minX) * MAP_SCALE;
    const tz = (z) => (z - layout.bounds.minZ) * MAP_SCALE;
    g.fillStyle = '#3a3c3f';
    for (const b of layout.blocks) g.fillRect(tx(b.minX), tz(b.minZ), (b.maxX - b.minX) * MAP_SCALE, (b.maxZ - b.minZ) * MAP_SCALE);
    for (const b of layout.buildings) {
      g.fillStyle = b.ruined ? '#5a4f45' : '#6d6f73';
      g.fillRect(tx(b.x - b.w / 2), tz(b.z - b.d / 2), b.w * MAP_SCALE, b.d * MAP_SCALE);
    }
    g.fillStyle = '#4b4f55';
    for (const p of layout.props) {
      if (p.type === 'car') g.fillRect(tx(p.x) - 3, tz(p.z) - 3, 6, 6);
    }
    this.mapCanvas = c;
  }

  /**
   * @param {object} d { player, cameraYaw, enemies, worldObjects }
   */
  drawMinimap({ player, cameraYaw, enemies, worldObjects }) {
    const g = this.minimapCtx;
    const S = MINIMAP_SIZE;
    const scale = S / (MINIMAP_RANGE * 2);
    g.save();
    g.clearRect(0, 0, S, S);
    g.beginPath();
    g.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#15171a';
    g.fillRect(0, 0, S, S);
    if (this.mapCanvas && this.layout) {
      const px = (player.position.x - this.layout.bounds.minX) * MAP_SCALE;
      const pz = (player.position.z - this.layout.bounds.minZ) * MAP_SCALE;
      const src = MINIMAP_RANGE * MAP_SCALE;
      g.imageSmoothingEnabled = false;
      g.drawImage(this.mapCanvas, px - src, pz - src, src * 2, src * 2, 0, 0, S, S);
    }
    const toMap = (x, z) => [S / 2 + (x - player.position.x) * scale, S / 2 + (z - player.position.z) * scale];
    const inRange = (x, z) => Math.abs(x - player.position.x) < MINIMAP_RANGE && Math.abs(z - player.position.z) < MINIMAP_RANGE;

    for (const o of worldObjects) {
      if (!o.isActive || !inRange(o.position.x, o.position.z)) continue;
      const [x, y] = toMap(o.position.x, o.position.z);
      g.fillStyle = o.kind === 'pickup' ? '#7dff7d' : o.kind === 'harvest' ? '#6fc3ff' : '#ffd166';
      g.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    for (const e of enemies) {
      if (e.isDead || !inRange(e.position.x, e.position.z)) continue;
      const [x, y] = toMap(e.position.x, e.position.z);
      g.fillStyle = e.isHostile ? '#ff3030' : '#c05050';
      g.beginPath();
      g.arc(x, y, e.isHostile ? 3.5 : 2.5, 0, Math.PI * 2);
      g.fill();
    }
    // View cone
    const viewYaw = cameraYaw + Math.PI; // direction camera looks
    const dirX = Math.sin(viewYaw);
    const dirZ = Math.cos(viewYaw);
    g.fillStyle = 'rgba(255,255,255,0.08)';
    g.beginPath();
    g.moveTo(S / 2, S / 2);
    const a0 = Math.atan2(dirZ, dirX);
    g.arc(S / 2, S / 2, 60, a0 - 0.55, a0 + 0.55);
    g.closePath();
    g.fill();
    // Player arrow
    g.translate(S / 2, S / 2);
    g.rotate(-player.facing + Math.PI);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(0, -7);
    g.lineTo(5, 5);
    g.lineTo(0, 2);
    g.lineTo(-5, 5);
    g.closePath();
    g.fill();
    g.restore();
  }

  update({ player, inventory, dayNight, weather, fps, showFps, pointerHint, inCombat }) {
    const pct = (v, max) => Math.max(0, Math.min(100, (v / max) * 100));
    const setBar = (key, v, max) => {
      const p = Math.round(pct(v, max));
      this._set(`bar-${key}`, p, (val) => {
        this.bars[key].fill.style.width = `${val}%`;
        this.bars[key].value.textContent = String(val);
        this.bars[key].node.classList.toggle('low', val < 25);
      });
    };
    setBar('health', player.health, PLAYER.MAX_HEALTH);
    setBar('stamina', player.stamina, PLAYER.MAX_STAMINA);
    setBar('hunger', player.hunger, PLAYER.MAX_HUNGER);
    setBar('thirst', player.thirst, PLAYER.MAX_THIRST);

    this._set('time', dayNight.getFormattedTime(), (v) => (this.clockTime.textContent = `${dayNight.isNight() ? '🌙' : '☀️'} ${v}`));
    this._set('info', `Day ${dayNight.day} · ${dayNight.getPhaseLabel()} · ${weather.icon} ${weather.label}`, (v) => (this.clockInfo.textContent = v));
    this._set('threat', dayNight.isNight(), (night) => {
      this.threat.textContent = night ? 'Infected are more aggressive' : '';
      this.threat.classList.toggle('hidden', !night);
    });

    const hotbarKey = inventory.hotbar.map((id) => `${id}:${id ? inventory.count(id) : 0}`).join('|') + `#${inventory.selectedSlot}`;
    this._set('hotbar', hotbarKey, () => {
      inventory.hotbar.forEach((id, i) => {
        const s = this.hotbarSlots[i];
        s.icon.textContent = id ? ITEMS[id]?.icon ?? '?' : '';
        s.qty.textContent = id && inventory.count(id) > 1 ? String(inventory.count(id)) : '';
        s.slot.title = id ? ITEMS[id]?.name : 'Empty';
        s.slot.classList.toggle('selected', i === inventory.selectedSlot);
      });
      const sel = inventory.getSelectedItem();
      this.equipped.textContent = sel ? `${sel.icon} ${sel.name}` : '✊ Fists';
    });
    const w = inventory.getTotalWeight();
    this._set('weight', `${w.toFixed(1)}/${inventory.maxWeight}`, (v) => {
      this.weight.textContent = `⚖ ${v} kg`;
      this.weight.classList.toggle('heavy', inventory.getLoadFraction() > PLAYER.OVERWEIGHT_THRESHOLD);
    });

    this._set('fpsVisible', showFps, (v) => this.fps.classList.toggle('hidden', !v));
    if (showFps) this._set('fps', Math.round(fps), (v) => (this.fps.textContent = `${v} FPS`));
    this._set('hint', pointerHint, (v) => this.hint.classList.toggle('hidden', !v));
    this._set('combat', inCombat, (v) => this.combatBanner.classList.toggle('hidden', !v));

    // Low health vignette.
    const low = player.health < 30 ? (30 - player.health) / 30 : 0;
    this._set('lowHealth', Math.round(low * 20), (v) => this.damage.style.setProperty('--low', String(v / 20)));
  }

  setPrompt(text) {
    this._set('prompt', text || '', (v) => {
      this.prompt.classList.toggle('hidden', !v);
      this.prompt.innerHTML = '';
      if (v) this.prompt.append(el('span', 'key', { text: 'E' }), document.createTextNode(` ${v}`));
    });
  }

  flashDamage() {
    this.damage.classList.remove('flash');
    void this.damage.offsetWidth; // restart animation
    this.damage.classList.add('flash');
  }

  notify(text, type = 'info') {
    const n = el('div', `notification ${type}`, { text });
    this.notifications.prepend(n);
    while (this.notifications.children.length > 6) this.notifications.lastChild.remove();
    setTimeout(() => n.classList.add('fade'), 2800);
    setTimeout(() => n.remove(), 3600);
  }
}
