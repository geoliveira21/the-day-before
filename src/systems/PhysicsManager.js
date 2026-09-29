import { clamp } from '../utils/Helpers.js';

/**
 * Lightweight arcade physics: static axis-aligned boxes stored in a spatial hash,
 * resolved against vertical cylinders (player / enemies).
 */
export class PhysicsManager {
  constructor(cellSize = 8) {
    this.cellSize = cellSize;
    this.colliders = [];
    this.grid = new Map();
    this.bounds = null;
    this._queryId = 0;
  }

  setBounds(minX, maxX, minZ, maxZ) {
    this.bounds = { minX, maxX, minZ, maxZ };
  }

  _key(ix, iz) {
    return `${ix},${iz}`;
  }

  _forCells(minX, maxX, minZ, maxZ, fn) {
    const cs = this.cellSize;
    const x0 = Math.floor(minX / cs);
    const x1 = Math.floor(maxX / cs);
    const z0 = Math.floor(minZ / cs);
    const z1 = Math.floor(maxZ / cs);
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) fn(this._key(ix, iz));
  }

  /**
   * Registers a static box collider.
   * @param {{minX:number,maxX:number,minZ:number,maxZ:number,minY?:number,maxY:number}} box
   */
  addBox(box, userData = null) {
    const collider = { minY: 0, ...box, userData, _q: 0 };
    this.colliders.push(collider);
    this._forCells(collider.minX, collider.maxX, collider.minZ, collider.maxZ, (key) => {
      if (!this.grid.has(key)) this.grid.set(key, []);
      this.grid.get(key).push(collider);
    });
    return collider;
  }

  /** Adds a collider for a box of size (w, h, d) centred at (x, z) rotated by `rotY`. */
  addRotatedBox(x, z, w, d, h, rotY = 0, userData = null, minY = 0) {
    const c = Math.abs(Math.cos(rotY));
    const s = Math.abs(Math.sin(rotY));
    const hw = (w * c + d * s) / 2;
    const hd = (w * s + d * c) / 2;
    return this.addBox({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd, minY, maxY: minY + h }, userData);
  }

  removeCollider(collider) {
    const i = this.colliders.indexOf(collider);
    if (i === -1) return;
    this.colliders.splice(i, 1);
    this._forCells(collider.minX, collider.maxX, collider.minZ, collider.maxZ, (key) => {
      const list = this.grid.get(key);
      if (!list) return;
      const j = list.indexOf(collider);
      if (j !== -1) list.splice(j, 1);
    });
  }

  query(minX, maxX, minZ, maxZ) {
    const id = ++this._queryId;
    const out = [];
    this._forCells(minX, maxX, minZ, maxZ, (key) => {
      const list = this.grid.get(key);
      if (!list) return;
      for (const c of list) {
        if (c._q === id) continue;
        c._q = id;
        if (c.maxX < minX || c.minX > maxX || c.maxZ < minZ || c.minZ > maxZ) continue;
        out.push(c);
      }
    });
    return out;
  }

  /**
   * Highest walkable surface below/around the given feet height.
   * Surfaces higher than feetY + stepHeight are ignored (they are walls).
   */
  getGroundHeight(x, z, radius, feetY, stepHeight = 0.45) {
    let ground = 0;
    const r = radius * 0.6;
    for (const c of this.query(x - r, x + r, z - r, z + r)) {
      if (c.maxY > feetY + stepHeight) continue;
      const cx = clamp(x, c.minX, c.maxX);
      const cz = clamp(z, c.minZ, c.maxZ);
      if ((x - cx) ** 2 + (z - cz) ** 2 <= r * r && c.maxY > ground) ground = c.maxY;
    }
    return ground;
  }

  /**
   * Pushes a cylinder (centre `pos`, radius, feet height, body height) out of all
   * colliders it overlaps. Mutates `pos.x`/`pos.z`.
   * @returns {boolean} true if any collision happened
   */
  resolveCircle(pos, radius, feetY = 0, stepHeight = 0.45, bodyHeight = 1.8) {
    let collided = false;
    for (let iter = 0; iter < 2; iter++) {
      const nearby = this.query(pos.x - radius, pos.x + radius, pos.z - radius, pos.z + radius);
      for (const c of nearby) {
        if (c.maxY <= feetY + stepHeight) continue; // walkable / step-able
        if (c.minY >= feetY + bodyHeight) continue; // overhead
        const cx = clamp(pos.x, c.minX, c.maxX);
        const cz = clamp(pos.z, c.minZ, c.maxZ);
        const dx = pos.x - cx;
        const dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= radius * radius) continue;
        collided = true;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2);
          const push = radius - d;
          pos.x += (dx / d) * push;
          pos.z += (dz / d) * push;
        } else {
          // Centre inside the box: exit through the nearest face.
          const exits = [
            { v: pos.x - c.minX, x: c.minX - radius, axis: 'x' },
            { v: c.maxX - pos.x, x: c.maxX + radius, axis: 'x' },
            { v: pos.z - c.minZ, x: c.minZ - radius, axis: 'z' },
            { v: c.maxZ - pos.z, x: c.maxZ + radius, axis: 'z' },
          ].sort((a, b) => a.v - b.v);
          pos[exits[0].axis] = exits[0].x;
        }
      }
    }
    if (this.bounds) {
      const b = this.bounds;
      const cx = clamp(pos.x, b.minX + radius, b.maxX - radius);
      const cz = clamp(pos.z, b.minZ + radius, b.maxZ - radius);
      if (cx !== pos.x || cz !== pos.z) collided = true;
      pos.x = cx;
      pos.z = cz;
    }
    return collided;
  }

  /** True if the point (x, z) is inside any collider taller than `minHeight`. */
  isBlocked(x, z, radius = 0, minHeight = 0.5) {
    for (const c of this.query(x - radius, x + radius, z - radius, z + radius)) {
      if (c.maxY <= minHeight) continue;
      const cx = clamp(x, c.minX, c.maxX);
      const cz = clamp(z, c.minZ, c.maxZ);
      if ((x - cx) ** 2 + (z - cz) ** 2 <= radius * radius) return true;
    }
    if (this.bounds) {
      const b = this.bounds;
      if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) return true;
    }
    return false;
  }
}
