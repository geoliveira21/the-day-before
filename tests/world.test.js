import { describe, expect, it } from 'vitest';
import { PhysicsManager } from '../src/systems/PhysicsManager.js';
import { DayNightCycle } from '../src/systems/DayNightCycle.js';
import { findTargetsInArc } from '../src/systems/CombatSystem.js';
import { generateCityLayout } from '../src/systems/MapGenerator.js';
import { ITEMS, LOOT_TABLES } from '../src/utils/Constants.js';

describe('PhysicsManager', () => {
  it('pushes circles out of boxes', () => {
    const physics = new PhysicsManager();
    physics.addBox({ minX: 0, maxX: 2, minZ: 0, maxZ: 2, maxY: 3 });
    const pos = { x: 2.2, z: 1 };
    expect(physics.resolveCircle(pos, 0.5)).toBe(true);
    expect(pos.x).toBeCloseTo(2.5);
    const inside = { x: 1.9, z: 1 };
    physics.resolveCircle(inside, 0.4);
    expect(inside.x).toBeCloseTo(2.4);
  });

  it('lets low obstacles be stepped on and reports ground height', () => {
    const physics = new PhysicsManager();
    physics.addBox({ minX: 0, maxX: 2, minZ: 0, maxZ: 2, maxY: 0.3 });
    const pos = { x: 1, z: 1 };
    expect(physics.resolveCircle(pos, 0.4, 0)).toBe(false);
    expect(physics.getGroundHeight(1, 1, 0.4, 0)).toBeCloseTo(0.3);
    expect(physics.getGroundHeight(5, 5, 0.4, 0)).toBe(0);
  });

  it('respects world bounds and removal', () => {
    const physics = new PhysicsManager();
    physics.setBounds(-10, 10, -10, 10);
    const pos = { x: 50, z: 0 };
    physics.resolveCircle(pos, 0.5);
    expect(pos.x).toBeCloseTo(9.5);
    const c = physics.addRotatedBox(0, 0, 2, 2, 2, Math.PI / 4);
    expect(physics.isBlocked(0, 0)).toBe(true);
    physics.removeCollider(c);
    expect(physics.isBlocked(0, 0)).toBe(false);
  });
});

describe('DayNightCycle', () => {
  it('advances time according to the configured cycle length', () => {
    const cycle = new DayNightCycle({ cycleMinutes: 20, startHour: 8 });
    cycle.update(50); // 50s of a 1200s cycle = 1 in-game hour
    expect(cycle.hour).toBeCloseTo(9);
    cycle.setCycleMinutes(10);
    expect(cycle.hoursPerSecond).toBeCloseTo(24 / 600);
  });

  it('wraps days and detects night', () => {
    const cycle = new DayNightCycle({ cycleMinutes: 1, startHour: 23 });
    cycle.update(5); // 2 in-game hours
    expect(cycle.day).toBe(2);
    expect(cycle.hour).toBeCloseTo(1);
    expect(cycle.isNight()).toBe(true);
    cycle.setHour(12);
    expect(cycle.isNight()).toBe(false);
    expect(cycle.getDaylight()).toBeCloseTo(1);
    expect(cycle.getAggression()).toBeCloseTo(1);
    cycle.setHour(0);
    expect(cycle.getDaylight()).toBeCloseTo(0);
    expect(cycle.getAggression()).toBeGreaterThan(1.2);
    expect(cycle.getPhaseLabel()).toBe('Night');
  });
});

describe('findTargetsInArc', () => {
  const origin = { x: 0, z: 0 };
  it('hits targets in front and within range only', () => {
    const front = { position: { x: 0, z: 1.5 } };
    const behind = { position: { x: 0, z: -1.5 } };
    const far = { position: { x: 0, z: 10 } };
    const hits = findTargetsInArc(origin, 0, 2, 90, [front, behind, far]);
    expect(hits.map((h) => h.target)).toEqual([front]);
  });

  it('sorts by distance', () => {
    const a = { position: { x: 0.2, z: 1.8 } };
    const b = { position: { x: 0, z: 1 } };
    const hits = findTargetsInArc(origin, 0, 2, 120, [a, b]);
    expect(hits[0].target).toBe(b);
  });
});

describe('generateCityLayout', () => {
  const layout = generateCityLayout(1337);

  it('is deterministic for a given seed', () => {
    const again = generateCityLayout(1337);
    expect(again.buildings.length).toBe(layout.buildings.length);
    expect(again.buildings[5]).toEqual(layout.buildings[5]);
    const other = generateCityLayout(99);
    expect(other.buildings).not.toEqual(layout.buildings);
  });

  it('produces a populated city', () => {
    expect(layout.buildings.length).toBeGreaterThan(30);
    expect(layout.props.length).toBeGreaterThan(20);
    expect(layout.containers.length).toBeGreaterThan(10);
    expect(layout.groundItems.length).toBeGreaterThan(10);
    expect(layout.enemySpawns.length).toBeGreaterThan(5);
    for (const b of layout.buildings) expect(b.h).toBeGreaterThan(0);
  });

  it('only references valid items and loot tables', () => {
    for (const g of layout.groundItems) expect(ITEMS[g.id]).toBeDefined();
    for (const c of layout.containers) expect(LOOT_TABLES[c.type]).toBeDefined();
  });

  it('keeps the player spawn clear of buildings and inside bounds', () => {
    const { x, z } = layout.playerSpawn;
    const b = layout.bounds;
    expect(x).toBeGreaterThan(b.minX);
    expect(x).toBeLessThan(b.maxX);
    expect(z).toBeGreaterThan(b.minZ);
    expect(z).toBeLessThan(b.maxZ);
    for (const bld of layout.buildings) {
      const inside = x > bld.x - bld.w / 2 - 1 && x < bld.x + bld.w / 2 + 1 && z > bld.z - bld.d / 2 - 1 && z < bld.z + bld.d / 2 + 1;
      expect(inside).toBe(false);
    }
  });
});
