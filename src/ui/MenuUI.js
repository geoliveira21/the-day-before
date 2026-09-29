import { el } from '../utils/Helpers.js';

const CONTROLS = [
  ['W A S D', 'Move'],
  ['Mouse', 'Look around'],
  ['Shift', 'Sprint (uses stamina)'],
  ['Space', 'Jump'],
  ['Left click', 'Attack / use selected item'],
  ['E', 'Interact · search · pick up'],
  ['1 – 5 / Wheel', 'Select hotbar slot'],
  ['Tab / I', 'Inventory'],
  ['C', 'Crafting'],
  ['F', 'Toggle flashlight'],
  ['Esc / P', 'Pause'],
  ['Gamepad', 'LS move · RS look · A jump · X interact · RT attack · LT sprint · Y inventory · B crafting · LB/RB hotbar · Start pause'],
];

/**
 * Full-screen menus: loading, main menu, pause, settings, controls and death screen.
 */
export class MenuUI {
  constructor(root, settings, callbacks = {}) {
    this.settings = settings;
    this.callbacks = callbacks;
    this.current = null;
    this.previous = null;
    this.root = el('div', 'menu-root');
    root.appendChild(this.root);
    this.screens = {
      loading: this._buildLoading(),
      main: this._buildMain(),
      pause: this._buildPause(),
      settings: this._buildSettings(),
      controls: this._buildControls(),
      death: this._buildDeath(),
    };
    for (const s of Object.values(this.screens)) {
      s.classList.add('hidden');
      this.root.appendChild(s);
    }
  }

  _button(text, onclick, cls = 'btn big') {
    return el('button', cls, { text, type: 'button', onclick: () => {
      this.callbacks.onClick?.();
      onclick();
    } });
  }

  _buildLoading() {
    this.loadingFill = el('div', 'loading-fill');
    this.loadingLabel = el('div', 'loading-label', { text: 'Initializing…' });
    return el('div', 'screen loading-screen', {}, [
      el('h1', 'title', { text: 'THE DAY BEFORE' }),
      el('div', 'subtitle', { text: 'a survival prototype' }),
      el('div', 'loading-bar', {}, [this.loadingFill]),
      this.loadingLabel,
      el('p', 'tip', { text: 'Tip: the infected are faster and more aggressive at night. Craft a flashlight.' }),
    ]);
  }

  _buildMain() {
    this.playButton = this._button('▶ Start Surviving', () => this.callbacks.onPlay?.());
    return el('div', 'screen main-menu', {}, [
      el('div', 'menu-card', {}, [
        el('h1', 'title', { text: 'THE DAY BEFORE' }),
        el('div', 'subtitle', { text: 'Scavenge. Craft. Survive the night.' }),
        el('div', 'menu-buttons', {}, [
          this.playButton,
          this._button('⚙ Settings', () => this.show('settings')),
          this._button('🎮 Controls', () => this.show('controls')),
        ]),
        el('p', 'muted small', { text: 'Single-player prototype · Three.js WebGL · Procedural city' }),
      ]),
    ]);
  }

  _buildPause() {
    return el('div', 'screen pause-menu', {}, [
      el('div', 'menu-card', {}, [
        el('h2', '', { text: 'Paused' }),
        el('div', 'menu-buttons', {}, [
          this._button('▶ Resume', () => this.callbacks.onResume?.()),
          this._button('⚙ Settings', () => this.show('settings')),
          this._button('🎮 Controls', () => this.show('controls')),
          this._button('⏏ Quit to Main Menu', () => this.callbacks.onQuitToMenu?.(), 'btn big secondary'),
        ]),
      ]),
    ]);
  }

  _buildControls() {
    const rows = CONTROLS.map(([k, v]) => el('tr', '', {}, [el('td', 'key-cell', { text: k }), el('td', '', { text: v })]));
    return el('div', 'screen controls-menu', {}, [
      el('div', 'menu-card wide', {}, [
        el('h2', '', { text: 'Controls' }),
        el('table', 'controls-table', {}, [el('tbody', '', {}, rows)]),
        el('p', 'muted small', { text: 'Touch devices get an on-screen joystick and buttons automatically.' }),
        this._button('← Back', () => this.back(), 'btn'),
      ]),
    ]);
  }

