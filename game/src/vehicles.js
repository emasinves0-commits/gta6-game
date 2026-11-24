// Cars: six types, arcade drift physics, damage, smoke, fire, explosions, enter/exit, car-car collisions.
import * as THREE from 'three';
import { GeoBuilder } from './geometry.js';
import { pushOut, clampToWorld } from './city.js';
import { emitSmoke, emitFire, explosion, addSkid, sparks } from './effects.js';
import { play } from './audio.js';

export const CAR_TYPES = {
  sedan: { name: 'Marlin Sedan', len: 4.5, w: 1.85, maxSpeed: 33, accel: 15, grip: 7.5, steer: 1.9, mass: 1, colors: [0x2f6fb5, 0xb8c2c9, 0x8a2f3a, 0x3b7d52, 0xe9e4d6] },
  taxi: { name: 'Sunny Cab', len: 4.6, w: 1.85, maxSpeed: 32, accel: 15, grip: 7.5, steer: 1.9, mass: 1, colors: [0xf2c12e] },
  pickup: { name: 'Rustler Pickup', len: 5.1, w: 2.0, maxSpeed: 30, accel: 13, grip: 6.5, steer: 1.7, mass: 1.3, colors: [0xc4573a, 0x5e7a8a, 0xd8cfb8, 0x2f5a3a] },
  sports: { name: 'Vesper GT', len: 4.3, w: 1.9, maxSpeed: 50, accel: 26, grip: 8.5, steer: 2.2, mass: 0.9, colors: [0xe0342b, 0xf2b630, 0x7a4fa3, 0x1c9cc4] },
  van: { name: 'Haul Van', len: 5.3, w: 2.05, maxSpeed: 27, accel: 11, grip: 6, steer: 1.5, mass: 1.6, colors: [0xf0ece0, 0x4a6a8a, 0x9a9a52] },
  police: { name: 'SBPD Cruiser', len: 4.7, w: 1.9, maxSpeed: 41, accel: 21, grip: 8, steer: 2.1, mass: 1.15, colors: [0x15181f] },
};
export const CIVILIAN_TYPES = ['sedan', 'sedan', 'taxi', 'pickup', 'sports', 'van'];

const bodyMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const charredMat = new THREE.MeshLambertMaterial({ color: 0x1d1b1a });
const wheelMat = new THREE.MeshLambertMaterial({ color: 0x151515 });
export const lightRed = new THREE.MeshBasicMaterial({ color: 0xff2020 });
export const lightBlue = new THREE.MeshBasicMaterial({ color: 0x2060ff });
const barGeo = new THREE.BoxGeometry(0.5, 0.18, 0.28);
const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 10).rotateZ(Math.PI / 2);
const geoCache = new Map();

