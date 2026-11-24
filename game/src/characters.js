// Low-poly human figures (player, pedestrians, cops, goons) built from boxes, with a tiny pose animator.
import * as THREE from 'three';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const SPH = new THREE.SphereGeometry(1, 8, 6);
const matCache = new Map();
export const lambert = (color) => {
  const k = color;
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshLambertMaterial({ color }));
  return matCache.get(k);
};

function part(geo, color, sx, sy, sz, x, y, z) {
  const m = new THREE.Mesh(geo, lambert(color));
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

export const SKINS = [0xf0c7a0, 0xd9a577, 0xb27c52, 0x7d5336, 0xf5d6b8];
export const SHIRTS = [0xe2453c, 0x2fa3b8, 0xf2b630, 0xf5f0e6, 0x7a4fa3, 0x3f9d57, 0xe27ab0, 0xff8a3d, 0x4a6fd1];
export const PANTS = [0x2b3a55, 0x3b3b3b, 0xcbb892, 0x5b7a9a, 0x6b4a3a, 0xeeeeee];

export function makeHuman({ skin = SKINS[0], shirt = SHIRTS[0], pants = PANTS[0], hair = 0x2a1c14, scale = 1, cap = null, vest = null } = {}) {
  const g = new THREE.Group();
  const legL = new THREE.Group(), legR = new THREE.Group();
  legL.position.set(-0.13, 0.85, 0); legR.position.set(0.13, 0.85, 0);
  legL.add(part(BOX, pants, 0.2, 0.85, 0.22, 0, -0.425, 0));
  legR.add(part(BOX, pants, 0.2, 0.85, 0.22, 0, -0.425, 0));
  legL.add(part(BOX, 0x1d1d1d, 0.22, 0.1, 0.32, 0, -0.82, 0.05));
  legR.add(part(BOX, 0x1d1d1d, 0.22, 0.1, 0.32, 0, -0.82, 0.05));
  const torso = part(BOX, shirt, 0.5, 0.62, 0.28, 0, 1.16, 0);
  const armL = new THREE.Group(), armR = new THREE.Group();
  armL.position.set(-0.33, 1.44, 0); armR.position.set(0.33, 1.44, 0);
  armL.add(part(BOX, shirt, 0.14, 0.34, 0.16, 0, -0.17, 0), part(BOX, skin, 0.12, 0.3, 0.14, 0, -0.47, 0));
  armR.add(part(BOX, shirt, 0.14, 0.34, 0.16, 0, -0.17, 0), part(BOX, skin, 0.12, 0.3, 0.14, 0, -0.47, 0));
  const head = part(SPH, skin, 0.17, 0.2, 0.18, 0, 1.68, 0);
  const hairM = part(SPH, hair, 0.185, 0.14, 0.195, 0, 1.76, -0.015);
  g.add(legL, legR, torso, armL, armR, head, hairM);
  if (vest) g.add(part(BOX, vest, 0.52, 0.4, 0.3, 0, 1.2, 0));
  if (cap) g.add(part(BOX, cap, 0.38, 0.1, 0.4, 0, 1.82, 0.05), part(BOX, cap, 0.3, 0.04, 0.2, 0, 1.78, 0.22));
  const gun = part(BOX, 0x222222, 0.06, 0.1, 0.26, 0, -0.62, 0.12);
  gun.visible = false;
  armR.add(gun);
  g.rotation.order = 'YXZ';
  g.scale.setScalar(scale);
  return { group: g, legL, legR, armL, armR, torso, head, gun, phase: 0 };
}

// Pose: walk cycle amount, whether the right arm is raised aiming, a punch swing (0..1) and a fall (0..1).
export function poseHuman(h, { walk = 0, dt = 0, aim = false, punch = 0, fall = 0, speed = 0 } = {}) {
  h.phase += dt * (3 + speed * 1.7);
  const s = Math.sin(h.phase) * Math.min(1, walk) * 0.9;
  h.legL.rotation.x = s; h.legR.rotation.x = -s;
  h.armL.rotation.x = -s * 0.8;
  if (aim) { h.armR.rotation.x = -1.45; h.armR.rotation.z = 0; h.gun.visible = true; }
  else if (punch > 0) { h.armR.rotation.x = -1.5 * Math.sin(punch * Math.PI); h.gun.visible = false; }
  else { h.armR.rotation.x = s * 0.8; h.gun.visible = false; }
  h.group.rotation.x = -fall * 1.45;
  h.group.position.y = fall * 0.25;
}
