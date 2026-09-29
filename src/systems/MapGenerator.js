import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GROUND_LOOT, WORLD } from '../utils/Constants.js';
import { createRNG } from '../utils/Helpers.js';
import { WorldObject } from '../objects/WorldObject.js';

// ============================================================== layout (pure)

/**
 * Generates a Manhattan-style grid city as plain data (no Three.js objects).
 * Deterministic for a given seed.
 */
export function generateCityLayout(seed = WORLD.SEED, config = WORLD) {
  const rng = createRNG(seed);
  const B = config.BLOCK_SIZE;
  const S = config.STREET_WIDTH;
  const A = config.ALLEY_WIDTH;
  const pitch = B + S;
  const width = config.BLOCKS_X * pitch + S;
  const depth = config.BLOCKS_Z * pitch + S;
  const originX = -width / 2;
  const originZ = -depth / 2;

  const layout = {
    seed,
    width,
    depth,
    bounds: { minX: originX, maxX: originX + width, minZ: originZ, maxZ: originZ + depth },
    blocks: [],
    streets: [],
    alleys: [],
    buildings: [],
    props: [],
    containers: [],
    harvestables: [],
    groundItems: [],
    fireBarrels: [],
    enemySpawns: [],
    playerSpawn: null,
  };

  // Streets: avenues run along Z, streets along X.
  for (let i = 0; i <= config.BLOCKS_X; i++) {
    const x = originX + S / 2 + i * pitch;
    layout.streets.push({ axis: 'z', x, z: 0, length: depth, width: S });
  }
  for (let j = 0; j <= config.BLOCKS_Z; j++) {
    const z = originZ + S / 2 + j * pitch;
    layout.streets.push({ axis: 'x', x: 0, z, length: width, width: S });
  }

  const cx = Math.floor(config.BLOCKS_X / 2);
  const cz = Math.floor(config.BLOCKS_Z / 2);
  layout.playerSpawn = { x: originX + S / 2 + cx * pitch, z: originZ + S / 2 + cz * pitch };
  const spawn = layout.playerSpawn;

  // Occupancy rectangles used to avoid overlapping props.
  const occupied = [];
  const overlaps = (x, z, r) =>
    occupied.some((o) => x + r > o.minX && x - r < o.maxX && z + r > o.minZ && z - r < o.maxZ);
  const occupy = (x, z, hw, hd) => occupied.push({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd });
  const nearSpawn = (x, z, r) => Math.hypot(x - spawn.x, z - spawn.z) < r;

  // ---------------------------------------------------------------- blocks
  for (let bx = 0; bx < config.BLOCKS_X; bx++) {
    for (let bz = 0; bz < config.BLOCKS_Z; bz++) {
      const minX = originX + S + bx * pitch;
      const minZ = originZ + S + bz * pitch;
      const block = { minX, maxX: minX + B, minZ, maxZ: minZ + B };
      layout.blocks.push(block);

      const lotW = (B - A) / 2;
      const lots = [];
      const mergeX = rng.chance(0.2);
      for (let lz = 0; lz < 2; lz++) {
        if (mergeX) {
          lots.push({ minX, maxX: minX + B, minZ: minZ + lz * (lotW + A), maxZ: minZ + lz * (lotW + A) + lotW });
        } else {
          for (let lx = 0; lx < 2; lx++) {
            lots.push({
              minX: minX + lx * (lotW + A),
              maxX: minX + lx * (lotW + A) + lotW,
              minZ: minZ + lz * (lotW + A),
              maxZ: minZ + lz * (lotW + A) + lotW,
            });
          }
        }
      }
      // Alleys between lots.
      layout.alleys.push({ minX, maxX: minX + B, minZ: minZ + lotW, maxZ: minZ + lotW + A });
      if (!mergeX) layout.alleys.push({ minX: minX + lotW, maxX: minX + lotW + A, minZ, maxZ: minZ + B });

      for (const lot of lots) {
        const lw = lot.maxX - lot.minX;
        const ld = lot.maxZ - lot.minZ;
        const lcx = (lot.minX + lot.maxX) / 2;
        const lcz = (lot.minZ + lot.maxZ) / 2;
        if (rng.chance(config.EMPTY_LOT_CHANCE)) {
          // Collapsed / empty lot: rubble and scrap.
          layout.harvestables.push({ type: 'scrap_pile', x: lcx + rng.range(-3, 3), z: lcz + rng.range(-3, 3), rot: rng.range(0, Math.PI * 2) });
          occupy(lcx, lcz, 2, 2);
          for (let k = 0; k < 3; k++) {
            const x = rng.range(lot.minX + 2, lot.maxX - 2);
            const z = rng.range(lot.minZ + 2, lot.maxZ - 2);
            if (overlaps(x, z, 1.5)) continue;
            layout.props.push({ type: 'rubble', x, z, rot: rng.range(0, Math.PI * 2), scale: rng.range(0.8, 1.6), variant: rng.int(0, 4) });
            occupy(x, z, 1.5, 1.5);
          }
          continue;
        }
        const margin = 1;
        const w = lw - margin * 2 - rng.range(0, 3);
        const d = ld - margin * 2 - rng.range(0, 3);
        const tall = rng.chance(0.12);
        let h = tall ? rng.range(config.MAX_BUILDING_HEIGHT * 0.7, config.MAX_BUILDING_HEIGHT) : rng.range(config.MIN_BUILDING_HEIGHT, config.MAX_BUILDING_HEIGHT * 0.5);
        const ruined = rng.chance(config.RUINED_CHANCE);
        if (ruined) h *= rng.range(0.45, 0.8);
        h = Math.round(h / 4) * 4 || 8; // align to floors (texture tiles are 4 units)
        const building = {
          x: lcx,
          z: lcz,
          w,
          d,
          h,
          ruined,
          style: rng.int(0, 2),
          roofDetails: rng.int(0, 3),
          seed: rng.int(1, 1e9),
        };
        layout.buildings.push(building);
        occupy(lcx, lcz, w / 2 + 0.3, d / 2 + 0.3);
      }
    }
  }

  // ---------------------------------------------------------------- streets
  const pointOnStreet = (street) => {
    const along = rng.range(-street.length / 2 + 4, street.length / 2 - 4);
    const across = rng.range(-street.width / 2 + 2, street.width / 2 - 2);
    return street.axis === 'z' ? { x: street.x + across, z: along, dir: 0 } : { x: along, z: street.z + across, dir: Math.PI / 2 };
  };

  // Keep the spawn intersection clear.
  occupy(spawn.x, spawn.z, 6, 6);

  for (const street of layout.streets) {
    const segments = street.axis === 'z' ? config.BLOCKS_Z : config.BLOCKS_X;
    const carCount = segments * config.CARS_PER_STREET_SEGMENT;
    for (let i = 0; i < carCount; i++) {
      const p = pointOnStreet(street);
      if (overlaps(p.x, p.z, 2.4)) continue;
      const rot = p.dir + (rng.chance(0.5) ? Math.PI : 0) + rng.range(-0.5, 0.5);
      layout.props.push({ type: 'car', x: p.x, z: p.z, rot, variant: rng.int(0, 3), burned: rng.chance(0.25) });
      occupy(p.x, p.z, 2.3, 2.3);
      layout.containers.push({ type: 'vehicle', x: p.x, z: p.z, rot, attached: true });
    }
    for (let i = 0; i < segments * 1.5; i++) {
      const p = pointOnStreet(street);
      if (overlaps(p.x, p.z, 1.6)) continue;
      layout.props.push({ type: 'rubble', x: p.x, z: p.z, rot: rng.range(0, Math.PI * 2), scale: rng.range(0.6, 1.3), variant: rng.int(0, 4) });
      occupy(p.x, p.z, 1.3, 1.3);
    }
    for (let i = 0; i < segments; i++) {
      const p = pointOnStreet(street);
      if (overlaps(p.x, p.z, 1)) continue;
      layout.props.push({ type: 'debris', x: p.x, z: p.z, rot: rng.range(0, Math.PI * 2) });
    }
    // Street lights along the sidewalk edge.
    for (let i = 0; i < segments; i++) {
      const along = (street.axis === 'z' ? originZ : originX) + S + i * pitch + B / 2;
      const side = rng.chance(0.5) ? 1 : -1;
      const x = street.axis === 'z' ? street.x + side * (S / 2 - 0.6) : along;
      const z = street.axis === 'z' ? along : street.z + side * (S / 2 - 0.6);
      layout.props.push({ type: 'streetlight', x, z, rot: street.axis === 'z' ? (side > 0 ? -Math.PI / 2 : Math.PI / 2) : side > 0 ? Math.PI : 0, bent: rng.chance(0.3) });
    }
  }

  // Containers near buildings / on streets.
  const randomWalkable = (margin = 1) => {
    for (let tries = 0; tries < 30; tries++) {
      const useAlley = rng.chance(0.3) && layout.alleys.length;
      let x;
      let z;
      if (useAlley) {
        const a = rng.pick(layout.alleys);
        x = rng.range(a.minX + margin, a.maxX - margin);
        z = rng.range(a.minZ + margin, a.maxZ - margin);
      } else {
        const p = pointOnStreet(rng.pick(layout.streets));
        x = p.x;
        z = p.z;
      }
      if (!overlaps(x, z, margin)) return { x, z };
    }
    return null;
  };

  const containerCounts = { crate: 45, barrel: 30, body: 25 };
  for (const [type, count] of Object.entries(containerCounts)) {
    for (let i = 0; i < count; i++) {
      const p = randomWalkable(1.2);
      if (!p) continue;
      layout.containers.push({ type, x: p.x, z: p.z, rot: rng.range(0, Math.PI * 2) });
      occupy(p.x, p.z, 0.8, 0.8);
    }
  }

  for (let i = 0; i < 18; i++) {
    const p = randomWalkable(1.5);
    if (!p) continue;
    layout.harvestables.push({ type: 'scrap_pile', x: p.x, z: p.z, rot: rng.range(0, Math.PI * 2) });
    occupy(p.x, p.z, 1.3, 1.3);
  }

  for (let i = 0; i < config.GROUND_ITEMS; i++) {
    const p = randomWalkable(0.6);
    if (!p) continue;
    const entry = rng.weighted(GROUND_LOOT);
    layout.groundItems.push({ id: entry.id, qty: entry.id === 'wood' || entry.id === 'cloth' ? rng.int(1, 2) : 1, x: p.x, z: p.z });
    occupy(p.x, p.z, 0.4, 0.4);
  }

  // A few guaranteed starter items near spawn.
  const starter = [
    { id: 'wood', qty: 2 },
    { id: 'cloth', qty: 2 },
    { id: 'scrap_metal', qty: 2 },
    { id: 'water_bottle', qty: 1 },
  ];
  starter.forEach((s, i) => {
    const a = (i / starter.length) * Math.PI * 2 + 0.4;
    layout.groundItems.push({ ...s, x: spawn.x + Math.cos(a) * 4, z: spawn.z + Math.sin(a) * 4 });
  });

  // Burning barrels near the centre, for atmosphere and light.
  for (let i = 0; i < config.FIRE_BARRELS; i++) {
    const a = (i / config.FIRE_BARRELS) * Math.PI * 2;
    const r = 18 + i * 9;
    let x = spawn.x + Math.cos(a) * r;
    let z = spawn.z + Math.sin(a) * r;
    // Snap to the nearest street so fires are visible.
    const snapped = snapToStreet(layout, x, z, S);
    x = snapped.x;
    z = snapped.z;
    if (overlaps(x, z, 0.8)) continue;
    layout.fireBarrels.push({ x, z });
    occupy(x, z, 0.6, 0.6);
  }

  for (let i = 0; i < 60; i++) {
    const p = randomWalkable(1);
    if (!p || nearSpawn(p.x, p.z, 25)) continue;
    layout.enemySpawns.push(p);
  }

  return layout;
}

