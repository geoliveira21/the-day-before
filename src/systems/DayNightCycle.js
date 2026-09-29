import * as THREE from 'three';
import { DAY_NIGHT } from '../utils/Constants.js';
import { clamp, formatTime, lerp, smoothstep } from '../utils/Helpers.js';

const SKY = {
  dayTop: new THREE.Color(0x5d7d9c),
  dayHorizon: new THREE.Color(0xb8b09a),
  duskTop: new THREE.Color(0x2e3560),
  duskHorizon: new THREE.Color(0xd8703f),
  nightTop: new THREE.Color(0x03050b),
  nightHorizon: new THREE.Color(0x121824),
  ground: new THREE.Color(0x0b0b0b),
};

const skyVertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }
`;

const skyFragment = /* glsl */ `
  uniform vec3 topColor;
  uniform vec3 horizonColor;
  uniform vec3 bottomColor;
  uniform vec3 sunDir;
  uniform vec3 moonDir;
  uniform vec3 sunColor;
  uniform float sunVisible;
  uniform float moonVisible;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 col = h > 0.0 ? mix(horizonColor, topColor, pow(clamp(h, 0.0, 1.0), 0.55))
                       : mix(horizonColor, bottomColor, clamp(-h * 5.0, 0.0, 1.0));
    float sd = max(dot(d, sunDir), 0.0);
    col += sunColor * (pow(sd, 900.0) * 6.0 + pow(sd, 12.0) * 0.35) * sunVisible;
    float md = max(dot(d, moonDir), 0.0);
    col += vec3(0.75, 0.82, 1.0) * (pow(md, 2200.0) * 3.0 + pow(md, 40.0) * 0.08) * moonVisible;
    gl_FragColor = vec4(col, 1.0);
  }
