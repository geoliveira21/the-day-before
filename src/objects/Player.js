import * as THREE from 'three';
import { ITEMS, PLAYER } from '../utils/Constants.js';
import { angleDiff, clamp, damp } from '../utils/Helpers.js';
import { createHumanoid, createItemMesh } from './Humanoid.js';

/**
 * Third-person player character: movement, survival stats and procedural animation.
 */
export class Player {
  constructor(scene) {
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.facing = 0; // model yaw, 0 = +Z
    this.onGround = true;
    this.health = PLAYER.MAX_HEALTH;
    this.stamina = PLAYER.MAX_STAMINA;
    this.hunger = PLAYER.MAX_HUNGER;
    this.thirst = PLAYER.MAX_THIRST;
    this.exhausted = false;
    this.sprinting = false;
    this.attackTimer = 0;
    this.attackDuration = 0.5;
    this.attackCooldown = 0;
    this.lastDamageTime = -Infinity;
    this.time = 0;
    this.walkPhase = 0;
    this.animState = 'idle';
    this.hurtFlash = 0;
    this.knockback = new THREE.Vector3();
    this.heldItemId = null;
    this.flashlightOn = false;

    this.materials = {
      skin: new THREE.MeshStandardMaterial({ color: 0xc89f82, roughness: 0.8 }),
      top: new THREE.MeshStandardMaterial({ color: 0x4a5236, roughness: 0.9 }),
      bottom: new THREE.MeshStandardMaterial({ color: 0x2f3440, roughness: 0.9 }),
      shoes: new THREE.MeshStandardMaterial({ color: 0x1d1a17, roughness: 0.9 }),
      extra: new THREE.MeshStandardMaterial({ color: 0x5c4630, roughness: 0.9 }),
    };
    this.rig = createHumanoid(this.materials);
    this.root = this.rig.root;
    scene.add(this.root);

    // Head gear: a simple beanie / gas-mask strap.
    const hat = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 0.32), new THREE.MeshStandardMaterial({ color: 0x2b2b2b }));
    hat.position.y = 0.3;
    hat.castShadow = true;
    this.rig.head.add(hat);

    this.flashlight = new THREE.SpotLight(0xfff1d0, 0, 32, Math.PI / 7, 0.45, 1.2);
    this.flashlight.position.set(0.15, 1.45, 0.25);
    this.flashlight.target.position.set(0, 1.0, 10);
    this.root.add(this.flashlight, this.flashlight.target);
  }

  get isDead() {
    return this.health <= 0;
  }

  get horizontalSpeed() {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  reset(spawn) {
    this.position.set(spawn.x, 0, spawn.z);
    this.velocity.set(0, 0, 0);
    this.knockback.set(0, 0, 0);
    this.health = PLAYER.MAX_HEALTH;
    this.stamina = PLAYER.MAX_STAMINA;
    this.hunger = Math.max(this.hunger, 60);
    this.thirst = Math.max(this.thirst, 60);
    this.exhausted = false;
    this.attackTimer = 0;
    this.attackCooldown = 0;
    this.root.rotation.set(0, this.facing, 0);
    this.root.position.copy(this.position);
  }

  setHeldItem(id) {
    if (id === this.heldItemId) return;
    this.heldItemId = id;
    if (this.heldMesh) {
      this.rig.handAnchor.remove(this.heldMesh);
      this.heldMesh.traverse((o) => {
        o.geometry?.dispose();
        o.material?.dispose();
      });
      this.heldMesh = null;
    }
    if (!id) return;
    const item = ITEMS[id];
    this.heldMesh = createItemMesh(id, item);
    const isLong = item?.category === 'weapon' || id === 'pickaxe';
    // Items are modelled along +Y; point them forward out of the fist.
    this.heldMesh.rotation.x = isLong ? Math.PI / 2 : 0;
    if (!isLong) this.heldMesh.scale.setScalar(0.8);
    this.rig.handAnchor.add(this.heldMesh);
  }

  setFlashlight(on) {
    this.flashlightOn = on;
    this.flashlight.intensity = on ? 40 : 0;
  }

  /** Begins a melee swing. Returns false if still cooling down. */
  startAttack(duration) {
    if (this.attackCooldown > 0 || this.isDead) return false;
    this.attackDuration = Math.max(0.3, duration);
    this.attackTimer = this.attackDuration;
    this.attackCooldown = duration;
    return true;
  }

  takeDamage(amount, fromDirection = null) {
    if (this.isDead) return;
    this.health = clamp(this.health - amount, 0, PLAYER.MAX_HEALTH);
    this.lastDamageTime = this.time;
    this.hurtFlash = 1;
    if (fromDirection) this.knockback.addScaledVector(fromDirection, 4);
  }

  /** Applies consumable effects ({ health, hunger, thirst }). */
  applyEffects(effects = {}) {
    if (effects.health) this.health = clamp(this.health + effects.health, 0, PLAYER.MAX_HEALTH);
    if (effects.hunger) this.hunger = clamp(this.hunger + effects.hunger, 0, PLAYER.MAX_HUNGER);
    if (effects.thirst) this.thirst = clamp(this.thirst + effects.thirst, 0, PLAYER.MAX_THIRST);
  }

  /**
   * @param {number} dt
   * @param {object} ctx { move:{x,y}, sprint, jump, cameraYaw, physics, loadFraction, aimYaw }
   * @returns {{ footstep: boolean, jumped: boolean, landed: boolean, landSpeed: number }}
   */
  update(dt, ctx) {
    const events = { footstep: false, jumped: false, landed: false, landSpeed: 0 };
    this.time += dt;
    this.attackTimer = Math.max(0, this.attackTimer - dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 3);

    const { move, cameraYaw, physics } = ctx;
    const moving = !this.isDead && (Math.abs(move.x) > 0.05 || Math.abs(move.y) > 0.05);

    // ---- stamina / sprint
    if (this.stamina <= 0) this.exhausted = true;
    if (this.exhausted && this.stamina > 25) this.exhausted = false;
    this.sprinting = moving && ctx.sprint && !this.exhausted && move.y > 0.2 && this.onGround !== false;
    if (this.sprinting) this.stamina = Math.max(0, this.stamina - PLAYER.STAMINA_DRAIN * dt);
    else this.stamina = Math.min(PLAYER.MAX_STAMINA, this.stamina + PLAYER.STAMINA_REGEN * dt * (moving ? 0.6 : 1));

    // ---- desired horizontal velocity (camera relative)
    const fx = -Math.sin(cameraYaw);
    const fz = -Math.cos(cameraYaw);
    const rx = Math.cos(cameraYaw);
    const rz = -Math.sin(cameraYaw);
    let speed = this.sprinting ? PLAYER.SPRINT_SPEED : PLAYER.WALK_SPEED;
    if (ctx.loadFraction > PLAYER.OVERWEIGHT_THRESHOLD) speed *= 0.7;
    if (this.attackTimer > 0) speed *= 0.6;
    const tx = moving ? (fx * move.y + rx * move.x) * speed : 0;
    const tz = moving ? (fz * move.y + rz * move.x) * speed : 0;
    const accel = damp(this.onGround ? 12 : 2.5, dt);
    this.velocity.x += (tx - this.velocity.x) * accel;
    this.velocity.z += (tz - this.velocity.z) * accel;

    // ---- jump
    if (ctx.jump && this.onGround && !this.isDead && this.stamina >= PLAYER.JUMP_STAMINA) {
      this.velocity.y = PLAYER.JUMP_VELOCITY;
      this.stamina -= PLAYER.JUMP_STAMINA;
      this.onGround = false;
      events.jumped = true;
    }

    // ---- integrate + collide
    this.knockback.multiplyScalar(Math.max(0, 1 - dt * 8));
    this.position.x += (this.velocity.x + this.knockback.x) * dt;
    this.position.z += (this.velocity.z + this.knockback.z) * dt;
    physics.resolveCircle(this.position, PLAYER.RADIUS, this.position.y, PLAYER.STEP_HEIGHT, PLAYER.HEIGHT);

    this.velocity.y -= PLAYER.GRAVITY * dt;
    this.position.y += this.velocity.y * dt;
    const ground = physics.getGroundHeight(this.position.x, this.position.z, PLAYER.RADIUS, this.position.y, PLAYER.STEP_HEIGHT);
    const wasOnGround = this.onGround;
    if (this.position.y <= ground) {
      if (!wasOnGround) {
        events.landed = true;
        events.landSpeed = -this.velocity.y;
        if (-this.velocity.y > 14) this.takeDamage((-this.velocity.y - 14) * 4);
      }
      this.position.y = ground;
      this.velocity.y = Math.max(0, this.velocity.y);
      this.onGround = true;
    } else if (wasOnGround && this.velocity.y <= 0 && this.position.y - ground < PLAYER.STEP_HEIGHT) {
      this.position.y = ground; // walking down small steps
      this.velocity.y = 0;
    } else {
      this.onGround = false;
    }

    // ---- facing
    let targetFacing = this.facing;
    if (this.attackTimer > 0 || ctx.aiming) targetFacing = Math.atan2(fx, fz);
    else if (moving) targetFacing = Math.atan2(tx, tz);
    this.facing += angleDiff(this.facing, targetFacing) * damp(14, dt);

    // ---- survival
    const drain = this.sprinting ? 1.5 : 1;
    this.hunger = Math.max(0, this.hunger - PLAYER.HUNGER_RATE * dt * drain);
    this.thirst = Math.max(0, this.thirst - PLAYER.THIRST_RATE * dt * drain);
    if (!this.isDead) {
      if (this.hunger <= 0 || this.thirst <= 0) {
        this.health = Math.max(0, this.health - PLAYER.STARVE_DAMAGE * dt);
      } else if (this.hunger > 50 && this.thirst > 50 && this.time - this.lastDamageTime > 5) {
        this.health = Math.min(PLAYER.MAX_HEALTH, this.health + PLAYER.REGEN_RATE * dt);
      }
    }

    // ---- animation
    const hs = this.horizontalSpeed;
    if (this.isDead) this.animState = 'dead';
    else if (this.attackTimer > 0) this.animState = 'attack';
    else if (!this.onGround) this.animState = 'jump';
    else if (hs > PLAYER.WALK_SPEED + 0.8) this.animState = 'run';
    else if (hs > 0.3) this.animState = 'walk';
    else this.animState = 'idle';

    const prevSin = Math.sin(this.walkPhase);
    if (this.onGround && hs > 0.3) this.walkPhase += dt * (hs * 1.9 + 1);
    const curSin = Math.sin(this.walkPhase);
    if (this.onGround && hs > 0.3 && Math.sign(prevSin) !== Math.sign(curSin)) events.footstep = true;

    this._animate(dt, hs);
    this.root.position.copy(this.position);
    this.root.rotation.y = this.facing;
    return events;
  }

  _animate(dt, hs) {
    const r = this.rig;
    const k = damp(12, dt);
    const running = this.animState === 'run';
    const swing = this.onGround ? Math.min(1, hs / PLAYER.WALK_SPEED) * (running ? 0.95 : 0.6) : 0;
    const s = Math.sin(this.walkPhase);

    let lLeg = s * swing;
    let rLeg = -s * swing;
    let lArm = -s * swing * 0.8;
    let rArm = s * swing * 0.8;
    let lean = running ? 0.18 : 0.04 * swing;
    let bob = this.onGround ? Math.abs(Math.cos(this.walkPhase)) * 0.05 * swing : 0;

    if (this.animState === 'idle') {
      bob = Math.sin(this.time * 2) * 0.01;
    } else if (this.animState === 'jump') {
      lLeg = -0.6;
      rLeg = 0.3;
      lArm = -0.9;
      rArm = -0.9;
    } else if (this.animState === 'dead') {
      lLeg = rLeg = lArm = rArm = 0;
    }

    let torsoTwist = 0;
    if (this.attackTimer > 0) {
      const p = 1 - this.attackTimer / this.attackDuration;
      if (p < 0.3) rArm = -2.7 * (p / 0.3);
      else if (p < 0.55) rArm = -2.7 + 3.2 * ((p - 0.3) / 0.25);
      else rArm = 0.5 * (1 - (p - 0.55) / 0.45);
      torsoTwist = p < 0.3 ? -0.35 * (p / 0.3) : -0.35 + 0.7 * Math.min(1, (p - 0.3) / 0.25);
      if (p > 0.55) torsoTwist *= 1 - (p - 0.55) / 0.45;
      lArm = -0.4;
      r.rightArm.rotation.x = rArm; // snappy, no smoothing
    } else {
      r.rightArm.rotation.x += (rArm - r.rightArm.rotation.x) * k;
    }
    r.leftLeg.rotation.x += (lLeg - r.leftLeg.rotation.x) * k;
    r.rightLeg.rotation.x += (rLeg - r.rightLeg.rotation.x) * k;
    r.leftArm.rotation.x += (lArm - r.leftArm.rotation.x) * k;
    r.torso.rotation.y += (torsoTwist - r.torso.rotation.y) * damp(20, dt);
    r.torso.rotation.x += (lean - r.torso.rotation.x) * k;
    r.body.position.y = bob;

    const deadTarget = this.isDead ? -Math.PI / 2 : 0;
    r.body.rotation.x += (deadTarget - r.body.rotation.x) * damp(6, dt);
    r.body.position.z = this.isDead ? -0.4 : 0;

    const flash = this.hurtFlash;
    for (const m of Object.values(this.materials)) m.emissive.setRGB(flash * 0.6, 0, 0);
  }
}
