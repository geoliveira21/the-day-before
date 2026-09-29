import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

import { CAMERA, ENEMY, GAME_STATES, ITEMS, PLAY_STATES, PLAYER, QUALITY_PRESETS, WORLD } from '../utils/Constants.js';
import { clamp, createRNG, damp, lerp, nextFrame } from '../utils/Helpers.js';
import { InputHandler } from '../utils/InputHandler.js';
import { PhysicsManager } from '../systems/PhysicsManager.js';
import { MapGenerator } from '../systems/MapGenerator.js';
import { InventorySystem } from '../systems/InventorySystem.js';
import { CraftingSystem } from '../systems/CraftingSystem.js';
import { CombatSystem } from '../systems/CombatSystem.js';
import { DayNightCycle } from '../systems/DayNightCycle.js';
import { Player } from '../objects/Player.js';
import { Enemy } from '../objects/Enemy.js';
import { Weather } from '../objects/Weather.js';
import { WorldObject } from '../objects/WorldObject.js';
import { ParticleSystem } from '../objects/ParticleSystem.js';
import { HUD } from '../ui/HUD.js';
import { InventoryUI } from '../ui/InventoryUI.js';
import { CraftingUI } from '../ui/CraftingUI.js';

const STARTING_ITEMS = [
  ['crowbar', 1],
  ['water_bottle', 1],
  ['canned_food', 1],
  ['bandage', 1],
];
const KILL_DROPS = ['cloth', 'canned_food', 'bandage', 'water_bottle', 'battery'];
const OBJECT_DRAW_DISTANCE = 75;
const LIGHTNING_COLOR = new THREE.Color(0.8, 0.85, 1);