`;

/**
 * Time of day simulation. Pure time logic works without a scene; call
 * `attach(scene)` to create the sky dome, sun, moon and stars.
 */
export class DayNightCycle {
  constructor({ cycleMinutes = DAY_NIGHT.CYCLE_MINUTES, startHour = DAY_NIGHT.START_HOUR } = {}) {
    this.hour = startHour;
    this.day = 1;
    this.setCycleMinutes(cycleMinutes);
    this.fogColor = new THREE.Color();
    this._sunDir = new THREE.Vector3();
    this._moonDir = new THREE.Vector3();
    this.attached = false;
  }

  setCycleMinutes(minutes) {
    this.cycleMinutes = clamp(Number(minutes) || DAY_NIGHT.CYCLE_MINUTES, 1, 120);
  }

  /** In-game hours advanced per real second. */
  get hoursPerSecond() {
    return 24 / (this.cycleMinutes * 60);
  }

  update(dt) {
    this.hour += dt * this.hoursPerSecond;
    while (this.hour >= 24) {
      this.hour -= 24;
      this.day += 1;
    }
  }

  setHour(hour) {
    this.hour = ((hour % 24) + 24) % 24;
  }

  /** Sine of sun elevation: 1 at noon, 0 at 06:00/18:00, -1 at midnight. */
  getSunElevation() {
    return Math.sin(((this.hour - 6) / 24) * Math.PI * 2);
  }

  /** 0 (full night) .. 1 (full day), smooth through twilight. */
  getDaylight() {
    return smoothstep(-0.12, 0.25, this.getSunElevation());
  }

  isNight() {
    return this.hour >= DAY_NIGHT.DUSK_HOUR || this.hour < DAY_NIGHT.DAWN_HOUR;
  }

  /** Multiplier applied to enemy detection/speed/damage; peaks at night. */
  getAggression() {
    return lerp(1, DAY_NIGHT.NIGHT_AGGRESSION, 1 - this.getDaylight());
  }

  getFormattedTime() {
    return formatTime(this.hour);
  }

  getPhaseLabel() {
    const h = this.hour;
    if (h >= 5 && h < 7.5) return 'Dawn';
    if (h >= 7.5 && h < 18) return 'Day';
    if (h >= 18 && h < 20.5) return 'Dusk';
    return 'Night';
  }

  getSunDirection(target = new THREE.Vector3()) {
    const a = ((this.hour - 6) / 24) * Math.PI * 2;
    return target.set(Math.cos(a), Math.sin(a), 0.35).normalize();
  }

  // ------------------------------------------------------------------ scene
  attach(scene) {
    this.scene = scene;

    this.hemiLight = new THREE.HemisphereLight(0xbfd1e5, 0x3a3226, 0.6);
    scene.add(this.hemiLight);

    this.ambient = new THREE.AmbientLight(0x404a60, 0.12);
    scene.add(this.ambient);

    this.sunLight = new THREE.DirectionalLight(0xfff0d8, 2);
    this.sunLight.castShadow = true;
    const cam = this.sunLight.shadow.camera;
    cam.left = -40;
    cam.right = 40;
    cam.top = 40;
    cam.bottom = -55;
    cam.near = 1;
    cam.far = 300;
    this.sunLight.shadow.bias = -0.0006;
    this.sunLight.shadow.normalBias = 0.04;
    scene.add(this.sunLight, this.sunLight.target);

    this.moonLight = new THREE.DirectionalLight(0x8fa8ff, 0.3);
    scene.add(this.moonLight, this.moonLight.target);

    this.skyUniforms = {
      topColor: { value: new THREE.Color() },
      horizonColor: { value: new THREE.Color() },
      bottomColor: { value: SKY.ground.clone() },
      sunDir: { value: new THREE.Vector3() },
      moonDir: { value: new THREE.Vector3() },
      sunColor: { value: new THREE.Color(1, 0.85, 0.6) },
      sunVisible: { value: 1 },
      moonVisible: { value: 0 },
    };
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(900, 32, 16),
      new THREE.ShaderMaterial({
        uniforms: this.skyUniforms,
        vertexShader: skyVertex,
        fragmentShader: skyFragment,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    );
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    scene.add(this.sky);

    const starCount = 1500;
    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const y = Math.random() * 0.95 + 0.05;
      const r = Math.sqrt(1 - y * y);
      positions.set([Math.cos(theta) * r * 850, y * 850, Math.sin(theta) * r * 850], i * 3);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, fog: false, depthWrite: false }),
    );
    this.stars.renderOrder = -9;
    this.stars.frustumCulled = false;
    scene.add(this.stars);

    this.attached = true;
    this.apply(new THREE.Vector3(), new THREE.Vector3());
  }

  /**
   * Updates lights and sky for the current hour.
   * @param {THREE.Vector3} focus point the shadow camera follows (player)
   * @param {THREE.Vector3} cameraPos sky dome is centred on the camera
   */
  apply(focus, cameraPos) {
    if (!this.attached) return;
    const daylight = this.getDaylight();
    const elevation = this.getSunElevation();
    const twilight = clamp(1 - Math.abs(elevation) / 0.3, 0, 1);

    const sunDir = this.getSunDirection(this._sunDir);
    const moonDir = this._moonDir.copy(sunDir).negate();

    this.skyUniforms.topColor.value.copy(SKY.nightTop).lerp(SKY.dayTop, daylight).lerp(SKY.duskTop, twilight * 0.5);
    const horizon = this.skyUniforms.horizonColor.value
      .copy(SKY.nightHorizon)
      .lerp(SKY.dayHorizon, daylight)
      .lerp(SKY.duskHorizon, twilight * 0.55);
    this.skyUniforms.sunDir.value.copy(sunDir);
    this.skyUniforms.moonDir.value.copy(moonDir);
    this.skyUniforms.sunVisible.value = smoothstep(-0.1, 0.05, elevation);
    this.skyUniforms.moonVisible.value = smoothstep(-0.1, 0.05, -elevation);
    this.fogColor.copy(horizon).multiplyScalar(0.85);

    this.sunLight.position.copy(focus).addScaledVector(sunDir, 120);
    this.sunLight.target.position.copy(focus);
    this.sunLight.intensity = 2.4 * smoothstep(-0.02, 0.2, elevation);
    this.sunLight.color.setRGB(1, lerp(0.55, 0.95, smoothstep(0, 0.5, elevation)), lerp(0.3, 0.85, smoothstep(0, 0.5, elevation)));

    this.moonLight.position.copy(focus).addScaledVector(moonDir, 120);
    this.moonLight.target.position.copy(focus);
    this.moonLight.intensity = 0.35 * smoothstep(-0.05, 0.3, -elevation);

    this.hemiLight.intensity = 0.15 + daylight * 0.75;
    this.hemiLight.color.setRGB(lerp(0.3, 0.75, daylight), lerp(0.35, 0.82, daylight), lerp(0.5, 0.9, daylight));

    this.stars.material.opacity = clamp(1 - daylight * 1.5, 0, 1);

    this.sky.position.copy(cameraPos);
    this.stars.position.copy(cameraPos);
  }
}
