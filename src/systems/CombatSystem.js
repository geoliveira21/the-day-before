import * as THREE from 'three';
import { FIST } from '../utils/Constants.js';
import { angleDiff } from '../utils/Helpers.js';

/**
 * Returns the targets inside a horizontal attack cone.
 * @param {{x:number,z:number}} origin
 * @param {number} facing yaw in radians (0 = +Z)
 * @param {number} range
 * @param {number} arcDeg full cone angle in degrees
 * @param {Array<{position:{x:number,z:number}}>} targets
 * @param {number} [targetRadius] extra reach for target body size
 */
export function findTargetsInArc(origin, facing, range, arcDeg, targets, targetRadius = 0.45) {
  const half = (arcDeg * Math.PI) / 360;
  const hits = [];
  for (const t of targets) {
    const dx = t.position.x - origin.x;
    const dz = t.position.z - origin.z;
    const dist = Math.hypot(dx, dz);
    if (dist > range + targetRadius) continue;
    // Very close targets are always hit (prevents misses when overlapping).
    if (dist > 0.6 && Math.abs(angleDiff(facing, Math.atan2(dx, dz))) > half) continue;
    hits.push({ target: t, distance: dist });
  }
  return hits.sort((a, b) => a.distance - b.distance);
}

/**
 * Resolves melee attacks between the player and enemies, including damage,
 * knockback and audio/visual feedback.
 */
export class CombatSystem {
  constructor({ audio = null, particles = null, onEnemyKilled = null, onPlayerHit = null } = {}) {
    this.audio = audio;
    this.particles = particles;
    this.onEnemyKilled = onEnemyKilled;
    this.onPlayerHit = onPlayerHit;
    this.pending = [];
    this._tmp = new THREE.Vector3();
  }

  /**
   * Starts a player swing; the hit is resolved slightly later to match the animation.
   * @returns {boolean} whether an attack started
   */
  playerAttack(player, weapon) {
    const w = weapon || FIST;
    if (!player.startAttack(w.cooldown)) return false;
    this.audio?.playSwing(w === FIST ? 0.6 : 1);
    this.pending.push({ delay: w.cooldown * 0.4, weapon: w, player });
    return true;
  }

  update(dt, enemies) {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      p.delay -= dt;
      if (p.delay > 0) continue;
      this.pending.splice(i, 1);
      this._resolvePlayerHit(p.player, p.weapon, enemies);
    }
  }

  _resolvePlayerHit(player, weapon, enemies) {
    if (player.isDead) return;
    const alive = enemies.filter((e) => !e.isDead);
    const hits = findTargetsInArc(player.position, player.facing, weapon.range, weapon.arc ?? 70, alive);
    // Melee weapons hit at most two enemies per swing.
    for (const { target } of hits.slice(0, 2)) {
      const dmg = weapon.damage * (0.85 + Math.random() * 0.3);
      const dir = this._tmp.set(target.position.x - player.position.x, 0, target.position.z - player.position.z);
      if (dir.lengthSq() < 1e-6) dir.set(Math.sin(player.facing), 0, Math.cos(player.facing));
      dir.normalize().multiplyScalar(weapon.knockback);
      const killed = target.takeDamage(dmg, dir.clone());
      const chest = target.getChestPosition();
      this.particles?.emit(chest, { count: killed ? 40 : 18, color: 0x7a0a0a, speed: 3.5, spread: 1, up: 1.5, life: 0.8, size: 0.12, gravity: -12 });
      this.audio?.playHit(killed);
      if (killed) this.onEnemyKilled?.(target);
    }
  }

  /** Applies an enemy's attack to the player. */
  enemyAttack(enemy, player, damage) {
    if (player.isDead) return;
    const dir = new THREE.Vector3(player.position.x - enemy.position.x, 0, player.position.z - enemy.position.z);
    if (dir.lengthSq() > 1e-6) dir.normalize();
    player.takeDamage(damage, dir);
    this.particles?.emit(this._tmp.set(player.position.x, player.position.y + 1.2, player.position.z), {
      count: 14,
      color: 0x8a0b0b,
      speed: 3,
      spread: 1,
      up: 1,
      life: 0.7,
      size: 0.1,
      gravity: -12,
    });
    this.audio?.playPlayerHurt();
    this.onPlayerHit?.(damage);
  }
}