function bodyGeometry(typeKey, color) {
  const key = typeKey + ':' + color;
  if (geoCache.has(key)) return geoCache.get(key);
  const t = CAR_TYPES[typeKey], b = new GeoBuilder(), L = t.len, W = t.w;
  const glass = 0x1d2a36, dark = 0x111111;
  const cabinZ = (off, len) => off * L - len / 2 * 0; void cabinZ;
  if (typeKey === 'sports') {
    b.box(0, 0.5, 0, W, 0.5, L, color);
    b.box(0, 0.62, 0.9, W * 0.92, 0.18, 1.7, color); // hood bulge
    b.box(0, 0.98, -0.25, W * 0.8, 0.5, 1.7, glass);
    b.box(0, 1.25, -0.3, W * 0.74, 0.07, 1.4, color);
    b.box(0, 0.98, -1.85, W * 0.95, 0.07, 0.5, dark); b.box(0.75, 0.88, -1.85, 0.08, 0.28, 0.4, dark); b.box(-0.75, 0.88, -1.85, 0.08, 0.28, 0.4, dark);
  } else if (typeKey === 'pickup') {
    b.box(0, 0.7, 0, W, 0.6, L, color);
    b.box(0, 1.28, 0.7, W * 0.9, 0.62, 1.7, glass); b.box(0, 1.62, 0.7, W * 0.86, 0.08, 1.5, color);
    b.box(0, 1.0, -1.35, W, 0.32, 0.12, color); b.box(W / 2 - 0.05, 1.0, -1.0, 0.1, 0.32, 2.3, color); b.box(-W / 2 + 0.05, 1.0, -1.0, 0.1, 0.32, 2.3, color);
    b.box(0, 0.98, -0.95, W * 0.9, 0.06, 2.1, 0x3a2f27);
  } else if (typeKey === 'van') {
    b.box(0, 0.75, 0, W, 0.7, L, color);
    b.box(0, 1.65, -0.45, W * 0.96, 1.15, L * 0.74, color);
    b.box(0, 1.35, 1.65, W * 0.9, 0.7, 0.9, glass);
    b.box(0, 1.55, 2.1, W * 0.9, 0.06, 0.2, dark);
  } else {
    b.box(0, 0.68, 0, W, 0.62, L, color);
    b.box(0, 1.22, -0.1, W * 0.88, 0.55, L * 0.5, glass);
    b.box(0, 1.52, -0.1, W * 0.84, 0.07, L * 0.44, typeKey === 'police' ? 0xf4f4f4 : color);
    if (typeKey === 'taxi') { b.box(0, 1.68, -0.1, 0.8, 0.22, 0.34, 0xfff2b0); b.box(0, 0.7, 0, W + 0.01, 0.08, L * 0.9, 0x1a1a1a); }
    if (typeKey === 'police') {
      b.box(0, 0.62, 0, W + 0.02, 0.26, L * 0.5, 0xf4f4f4); // white doors
      b.box(0, 0.93, 0.0, W * 0.5, 0.05, L * 0.9, 0xf4f4f4);
    }
  }
  // lights + bumpers
  const fz = L / 2 - 0.02;
  b.box(0.62, 0.7, fz, 0.4, 0.17, 0.08, 0xfff4c8); b.box(-0.62, 0.7, fz, 0.4, 0.17, 0.08, 0xfff4c8);
  b.box(0.62, 0.7, -fz, 0.4, 0.17, 0.08, 0xd81818); b.box(-0.62, 0.7, -fz, 0.4, 0.17, 0.08, 0xd81818);
  b.box(0, 0.36, fz - 0.02, W + 0.04, 0.2, 0.18, 0x2b2b2b); b.box(0, 0.36, -fz + 0.02, W + 0.04, 0.2, 0.18, 0x2b2b2b);
  const g = b.build();
  geoCache.set(key, g);
  return g;
}

function makeCarObject(car) {
  const t = CAR_TYPES[car.type];
  const g = new THREE.Group();
  const body = new THREE.Group();
  const mesh = new THREE.Mesh(bodyGeometry(car.type, car.color), bodyMat);
  mesh.castShadow = true;
  body.add(mesh);
  if (car.type === 'police') {
    const r = new THREE.Mesh(barGeo, lightRed), bl = new THREE.Mesh(barGeo, lightBlue);
    r.position.set(0.28, 1.68, -0.1); bl.position.set(-0.28, 1.68, -0.1);
    body.add(r, bl);
  }
  g.add(body);
  const axle = (z) => {
    const a = new THREE.Group(); a.position.set(0, 0.36, z);
    const spin = new THREE.Group();
    for (const s of [-1, 1]) { const w = new THREE.Mesh(wheelGeo, wheelMat); w.position.x = s * (t.w / 2 - 0.08); spin.add(w); }
    a.add(spin);
    g.add(a);
    return { axle: a, spin };
  };
  car.front = axle(t.len * 0.31);
  car.rear = axle(-t.len * 0.3);
  car.bodyObj = body; car.mesh = mesh;
  return g;
}

export function createCar(game, type, x, z, heading, opts = {}) {
  const t = CAR_TYPES[type];
  const car = {
    kind: 'car', type, x, z, heading, vx: 0, vz: 0, speed: 0, hp: 100, dead: false, burning: false, exploded: false,
    driver: opts.driver || 'none', color: opts.color ?? game.rng.pick(t.colors), ctl: { throttle: 0, steer: 0, handbrake: false },
    steerVis: 0, smokeT: 0, missionCar: !!opts.missionCar, siren: type === 'police', roll: 0, pitch: 0, lastSpeed: 0, hornT: 0,
    plate: 'SB-' + game.rng.int(100, 999), stuck: 0, owner: opts.owner || null, hitCd: 0, burnT: 0,
  };
  car.obj = makeCarObject(car);
  game.scene.add(car.obj);
  syncCar(car, 0);
  game.cars.push(car);
  return car;
}

