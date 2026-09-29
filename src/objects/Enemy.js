import * as THREE from 'three';
import { ENEMY } from '../utils/Constants.js';
import { angleDiff, damp } from '../utils/Helpers.js';
import { createHumanoid } from './Humanoid.js';

export const ENEMY_STATES = Object.freeze({
  PATROL: 'patrol',
  CHASE: 'chase',
  ATTACK: 'attack',
  HURT: 'hurt',
  DEAD: 'dead',
});

const SKIN_TONES = [0x7d8f6a, 0x8a9474, 0x6f7d63, 0x9a8f7a];
const CLOTHES = [0x3b3530, 0x4a3b2c, 0x2e3a44, 0x523a3a, 0x3f4a3a];

/**
 * Zombie-like mutant with a small finite state machine:
 * patrol → chase (player detected) → attack (in range) → hurt (knockback) → dead.
 */
export class Enemy {
  constructor(scene, position, rng = Math) {
    const rand = () => (typeof rng.next === 'function' ? rng.next() : Math.random());
    const pick = (arr) => arr[Math.floor(rand() * arr.length)];
    this.scene = scene;
    this.position = position.clone();
    this.home = position.clone();
    this.velocity = new THREE.Vector3();
    this.knockback = new THREE.Vector3();
    this.facing = rand() * Math.PI * 2;
    this.state = ENEMY_STATES.PATROL;
    this.health = ENEMY.MAX_HEALTH;
    this.maxHealth = ENEMY.MAX_HEALTH;
    this.waypoint = null;
    this.waitTimer = rand() * 3;
    this.stateTimer = 0;
    this.attackTimer = 0;
    this.attackCooldown = 0;
    this.attackHitDone = false;
    this.hurtTimer = 0;
    this.deadTimer = 0;
    this.lostTimer = 0;
    this.stuckTimer = 0;
    this.detourTimer = 0;
    this.detourSign = 1;
    this.groanTimer = 3 + rand() * 10;
    this.hurtFlash = 0;
    this.time = rand() * 10;
    this.walkPhase = 0;
    this.speedFactor = 0.85 + rand() * 0.3;
    this.removable = false;

    this.materials = {
      skin: new THREE.MeshStandardMaterial({ color: pick(SKIN_TONES), roughness: 0.9 }),
      top: new THREE.MeshStandardMaterial({ color: pick(CLOTHES), roughness: 1 }),
      bottom: new THREE.MeshStandardMaterial({ color: pick(CLOTHES), roughness: 1 }),
      shoes: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 1 }),
    };
    this.rig = createHumanoid(this.materials, { scale: 0.95 + rand() * 0.15 });
    this.root = this.rig.root;
    // Glowing eyes make enemies readable at night.
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff3b1f });
    this.eyeMaterial = eyeMat;
    for (const x of [-0.07, 0.07]) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.02), eyeMat);
      eye.position.set(x, 0.16, 0.155);
      this.rig.head.add(eye);
    }
    this.rig.head.rotation.z = (rand() - 0.5) * 0.5;
    scene.add(this.root);
    this.root.position.copy(this.position);
  }

  get isDead() {
    return this.state === ENEMY_STATES.DEAD;
  }

  get isHostile() {
    return this.state === ENEMY_STATES.CHASE || this.state === ENEMY_STATES.ATTACK;
  }

  /** Chest position used for particles and hit tests. */
  getChestPosition(target = new THREE.Vector3()) {
    return target.set(this.position.x, this.position.y + 1.2, this.position.z);
  }

  takeDamage(amount, knockbackVec) {
    if (this.isDead) return false;
    this.health -= amount;
    this.hurtFlash = 1;
    if (knockbackVec) this.knockback.add(knockbackVec);
    if (this.health <= 0) {
      this.health = 0;
      this.state = ENEMY_STATES.DEAD;
      this.deadTimer = 0;
      return true;
    }
    this.state = ENEMY_STATES.HURT;
    this.hurtTimer = ENEMY.HURT_TIME;
    this.attackTimer = 0;
    return false;
  }

  _pickWaypoint(physics) {
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 4 + Math.random() * 10;
      const x = this.home.x + Math.cos(a) * r;
      const z = this.home.z + Math.sin(a) * r;
      if (!physics.isBlocked(x, z, ENEMY.RADIUS)) return new THREE.Vector3(x, 0, z);
    }
    return this.home.clone();
  }

  /**
   * @param {number} dt
   * @param {object} ctx { player, physics, aggression, onAttack(enemy, damage), onScream(enemy), onGroan(enemy) }
   */
  update(dt, ctx) {
    this.time += dt;
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 4);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    const { player, physics, aggression } = ctx;

    if (this.isDead) {
      this.deadTimer += dt;
      this.knockback.multiplyScalar(Math.max(0, 1 - dt * 6));
      this.position.addScaledVector(this.knockback, dt);
      physics.resolveCircle(this.position, ENEMY.RADIUS, 0);
      this.rig.body.rotation.x += (-Math.PI / 2 - this.rig.body.rotation.x) * damp(8, dt);
      this.rig.body.position.z = -0.45;
      const sinking = this.deadTimer > ENEMY.CORPSE_TIME - 2;
      this.root.position.set(this.position.x, sinking ? this.root.position.y - dt * 0.3 : this.position.y, this.position.z);
      if (this.deadTimer > ENEMY.CORPSE_TIME) this.removable = true;
      this._applyFlash();
      return;
    }

    const dx = player.position.x - this.position.x;
    const dz = player.position.z - this.position.z;
    const dist = Math.hypot(dx, dz);
    const playerAlive = !player.isDead;
    const detect = ENEMY.DETECT_RANGE * aggression * (player.sprinting ? 1.35 : 1);

    let moveSpeed = 0;
    let targetX = this.position.x;
    let targetZ = this.position.z;

    switch (this.state) {
      case ENEMY_STATES.PATROL: {
        if (playerAlive && dist < detect) {
          this.state = ENEMY_STATES.CHASE;
          this.lostTimer = 0;
          ctx.onScream?.(this);
          break;
        }
        if (this.waitTimer > 0) {
          this.waitTimer -= dt;
          break;
        }
        if (!this.waypoint) this.waypoint = this._pickWaypoint(physics);
        targetX = this.waypoint.x;
        targetZ = this.waypoint.z;
        moveSpeed = ENEMY.PATROL_SPEED * this.speedFactor;
        if (Math.hypot(targetX - this.position.x, targetZ - this.position.z) < 0.8) {
          this.waypoint = null;
          this.waitTimer = 1 + Math.random() * 4;
        }
        break;
      }
      case ENEMY_STATES.CHASE: {
        if (!playerAlive) {
          this.state = ENEMY_STATES.PATROL;
          break;
        }
        if (dist > detect * ENEMY.LOSE_RANGE_MULT) {
          this.lostTimer += dt;
          if (this.lostTimer > 4) {
            this.state = ENEMY_STATES.PATROL;
            this.home.copy(this.position);
            this.waypoint = null;
            break;
          }
        } else {
          this.lostTimer = 0;
        }
        if (dist < ENEMY.ATTACK_RANGE && this.attackCooldown <= 0) {
          this.state = ENEMY_STATES.ATTACK;
          this.attackTimer = ENEMY.ATTACK_WINDUP / Math.sqrt(aggression);
          this.attackHitDone = false;
          break;
        }
        targetX = player.position.x;
        targetZ = player.position.z;
        moveSpeed = dist < ENEMY.ATTACK_RANGE * 0.8 ? 0 : ENEMY.CHASE_SPEED * this.speedFactor * (0.85 + 0.15 * aggression);
        break;
      }
      case ENEMY_STATES.ATTACK: {
        this.attackTimer -= dt;
        targetX = player.position.x;
        targetZ = player.position.z;
        if (this.attackTimer <= 0 && !this.attackHitDone) {
          this.attackHitDone = true;
          if (playerAlive && dist < ENEMY.ATTACK_RANGE + 0.4) ctx.onAttack?.(this, ENEMY.ATTACK_DAMAGE * (0.8 + 0.2 * aggression));
          this.attackCooldown = ENEMY.ATTACK_COOLDOWN / aggression;
          this.stateTimer = 0.35;
        }
        if (this.attackHitDone) {
          this.stateTimer -= dt;
          if (this.stateTimer <= 0) this.state = ENEMY_STATES.CHASE;
        }
        break;
      }
      case ENEMY_STATES.HURT: {
        this.hurtTimer -= dt;
        if (this.hurtTimer <= 0) this.state = playerAlive ? ENEMY_STATES.CHASE : ENEMY_STATES.PATROL;
        break;
      }
      default:
        break;
    }

    // Steering
    let mx = targetX - this.position.x;
    let mz = targetZ - this.position.z;
    const ml = Math.hypot(mx, mz);
    if (ml > 0.001 && moveSpeed > 0) {
      mx /= ml;
      mz /= ml;
      if (this.detourTimer > 0) {
        this.detourTimer -= dt;
        const a = this.detourSign * 1.1;
        const c = Math.cos(a);
        const s = Math.sin(a);
        [mx, mz] = [mx * c - mz * s, mx * s + mz * c];
      }
      this.velocity.x = mx * moveSpeed;
      this.velocity.z = mz * moveSpeed;
    } else {
      this.velocity.x *= Math.max(0, 1 - dt * 10);
      this.velocity.z *= Math.max(0, 1 - dt * 10);
    }

    if (this.state === ENEMY_STATES.ATTACK || this.state === ENEMY_STATES.CHASE || this.state === ENEMY_STATES.HURT) {
      if (dist > 0.01) this.facing += angleDiff(this.facing, Math.atan2(dx, dz)) * damp(10, dt);
    } else if (Math.hypot(this.velocity.x, this.velocity.z) > 0.1) {
      this.facing += angleDiff(this.facing, Math.atan2(this.velocity.x, this.velocity.z)) * damp(5, dt);
    }

    this.knockback.multiplyScalar(Math.max(0, 1 - dt * 6));
    const beforeX = this.position.x;
    const beforeZ = this.position.z;
    this.position.x += (this.velocity.x + this.knockback.x) * dt;
    this.position.z += (this.velocity.z + this.knockback.z) * dt;
    const hit = physics.resolveCircle(this.position, ENEMY.RADIUS, this.position.y);
    this.position.y = physics.getGroundHeight(this.position.x, this.position.z, ENEMY.RADIUS, this.position.y + 0.1);

    // Stuck detection → detour around obstacles
    const moved = Math.hypot(this.position.x - beforeX, this.position.z - beforeZ);
    if (moveSpeed > 0 && hit && moved < moveSpeed * dt * 0.35) {
      this.stuckTimer += dt;
      if (this.stuckTimer > 0.4) {
        this.stuckTimer = 0;
        if (this.state === ENEMY_STATES.PATROL) this.waypoint = null;
        else {
          this.detourTimer = 0.8;
          this.detourSign = Math.random() < 0.5 ? -1 : 1;
        }
      }
    } else {
      this.stuckTimer = Math.max(0, this.stuckTimer - dt);
    }

    // Idle groans
    this.groanTimer -= dt;
    if (this.groanTimer <= 0) {
      this.groanTimer = 6 + Math.random() * 12;
      ctx.onGroan?.(this);
    }

    this._animate(dt, Math.hypot(this.velocity.x, this.velocity.z));
    this.root.position.copy(this.position);
    this.root.rotation.y = this.facing;
  }

  _animate(dt, speed) {
    const r = this.rig;
    const k = damp(10, dt);
    this.walkPhase += dt * (speed * 2.4 + 0.5);
    const s = Math.sin(this.walkPhase);
    const swing = Math.min(1, speed / 2) * 0.55;
    const chasing = this.state === ENEMY_STATES.CHASE || this.state === ENEMY_STATES.ATTACK;
    let armBase = chasing ? -1.45 : -0.15 + Math.sin(this.time * 1.3) * 0.08;
    let lArm = armBase + s * 0.15;
    let rArm = armBase - s * 0.15;
    if (this.state === ENEMY_STATES.ATTACK) {
      const windup = ENEMY.ATTACK_WINDUP;
      const p = this.attackHitDone ? 1 : 1 - Math.max(0, this.attackTimer) / windup;
      lArm = rArm = this.attackHitDone ? -0.9 : -1.4 - 1.2 * p;
    }
    if (this.state === ENEMY_STATES.HURT) {
      lArm = rArm = -0.3;
    }
    r.leftArm.rotation.x += (lArm - r.leftArm.rotation.x) * k;
    r.rightArm.rotation.x += (rArm - r.rightArm.rotation.x) * (this.state === ENEMY_STATES.ATTACK ? damp(25, dt) : k);
    r.leftLeg.rotation.x += (s * swing - r.leftLeg.rotation.x) * k;
    r.rightLeg.rotation.x += (-s * swing - r.rightLeg.rotation.x) * k;
    const lean = this.state === ENEMY_STATES.HURT ? -0.35 : chasing ? 0.28 : 0.12;
    r.torso.rotation.x += (lean - r.torso.rotation.x) * k;
    r.torso.rotation.z = Math.sin(this.walkPhase * 0.5) * 0.08;
    r.body.position.y = Math.abs(Math.cos(this.walkPhase)) * 0.04 * swing;
    this._applyFlash();
  }

  _applyFlash() {
    const f = this.hurtFlash;
    for (const m of Object.values(this.materials)) m.emissive.setRGB(f * 0.8, f * 0.1, f * 0.1);
  }

  dispose() {
    this.scene.remove(this.root);
    this.root.traverse((o) => {
      o.geometry?.dispose();
    });
    for (const m of Object.values(this.materials)) m.dispose();
    this.eyeMaterial.dispose();
  }
}
