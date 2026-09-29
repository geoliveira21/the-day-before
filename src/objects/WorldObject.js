import * as THREE from 'three';
import { INTERACTABLE_LABELS, ITEMS, LOOT_TABLES } from '../utils/Constants.js';
import { rollLoot } from '../utils/Helpers.js';
import { createItemMesh } from './Humanoid.js';

let markerTexture = null;
function getMarkerTexture() {
  if (markerTexture || typeof document === 'undefined') return markerTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,220,120,0.9)');
  grad.addColorStop(1, 'rgba(255,180,60,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  markerTexture = new THREE.CanvasTexture(c);
  markerTexture.colorSpace = THREE.SRGBColorSpace;
  return markerTexture;
}

const ringGeometry = new THREE.RingGeometry(0.3, 0.42, 24);
ringGeometry.rotateX(-Math.PI / 2);

/**
 * Something the player can interact with:
 *  - pickup: loose items on the ground (removed once collected)
 *  - container: crates, barrels, bodies, vehicles (searched once, may keep leftovers)
 *  - harvest: scrap piles that need a tool and have limited uses
 */
export class WorldObject {
  constructor({ kind, type, position, mesh = null, loot = [], label, requiresTool = null, uses = 1, rng = null, markerHeight = 1.4 }) {
    this.kind = kind;
    this.type = type;
    this.position = position.clone();
    this.mesh = mesh;
    this.loot = loot;
    this.label = label;
    this.requiresTool = requiresTool;
    this.uses = uses;
    this.rng = rng;
    this.removed = false;
    this.depleted = false;
    this.focused = false;
    this.time = Math.random() * 10;
    this.reach = 0; // extra interaction distance for large objects (e.g. cars)

    this.root = new THREE.Group();
    this.root.position.copy(this.position);
    if (mesh) this.root.add(mesh);

    const tex = getMarkerTexture();
    if (tex) {
      this.marker = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: tex, color: kind === 'pickup' ? 0x9cff9c : 0xffd27a, transparent: true, depthWrite: false, opacity: 0 }),
      );
      this.marker.position.y = markerHeight;
      this.marker.scale.setScalar(0.35);
      this.root.add(this.marker);
    }
    if (kind === 'pickup') {
      this.ring = new THREE.Mesh(
        ringGeometry,
        new THREE.MeshBasicMaterial({ color: 0x9cff9c, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      this.ring.position.y = 0.03;
      this.root.add(this.ring);
    }
  }

  static createPickup(id, qty, position) {
    const item = ITEMS[id];
    const mesh = createItemMesh(id, item);
    mesh.position.y = 0.25;
    return new WorldObject({
      kind: 'pickup',
      type: id,
      position,
      mesh,
      loot: [{ id, qty }],
      label: item?.name ?? id,
      markerHeight: 0.9,
    });
  }

  static createContainer(type, position, mesh, rng) {
    const table = LOOT_TABLES[type] || LOOT_TABLES.crate;
    return new WorldObject({
      kind: 'container',
      type,
      position,
      mesh,
      loot: rollLoot(table, rng),
      label: INTERACTABLE_LABELS[type] || type,
      markerHeight: type === 'body' ? 0.8 : type === 'vehicle' ? 2 : 1.5,
    });
  }

  static createHarvest(type, position, mesh, rng, { requiresTool = 'pickaxe', uses = 3 } = {}) {
    return new WorldObject({
      kind: 'harvest',
      type,
      position,
      mesh,
      label: INTERACTABLE_LABELS[type] || type,
      requiresTool,
      uses,
      rng,
      markerHeight: 1.3,
    });
  }

  get isActive() {
    return !this.removed && !this.depleted;
  }

  /** Text for the interaction prompt. */
  getPrompt(inventory) {
    if (!this.isActive) return null;
    if (this.kind === 'pickup') {
      const { id, qty } = this.loot[0];
      return `Pick up ${ITEMS[id]?.name ?? id}${qty > 1 ? ` ×${qty}` : ''}`;
    }
    if (this.kind === 'harvest') {
      if (this.requiresTool && !inventory.hasTool(this.requiresTool)) {
        return `${this.label} — requires ${ITEMS[this.requiresTool]?.name ?? this.requiresTool}`;
      }
      return `Harvest ${this.label} (${this.uses} left)`;
    }
    return `Search ${this.label}`;
  }

  /**
   * Moves loot into the inventory respecting weight limits.
   * @returns {{ ok: boolean, collected: {id:string, qty:number}[], message?: string }}
   */
  interact(inventory) {
    if (!this.isActive) return { ok: false, collected: [] };

    if (this.kind === 'harvest') {
      if (this.requiresTool && !inventory.hasTool(this.requiresTool)) {
        return { ok: false, collected: [], message: `You need a ${ITEMS[this.requiresTool]?.name ?? this.requiresTool}` };
      }
      if (this.loot.length === 0) this.loot = rollLoot(LOOT_TABLES[this.type] || [], this.rng);
    }

    const collected = [];
    let blocked = false;
    for (const stack of this.loot) {
      const added = inventory.add(stack.id, stack.qty);
      if (added > 0) collected.push({ id: stack.id, qty: added });
      stack.qty -= added;
      if (stack.qty > 0) blocked = true;
    }
    this.loot = this.loot.filter((s) => s.qty > 0);

    if (this.kind === 'harvest' && !blocked) {
      this.uses -= 1;
      if (this.uses <= 0) this.depleted = true;
    } else if (this.loot.length === 0) {
      if (this.kind === 'pickup') this.removed = true;
      else this.depleted = true;
    }

    if (this.kind === 'container' && collected.length === 0 && !blocked) {
      return { ok: true, collected, message: `${this.label} is empty` };
    }
    return {
      ok: collected.length > 0,
      collected,
      message: blocked ? 'Too heavy — some items were left behind' : undefined,
    };
  }

  setFocused(focused) {
    this.focused = focused;
  }

  update(dt, distanceToPlayer) {
    this.time += dt;
    const visible = this.isActive && distanceToPlayer < 14;
    if (this.marker) {
      const target = !visible ? 0 : this.focused ? 1 : 0.55;
      const m = this.marker.material;
      m.opacity += (target - m.opacity) * Math.min(1, dt * 8);
      this.marker.visible = m.opacity > 0.01;
      const pulse = 1 + Math.sin(this.time * 4) * 0.15;
      this.marker.scale.setScalar((this.focused ? 0.55 : 0.32) * pulse);
    }
    if (this.kind === 'pickup' && this.mesh) {
      this.mesh.rotation.y += dt * 1.2;
      this.mesh.position.y = 0.25 + Math.sin(this.time * 2) * 0.06;
      if (this.ring) {
        this.ring.material.opacity = (this.focused ? 0.9 : 0.4) + Math.sin(this.time * 3) * 0.1;
        this.ring.scale.setScalar(this.focused ? 1.25 : 1);
      }
    }
  }

  /** Frees GPU resources. Only valid for pickups, whose meshes are not shared. */
  dispose() {
    this.root.traverse((o) => {
      if (o.geometry && o.geometry !== ringGeometry) o.geometry.dispose();
      o.material?.dispose?.();
    });
  }
}