function snapToStreet(layout, x, z, S) {
  let best = null;
  for (const st of layout.streets) {
    const d = st.axis === 'z' ? Math.abs(x - st.x) : Math.abs(z - st.z);
    if (!best || d < best.d) best = { d, st };
  }
  const off = S / 2 - 1.5;
  if (best.st.axis === 'z') return { x: best.st.x + Math.sign(x - best.st.x || 1) * off, z };
  return { x, z: best.st.z + Math.sign(z - best.st.z || 1) * off };
}

// ============================================================ textures

function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')];
}

function noise(g, size, alpha, rng, count = size * 6) {
  for (let i = 0; i < count; i++) {
    const v = Math.floor(rng.range(0, 255));
    g.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    g.fillRect(rng.range(0, size), rng.range(0, size), rng.range(1, 3), rng.range(1, 3));
  }
}

/** Creates a 4x4-window facade tile (covers 16x16 world units) plus a lit-window emissive map. */
function createFacadeTextures(baseColor, rng) {
  const size = 256;
  const [c, g] = makeCanvas(size);
  const [e, ge] = makeCanvas(size);
  g.fillStyle = baseColor;
  g.fillRect(0, 0, size, size);
  noise(g, size, 0.08, rng);
  ge.fillStyle = '#000';
  ge.fillRect(0, 0, size, size);
  const cell = size / 4;
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const x = i * cell + cell * 0.22;
      const y = j * cell + cell * 0.18;
      const w = cell * 0.56;
      const h = cell * 0.62;
      // Floor ledge
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(i * cell, j * cell + cell - 4, cell, 4);
      const roll = rng.next();
      if (roll < 0.15) {
        g.fillStyle = '#5a4128'; // boarded up
        g.fillRect(x, y, w, h);
        g.fillStyle = '#3d2b19';
        for (let k = 0; k < 3; k++) g.fillRect(x - 2, y + 6 + k * (h / 3), w + 4, 5);
      } else if (roll < 0.35) {
        g.fillStyle = '#050505'; // broken
        g.fillRect(x, y, w, h);
        g.fillStyle = 'rgba(120,140,150,0.5)';
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + w * 0.4, y);
        g.lineTo(x, y + h * 0.5);
        g.fill();
      } else {
        const grad = g.createLinearGradient(x, y, x + w, y + h);
        grad.addColorStop(0, '#1d262d');
        grad.addColorStop(1, '#3a4a55');
        g.fillStyle = grad;
        g.fillRect(x, y, w, h);
        g.strokeStyle = 'rgba(0,0,0,0.6)';
        g.lineWidth = 2;
        g.strokeRect(x, y, w, h);
        g.beginPath();
        g.moveTo(x + w / 2, y);
        g.lineTo(x + w / 2, y + h);
        g.stroke();
        if (rng.next() < 0.22) {
          ge.fillStyle = rng.next() < 0.5 ? '#ffb45a' : '#ffd08a';
          ge.fillRect(x + 2, y + 2, w - 4, h - 4);
        }
      }
    }
  }
  // Grime streaks
  for (let k = 0; k < 20; k++) {
    g.fillStyle = 'rgba(20,15,10,0.12)';
    g.fillRect(rng.range(0, size), 0, rng.range(2, 8), size);
  }
  const map = new THREE.CanvasTexture(c);
  const emissiveMap = new THREE.CanvasTexture(e);
  for (const t of [map, emissiveMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
  }
  return { map, emissiveMap };
}