  _buildDeath() {
    this.deathStats = el('p', 'death-stats');
    return el('div', 'screen death-screen', {}, [
      el('div', 'menu-card', {}, [
        el('h1', 'title red', { text: 'YOU DIED' }),
        this.deathStats,
        el('div', 'menu-buttons', {}, [
          this._button('↻ Respawn', () => this.callbacks.onRespawn?.()),
          this._button('⏏ Main Menu', () => this.callbacks.onQuitToMenu?.(), 'btn big secondary'),
        ]),
      ]),
    ]);
  }

  _buildSettings() {
    const s = this.settings;
    const emit = () => this.callbacks.onSettingsChange?.(this.settings);
    const slider = (label, key, min, max, step, fmt = (v) => `${Math.round(v * 100)}%`) => {
      const out = el('span', 'setting-value', { text: fmt(s[key]) });
      const input = el('input', '', { type: 'range', min, max, step, value: s[key] });
      input.addEventListener('input', () => {
        s[key] = Number(input.value);
        out.textContent = fmt(s[key]);
        emit();
      });
      this._syncers.push(() => {
        input.value = s[key];
        out.textContent = fmt(s[key]);
      });
      return el('label', 'setting', {}, [el('span', 'setting-label', { text: label }), input, out]);
    };
    const toggle = (label, key) => {
      const input = el('input', '', { type: 'checkbox' });
      input.checked = !!s[key];
      input.addEventListener('change', () => {
        s[key] = input.checked;
        emit();
      });
      this._syncers.push(() => (input.checked = !!s[key]));
      return el('label', 'setting', {}, [el('span', 'setting-label', { text: label }), input]);
    };
    const select = (label, key, options) => {
      const input = el('select', '');
      for (const [value, text] of options) {
        const o = el('option', '', { value, text });
        if (s[key] === value) o.selected = true;
        input.appendChild(o);
      }
      input.addEventListener('change', () => {
        s[key] = input.value;
        emit();
      });
      this._syncers.push(() => (input.value = s[key]));
      return el('label', 'setting', {}, [el('span', 'setting-label', { text: label }), input]);
    };
    this._syncers = [];

    return el('div', 'screen settings-menu', {}, [
      el('div', 'menu-card wide', {}, [
        el('h2', '', { text: 'Settings' }),
        el('h3', '', { text: '🔊 Audio' }),
        slider('Master volume', 'masterVolume', 0, 1, 0.05),
        slider('Music & ambience', 'musicVolume', 0, 1, 0.05),
        slider('Sound effects', 'sfxVolume', 0, 1, 0.05),
        el('h3', '', { text: '🖥 Graphics' }),
        select('Quality', 'quality', [
          ['low', 'Low (no shadows)'],
          ['medium', 'Medium'],
          ['high', 'High'],
        ]),
        toggle('Post-processing (bloom, grain)', 'postProcessing'),
        toggle('Show FPS', 'showFps'),
        el('h3', '', { text: '🎮 Gameplay' }),
        slider('Day length', 'dayLengthMinutes', 2, 60, 1, (v) => `${v} min`),
        slider('Mouse sensitivity', 'mouseSensitivity', 0.2, 3, 0.1, (v) => `${Number(v).toFixed(1)}×`),
        toggle('Invert Y axis', 'invertY'),
        this._button('← Back', () => this.back(), 'btn'),
      ]),
    ]);
  }

  show(name) {
    if (this.current && this.current !== name) this.previous = this.current;
    for (const [key, screen] of Object.entries(this.screens)) screen.classList.toggle('hidden', key !== name);
    this.current = name;
    this.root.classList.toggle('dim', name !== 'main' && name !== 'loading');
    if (name === 'settings') this._syncers.forEach((fn) => fn());
  }

  back() {
    this.show(this.previous && this.previous !== 'settings' && this.previous !== 'controls' ? this.previous : 'main');
  }

  hide() {
    for (const screen of Object.values(this.screens)) screen.classList.add('hidden');
    this.current = null;
    this.root.classList.remove('dim');
  }

  get isVisible() {
    return this.current !== null;
  }

  setLoadingProgress(p, label) {
    this.loadingFill.style.width = `${Math.round(p * 100)}%`;
    if (label) this.loadingLabel.textContent = label;
  }

  setPlayLabel(text) {
    this.playButton.textContent = text;
  }

  showDeath({ day, kills }) {
    this.deathStats.textContent = `You survived until day ${day} and put down ${kills} infected.`;
    this.show('death');
  }
}
