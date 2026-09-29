import * as THREE from 'three';

const vertexShader = /* glsl */ `
  attribute float size;
  attribute float alpha;
  attribute vec3 color;
  varying float vAlpha;
  varying vec3 vColor;
  uniform float scale;
  void main() {
    vAlpha = alpha;
    vColor = color;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * scale / max(-mv.z, 0.1);
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = /* glsl */ `
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.1, d) * vAlpha;
    gl_FragColor = vec4(vColor, a);
  }
`;

/**
 * Pooled GPU point particles with per-particle colour, size, alpha, gravity and drag.
 */
export class ParticleSystem {
  constructor(scene, { max = 1000, additive = false } = {}) {
    this.max = max;
    this.cursor = 0;
    this.particles = Array.from({ length: max }, () => ({
      life: 0,
      maxLife: 1,
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      color: new THREE.Color(),
      size: 1,
      grow: 0,
      gravity: 0,
      drag: 0,
    }));
    this.positions = new Float32Array(max * 3);
    this.colors = new Float32Array(max * 3);
    this.sizes = new Float32Array(max);
    this.alphas = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alphas, 1).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      uniforms: { scale: { value: 400 } },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
    this.geometry = geo;
    this.active = 0;
  }

  /** Converts world-space particle size to pixels for the current viewport. */
  setViewport(drawingBufferHeight, fovDeg) {
    this.material.uniforms.scale.value = drawingBufferHeight / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }

  /**
   * @param {THREE.Vector3} origin
   * @param {object} o emission options
   */
  emit(origin, { count = 10, color = 0xffffff, colorJitter = 0.1, speed = 2, spread = 1, up = 0, life = 1, lifeJitter = 0.3, size = 0.2, grow = 0, gravity = -9.8, drag = 0.5, offset = 0 } = {}) {
    const base = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      const p = this.particles[this.cursor];
      this.cursor = (this.cursor + 1) % this.max;
      p.pos.set(origin.x + (Math.random() - 0.5) * offset, origin.y + (Math.random() - 0.5) * offset, origin.z + (Math.random() - 0.5) * offset);
      const theta = Math.random() * Math.PI * 2;
      const y = 2 * Math.random() - 1;
      const r = Math.sqrt(1 - y * y);
      // spread 1 = full sphere, 0 = straight up
      p.vel.set(Math.cos(theta) * r * spread, y * spread + (1 - spread), Math.sin(theta) * r * spread).normalize();
      p.vel.multiplyScalar(speed * (0.4 + Math.random() * 0.6));
      p.vel.y += up;
      p.color.copy(base).offsetHSL(0, 0, (Math.random() - 0.5) * colorJitter);
      p.maxLife = p.life = life * (1 - lifeJitter / 2 + Math.random() * lifeJitter);
      p.size = size * (0.7 + Math.random() * 0.6);
      p.grow = grow;
      p.gravity = gravity;
      p.drag = drag;
    }
  }

  update(dt) {
    let active = 0;
    for (let i = 0; i < this.max; i++) {
      const p = this.particles[i];
      if (p.life <= 0) {
        this.alphas[i] = 0;
        this.sizes[i] = 0;
        continue;
      }
      active++;
      p.life -= dt;
      p.vel.y += p.gravity * dt;
      p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      p.pos.addScaledVector(p.vel, dt);
      if (p.pos.y < 0.02) {
        p.pos.y = 0.02;
        p.vel.set(0, 0, 0);
      }
      p.size += p.grow * dt;
      const t = Math.max(0, p.life / p.maxLife);
      this.positions[i * 3] = p.pos.x;
      this.positions[i * 3 + 1] = p.pos.y;
      this.positions[i * 3 + 2] = p.pos.z;
      this.colors[i * 3] = p.color.r;
      this.colors[i * 3 + 1] = p.color.g;
      this.colors[i * 3 + 2] = p.color.b;
      this.sizes[i] = p.size;
      this.alphas[i] = Math.min(1, t * 2);
    }
    if (active > 0 || this.active > 0) {
      for (const name of ['position', 'color', 'size', 'alpha']) this.geometry.attributes[name].needsUpdate = true;
    }
    this.active = active;
  }
}