function createGroundTexture(rng, base, size = 512, cracks = 40) {
  const [c, g] = makeCanvas(size);
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  noise(g, size, 0.12, rng, size * 30);
  g.strokeStyle = 'rgba(0,0,0,0.45)';
  for (let i = 0; i < cracks; i++) {
    g.lineWidth = rng.range(0.5, 2);
    g.beginPath();
    let x = rng.range(0, size);
    let y = rng.range(0, size);
    g.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      x += rng.range(-30, 30);
      y += rng.range(-30, 30);
      g.lineTo(x, y);
    }
    g.stroke();
  }
  for (let i = 0; i < 12; i++) {
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.beginPath();
    g.arc(rng.range(0, size), rng.range(0, size), rng.range(10, 50), 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Scales box UVs so the texture repeats every `tile` world units. */
function scaleBoxUVs(geometry, w, h, d, tile) {
  const uv = geometry.attributes.uv;
  // Face order in BoxGeometry: +x, -x, +y, -y, +z, -z (4 vertices each)
  const dims = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, (uv.getX(i) * dims[f][0]) / tile, (uv.getY(i) * dims[f][1]) / tile);
    }
  }
  uv.needsUpdate = true;
}

function colored(geometry, color) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const c = new THREE.Color(color);
  const count = g.attributes.position.count;
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) arr.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

