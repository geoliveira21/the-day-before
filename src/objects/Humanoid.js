import * as THREE from 'three';

/**
 * Builds a blocky low-poly humanoid rig used by both the player and enemies.
 * Pivots are placed at joints so limbs can be rotated for simple procedural animation.
 */
export function createHumanoid(materials, { scale = 1 } = {}) {
  const root = new THREE.Group();
  const body = new THREE.Group(); // everything that bobs / leans
  root.add(body);

  const box = (w, h, d, mat) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };

  const hips = new THREE.Group();
  hips.position.y = 0.88;
  body.add(hips);

  const makeLeg = (x) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0, 0);
    const leg = box(0.2, 0.8, 0.22, materials.bottom);
    leg.position.y = -0.4;
    const shoe = box(0.22, 0.1, 0.3, materials.shoes);
    shoe.position.set(0, -0.83, 0.04);
    pivot.add(leg, shoe);
    hips.add(pivot);
    return pivot;
  };
  const leftLeg = makeLeg(0.12);
  const rightLeg = makeLeg(-0.12);

  const torso = new THREE.Group();
  hips.add(torso);
  const chest = box(0.52, 0.62, 0.3, materials.top);
  chest.position.y = 0.33;
  torso.add(chest);

  const head = new THREE.Group();
  head.position.y = 0.72;
  const headMesh = box(0.3, 0.32, 0.3, materials.skin);
  headMesh.position.y = 0.12;
  head.add(headMesh);
  torso.add(head);

  if (materials.extra) {
    const pack = box(0.4, 0.45, 0.18, materials.extra);
    pack.position.set(0, 0.35, -0.23);
    torso.add(pack);
  }

  const makeArm = (x) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.6, 0);
    const upper = box(0.15, 0.62, 0.17, materials.top);
    upper.position.y = -0.28;
    const hand = box(0.13, 0.13, 0.13, materials.skin);
    hand.position.y = -0.64;
    pivot.add(upper, hand);
    torso.add(pivot);
    return pivot;
  };
  const leftArm = makeArm(0.34);
  const rightArm = makeArm(-0.34);

  const handAnchor = new THREE.Group();
  handAnchor.position.set(0, -0.66, 0.02);
  rightArm.add(handAnchor);

  root.scale.setScalar(scale);
  return { root, body, hips, torso, head, headMesh, leftArm, rightArm, leftLeg, rightLeg, handAnchor };
}

/** Builds a small mesh for an item held in hand or lying on the ground. */
export function createItemMesh(id, item) {
  const color = item?.color ?? 0xffffff;
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: item?.category === 'weapon' ? 0.4 : 0.1 });
  const group = new THREE.Group();
  const add = (geo, m = mat, pos = [0, 0, 0], rot = [0, 0, 0]) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(...pos);
    mesh.rotation.set(...rot);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  };
  const dark = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
  switch (id) {
    case 'crowbar':
      add(new THREE.BoxGeometry(0.05, 0.9, 0.05), mat, [0, 0.35, 0]);
      add(new THREE.BoxGeometry(0.05, 0.05, 0.18), mat, [0, 0.8, 0.07]);
      break;
    case 'baseball_bat':
    case 'wooden_club':
      add(new THREE.CylinderGeometry(id === 'wooden_club' ? 0.07 : 0.055, 0.025, 0.95, 8), mat, [0, 0.35, 0]);
      break;
    case 'spiked_bat': {
      add(new THREE.CylinderGeometry(0.06, 0.025, 0.95, 8), mat, [0, 0.35, 0]);
      const nail = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.8, roughness: 0.3 });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        add(new THREE.ConeGeometry(0.015, 0.1, 4), nail, [Math.cos(a) * 0.07, 0.6 + (i % 3) * 0.08, Math.sin(a) * 0.07], [0, 0, (Math.PI / 2) * Math.sign(Math.cos(a) || 1)]);
      }
      break;
    }
    case 'metal_pipe':
      add(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 8), mat, [0, 0.38, 0]);
      break;
    case 'pickaxe':
      add(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6), new THREE.MeshStandardMaterial({ color: 0x7b4a1e }), [0, 0.35, 0]);
      add(new THREE.BoxGeometry(0.06, 0.08, 0.6), mat, [0, 0.78, 0]);
      break;
    case 'flashlight':
      add(new THREE.CylinderGeometry(0.035, 0.03, 0.22, 8), dark, [0, 0.05, 0.05], [Math.PI / 2, 0, 0]);
      break;
    case 'wood':
      add(new THREE.BoxGeometry(0.5, 0.08, 0.14), mat, [0, 0, 0], [0, 0.3, 0]);
      add(new THREE.BoxGeometry(0.45, 0.08, 0.14), mat, [0.05, 0.08, 0.02], [0, -0.4, 0]);
      break;
    case 'scrap_metal':
      add(new THREE.DodecahedronGeometry(0.16, 0), mat);
      add(new THREE.BoxGeometry(0.3, 0.03, 0.12), mat, [0.1, -0.05, 0.1], [0.2, 0.6, 0.1]);
      break;
    case 'cloth':
      add(new THREE.BoxGeometry(0.35, 0.06, 0.3), mat, [0, 0, 0], [0, 0.4, 0.1]);
      break;
    case 'electronics':
      add(new THREE.BoxGeometry(0.3, 0.03, 0.22), mat);
      add(new THREE.BoxGeometry(0.08, 0.05, 0.08), dark, [0.05, 0.04, 0]);
      break;
    case 'battery':
      add(new THREE.CylinderGeometry(0.06, 0.06, 0.2, 10), mat);
      break;
    case 'canned_food':
      add(new THREE.CylinderGeometry(0.08, 0.08, 0.14, 12), mat);
      break;
    case 'water_bottle':
      add(new THREE.CylinderGeometry(0.06, 0.07, 0.3, 10), new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.75, roughness: 0.1 }));
      break;
    default:
      add(new THREE.BoxGeometry(0.2, 0.15, 0.2), mat);
  }
  return group;
}