export function removeCar(game, car) {
  game.scene.remove(car.obj);
  const k = game.cars.indexOf(car);
  if (k >= 0) game.cars.splice(k, 1);
}

export const carForward = (car) => ({ x: Math.sin(car.heading), z: Math.cos(car.heading) });

const circlesOf = (car) => {
  const t = CAR_TYPES[car.type], fx = Math.sin(car.heading), fz = Math.cos(car.heading), o = t.len * 0.3;
  return [[car.x + fx * o, car.z + fz * o], [car.x, car.z], [car.x - fx * o, car.z - fz * o]];
};

function stepCar(game, car, dt) {
  const t = CAR_TYPES[car.type];
  if (car.dead) { car.vx *= Math.exp(-3 * dt); car.vz *= Math.exp(-3 * dt); }
  const ctl = car.dead ? { throttle: 0, steer: 0, handbrake: false } : car.ctl;
  let fx = Math.sin(car.heading), fz = Math.cos(car.heading);
  let rx = -fz, rz = fx;
  let vf = car.vx * fx + car.vz * fz, vl = car.vx * rx + car.vz * rz;
  const dmgFactor = 1 - Math.max(0, 50 - car.hp) / 140; // badly damaged cars lose power
  if (ctl.throttle > 0) vf += t.accel * dmgFactor * ctl.throttle * Math.max(0.05, 1 - Math.max(0, vf) / t.maxSpeed) * dt * 1.5;
  else if (ctl.throttle < 0) {
    if (vf > 0.6) vf -= 30 * -ctl.throttle * dt;
    else vf += t.accel * 0.6 * ctl.throttle * Math.max(0.05, 1 - Math.abs(vf) / (t.maxSpeed * 0.3)) * dt * 1.5;
  } else vf -= vf * 0.55 * dt + Math.sign(vf) * Math.min(Math.abs(vf), 1.4 * dt);
  if (ctl.handbrake) vf -= vf * Math.min(1, 1.4 * dt);
  const sp = Math.abs(vf);
  const steerIn = ctl.steer;
  car.steerVis += (steerIn * 0.5 - car.steerVis) * Math.min(1, 10 * dt);
  const yaw = steerIn * t.steer * Math.min(1, sp / 5) * (1 / (1 + sp / 42)) * (vf >= 0 ? 1 : -1) * (ctl.handbrake ? 1.45 : 1);
  car.heading += yaw * dt;
  fx = Math.sin(car.heading); fz = Math.cos(car.heading); rx = -fz; rz = fx;
  // world velocity keeps its direction; re-split in the new basis to create slip, then apply grip
  const wvx = fx * vf + rx * vl, wvz = fz * vf + rz * vl;
  vf = wvx * fx + wvz * fz; vl = wvx * rx + wvz * rz;
  const grip = ctl.handbrake ? 1.6 : t.grip;
  vl -= vl * Math.min(1, grip * dt);
  car.slip = Math.abs(vl);
  car.vx = fx * vf + rx * vl; car.vz = fz * vf + rz * vl;
  car.speed = vf;
  car.x += car.vx * dt; car.z += car.vz * dt;
  // world collisions (three circles along the body)
  const R = t.w * 0.52;
  let impact = 0;
  for (let k = -1; k <= 1; k++) {
    const o = k * t.len * 0.3, p = { x: car.x + fx * o, z: car.z + fz * o };
    const hit = pushOut(game.city, p, R, 0.4) || (clampToWorld(p, R) ? { nx: 0, nz: 0, depth: 0 } : null);
    if (hit) {
      const nx = p.x - (car.x + fx * o), nz = p.z - (car.z + fz * o);
      car.x += nx; car.z += nz;
      const len = Math.hypot(hit.nx, hit.nz) || 1, nnx = hit.nx / len, nnz = hit.nz / len;
      const vn = car.vx * nnx + car.vz * nnz;
      if (vn < 0 && len > 0.01) {
        car.vx -= 1.3 * vn * nnx; car.vz -= 1.3 * vn * nnz;
        car.vx *= 0.94; car.vz *= 0.94;
        impact = Math.max(impact, -vn);
        // nudge the heading away from the wall so cars can slide out
        car.heading += (fx * nnz - fz * nnx) * 0.02 * Math.min(1, -vn / 6);
      }
    }
  }
  if (impact > 4 && car.hitCd <= 0) {
    car.hitCd = 0.25;
    damageCar(game, car, (impact - 3) * 1.8 / t.mass, car.driver === 'player' ? 'player' : null);
    sparks(game, car.x + fx * 1.5, 0.8, car.z + fz * 1.5, 6);
    if (car.driver === 'player') { play('crash', Math.min(1, impact / 18)); game.shake = Math.min(1, impact / 16); }
  }
  car.hitCd -= dt;
  const acc = (car.speed - car.lastSpeed) / Math.max(dt, 1e-3);
  car.lastSpeed = car.speed;
  car.pitch += (-Math.max(-12, Math.min(12, acc)) * 0.004 - car.pitch) * Math.min(1, 6 * dt);
  car.roll += (Math.max(-12, Math.min(12, vl)) * -0.016 - steerIn * sp * 0.0008 - car.roll) * Math.min(1, 6 * dt);
  // skid marks + smoke from tyres
  if ((car.slip > 3.4 || (ctl.handbrake && sp > 6)) && sp > 5 && !car.dead) {
    car.skidT = (car.skidT || 0) - dt;
    if (car.skidT <= 0) {
      car.skidT = 0.045;
      for (const s of [-1, 1]) addSkid(game, car.x - fx * t.len * 0.3 + rx * s * t.w * 0.42, car.z - fz * t.len * 0.3 + rz * s * t.w * 0.42, car.heading);
      if (Math.random() < 0.4) emitSmoke(game, car.x - fx * 1.6, 0.3, car.z - fz * 1.6, 0.9, 0xd8d2c8);
    }
  }
  // damage smoke / fire
  if (car.hp < 50 && !car.exploded) {
    car.smokeT -= dt;
    if (car.smokeT <= 0) {
      car.smokeT = car.hp < 25 ? 0.07 : 0.16;
      emitSmoke(game, car.x + fx * 1.5, 1.1, car.z + fz * 1.5, car.hp < 25 ? 1.6 : 1.1, car.hp < 25 ? 0x1c1c1c : 0x9a9a9a);
      if (car.hp < 22) emitFire(game, car.x + fx * 1.4, 0.9, car.z + fz * 1.4);
    }
  }
  if (car.hp < 14 && !car.dead && car.driver !== 'player_burn') { car.burnT += dt; if (car.burnT > 6) explodeCar(game, car); }
  if (car.dead && car.burning) {
    car.smokeT -= dt;
    if (car.smokeT <= 0) { car.smokeT = 0.12; emitSmoke(game, car.x, 1.3, car.z, 1.9, 0x161616); emitFire(game, car.x + (Math.random() - 0.5), 0.9, car.z + (Math.random() - 0.5)); }
    car.burnT -= dt * 0;
  }
}

