import { describe, expect, it } from 'vitest';
import { generateCityLayout } from '../src/systems/MapGenerator.js';
import { closestRoadPoint, createRoad, roadPoint } from '../src/systems/RegionalMap.js';
import { drawMapLayout } from '../src/ui/MapView.js';
import { WORLD } from '../src/utils/Constants.js';

describe('regional world layout', () => {
  const layout = generateCityLayout();

  it('is elongated north-south with a dense south, mixed center and sparse north', () => {
    expect(layout.depth).toBeGreaterThan(layout.width * 1.7);
    expect(layout.regions.map((r) => r.id)).toEqual(['countryside', 'midlands', 'city']);
    const counts = layout.regions.map((r) => layout.buildings.filter((b) => b.district === r.id).length);
    expect(counts[2]).toBeGreaterThan(counts[1] * 2);
    expect(counts[1]).toBeGreaterThan(counts[0] * 4);
    for (const b of layout.buildings) {
      const region = layout.regions.find((r) => r.id === b.district);
      expect(b.z - b.d / 2).toBeGreaterThanOrEqual(region.minZ);
      expect(b.z + b.d / 2).toBeLessThanOrEqual(region.maxZ);
    }
    expect(layout.playerSpawn.z).toBeGreaterThan(layout.regions[2].minZ);
  });

  it('includes industrial, civic and rural destinations', () => {
    expect(layout.landmarks.map((l) => l.name)).toEqual(expect.arrayContaining([
      'FACTORY', 'WAREHOUSES', 'CITY HOSPITAL', 'MARKET', 'RANGER STATION', 'DOWNTOWN',
    ]));
    const factory = layout.buildings.find((b) => b.label === 'FACTORY');
    expect(factory.industrial).toBe(true);
    expect(factory.w).toBeGreaterThan(WORLD.BLOCK_SIZE * 0.8);
    const rural = layout.regions[0];
    expect(layout.scenery.filter((p) => p.type === 'tree' && p.z < rural.maxZ).length).toBeGreaterThan(100);
  });

  it('connects every road segment, including the diagonal and winding northern road', () => {
    const streets = layout.streets;
    const connected = (a, b) => {
      const cross = (x, z, y, w) => x * w - z * y;
      const ax = a.x2 - a.x1, az = a.z2 - a.z1;
      const bx = b.x2 - b.x1, bz = b.z2 - b.z1;
      const denom = cross(ax, az, bx, bz);
      if (Math.abs(denom) < 1e-8) {
        return [[a.x1, a.z1], [a.x2, a.z2]].some(([x, z]) => closestRoadPoint(b, x, z).distance < 0.001) ||
          [[b.x1, b.z1], [b.x2, b.z2]].some(([x, z]) => closestRoadPoint(a, x, z).distance < 0.001);
      }
      const t = cross(b.x1 - a.x1, b.z1 - a.z1, bx, bz) / denom;
      const u = cross(b.x1 - a.x1, b.z1 - a.z1, ax, az) / denom;
      return t >= -1e-8 && t <= 1 + 1e-8 && u >= -1e-8 && u <= 1 + 1e-8;
    };
    const visited = new Set([0]);
    const queue = [0];
    while (queue.length) {
      const i = queue.shift();
      streets.forEach((s, j) => {
        if (!visited.has(j) && connected(streets[i], s)) { visited.add(j); queue.push(j); }
      });
    }
    expect(visited.size).toBe(streets.length);
    expect(streets.some((s) => s.route === 'diagonal' && s.x1 !== s.x2 && s.z1 !== s.z2)).toBe(true);
    const spine = streets.filter((s) => s.route === 'main');
    expect(new Set(spine.filter((s) => s.district === 'countryside').map((s) => s.angle)).size).toBeGreaterThan(10);
    expect(Math.min(...spine.flatMap((s) => [s.z1, s.z2]))).toBeLessThan(layout.regions[0].minZ + 20);
    expect(Math.max(...spine.flatMap((s) => [s.z1, s.z2]))).toBeGreaterThan(layout.regions[2].maxZ - 20);
  });

  it.each([1337, 99, 42])('keeps roads, supplies, props and scenery in bounds for seed %i', (seed) => {
    const world = generateCityLayout(seed);
    expect(generateCityLayout(seed)).toEqual(world);
    for (const p of [...world.props, ...world.scenery, ...world.groundItems, ...world.containers, ...world.enemySpawns]) {
      expect(p.x).toBeGreaterThanOrEqual(world.bounds.minX);
      expect(p.x).toBeLessThanOrEqual(world.bounds.maxX);
      expect(p.z).toBeGreaterThanOrEqual(world.bounds.minZ);
      expect(p.z).toBeLessThanOrEqual(world.bounds.maxZ);
    }
    for (const road of world.streets) {
      expect(road.length).toBeGreaterThan(0);
      const x = (road.x1 + road.x2) / 2, z = (road.z1 + road.z2) / 2;
      for (const b of world.buildings) {
        // Conservative rectangle projection ensures the entire roadway is outside each building.
        const reach = (Math.abs(Math.cos(road.angle)) * b.w + Math.abs(Math.sin(road.angle)) * b.d) / 2;
        const t = closestRoadPoint(road, b.x, b.z);
        if (t.t > 0 && t.t < 1) expect(t.distance).toBeGreaterThanOrEqual(road.width / 2 + reach);
      }
      expect(closestRoadPoint(road, x, z).distance).toBeCloseTo(0);
    }
  });
});

describe('road geometry and map rendering', () => {
  it('samples and clamps diagonal roads using their finite endpoints', () => {
    const road = createRoad(10, 20, 40, 60, 10, 'city');
    expect(road.length).toBe(50);
    expect(roadPoint(road, 0.5)).toMatchObject({ x: 25, z: 40 });
    const offset = roadPoint(road, 0.5, 4);
    expect(closestRoadPoint(road, offset.x, offset.z).distance).toBeCloseTo(4);
    expect(closestRoadPoint(road, 70, 100)).toMatchObject({ x: 40, z: 60, t: 1 });
    expect(closestRoadPoint(road, -20, -20)).toMatchObject({ x: 10, z: 20, t: 0 });
  });

  it('draws every road with the same endpoints and widths as the playable world', () => {
    const layout = generateCityLayout();
    const lines = [];
    const g = { fillRect() {}, beginPath() {}, moveTo(x, z) { this.start = [x, z]; },
      lineTo(x, z) { this.end = [x, z]; }, stroke() { lines.push({ start: this.start, end: this.end, width: this.lineWidth }); } };
    drawMapLayout(g, layout, 2);
    expect(lines).toHaveLength(layout.streets.length);
    layout.streets.forEach((s, i) => {
      expect(lines[i]).toEqual({ start: [(s.x1 - layout.bounds.minX) * 2, (s.z1 - layout.bounds.minZ) * 2],
        end: [(s.x2 - layout.bounds.minX) * 2, (s.z2 - layout.bounds.minZ) * 2], width: s.width * 2 });
    });
  });
});
