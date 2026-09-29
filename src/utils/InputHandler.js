import { el, clamp } from './Helpers.js';

const KEY_BINDINGS = {
  forward: ['KeyW', 'ArrowUp'],
  backward: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  interact: ['KeyE'],
  inventory: ['Tab', 'KeyI'],
  crafting: ['KeyC'],
  pause: ['Escape', 'KeyP'],
  flashlight: ['KeyF'],
  attack: [],
  hotbar1: ['Digit1'],
  hotbar2: ['Digit2'],
  hotbar3: ['Digit3'],
  hotbar4: ['Digit4'],
  hotbar5: ['Digit5'],
};

// Standard gamepad mapping (Xbox layout names).
const GAMEPAD_BINDINGS = {
  jump: [0], // A
  crafting: [1], // B
  interact: [2], // X
  inventory: [3], // Y
  hotbarPrev: [4], // LB
  hotbarNext: [5], // RB
  sprint: [6, 10], // LT / L3
  attack: [7], // RT
  pause: [9], // Start
  flashlight: [12], // D-pad up
};

const PREVENT_DEFAULT = new Set(['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const DEADZONE = 0.18;

const codeToActions = new Map();
for (const [action, codes] of Object.entries(KEY_BINDINGS)) {
  for (const code of codes) {
    if (!codeToActions.has(code)) codeToActions.set(code, []);
    codeToActions.get(code).push(action);
  }
}

/**
 * Unified input layer: keyboard + mouse (pointer lock), gamepad and touch.
 * Game code queries abstract actions (e.g. "jump") instead of raw keys.
 */
export class InputHandler {
  constructor(canvas, uiRoot) {
    this.canvas = canvas;
    this.uiRoot = uiRoot;
    this.down = new Set();
    this.pressed = new Set();
    this.keySources = new Map(); // action -> Set of active sources
    this.look = { dx: 0, dy: 0 };
    this.hotbarDelta = 0;
    this.gamepadIndex = null;
    this.gamepadButtons = [];
    this.gamepadMove = { x: 0, y: 0 };
    this.gamepadLook = { x: 0, y: 0 };
    this.touchMove = { x: 0, y: 0 };
    this.pointerLockListeners = [];
    this.touchEnabled =
      typeof window !== 'undefined' &&
      ('ontouchstart' in window || window.matchMedia?.('(pointer: coarse)').matches);

    this._bindKeyboard();
    this._bindMouse();
    this._bindGamepad();
    if (this.touchEnabled) this._createTouchControls();
  }

  // ---------------------------------------------------------------- sources
  _setSource(action, source, active) {
    if (!this.keySources.has(action)) this.keySources.set(action, new Set());
    const sources = this.keySources.get(action);
    const wasDown = sources.size > 0;
    if (active) sources.add(source);
    else sources.delete(source);
    const isDown = sources.size > 0;
    if (isDown && !wasDown) {
      this.down.add(action);
      this.pressed.add(action);
    } else if (!isDown && wasDown) {
      this.down.delete(action);
    }
  }

  _bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (PREVENT_DEFAULT.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      const actions = codeToActions.get(e.code);
      if (actions) for (const a of actions) this._setSource(a, `key:${e.code}`, true);
    });
    window.addEventListener('keyup', (e) => {
      const actions = codeToActions.get(e.code);
      if (actions) for (const a of actions) this._setSource(a, `key:${e.code}`, false);
    });
    window.addEventListener('blur', () => this.releaseAll());
  }

  _bindMouse() {
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0 && this.isPointerLocked) this._setSource('attack', 'mouse0', true);
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this._setSource('attack', 'mouse0', false);
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.isPointerLocked) return;
      this.look.dx += e.movementX || 0;
      this.look.dy += e.movementY || 0;
    });
    window.addEventListener(
      'wheel',
      (e) => {
        if (this.isPointerLocked) this.hotbarDelta += Math.sign(e.deltaY);
      },
      { passive: true },
    );
    document.addEventListener('pointerlockchange', () => {
      if (!this.isPointerLocked) this._setSource('attack', 'mouse0', false);
      for (const cb of this.pointerLockListeners) cb(this.isPointerLocked);
    });
  }

  _bindGamepad() {
    window.addEventListener('gamepadconnected', (e) => {
      this.gamepadIndex = e.gamepad.index;
    });
    window.addEventListener('gamepaddisconnected', (e) => {
      if (this.gamepadIndex === e.gamepad.index) {
        this.gamepadIndex = null;
        for (const action of Object.keys(GAMEPAD_BINDINGS)) this._setSource(action, 'gamepad', false);
      }
    });
  }

  _pollGamepad() {
    if (this.gamepadIndex === null || !navigator.getGamepads) return;
    const pad = navigator.getGamepads()[this.gamepadIndex];
    if (!pad) return;
    const axis = (i) => {
      const v = pad.axes[i] || 0;
      return Math.abs(v) < DEADZONE ? 0 : v;
    };
    this.gamepadMove.x = axis(0);
    this.gamepadMove.y = -axis(1);
    this.gamepadLook.x = axis(2);
    this.gamepadLook.y = axis(3);
    for (const [action, buttons] of Object.entries(GAMEPAD_BINDINGS)) {
      const active = buttons.some((b) => pad.buttons[b]?.pressed);
      const wasActive = this.keySources.get(action)?.has('gamepad') ?? false;
      if (active && !wasActive) {
        if (action === 'hotbarNext') this.hotbarDelta += 1;
        else if (action === 'hotbarPrev') this.hotbarDelta -= 1;
      }
      this._setSource(action, 'gamepad', active);
    }
  }

  // ---------------------------------------------------------------- touch
  _createTouchControls() {
    const joystick = el('div', 'touch-joystick', {}, [el('div', 'touch-knob')]);
    const knob = joystick.firstChild;
    const lookZone = el('div', 'touch-look');
    const buttons = el('div', 'touch-buttons');
    const makeButton = (label, action) => {
      const b = el('button', 'touch-btn', { text: label, type: 'button' });
      b.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this._setSource(action, `touch:${action}`, true);
      });
      const release = (e) => {
        e.preventDefault();
        this._setSource(action, `touch:${action}`, false);
      };
      b.addEventListener('touchend', release);
      b.addEventListener('touchcancel', release);
      return b;
    };
    buttons.append(
      makeButton('⚔', 'attack'),
      makeButton('⤒', 'jump'),
      makeButton('E', 'interact'),
      makeButton('⇧', 'sprint'),
      makeButton('🎒', 'inventory'),
      makeButton('🔨', 'crafting'),
      makeButton('⏸', 'pause'),
    );
    this.touchRoot = el('div', 'touch-controls hidden', {}, [lookZone, joystick, buttons]);
    this.uiRoot.appendChild(this.touchRoot);

    let joyId = null;
    let origin = null;
    const radius = 50;
    joystick.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      joyId = t.identifier;
      const rect = joystick.getBoundingClientRect();
      origin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });
    joystick.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier !== joyId) continue;
        const dx = clamp(t.clientX - origin.x, -radius, radius);
        const dy = clamp(t.clientY - origin.y, -radius, radius);
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
        this.touchMove.x = dx / radius;
        this.touchMove.y = -dy / radius;
      }
    });
    const endJoy = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== joyId) continue;
        joyId = null;
        knob.style.transform = '';
        this.touchMove.x = 0;
        this.touchMove.y = 0;
      }
    };
    joystick.addEventListener('touchend', endJoy);
    joystick.addEventListener('touchcancel', endJoy);

    let lookId = null;
    let last = null;
    lookZone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      lookId = t.identifier;
      last = { x: t.clientX, y: t.clientY };
    });
    lookZone.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier !== lookId) continue;
        this.look.dx += (t.clientX - last.x) * 1.5;
        this.look.dy += (t.clientY - last.y) * 1.5;
        last = { x: t.clientX, y: t.clientY };
      }
    });
    const endLook = (e) => {
      for (const t of e.changedTouches) if (t.identifier === lookId) lookId = null;
    };
    lookZone.addEventListener('touchend', endLook);
    lookZone.addEventListener('touchcancel', endLook);
  }

  setTouchVisible(visible) {
    this.touchRoot?.classList.toggle('hidden', !visible);
  }

  // ---------------------------------------------------------------- queries
  get isPointerLocked() {
    return document.pointerLockElement === this.canvas;
  }

  get hasGamepad() {
    return this.gamepadIndex !== null;
  }

  /** True when the player can look around without pointer lock (gamepad/touch). */
  get canPlayWithoutPointerLock() {
    return this.touchEnabled || this.hasGamepad;
  }

  requestPointerLock() {
    if (this.touchEnabled || this.isPointerLocked || !this.canvas.requestPointerLock) return;
    try {
      const result = this.canvas.requestPointerLock();
      if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch {
      // Browsers throttle re-locking right after exit; the user can click again.
    }
  }

  exitPointerLock() {
    if (this.isPointerLocked) document.exitPointerLock();
  }

  onPointerLockChange(cb) {
    this.pointerLockListeners.push(cb);
  }

  update() {
    this._pollGamepad();
  }

  isDown(action) {
    return this.down.has(action);
  }

  wasPressed(action) {
    return this.pressed.has(action);
  }

  /** Movement intent in local space: x = strafe right, y = forward. Magnitude <= 1. */
  getMoveVector() {
    let x = 0;
    let y = 0;
    if (this.isDown('forward')) y += 1;
    if (this.isDown('backward')) y -= 1;
    if (this.isDown('right')) x += 1;
    if (this.isDown('left')) x -= 1;
    x += this.gamepadMove.x + this.touchMove.x;
    y += this.gamepadMove.y + this.touchMove.y;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  /** Returns and clears accumulated look delta in "mouse pixels". */
  consumeLook(dt, gamepadSpeed = 600) {
    const dx = this.look.dx + this.gamepadLook.x * gamepadSpeed * dt;
    const dy = this.look.dy + this.gamepadLook.y * gamepadSpeed * dt;
    this.look.dx = 0;
    this.look.dy = 0;
    return { dx, dy };
  }

  consumeHotbarDelta() {
    const d = this.hotbarDelta;
    this.hotbarDelta = 0;
    return d;
  }

  releaseAll() {
    for (const sources of this.keySources.values()) sources.clear();
    this.down.clear();
    this.touchMove.x = 0;
    this.touchMove.y = 0;
  }

  /** Must be called once at the end of every frame. */
  endFrame() {
    this.pressed.clear();
  }
}