export function damageCar(game, car, amount, by) {
  if (car.dead || amount <= 0) return;
  car.hp -= amount;
  car.lastDamageBy = by;
  if (car.hp <= 0) { car.hp = 0; explodeCar(game, car); }
}

export function explodeCar(game, car) {
  if (car.exploded) return;
  car.exploded = true; car.dead = true; car.burning = true; car.hp = 0;
  explosion(game, car.x, 1, car.z);
  play('explosion', 1);
  game.shake = Math.max(game.shake || 0, 0.9);
  car.mesh.material = charredMat;
  car.bodyObj.position.y = -0.1;
  car.vx *= 0.3; car.vz *= 0.3;
  game.events.push({ type: 'explosion', car });
  game.blasts = game.blasts || [];
  game.blasts.push({ x: car.x, z: car.z, r: 8, by: car.lastDamageBy });
  if (car.driver === 'player') {
    const p = game.player;
    p.inCar = null; p.x = car.x + 2.2; p.z = car.z; car.driver = 'none';
    p.hp -= 55; game.notify && game.notify('Your car exploded!');
  }
  if (car.driver === 'ai' || car.driver === 'cop') car.driver = 'none';
  car.siren = false;
}

export function updateCars(game, dt) {
  for (const car of game.cars) stepCar(game, car, dt);
  // car vs car
  const cs = game.cars;
  for (let a = 0; a < cs.length; a++) {
    const A = cs[a];
    for (let b = a + 1; b < cs.length; b++) {
      const B = cs[b];
      const dx = B.x - A.x, dz = B.z - A.z;
      if (dx * dx + dz * dz > 30) continue;
      const ca = circlesOf(A), cb = circlesOf(B);
      let best = null;
      for (const p of ca) for (const q of cb) {
        const ex = q[0] - p[0], ez = q[1] - p[1], d = Math.hypot(ex, ez), pen = 2.0 - d;
        if (pen > 0 && (!best || pen > best.pen)) best = { pen, nx: d > 1e-4 ? ex / d : 1, nz: d > 1e-4 ? ez / d : 0 };
      }
      if (!best) continue;
      const ma = CAR_TYPES[A.type].mass, mb = CAR_TYPES[B.type].mass;
      const aStatic = A.driver === 'none' && Math.hypot(A.vx, A.vz) < 0.5, bStatic = B.driver === 'none' && Math.hypot(B.vx, B.vz) < 0.5;
      const wa = aStatic ? 0.15 : mb / (ma + mb), wb = bStatic ? 0.15 : ma / (ma + mb);
      const norm = wa + wb;
      A.x -= best.nx * best.pen * wa / norm; A.z -= best.nz * best.pen * wa / norm;
      B.x += best.nx * best.pen * wb / norm; B.z += best.nz * best.pen * wb / norm;
      const rv = (B.vx - A.vx) * best.nx + (B.vz - A.vz) * best.nz;
      if (rv < 0) {
        const j = -(1.35) * rv / (1 / ma + 1 / mb);
        A.vx -= j * best.nx / ma; A.vz -= j * best.nz / ma; B.vx += j * best.nx / mb; B.vz += j * best.nz / mb;
        if (-rv > 4 && A.hitCd <= 0 && B.hitCd <= 0) {
          A.hitCd = B.hitCd = 0.3;
          const dmg = (-rv - 3) * 1.6;
          const aP = A.driver === 'player', bP = B.driver === 'player';
          damageCar(game, A, dmg / ma, bP ? 'player' : B.driver === 'cop' ? 'cop' : null);
          damageCar(game, B, dmg / mb, aP ? 'player' : A.driver === 'cop' ? 'cop' : null);
          sparks(game, (A.x + B.x) / 2, 0.9, (A.z + B.z) / 2, 8);
          if (aP || bP) { play('crash', Math.min(1, -rv / 16)); game.shake = Math.max(game.shake || 0, Math.min(1, -rv / 14)); }
          game.events.push({ type: 'carCrash', a: A, b: B, speed: -rv });
        }
      }
    }
  }
  for (const car of cs) syncCar(car, dt);
}

export function syncCar(car, dt) {
  car.obj.position.set(car.x, 0, car.z);
  car.obj.rotation.y = car.heading;
  car.bodyObj.rotation.x = car.pitch || 0;
  car.bodyObj.rotation.z = car.roll || 0;
  car.front.axle.rotation.y = car.steerVis;
  const spin = car.speed * dt / 0.36;
  car.front.spin.rotation.x += spin; car.rear.spin.rotation.x += spin;
}

export function nearestCar(game, x, z, maxD = 3.6) {
  let best = null, bd = maxD;
  for (const c of game.cars) {
    if (c.dead || c === game.player.inCar) continue;
    const d = Math.hypot(c.x - x, c.z - z) - CAR_TYPES[c.type].len * 0.15;
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

export function repairCar(car) { car.hp = 100; car.burnT = 0; }