// Vignette + film grain + subtle desaturation + damage tint.
const AtmosphereShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    damage: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float damage;
    varying vec2 vUv;
    float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
      color.rgb = mix(vec3(gray), color.rgb, 0.78);
      float v = smoothstep(0.85, 0.25, length(vUv - 0.5));
      color.rgb *= mix(0.55, 1.0, v);
      color.rgb = mix(color.rgb, vec3(0.5, 0.0, 0.0), damage * (1.0 - v) * 0.8);
      color.rgb += (rand(vUv * 1000.0 + time) - 0.5) * 0.035;
      gl_FragColor = color;
    }
  `,
};

/**
 * Main game scene: owns the renderer, world, systems and the state machine,
 * and runs the game loop.
 */
export class GameScene {
  constructor({ container, uiRoot, settings, audio, menu }) {
    this.container = container;
    this.uiRoot = uiRoot;
    this.settings = settings;
    this.audio = audio;
    this.menu = menu;
    this.state = GAME_STATES.LOADING;
    this.started = false;
    this.kills = 0;
    this.cameraYaw = Math.PI * 0.25;
    this.cameraPitch = 0.25;
    this.cameraDistance = CAMERA.DISTANCE;
    this.cameraShake = 0;
    this.damageFlash = 0;
    this.combatCooldown = 0;
    this.respawnTimer = 0;
    this.deathTimer = 0;
    this.frame = 0;
    this.fps = 60;
    this.elapsed = 0;
    this.lastUnlockPause = 0;
    this.stateListeners = new Set();
    this.rng = createRNG(WORLD.SEED + 7);
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this.raycaster = new THREE.Raycaster();
  }

  onStateChange(cb) {
    this.stateListeners.add(cb);
  }

  // =================================================================== setup
  async init(onProgress = async () => {}) {
    const report = async (p, label) => {
      await onProgress(p, label);
      await nextFrame();
    };
    await report(0.02, 'Starting renderer');

    const preset = QUALITY_PRESETS[this.settings.quality] || QUALITY_PRESETS.medium;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.canvas = this.renderer.domElement;
    this.canvas.classList.add('game-canvas');
    this.container.appendChild(this.canvas);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x8c8878, 0.008);
    this.camera = new THREE.PerspectiveCamera(CAMERA.FOV, window.innerWidth / window.innerHeight, 0.1, 1500);

    this.input = new InputHandler(this.canvas, this.uiRoot);
    this.input.onPointerLockChange((locked) => {
      if (!locked && PLAY_STATES.has(this.state) && !this.input.canPlayWithoutPointerLock) {
        this.lastUnlockPause = performance.now();
        this.setState(GAME_STATES.PAUSED);
      }
    });
    this.canvas.addEventListener('click', () => {
      if (PLAY_STATES.has(this.state)) this.input.requestPointerLock();
    });

    await report(0.05, 'Generating city');
    this.physics = new PhysicsManager();
    this.map = new MapGenerator(WORLD.SEED);
    this.layout = this.map.generate();
    this.world = await this.map.build(this.scene, this.physics, (p, label) => report(0.05 + p * 0.65, label));
    this.worldObjects = this.world.worldObjects;

    await report(0.75, 'Setting the sun');
    this.dayNight = new DayNightCycle({ cycleMinutes: this.settings.dayLengthMinutes });
    this.dayNight.attach(this.scene);
    this.weather = new Weather(this.scene, createRNG(WORLD.SEED + 3));
    this.weather.onChange(() => {
      if (PLAY_STATES.has(this.state)) this.hud.notify(`${this.weather.icon} Weather: ${this.weather.label}`, 'info');
    });

    this.particles = new ParticleSystem(this.scene, { max: 900 });
    this.fireParticles = new ParticleSystem(this.scene, { max: 700, additive: true });

    await report(0.8, 'Preparing survivor');
    this.player = new Player(this.scene);
    this.inventory = new InventorySystem();
    this.crafting = new CraftingSystem(this.inventory);
    this.combat = new CombatSystem({
      audio: this.audio,
      particles: this.particles,
      onEnemyKilled: (e) => this._onEnemyKilled(e),
      onPlayerHit: () => {
        this.hud.flashDamage();
        this.cameraShake = Math.min(1, this.cameraShake + 0.5);
        this.damageFlash = 1;
      },
    });

    await report(0.85, 'Waking the infected');
    this.enemies = [];

    this.hud = new HUD(this.uiRoot);
    this.hud.setMapLayout(this.layout);
    this.inventoryUI = new InventoryUI(this.uiRoot, this.inventory, {
      onUse: (id) => this.useItem(id),
      onDrop: (id, qty) => this.dropItem(id, qty),
      onClose: () => this.setState(GAME_STATES.EXPLORATION),
      onOpenCrafting: () => this.setState(GAME_STATES.CRAFTING),
    });
    this.craftingUI = new CraftingUI(this.uiRoot, this.crafting, this.inventory, {
      onCraft: (recipe, result) => this._onCraft(recipe, result),
      onClose: () => this.setState(GAME_STATES.EXPLORATION),
      onOpenInventory: () => this.setState(GAME_STATES.INVENTORY),
    });

    await report(0.92, 'Compiling shaders');
    this._setupPostProcessing(preset);
    this.applySettings();
    window.addEventListener('resize', () => this._onResize());
    this._onResize();

    this.newGame();
    this.renderer.compile(this.scene, this.camera);
    await report(1, 'Ready');
  }

  _setupPostProcessing(preset) {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: preset.antialias ? 4 : 0,
    });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.45, 0.5, 0.82);
    this.composer.addPass(this.bloomPass);
    this.atmospherePass = new ShaderPass(AtmosphereShader);
    this.composer.addPass(this.atmospherePass);
    this.composer.addPass(new OutputPass());
  }

  applySettings() {
    const s = this.settings;
    const preset = QUALITY_PRESETS[s.quality] || QUALITY_PRESETS.medium;
    this.dayNight.setCycleMinutes(s.dayLengthMinutes);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, preset.pixelRatio));
    const shadowsChanged = this.renderer.shadowMap.enabled !== preset.shadows;
    this.renderer.shadowMap.enabled = preset.shadows;
    const sun = this.dayNight.sunLight;
    sun.castShadow = preset.shadows;
    if (sun.shadow.mapSize.x !== preset.shadowMapSize) {
      sun.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    }
    if (shadowsChanged) {
      this.scene.traverse((o) => {
        if (!o.material) return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.needsUpdate = true;
      });
    }
    this.usePostProcessing = s.postProcessing;
    this.bloomPass.enabled = preset.bloom;
    this._onResize();
  }

  _onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    const pr = this.renderer.getPixelRatio();
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    const dbh = this.renderer.getDrawingBufferSize(this._v2Temp || (this._v2Temp = new THREE.Vector2())).y;
    this.particles.setViewport(dbh, CAMERA.FOV);
    this.fireParticles.setViewport(dbh, CAMERA.FOV);
  }

  newGame() {
    this.inventory.clear();
    for (const [id, qty] of STARTING_ITEMS) this.inventory.add(id, qty);
    this.inventory.selectSlot(0);
    this.player.hunger = PLAYER.MAX_HUNGER * 0.8;
    this.player.thirst = PLAYER.MAX_THIRST * 0.7;
    this.player.reset(this.layout.playerSpawn);
    this.player.setFlashlight(false);
    this.kills = 0;
    for (const e of this.enemies) e.dispose();
    this.enemies = [];
    const count = this.dayNight.isNight() ? ENEMY.NIGHT_COUNT : ENEMY.DAY_COUNT;
    for (let i = 0; i < count; i++) this._spawnEnemy();
  }

  // =================================================================== state
  setState(next) {
    const prev = this.state;
    if (prev === next) return;
    this.state = next;
    const playing = PLAY_STATES.has(next);

    if (next !== GAME_STATES.INVENTORY) this.inventoryUI.close();
    if (next !== GAME_STATES.CRAFTING) this.craftingUI.close();

    switch (next) {
      case GAME_STATES.EXPLORATION:
      case GAME_STATES.COMBAT:
        this.menu.hide();
        this.hud.setVisible(true);
        if (!PLAY_STATES.has(prev)) {
          this.input.requestPointerLock();
          this.audio.resume();
        }
        break;
      case GAME_STATES.INVENTORY:
        this.inventoryUI.open();
        this.input.exitPointerLock();
        break;
      case GAME_STATES.CRAFTING:
        this.craftingUI.open();
        this.input.exitPointerLock();
        break;
      case GAME_STATES.PAUSED:
        this.menu.show('pause');
        this.input.exitPointerLock();
        break;
      case GAME_STATES.DEAD:
        this.menu.showDeath({ day: this.dayNight.day, kills: this.kills });
        this.input.exitPointerLock();
        break;
      case GAME_STATES.MENU:
        this.hud.setVisible(false);
        this.menu.show('main');
        this.input.exitPointerLock();
        break;
      default:
        break;
    }
    this.input.setTouchVisible(playing);
    this.input.releaseAll();
    this.audio.setAmbientMode(this.dayNight.isNight(), next === GAME_STATES.COMBAT);
    for (const cb of this.stateListeners) cb(next, prev);
  }

  play() {
    this.started = true;
    this.setState(GAME_STATES.EXPLORATION);
    if (this.hud) this.hud.notify('Find supplies, craft gear and survive. Press Tab for inventory, C to craft.', 'info');
  }

  resume() {
    this.setState(this.player.isDead ? GAME_STATES.DEAD : GAME_STATES.EXPLORATION);
  }

  respawn() {
    this.player.reset(this.layout.playerSpawn);
    this.deathTimer = 0;
    for (const e of this.enemies) {
      if (e.isHostile && e.position.distanceTo(this.player.position) < 30) {
        e.state = 'patrol';
        e.home.copy(e.position);
      }
    }
    this.setState(GAME_STATES.EXPLORATION);
    this.hud.notify('You wake up at the intersection…', 'warning');
  }

  // =================================================================== loop
  start() {
    let last = performance.now();
    const loop = (now) => {
      requestAnimationFrame(loop);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      this.update(dt);
      this.render();
      this.input.endFrame();
    };
    requestAnimationFrame(loop);
  }

  _handleStateInput() {
    const i = this.input;
    const S = GAME_STATES;
    if (i.wasPressed('pause')) {
      if (PLAY_STATES.has(this.state)) this.setState(S.PAUSED);
      else if (this.state === S.PAUSED) {
        // Ignore the Escape that just released the pointer lock.
        if (performance.now() - this.lastUnlockPause > 400) this.resume();
      } else if (this.state === S.INVENTORY || this.state === S.CRAFTING) this.setState(S.EXPLORATION);
      return;
    }
    if (i.wasPressed('inventory')) {
      if (PLAY_STATES.has(this.state) || this.state === S.CRAFTING) this.setState(S.INVENTORY);
      else if (this.state === S.INVENTORY) this.setState(S.EXPLORATION);
      return;
    }
    if (i.wasPressed('crafting')) {
      if (PLAY_STATES.has(this.state) || this.state === S.INVENTORY) this.setState(S.CRAFTING);
      else if (this.state === S.CRAFTING) this.setState(S.EXPLORATION);
    }
  }

  update(dt) {
    this.frame++;
    this.elapsed += dt;
    this.fps = lerp(this.fps, 1 / Math.max(dt, 1e-4), 0.05);
    this.input.update();
    this._handleStateInput();

    if (this.state === GAME_STATES.LOADING) return;
    if (this.state === GAME_STATES.PAUSED) {
      this.input.consumeLook(dt);
      return;
    }

    const S = GAME_STATES;
    const controlling = PLAY_STATES.has(this.state);

    if (this.state === S.MENU) {
      this.input.consumeLook(dt);
      this._updateEnvironment(dt * 4);
      this._updateMenuCamera(dt);
      return;
    }

    // ---- camera look
    const look = this.input.consumeLook(dt, 450);
    if (controlling) {
      const sens = CAMERA.LOOK_SENSITIVITY * this.settings.mouseSensitivity;
      this.cameraYaw -= look.dx * sens;
      this.cameraPitch = clamp(this.cameraPitch + look.dy * sens * (this.settings.invertY ? -1 : 1), CAMERA.MIN_PITCH, CAMERA.MAX_PITCH);
    }

    // ---- hotbar / tools
    if (controlling) {
      for (let s = 0; s < 5; s++) if (this.input.wasPressed(`hotbar${s + 1}`)) this.inventory.selectSlot(s);
      const delta = this.input.consumeHotbarDelta();
      if (delta) this.inventory.cycleSlot(delta);
      if (this.input.wasPressed('flashlight')) this._toggleFlashlight();
    } else {
      this.input.consumeHotbarDelta();
    }
    if (this.player.flashlightOn && !this.inventory.hasTool('flashlight')) this.player.setFlashlight(false);

    // ---- player
    const move = controlling && !this.player.isDead ? this.input.getMoveVector() : { x: 0, y: 0 };
    const events = this.player.update(dt, {
      move,
      sprint: controlling && this.input.isDown('sprint'),
      jump: controlling && this.input.wasPressed('jump'),
      cameraYaw: this.cameraYaw,
      physics: this.physics,
      loadFraction: this.inventory.getLoadFraction(),
    });
    this.player.setHeldItem(this.inventory.getSelectedId());
    this._handlePlayerEvents(events);

    if (controlling && !this.player.isDead) {
      if (this.input.isDown('attack')) this._primaryAction(this.input.wasPressed('attack'));
      this._updateInteraction();
    } else {
      this.hud.setPrompt(null);
    }

    // ---- combat & enemies
    this.combat.update(dt, this.enemies);
    this._updateEnemies(dt);

    // ---- death
    if (this.player.isDead && this.state !== S.DEAD) {
      if (this.deathTimer === 0) {
        this.audio.playDeath();
        this.hud.notify('You have been overwhelmed…', 'danger');
        this.player.setFlashlight(false);
      }
      this.deathTimer += dt;
      if (this.deathTimer > 2) this.setState(S.DEAD);
    }

    this._updateEnvironment(dt);
    this._updateCamera(dt);
    this._updateHUD();
  }

  // =================================================================== gameplay
  _handlePlayerEvents(events) {
    const wet = this.weather.rainIntensity > 0.4;
    if (events.footstep) {
      this.audio.playFootstep(this.player.sprinting, wet);
      if (this.player.sprinting) {
        this.particles.emit(this._v.set(this.player.position.x, this.player.position.y + 0.05, this.player.position.z), {
          count: 3, color: wet ? 0x5a6570 : 0x7d7466, speed: 0.8, spread: 1, up: 0.4, life: 0.5, size: 0.25, grow: 0.6, gravity: -1, drag: 2,
        });
      }
    }
    if (events.jumped) this.audio.playJump();
    if (events.landed && events.landSpeed > 4) {
      this.audio.playLand(events.landSpeed / 6);
      this.particles.emit(this._v.set(this.player.position.x, this.player.position.y + 0.05, this.player.position.z), {
        count: 12, color: 0x7d7466, speed: 2, spread: 1, up: 0.2, life: 0.6, size: 0.3, grow: 0.8, gravity: -2, drag: 3,
      });
    }
  }

  _primaryAction(justPressed) {
    const id = this.inventory.getSelectedId();
    const item = id ? ITEMS[id] : null;
    if (item?.category === 'consumable') {
      if (justPressed) this.useItem(id);
      return;
    }
    this.combat.playerAttack(this.player, this.inventory.getEquippedWeapon());
  }

  _toggleFlashlight() {
    if (!this.inventory.hasTool('flashlight')) {
      this.hud.notify('You need a flashlight — craft one from electronics, a battery and scrap.', 'warning');
      this.audio.playError();
      return;
    }
    this.player.setFlashlight(!this.player.flashlightOn);
    this.audio.playUI();
  }

  useItem(id) {
    const item = ITEMS[id];
    if (!item || item.category !== 'consumable' || !this.inventory.has(id)) return;
    if (this.player.isDead) return;
    this.inventory.remove(id, 1);
    this.player.applyEffects(item.effects);
    this.audio.playConsume();
    const parts = Object.entries(item.effects).map(([k, v]) => `+${v} ${k}`);
    this.hud.notify(`${item.icon} Used ${item.name} (${parts.join(', ')})`, 'success');
  }

  dropItem(id, qty) {
    if (!this.inventory.remove(id, qty)) return;
    const f = this.player.facing;
    const pos = new THREE.Vector3(this.player.position.x + Math.sin(f) * 1.2, 0, this.player.position.z + Math.cos(f) * 1.2);
    this._spawnPickup(id, qty, pos);
    this.hud.notify(`Dropped ${ITEMS[id].name} ×${qty}`, 'info');
  }

  _spawnPickup(id, qty, pos) {
    const obj = WorldObject.createPickup(id, qty, pos);
    this.world.root.add(obj.root);
    this.worldObjects.push(obj);
    return obj;
  }

  _onCraft(recipe, result) {
    if (result.ok) {
      const item = ITEMS[result.output.id];
      this.audio.playCraft();
      this.hud.notify(`🔨 Crafted ${item.icon} ${item.name}`, 'success');
    } else {
      this.audio.playError();
      this.hud.notify(result.reason, 'warning');
    }
  }

  _updateInteraction() {
    const p = this.player.position;
    let best = null;
    let bestD = Infinity;
    for (const o of this.worldObjects) {
      if (!o.isActive) continue;
      const dx = o.position.x - p.x;
      const dz = o.position.z - p.z;
      if (Math.abs(dx) > 5 || Math.abs(dz) > 5) continue;
      const d = Math.hypot(dx, dz) - o.reach;
      if (d < PLAYER.INTERACT_RANGE && d < bestD) {
        best = o;
        bestD = d;
      }
    }
    if (this.focused !== best) {
      this.focused?.setFocused(false);
      best?.setFocused(true);
      this.focused = best;
    }
    this.hud.setPrompt(best ? best.getPrompt(this.inventory) : null);
    if (best && this.input.wasPressed('interact')) this._interact(best);
  }

  _interact(obj) {
    const result = obj.interact(this.inventory);
    if (result.collected.length) {
      if (obj.kind === 'pickup') this.audio.playPickup();
      else {
        this.audio.playSearch();
        setTimeout(() => this.audio.playPickup(), 250);
      }
      for (const { id, qty } of result.collected) this.hud.notify(`+${qty} ${ITEMS[id].icon} ${ITEMS[id].name}`, 'loot');
    }
    if (result.message) {
      this.hud.notify(result.message, result.ok ? 'info' : 'warning');
      if (!result.ok) this.audio.playError();
    }
    if (obj.removed) {
      this.world.root.remove(obj.root);
      if (obj.kind === 'pickup') obj.dispose();
      const index = this.worldObjects.indexOf(obj);
      if (index !== -1) this.worldObjects.splice(index, 1);
      if (this.focused === obj) this.focused = null;
    }
  }

  _spawnEnemy() {
    const spawns = this.layout.enemySpawns;
    const p = this.player.position;
    for (let tries = 0; tries < 20; tries++) {
      const s = spawns[Math.floor(this.rng.next() * spawns.length)];
      if (Math.hypot(s.x - p.x, s.z - p.z) < ENEMY.SPAWN_MIN_DISTANCE) continue;
      const x = s.x + this.rng.range(-3, 3);
      const z = s.z + this.rng.range(-3, 3);
      if (this.physics.isBlocked(x, z, ENEMY.RADIUS)) continue;
      const enemy = new Enemy(this.scene, new THREE.Vector3(x, 0, z), this.rng);
      this.enemies.push(enemy);
      return enemy;
    }
    return null;
  }

  _onEnemyKilled(enemy) {
    this.kills++;
    this.hud.notify('☠ Infected down', 'danger');
    if (this.rng.chance(0.35)) {
      const id = this.rng.pick(KILL_DROPS);
      this._spawnPickup(id, 1, new THREE.Vector3(enemy.position.x + 0.5, 0, enemy.position.z + 0.3));
    }
  }

  _updateEnemies(dt) {
    const player = this.player;
    const aggression = this.dayNight.getAggression();
    const volumeFor = (e) => clamp(1 - e.position.distanceTo(player.position) / 45, 0, 1);
    const ctx = {
      player,
      physics: this.physics,
      aggression,
      onAttack: (e, dmg) => this.combat.enemyAttack(e, player, dmg),
      onScream: (e) => this.audio.playScream(volumeFor(e)),
      onGroan: (e) => this.audio.playGroan(volumeFor(e) * 0.8),
    };

    let hostileNearby = false;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      const d = Math.hypot(e.position.x - player.position.x, e.position.z - player.position.z);
      e.root.visible = d < ENEMY.ACTIVE_DISTANCE + 30;
      if (d < ENEMY.ACTIVE_DISTANCE || e.isHostile) e.update(dt, ctx);
      if (e.isHostile && d < 35) hostileNearby = true;
      if (e.removable) {
        e.dispose();
        this.enemies.splice(i, 1);
      }
    }

    // Separation between enemies and from the player.
    const R = ENEMY.RADIUS;
    for (let i = 0; i < this.enemies.length; i++) {
      const a = this.enemies[i];
      if (a.isDead) continue;
      const pdx = a.position.x - player.position.x;
      const pdz = a.position.z - player.position.z;
      const pd = Math.hypot(pdx, pdz);
      const minP = R + PLAYER.RADIUS;
      if (pd < minP && pd > 1e-4 && !player.isDead) {
        a.position.x += (pdx / pd) * (minP - pd);
        a.position.z += (pdz / pd) * (minP - pd);
      }
      for (let j = i + 1; j < this.enemies.length; j++) {
        const b = this.enemies[j];
        if (b.isDead) continue;
        const dx = b.position.x - a.position.x;
        const dz = b.position.z - a.position.z;
        const d = Math.hypot(dx, dz);
        if (d < R * 2 && d > 1e-4) {
          const push = (R * 2 - d) / 2;
          a.position.x -= (dx / d) * push;
          a.position.z -= (dz / d) * push;
          b.position.x += (dx / d) * push;
          b.position.z += (dz / d) * push;
        }
      }
    }

    // Respawn to maintain population (more at night).
    this.respawnTimer -= dt;
    if (this.respawnTimer <= 0) {
      this.respawnTimer = ENEMY.RESPAWN_INTERVAL;
      const target = this.dayNight.isNight() ? ENEMY.NIGHT_COUNT : ENEMY.DAY_COUNT;
      const alive = this.enemies.filter((e) => !e.isDead).length;
      if (alive < target) this._spawnEnemy();
    }

    // Exploration <-> combat state.
    if (this.state === GAME_STATES.EXPLORATION && hostileNearby) {
      this.setState(GAME_STATES.COMBAT);
      this.combatCooldown = 3;
    } else if (this.state === GAME_STATES.COMBAT) {
      if (hostileNearby) this.combatCooldown = 3;
      else {
        this.combatCooldown -= dt;
        if (this.combatCooldown <= 0) this.setState(GAME_STATES.EXPLORATION);
      }
    }
  }

  // =================================================================== world
  _updateEnvironment(dt) {
    const wasNight = this.dayNight.isNight();
    this.dayNight.update(dt);
    const isNight = this.dayNight.isNight();
    if (wasNight !== isNight) {
      this.audio.setAmbientMode(isNight, this.state === GAME_STATES.COMBAT);
      if (PLAY_STATES.has(this.state)) {
        this.hud.notify(isNight ? '🌙 Night falls. The infected grow restless…' : '🌅 Dawn breaks. The streets calm down.', isNight ? 'danger' : 'info');
      }
    }
    const focus = this.state === GAME_STATES.MENU ? this._menuFocus() : this.player.position;
    this.dayNight.apply(focus, this.camera.position);

    this.weather.update(dt, this.camera.position);
    if (this.weather.thunder) this.audio.playThunder();
    this.audio.setRain(this.weather.rainIntensity);
    this.dayNight.hemiLight.intensity += this.weather.flash * 2.5;

    const daylight = this.dayNight.getDaylight();
    this.scene.fog.color.copy(this.dayNight.fogColor).lerp(LIGHTNING_COLOR, this.weather.flash * 0.3);
    this.scene.fog.density = this.weather.fogDensity + (1 - daylight) * 0.004;
    this.renderer.toneMappingExposure = lerp(1.35, 1.05, daylight);
    for (const m of this.world.windowMaterials) m.emissiveIntensity = (1 - daylight) * 1.6;

    // Fires
    const p = focus;
    for (const f of this.world.fireBarrels) {
      const d = f.position.distanceTo(p);
      f.light.intensity = d < 90 ? (14 + Math.sin(this.elapsed * 13 + f.position.x) * 3 + Math.random() * 4) * (1 + (1 - daylight)) : 0;
      if (d > 70) continue;
      f.acc = (f.acc || 0) + dt * 45;
      const n = Math.floor(f.acc);
      f.acc -= n;
      if (n > 0) {
        this.fireParticles.emit(f.position, { count: n, color: 0xff7a1a, colorJitter: 0.25, speed: 0.6, spread: 0.4, up: 1.6, life: 0.7, size: 0.35, grow: -0.3, gravity: 1.5, drag: 1.5, offset: 0.5 });
        if (Math.random() < 0.25) {
          this.particles.emit(this._v.copy(f.position).setY(1.8), { count: 1, color: 0x2a2826, speed: 0.3, spread: 0.5, up: 1.2, life: 3, size: 0.6, grow: 0.9, gravity: 0.2, drag: 0.6, offset: 0.3 });
        }
      }
    }
    this.particles.update(dt);
    this.fireParticles.update(dt);

    for (const o of this.worldObjects) {
      const d = Math.hypot(o.position.x - p.x, o.position.z - p.z);
      // Distance culling keeps draw calls low; fog hides everything this far anyway.
      o.root.visible = d < OBJECT_DRAW_DISTANCE;
      if (d < 30 || o.focused) o.update(dt, d);
    }

    this.audio.update(dt);
    this.atmospherePass.uniforms.time.value = this.elapsed % 100;
    this.damageFlash = Math.max(0, this.damageFlash - dt * 2.5);
    const lowHealth = this.player.health < 30 ? (30 - this.player.health) / 60 : 0;
    this.atmospherePass.uniforms.damage.value = Math.min(1, this.damageFlash + lowHealth);
  }

  _menuFocus() {
    return this._v2.set(this.layout.playerSpawn.x, 0, this.layout.playerSpawn.z);
  }

  _updateMenuCamera(dt) {
    this.menuAngle = (this.menuAngle || 0) + dt * 0.05;
    const c = this._menuFocus();
    this.camera.position.set(c.x + Math.cos(this.menuAngle) * 70, 38, c.z + Math.sin(this.menuAngle) * 70);
    this.camera.lookAt(c.x, 6, c.z);
  }

  _updateCamera(dt) {
    const p = this.player.position;
    const yaw = this.cameraYaw;
    const pitch = this.cameraPitch;
    const pivot = this._v.set(
      p.x + Math.cos(yaw) * CAMERA.SHOULDER_OFFSET,
      p.y + CAMERA.TARGET_HEIGHT,
      p.z - Math.sin(yaw) * CAMERA.SHOULDER_OFFSET,
    );
    const dir = this._v2.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));

    let wanted = CAMERA.DISTANCE;
    this.raycaster.set(pivot, dir);
    this.raycaster.far = CAMERA.DISTANCE + 0.3;
    const hits = this.raycaster.intersectObjects(this.world.occluders, false);
    if (hits.length) wanted = Math.max(0.8, hits[0].distance - 0.3);
    // Snap in quickly to avoid clipping, ease out slowly.
    const k = wanted < this.cameraDistance ? damp(25, dt) : damp(4, dt);
    this.cameraDistance += (wanted - this.cameraDistance) * k;

    this.camera.position.copy(pivot).addScaledVector(dir, this.cameraDistance);
    if (this.camera.position.y < 0.3) this.camera.position.y = 0.3;
    this.camera.lookAt(pivot);

    if (this.cameraShake > 0) {
      const s = this.cameraShake * 0.12;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.cameraShake = Math.max(0, this.cameraShake - dt * 3);
    }
  }

  _updateHUD() {
    this.hud.update({
      player: this.player,
      inventory: this.inventory,
      dayNight: this.dayNight,
      weather: this.weather,
      fps: this.fps,
      showFps: this.settings.showFps,
      pointerHint: PLAY_STATES.has(this.state) && !this.input.isPointerLocked && !this.input.canPlayWithoutPointerLock,
      inCombat: this.state === GAME_STATES.COMBAT,
    });
    if (this.frame % 2 === 0) {
      this.hud.drawMinimap({ player: this.player, cameraYaw: this.cameraYaw, enemies: this.enemies, worldObjects: this.worldObjects });
    }
  }

  render() {
    if (!this.renderer) return;
    if (this.usePostProcessing) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
