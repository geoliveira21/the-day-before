import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Player } from '../src/objects/Player.js';
import { MapGenerator } from '../src/systems/MapGenerator.js';
import { PhysicsManager } from '../src/systems/PhysicsManager.js';
import { createRNG } from '../src/utils/Helpers.js';
import { WorldObject } from '../src/objects/WorldObject.js';
import { InventorySystem } from '../src/systems/InventorySystem.js';

describe('survival scene presentation', () => {
  it('keeps supplies grounded and only highlights focused loot without changing pickup behavior', () => {
    const item = WorldObject.createPickup('cloth', 2, new THREE.Vector3());
    const height = item.mesh.position.y;
    item.update(1, 3);
    expect(item.mesh.position.y).toBe(height);
    expect(item.mesh.rotation.y).toBe(0);
    expect(item.ring.visible).toBe(false);
    item.setFocused(true);
    item.update(1, 3);
    expect(item.ring.visible).toBe(true);
    item.update(1, 20);
    expect(item.ring.visible).toBe(false);
    const inventory = new InventorySystem();
    expect(item.interact(inventory).collected).toEqual([{ id: 'cloth', qty: 2 }]);
    expect(item.removed).toBe(true);
  });

  it('builds a geared survivor while preserving the animated rig and held items', () => {
    const player = new Player(new THREE.Scene());
    const pack = player.root.getObjectByName('backpack');
    expect(pack).toBeDefined();
    expect(pack.position.z).toBeLessThan(0);
    expect(pack.parent).toBe(player.rig.torso);
    player.setHeldItem('crowbar');
    expect(player.heldMesh.parent).toBe(player.rig.handAnchor);
    player.setHeldItem('water_bottle');
    expect(player.heldMesh.parent).toBe(player.rig.handAnchor);
    player.reset({ x: 2, z: 3 });
    expect(player.root.position.toArray()).toEqual([2, 0, 3]);
  });

  it('batches decorative plants and gives tree trunks collision', () => {
    const map = new MapGenerator();
    const root = new THREE.Group();
    const physics = new PhysicsManager();
    const scenery = [
      { type: 'weeds', x: 2, z: 3, scale: 1, rot: 0 },
      { type: 'tree', x: 6, z: 8, scale: 1, rot: 0.4 },
    ];
    map._buildScenery(root, { scenery }, physics);
    expect(root.children).toHaveLength(2);
    expect(root.getObjectByName('weeds').isInstancedMesh).toBe(true);
    expect(root.getObjectByName('tree').count).toBe(1);
    expect(physics.isBlocked(6, 8)).toBe(true);
    expect(physics.isBlocked(2, 3)).toBe(false);
  });

  it('builds finite, reproducible weathered vehicle geometry', () => {
    const map = new MapGenerator();
    const car = map._carGeometry(createRNG(42));
    const again = map._carGeometry(createRNG(42));
    expect(car.attributes.position.array).toEqual(again.attributes.position.array);
    expect([...car.attributes.position.array].every(Number.isFinite)).toBe(true);
    expect(car.attributes.color.count).toBe(car.attributes.position.count);
    car.computeBoundingBox();
    expect(car.boundingBox.max.y).toBeLessThan(1.7);
  });
});