function placed(geometry, x, y, z, rx = 0, ry = 0, rz = 0) {
  geometry.rotateX(rx);
  geometry.rotateY(ry);
  geometry.rotateZ(rz);
  geometry.translate(x, y, z);
  return geometry;
}

// ============================================================ builder

/**
 * Turns a city layout into meshes, colliders and interactable world objects.
 */
export class MapGenerator {
  constructor(seed = WORLD.SEED, config = WORLD) {
    this.seed = seed;
    this.config = config;
    this.layout = null;
  }

  generate() {
    this.layout = generateCityLayout(this.seed, this.config);
    return this.layout;
  }

  /**
   * @param {THREE.Scene} scene
   * @param {import('./PhysicsManager.js').PhysicsManager} physics
   * @param {(p:number,label:string)=>Promise<void>} [onProgress]
   */
  async build(scene, physics, onProgress = async () => {}) {
    const layout = this.layout || this.generate();
    const rng = createRNG(this.seed ^ 0x5bd1e995);
    const root = new THREE.Group();
    root.name = 'city';
    scene.add(root);

    const result = {
      root,
      layout,
      occluders: [],
      windowMaterials: [],
      worldObjects: [],
      fireBarrels: [],
    };

    physics.setBounds(layout.bounds.minX, layout.bounds.maxX, layout.bounds.minZ, layout.bounds.maxZ);

    await onProgress(0.1, 'Paving streets');
    this._buildGround(root, layout, rng);

    await onProgress(0.25, 'Raising buildings');
    this._buildBuildings(root, layout, physics, rng, result);

    await onProgress(0.5, 'Scattering debris');
    this._buildProps(root, layout, physics, rng, result);

    await onProgress(0.65, 'Hiding supplies');
    this._buildInteractables(root, layout, physics, rng, result);

    // Invisible perimeter walls.
    const b = layout.bounds;
    const t = 2;
    physics.addBox({ minX: b.minX - t, maxX: b.maxX + t, minZ: b.minZ - t, maxZ: b.minZ, maxY: 100 });
    physics.addBox({ minX: b.minX - t, maxX: b.maxX + t, minZ: b.maxZ, maxZ: b.maxZ + t, maxY: 100 });
    physics.addBox({ minX: b.minX - t, maxX: b.minX, minZ: b.minZ, maxZ: b.maxZ, maxY: 100 });
    physics.addBox({ minX: b.maxX, maxX: b.maxX + t, minZ: b.minZ, maxZ: b.maxZ, maxY: 100 });

    root.traverse((o) => {
      if (o.isMesh && !o.userData.dynamic) {
        o.updateMatrix();
        o.matrixAutoUpdate = false;
      }
    });
    root.updateMatrixWorld(true);
    return result;
  }

  _buildGround(root, layout, rng) {
    const asphalt = createGroundTexture(rng, '#2b2b2d');
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(layout.width + 400, layout.depth + 400),
      new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.95, color: 0x9a9a9a }),
    );
    asphalt.repeat.set((layout.width + 400) / 16, (layout.depth + 400) / 16);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    root.add(ground);

    const concrete = createGroundTexture(rng, '#6b6862', 256, 15);
    const sidewalkMat = new THREE.MeshStandardMaterial({ map: concrete, roughness: 0.9 });
    const h = this.config.SIDEWALK_HEIGHT;
    const geos = [];
    for (const block of layout.blocks) {
      const w = block.maxX - block.minX;
      const d = block.maxZ - block.minZ;
      const g = new THREE.BoxGeometry(w + 2, h, d + 2);
      scaleBoxUVs(g, w + 2, h, d + 2, 8);
      g.translate((block.minX + block.maxX) / 2, h / 2, (block.minZ + block.maxZ) / 2);
      geos.push(g);
    }
    const sidewalks = new THREE.Mesh(mergeGeometries(geos), sidewalkMat);
    sidewalks.receiveShadow = true;
    root.add(sidewalks);

    // Faded lane markings (instanced dashes).
    const dashGeo = new THREE.PlaneGeometry(0.25, 3);
    dashGeo.rotateX(-Math.PI / 2);
    const dashes = [];
    for (const st of layout.streets) {
      for (let s = -st.length / 2 + 2; s < st.length / 2 - 2; s += 7) {
        if (rng.chance(0.25)) continue; // worn off
        dashes.push(st.axis === 'z' ? { x: st.x, z: s, r: 0 } : { x: s, z: st.z, r: Math.PI / 2 });
      }
    }
    const inst = new THREE.InstancedMesh(dashGeo, new THREE.MeshStandardMaterial({ color: 0xb59a3a, roughness: 1, transparent: true, opacity: 0.55 }), dashes.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    dashes.forEach((d, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), d.r);
      m.compose(new THREE.Vector3(d.x, 0.02, d.z), q, new THREE.Vector3(1, 1, 1));
      inst.setMatrixAt(i, m);
    });
    inst.receiveShadow = true;
    root.add(inst);
  }

  _buildBuildings(root, layout, physics, rng, result) {
    const palettes = ['#6d6258', '#5b5f63', '#7a5b4a'];
    const facadeMats = palettes.map((color) => {
      const { map, emissiveMap } = createFacadeTextures(color, rng);
      const mat = new THREE.MeshStandardMaterial({
        map,
        emissiveMap,
        emissive: new THREE.Color(0xffc27a),
        emissiveIntensity: 0,
        roughness: 0.92,
      });
      result.windowMaterials.push(mat);
      return mat;
    });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x3b3a38, roughness: 1 });
    const ruinMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
    const detailMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.2 });

    for (const b of layout.buildings) {
      const brng = createRNG(b.seed);
      const geo = new THREE.BoxGeometry(b.w, b.h, b.d);
      scaleBoxUVs(geo, b.w, b.h, b.d, 16);
      const facade = facadeMats[b.style];
      const mesh = new THREE.Mesh(geo, [facade, facade, roofMat, roofMat, facade, facade]);
      mesh.position.set(b.x, b.h / 2, b.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      root.add(mesh);
      result.occluders.push(mesh);
      physics.addBox({ minX: b.x - b.w / 2, maxX: b.x + b.w / 2, minZ: b.z - b.d / 2, maxZ: b.z + b.d / 2, maxY: b.h }, { type: 'building' });

      const details = [];
      if (b.ruined) {
        // Jagged broken floors on top.
        const pieces = brng.int(2, 4);
        for (let i = 0; i < pieces; i++) {
          const pw = brng.range(b.w * 0.2, b.w * 0.5);
          const pd = brng.range(b.d * 0.2, b.d * 0.5);
          const ph = brng.range(2, 8);
          const g = new THREE.BoxGeometry(pw, ph, pd);
          scaleBoxUVs(g, pw, ph, pd, 16);
          const piece = new THREE.Mesh(g, facade);
          piece.position.set(
            b.x + brng.range(-(b.w - pw) / 2, (b.w - pw) / 2),
            b.h + ph / 2 - 0.5,
            b.z + brng.range(-(b.d - pd) / 2, (b.d - pd) / 2),
          );
          piece.rotation.z = brng.range(-0.12, 0.12);
          piece.castShadow = true;
          root.add(piece);
        }
        // Rubble at the base.
        for (let i = 0; i < 4; i++) {
          const side = brng.int(0, 3);
          const along = brng.range(-0.4, 0.4);
          const x = b.x + (side === 0 ? b.w / 2 + 0.6 : side === 1 ? -b.w / 2 - 0.6 : along * b.w);
          const z = b.z + (side === 2 ? b.d / 2 + 0.6 : side === 3 ? -b.d / 2 - 0.6 : along * b.d);
          const s = brng.range(0.4, 0.9);
          details.push(colored(placed(new THREE.DodecahedronGeometry(s, 0), x, s * 0.5, z, brng.next(), brng.next(), 0), 0x6a645c));
        }
      } else {
        // Roof parapet.
        const t = 0.3;
        const ph = 0.8;
        details.push(colored(placed(new THREE.BoxGeometry(b.w, ph, t), b.x, b.h + ph / 2, b.z + b.d / 2 - t / 2), 0x4d4843));
        details.push(colored(placed(new THREE.BoxGeometry(b.w, ph, t), b.x, b.h + ph / 2, b.z - b.d / 2 + t / 2), 0x4d4843));
        details.push(colored(placed(new THREE.BoxGeometry(t, ph, b.d), b.x + b.w / 2 - t / 2, b.h + ph / 2, b.z), 0x4d4843));
        details.push(colored(placed(new THREE.BoxGeometry(t, ph, b.d), b.x - b.w / 2 + t / 2, b.h + ph / 2, b.z), 0x4d4843));
        for (let i = 0; i < b.roofDetails; i++) {
          const x = b.x + brng.range(-b.w / 3, b.w / 3);
          const z = b.z + brng.range(-b.d / 3, b.d / 3);
          if (brng.chance(0.5)) {
            // Water tank
            details.push(colored(placed(new THREE.CylinderGeometry(1.2, 1.2, 2.2, 10), x, b.h + 2.6, z), 0x5a4030));
            details.push(colored(placed(new THREE.ConeGeometry(1.3, 0.8, 10), x, b.h + 4.1, z), 0x3d2d22));
            for (const [lx, lz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) {
              details.push(colored(placed(new THREE.BoxGeometry(0.12, 1.5, 0.12), x + lx, b.h + 0.75, z + lz), 0x2e2b28));
            }
          } else {
            details.push(colored(placed(new THREE.BoxGeometry(2, 1.2, 1.5), x, b.h + 0.6, z), 0x6f6f6f));
          }
        }
        // Awning / shop sign at street level.
        if (brng.chance(0.4)) {
          const face = brng.chance(0.5) ? 1 : -1;
          details.push(colored(placed(new THREE.BoxGeometry(b.w * 0.6, 0.15, 1.4), b.x, 3.4, b.z + face * (b.d / 2 + 0.7), face * 0.15, 0, 0), brng.pick([0x5c2a24, 0x2b4a3a, 0x2d3950])));
        }
      }
      if (details.length) {
        const dm = new THREE.Mesh(mergeGeometries(details), b.ruined ? ruinMat : detailMat);
        dm.castShadow = true;
        dm.receiveShadow = true;
        root.add(dm);
      }
    }
  }

  _carGeometry(rng) {
    const parts = [];
    parts.push(colored(placed(new THREE.BoxGeometry(1.9, 0.7, 4.3), 0, 0.65, 0), 0xffffff));
    parts.push(colored(placed(new THREE.BoxGeometry(1.7, 0.6, 2.2), 0, 1.3, -0.25), 0xdddddd));
    parts.push(colored(placed(new THREE.BoxGeometry(1.72, 0.45, 2.0), 0, 1.3, -0.25), 0x151a1f)); // windows
    for (const [x, z] of [[0.9, 1.35], [-0.9, 1.35], [0.9, -1.35], [-0.9, -1.35]]) {
      if (rng.chance(0.2)) continue; // missing wheel
      parts.push(colored(placed(new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10), x, 0.35, z, 0, 0, Math.PI / 2), 0x151515));
    }
    return mergeGeometries(parts);
  }

  _rubbleGeometry(rng) {
    const parts = [];
    const n = rng.int(5, 9);
    for (let i = 0; i < n; i++) {
      const s = rng.range(0.25, 0.7);
      const g = rng.chance(0.5) ? new THREE.DodecahedronGeometry(s, 0) : new THREE.BoxGeometry(s * 2, s * 0.6, s * 1.4);
      const shade = rng.pick([0x5e5850, 0x6d675e, 0x4b4640, 0x7a4c3a]);
      parts.push(colored(placed(g, rng.range(-1, 1), s * 0.4, rng.range(-1, 1), rng.next(), rng.next() * 3, rng.next()), shade));
    }
    return mergeGeometries(parts);
  }

  _buildProps(root, layout, physics, rng, result) {
    const carMats = [0x6b2e24, 0x3b4a52, 0x5a5a4a, 0x2a3a2a].map(
      (c) => new THREE.MeshStandardMaterial({ color: c, vertexColors: true, roughness: 0.75, metalness: 0.3 }),
    );
    const burnedMat = new THREE.MeshStandardMaterial({ color: 0x2a2522, vertexColors: true, roughness: 1 });
    const carGeos = [0, 1, 2, 3].map(() => this._carGeometry(rng));
    const rubbleGeos = [0, 1, 2, 3, 4].map(() => this._rubbleGeometry(rng));
    const rubbleMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
    const debrisGeo = mergeGeometries([
      colored(placed(new THREE.BoxGeometry(1.4, 0.05, 0.9), 0, 0.03, 0, 0, 0.3, 0), 0x8a8070),
      colored(placed(new THREE.BoxGeometry(0.6, 0.04, 0.4), 0.8, 0.03, 0.5, 0, 1.1, 0), 0xb0a890),
      colored(placed(new THREE.BoxGeometry(0.9, 0.1, 0.2), -0.6, 0.06, -0.4, 0, -0.6, 0), 0x5a3a20),
    ]);
    const poleParts = (bent) => {
      const parts = [colored(placed(new THREE.CylinderGeometry(0.08, 0.12, 6, 6), 0, 3, 0), 0x2f3336)];
      parts.push(colored(placed(new THREE.BoxGeometry(0.1, 0.1, 1.8), 0, 5.9, 0.85), 0x2f3336));
      parts.push(colored(placed(new THREE.BoxGeometry(0.35, 0.15, 0.5), 0, 5.8, 1.7), 0x444444));
      const g = mergeGeometries(parts);
      if (bent) g.rotateX(0.35);
      return g;
    };
    const poleGeos = [poleParts(false), poleParts(true)];
    const poleMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.5 });

    for (const p of layout.props) {
      let mesh = null;
      if (p.type === 'car') {
        mesh = new THREE.Mesh(carGeos[p.variant % carGeos.length], p.burned ? burnedMat : carMats[p.variant % carMats.length]);
        physics.addRotatedBox(p.x, p.z, 1.9, 4.3, 1.6, p.rot, { type: 'car' });
      } else if (p.type === 'rubble') {
        mesh = new THREE.Mesh(rubbleGeos[p.variant % rubbleGeos.length], rubbleMat);
        mesh.scale.setScalar(p.scale);
        physics.addBox({ minX: p.x - 0.9 * p.scale, maxX: p.x + 0.9 * p.scale, minZ: p.z - 0.9 * p.scale, maxZ: p.z + 0.9 * p.scale, maxY: 0.4 * p.scale }, { type: 'rubble' });
      } else if (p.type === 'debris') {
        mesh = new THREE.Mesh(debrisGeo, rubbleMat);
        mesh.castShadow = false;
      } else if (p.type === 'streetlight') {
        mesh = new THREE.Mesh(poleGeos[p.bent ? 1 : 0], poleMat);
        physics.addBox({ minX: p.x - 0.15, maxX: p.x + 0.15, minZ: p.z - 0.15, maxZ: p.z + 0.15, maxY: 6 }, { type: 'pole' });
      }
      if (!mesh) continue;
      mesh.position.set(p.x, 0, p.z);
      mesh.rotation.y = p.rot;
      if (p.type !== 'debris') mesh.castShadow = true;
      mesh.receiveShadow = true;
      root.add(mesh);
      if (p.type === 'car') result.occluders.push(mesh);
    }
  }

  _buildInteractables(root, layout, physics, rng, result) {
    const crateGeo = new THREE.BoxGeometry(1, 0.9, 1);
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x7a5530, roughness: 0.9 });
    const barrelGeo = new THREE.CylinderGeometry(0.42, 0.42, 1.1, 12);
    const barrelMats = [0x3d5a3a, 0x5b2f22, 0x2f4a66].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, metalness: 0.4 }));
    const bodyGeo = mergeGeometries([
      colored(placed(new THREE.BoxGeometry(0.5, 0.25, 0.7), 0, 0.14, 0), 0x3b3b35),
      colored(placed(new THREE.BoxGeometry(0.28, 0.25, 0.28), 0, 0.14, 0.52), 0x8a7060),
      colored(placed(new THREE.BoxGeometry(0.18, 0.2, 0.8), 0.12, 0.11, -0.72), 0x2b2b3a),
      colored(placed(new THREE.BoxGeometry(0.18, 0.2, 0.8), -0.14, 0.11, -0.7, 0, 0.2, 0), 0x2b2b3a),
      colored(placed(new THREE.BoxGeometry(0.6, 0.15, 0.15), 0.5, 0.1, 0.2, 0, 0.5, 0), 0x3b3b35),
      colored(placed(new THREE.BoxGeometry(0.14, 0.02, 0.9), 0.05, 0.01, 0.1, 0, 0.4, 0), 0x4a0e0e), // blood
    ]);
    const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
    const scrapGeo = (() => {
      const parts = [];
      for (let i = 0; i < 10; i++) {
        const s = rng.range(0.15, 0.45);
        parts.push(colored(placed(new THREE.BoxGeometry(s * 2.5, s * 0.3, s), rng.range(-0.8, 0.8), rng.range(0.1, 0.6), rng.range(-0.8, 0.8), rng.next(), rng.next() * 3, rng.next()), rng.pick([0x8a8f94, 0x6b4a33, 0x9c6b3a, 0x555a5e])));
      }
      parts.push(colored(placed(new THREE.DodecahedronGeometry(0.9, 0), 0, 0.2, 0), 0x4b4640));
      return mergeGeometries(parts);
    })();
    const scrapMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.5 });

    const add = (obj) => {
      root.add(obj.root);
      obj.root.traverse((o) => {
        if (o.isMesh) o.userData.dynamic = true;
      });
      result.worldObjects.push(obj);
      return obj;
    };

    for (const c of layout.containers) {
      const pos = new THREE.Vector3(c.x, 0, c.z);
      if (c.type === 'vehicle') {
        // Mesh + collider already created by the car prop.
        add(WorldObject.createContainer('vehicle', pos, null, rng)).reach = 1.6;
        continue;
      }
      let mesh;
      if (c.type === 'crate') {
        mesh = new THREE.Mesh(crateGeo, crateMat);
        mesh.position.y = 0.45;
        physics.addRotatedBox(c.x, c.z, 1, 1, 0.9, c.rot, { type: 'crate' });
      } else if (c.type === 'barrel') {
        mesh = new THREE.Mesh(barrelGeo, rng.pick(barrelMats));
        mesh.position.y = 0.55;
        physics.addBox({ minX: c.x - 0.4, maxX: c.x + 0.4, minZ: c.z - 0.4, maxZ: c.z + 0.4, maxY: 1.1 }, { type: 'barrel' });
      } else {
        mesh = new THREE.Mesh(bodyGeo, bodyMat);
      }
      mesh.rotation.y = c.rot;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      add(WorldObject.createContainer(c.type, pos, mesh, rng));
    }

    for (const h of layout.harvestables) {
      const mesh = new THREE.Mesh(scrapGeo, scrapMat);
      mesh.rotation.y = h.rot;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      physics.addBox({ minX: h.x - 0.9, maxX: h.x + 0.9, minZ: h.z - 0.9, maxZ: h.z + 0.9, maxY: 0.4 }, { type: 'scrap' });
      add(WorldObject.createHarvest(h.type, new THREE.Vector3(h.x, 0, h.z), mesh, rng)).reach = 0.8;
    }

    for (const g of layout.groundItems) {
      add(WorldObject.createPickup(g.id, g.qty, new THREE.Vector3(g.x, 0, g.z)));
    }

    const fireBarrelMat = new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.8, metalness: 0.4, emissive: 0x401000, emissiveIntensity: 0.6 });
    for (const f of layout.fireBarrels) {
      const mesh = new THREE.Mesh(barrelGeo, fireBarrelMat);
      mesh.position.set(f.x, 0.55, f.z);
      mesh.castShadow = true;
      root.add(mesh);
      physics.addBox({ minX: f.x - 0.4, maxX: f.x + 0.4, minZ: f.z - 0.4, maxZ: f.z + 0.4, maxY: 1.1 }, { type: 'fire' });
      const light = new THREE.PointLight(0xff7a2a, 12, 16, 1.6);
      light.position.set(f.x, 1.8, f.z);
      root.add(light);
      result.fireBarrels.push({ position: new THREE.Vector3(f.x, 1.1, f.z), light });
    }
  }
}
