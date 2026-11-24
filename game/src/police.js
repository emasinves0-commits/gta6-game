// SBPD: 1-5 star wanted system, pursuing/ramming/flanking cruisers, cops on foot, roadblocks, helicopter with spotlight,
// line-of-sight escape, busting, and the dispatch list shown in the HUD.
import * as THREE from 'three';
import { MAX_STARS, COOLDOWN_BASE, COOLDOWN_PER_STAR, SIGHT_RANGE, HELI_SIGHT, CRUISERS_PER_STAR, BUST_TIME } from './config.js';
import { nodePos, nearestNode, roadPath, segBlocked, DIRS, pushOut, clampToWorld } from './city.js';
import { createCar, removeCar, CAR_TYPES } from './vehicles.js';
import { pickEdge, placeOnLane } from './traffic.js';
import { makeHuman, poseHuman } from './characters.js';
import { hitscan } from './combat.js';
import { play } from './audio.js';
import { setPlayerKillsStat } from './stats.js';

const THRESH = [0, 20, 55, 105, 170, 250];
const starsFor = (pts) => { let s = 0; for (let k = 1; k < THRESH.length; k++) if (pts >= THRESH[k]) s = k; return s; };
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
const ROLES = ['PURSUIT', 'RAMMING', 'FLANKING'];

export function createWanted() { return { stars: 0, pts: 0, cool: 0, seen: false, unitSeq: 0, spawnT: 1.5, losT: 0, flash: 0 }; }

export function addWanted(game, pts, reason) {
  if (game.mission?.noWanted || game.godMode) return;
  const w = game.wanted;
  if (pts <= 0) return;
  w.pts += pts; w.cool = 0;
  const s = Math.min(MAX_STARS, starsFor(w.pts));
  if (s > w.stars) { w.stars = s; play('wanted'); w.flash = 1.2; game.banner && game.banner(`WANTED  ${'*'.repeat(s)}`, reason ? reason.toUpperCase() : 'SBPD ALERTED', 'wanted'); }
}

export function setWanted(game, stars) {
  const w = game.wanted;
  w.stars = Math.max(0, Math.min(MAX_STARS, stars));
  w.pts = THRESH[w.stars] + (w.stars ? 1 : 0); w.cool = 0; w.flash = 1;
  if (stars > 0) play('wanted');
}

export function clearWanted(game) { game.wanted.stars = 0; game.wanted.pts = 0; game.wanted.cool = 0; }

// ---------------- cops on foot ----------------
export function createCop(game, x, z, kind = 'cop') {
  const goon = kind === 'goon';
  const human = makeHuman(goon
    ? { skin: 0xc9966d, shirt: 0x1d1d22, pants: 0x1d1d22, hair: 0x111111, vest: 0x5a1f1f, cap: 0x111111 }
    : { skin: game.rng.pick([0xf0c7a0, 0xb27c52]), shirt: 0x1f3a73, pants: 0x14213d, hair: 0x2a1c14, cap: 0x14213d });
  human.gun.visible = true;
  game.scene.add(human.group);
  const cop = { kind, x, z, heading: 0, vx: 0, vz: 0, hp: goon ? 70 : 55, dead: false, human, fireT: game.rng.range(0.6, 1.4), deadT: 0, fall: 0, name: goon ? 'GUARD' : 'OFFICER', roadblock: false, holdX: x, holdZ: z, bustT: 0 };
  game.cops.push(cop);
  return cop;
}

export function damageCop(game, cop, dmg, by) {
  if (cop.dead) return;
  cop.hp -= dmg;
  if (by === 'player' && cop.kind === 'cop') addWanted(game, 14, 'shooting at police');
  if (cop.hp <= 0) {
    cop.dead = true;
    if (by === 'player') {
      game.stats.kills++;
      if (cop.kind === 'cop') { addWanted(game, 40, 'police officer down'); game.stats.copKills++; }
      game.money += cop.kind === 'goon' ? 120 : 60;
    }
  }
}

function updateCops(game, dt) {
  const p = game.player, w = game.wanted;
  for (let k = game.cops.length - 1; k >= 0; k--) {
    const c = game.cops[k];
    if (c.dead) {
      c.deadT += dt; c.fall = Math.min(1, c.fall + dt * 4);
      poseHuman(c.human, { fall: c.fall, dt });
      c.human.group.position.set(c.x, 0, c.z);
      if (c.deadT > 14) { game.scene.remove(c.human.group); game.cops.splice(k, 1); }
      continue;
    }
    const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz);
    const hostile = c.kind === 'goon' ? game.mission.active && c.active !== false : w.stars > 0;
    if (c.kind === 'cop' && w.stars === 0 && !c.roadblock) { c.idleT = (c.idleT || 0) + dt; if (c.idleT > 6 && d > 25) { game.scene.remove(c.human.group); game.cops.splice(k, 1); continue; } }
    let walk = 0;
    if (hostile && !p.dead) {
      const want = c.roadblock ? 0 : c.kind === 'goon' ? 9 : 5;
      const target = c.roadblock ? { x: c.holdX, z: c.holdZ } : p;
      const tx = target.x - c.x, tz = target.z - c.z, td = Math.hypot(tx, tz) || 1;
      const sp = c.kind === 'goon' ? 3.6 : 4.6;
      if (td > want && !(c.roadblock && td < 1)) {
        c.vx += ((tx / td) * sp - c.vx) * Math.min(1, dt * 6); c.vz += ((tz / td) * sp - c.vz) * Math.min(1, dt * 6); walk = 1;
      } else { c.vx *= 0.8; c.vz *= 0.8; }
      c.heading += angDiff(Math.atan2(dx, dz), c.heading) * Math.min(1, dt * 10);
      // shoot
      c.fireT -= dt;
      const range = c.kind === 'goon' ? 36 : 32;
      if (c.fireT <= 0 && d < range && (!p.inCar || true)) {
        const blocked = segBlocked(game.city, c.x, c.z, p.x, p.z, 1.3, 2.0) >= 0;
        if (!blocked) {
          c.fireT = game.rng.range(0.8, 1.5);
          const a = Math.atan2(dx, dz) + (Math.random() - 0.5) * (0.13 + d * 0.003);
          hitscan(game, c.x + Math.sin(a) * 0.6, c.z + Math.cos(a) * 0.6, Math.sin(a), Math.cos(a), { range: 60, damage: c.kind === 'goon' ? 26 : 20 }, c.kind === 'goon' ? 'goon' : 'cop');
          play('copshot', Math.max(0.2, 1 - d / 60));
          game.events.push({ type: 'shot', x: c.x, z: c.z, by: 'cop' });
        } else c.fireT = 0.4;
      }
      // arrest
      if (c.kind === 'cop' && !c.roadblock) {
        const close = p.inCar ? d < 3.8 && Math.abs(p.inCar.speed) < 5 : d < 2.2;
        if (close) { p.bustT = (p.bustT || 0) + dt * 0.5; }
      }
    } else { c.vx *= 0.85; c.vz *= 0.85; }
    c.x += c.vx * dt; c.z += c.vz * dt;
    pushOut(game.city, c, 0.4, 0.3); clampToWorld(c, 0.4, 1.5);
    c.human.group.position.set(c.x, 0, c.z);
    c.human.group.rotation.y = c.heading;
    poseHuman(c.human, { walk, dt, aim: hostile, speed: Math.hypot(c.vx, c.vz) });
  }
}

// ---------------- cruisers ----------------
function spawnCruiser(game) {
  const p = game.player;
  const e = pickEdge(game, p, 85, 150);
  const car = createCar(game, 'police', 0, 0, 0, { driver: 'cop' });
  placeOnLane(car, e.i, e.j, e.d, e.along);
  car.ai = null;
  car.vx = Math.sin(car.heading) * 8; car.vz = Math.cos(car.heading) * 8;
  game.wanted.unitSeq++;
  car.unit = 'SBPD-' + String(game.wanted.unitSeq).padStart(2, '0');
  car.role = ROLES[(game.wanted.unitSeq - 1) % 3];
  car.cp = { path: null, pathT: 0, stuckT: 0, revT: 0, copsOut: 0, flankSide: game.rng.chance(0.5) ? 1 : -1 };
  car.siren = true;
  return car;
}

function driveCruiser(game, car, dt) {
  const p = game.player, cp = car.cp, w = game.wanted, t = CAR_TYPES.police;
  const tgt = p.inCar || p;
  const tvx = p.inCar ? p.inCar.vx : p.vx, tvz = p.inCar ? p.inCar.vz : p.vz;
  const dx = tgt.x - car.x, dz = tgt.z - car.z, d = Math.hypot(dx, dz);
  const direct = d < 45 && segBlocked(game.city, car.x, car.z, tgt.x, tgt.z, 1.0, 2.5) < 0;
  let ax, az, targetSpeed = t.maxSpeed * 0.85;
  if (cp.revT > 0) { cp.revT -= dt; car.ctl.throttle = -1; car.ctl.steer = -cp.revSteer; car.ctl.handbrake = false; return; }
  if (direct) {
    const lead = Math.min(1.1, d / 25);
    ax = tgt.x + tvx * lead; az = tgt.z + tvz * lead;
    if (car.role === 'FLANKING' && d > 16) { const fx = Math.sin(car.heading), fz = Math.cos(car.heading); ax += -fz * 9 * cp.flankSide; az += fx * 9 * cp.flankSide; }
    if (car.role === 'PURSUIT' && d < 18) targetSpeed = Math.max(8, Math.hypot(tvx, tvz) * 1.08 + 2);
    if (d < 7 && !p.inCar) targetSpeed = 3;
  } else {
    cp.pathT -= dt;
    if (!cp.path || cp.pathT <= 0) { cp.path = roadPath(nearestNode(car.x, car.z), nearestNode(tgt.x, tgt.z)); cp.pathT = 1.2; }
    let node = null;
    for (const n of cp.path) { const np = nodePos(n.i, n.j); if (Math.hypot(np.x - car.x, np.z - car.z) > 11) { node = np; break; } }
    if (!node) node = { x: tgt.x, z: tgt.z };
    ax = node.x; az = node.z;
  }
  const desired = Math.atan2(ax - car.x, az - car.z), err = angDiff(desired, car.heading);
  car.ctl.steer = Math.max(-1, Math.min(1, err * 2.6));
  if (Math.abs(err) > 0.9) targetSpeed = Math.min(targetSpeed, 11);
  const e = targetSpeed - car.speed;
  car.ctl.throttle = e > 0 ? 1 : Math.max(-0.6, e * 0.3);
  car.ctl.handbrake = false;
  if (Math.abs(car.speed) < 1.2 && d > 9) { cp.stuckT += dt; if (cp.stuckT > 1.3) { cp.stuckT = 0; cp.revT = 1.0; cp.revSteer = car.ctl.steer || 1; } } else cp.stuckT = 0;
  // officers get out when the player is on foot / slow and close
  if (d < 20 && (!p.inCar || Math.abs(p.inCar.speed) < 4) && cp.copsOut < (w.stars >= 3 ? 2 : 1) && countFootCops(game) < 8) {
    car.ctl.throttle = 0; car.ctl.handbrake = true;
    if (Math.abs(car.speed) < 2) {
      cp.copsOut++;
      const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
      createCop(game, car.x - fz * 2.2 * (cp.copsOut % 2 ? 1 : -1), car.z + fx * 2.2 * (cp.copsOut % 2 ? 1 : -1));
      if (cp.copsOut >= (w.stars >= 3 ? 2 : 1)) { car.driver = 'none'; car.siren = false; car.role = 'ABANDONED'; }
    }
  }
}
const countFootCops = (game) => game.cops.filter((c) => c.kind === 'cop' && !c.dead).length;

// ---------------- roadblocks ----------------
function spawnRoadblock(game) {
  const p = game.player, tgt = p.inCar || p;
  let fx = p.inCar ? Math.sin(p.inCar.heading) : Math.sin(p.heading), fz = p.inCar ? Math.cos(p.inCar.heading) : Math.cos(p.heading);
  const n = nearestNode(tgt.x + fx * 140, tgt.z + fz * 140), np = nodePos(n.i, n.j);
  if (Math.hypot(np.x - tgt.x, np.z - tgt.z) < 70) return;
  // pick the road axis closest to the approach direction; block that arm of the intersection just before the node
  let axis = Math.abs(fx) > Math.abs(fz) ? 0 : 1;
  const sgn = (axis === 0 ? fx : fz) > 0 ? -1 : 1; // arm toward the player
  const dir = DIRS[axis === 0 ? (sgn > 0 ? 0 : 2) : (sgn > 0 ? 1 : 3)];
  const cx = np.x + dir[0] * 17, cz = np.z + dir[1] * 17;
  const perp = [-dir[1], dir[0]];
  const cars = [];
  for (const o of [-3.8, 3.8]) {
    const car = createCar(game, 'police', cx + perp[0] * o, cz + perp[1] * o, Math.atan2(perp[0], perp[1]) + (o > 0 ? 0.12 : -0.12), { driver: 'none' });
    car.roadblock = true; car.parked = true; car.siren = true;
    game.wanted.unitSeq++;
    car.unit = 'SBPD-' + String(game.wanted.unitSeq).padStart(2, '0'); car.role = 'ROADBLOCK';
    cars.push(car);
    const cop = createCop(game, car.x - dir[0] * 2.4, car.z - dir[1] * 2.4);
    cop.roadblock = true; cop.holdX = cop.x; cop.holdZ = cop.z;
  }
  const cones = [];
  for (let k = -2; k <= 2; k++) {
    if (k === 0) continue;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.7, 6), new THREE.MeshLambertMaterial({ color: 0xff6a1f }));
    cone.position.set(cx + perp[0] * k * 3.3 + dir[0] * 5, 0.35, cz + perp[1] * k * 3.3 + dir[1] * 5);
    game.scene.add(cone); cones.push(cone);
  }
  game.roadblocks.push({ cars, cones, x: cx, z: cz });
}

function updateRoadblocks(game) {
  const p = game.player, w = game.wanted;
  for (let k = game.roadblocks.length - 1; k >= 0; k--) {
    const rb = game.roadblocks[k], d = Math.hypot(rb.x - p.x, rb.z - p.z);
    if (w.stars < 3 || d > 300) {
      for (const c of rb.cars) removeCar(game, c);
      for (const c of rb.cones) game.scene.remove(c);
      for (let q = game.cops.length - 1; q >= 0; q--) if (game.cops[q].roadblock && Math.hypot(game.cops[q].holdX - rb.x, game.cops[q].holdZ - rb.z) < 12) { game.scene.remove(game.cops[q].human.group); game.cops.splice(q, 1); }
      game.roadblocks.splice(k, 1);
    }
  }
  if (w.stars >= 3 && game.roadblocks.length < (w.stars >= 5 ? 2 : 1) && (game.time - (game.lastRoadblock || -99)) > 7) { game.lastRoadblock = game.time; spawnRoadblock(game); }
}

// ---------------- helicopter ----------------
function makeHeli() {
  const g = new THREE.Group();
  const body = new THREE.MeshLambertMaterial({ color: 0x20242c }), white = new THREE.MeshLambertMaterial({ color: 0xe9ecf2 });
  const fus = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), body); fus.scale.set(1.4, 1.5, 3.0); g.add(fus);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.35, 3.2), white); stripe.position.y = -0.2; g.add(stripe);
  const glass = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshLambertMaterial({ color: 0x6fa6c8 })); glass.scale.set(1.1, 0.9, 1.3); glass.position.set(0, 0.35, 1.5); g.add(glass);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 4.6), body); tail.position.set(0, 0.4, -4.3); g.add(tail);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.4, 0.9), body); fin.position.set(0, 1.0, -6.3); g.add(fin);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.6, 6), body); mast.position.y = 1.7; g.add(mast);
  const rotor = new THREE.Group(); rotor.position.y = 2.0;
  for (let k = 0; k < 2; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(11, 0.05, 0.35), body); b.rotation.y = k * Math.PI / 2; rotor.add(b); }
  g.add(rotor);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(5.6, 5.6, 0.02, 20), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.13, depthWrite: false })); disc.position.y = 2.0; g.add(disc);
  const skidL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 3.2), body); skidL.position.set(-1.2, -1.5, 0.2); g.add(skidL);
  const skidR = skidL.clone(); skidR.position.x = 1.2; g.add(skidR);
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff4c8 })); light.position.set(0, -1.1, 1.8); g.add(light);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { group: g, rotor, disc };
}

export function spawnHeli(game, near) {
  if (game.heli) return;
  const parts = makeHeli();
  const p = near || game.player;
  const h = { ...parts, x: p.x + 90, z: p.z - 70, y: 34, ang: 0, vx: 0, vz: 0, yaw: 0, orbit: 0 };
  // spotlight cone (translucent) + ground pool
  const coneGeo = new THREE.CylinderGeometry(0.4, 6.5, 1, 24, 1, true);
  coneGeo.translate(0, -0.5, 0);
  const cone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color: 0xfff1b8, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  const pool = new THREE.Mesh(new THREE.CircleGeometry(6.5, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfff1b8, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending }));
  h.cone = cone; h.pool = pool;
  game.scene.add(h.group, cone, pool);
  game.heli = h;
  game.banner && game.banner('AIR UNIT DEPLOYED', 'AIR-1 IS ON STATION', 'wanted');
  game.say && game.say('SBPD Dispatch', 'All units, Air-1 has eyes on the suspect. Keep him in the light.');
  play('heli');
}

export function removeHeli(game) {
  const h = game.heli;
  if (!h) return;
  game.scene.remove(h.group, h.cone, h.pool);
  game.heli = null;
}

function updateHeli(game, dt) {
  const w = game.wanted, p = game.player;
  if (w.stars >= 3 && !game.heli) spawnHeli(game);
  const h = game.heli;
  if (!h) return;
  const tgt = p.inCar || p;
  h.orbit += dt * 0.35;
  const gx = w.stars >= 3 ? tgt.x + Math.cos(h.orbit) * 16 : h.x + 200, gz = w.stars >= 3 ? tgt.z + Math.sin(h.orbit) * 16 : h.z - 200;
  const dx = gx - h.x, dz = gz - h.z, d = Math.hypot(dx, dz) || 1;
  const sp = Math.min(46, d * 1.3 + (w.stars >= 3 ? Math.hypot(tgt.vx || 0, tgt.vz || 0) * 0.5 : 0));
  h.vx += ((dx / d) * sp - h.vx) * Math.min(1, dt * 1.6); h.vz += ((dz / d) * sp - h.vz) * Math.min(1, dt * 1.6);
  h.x += h.vx * dt; h.z += h.vz * dt;
  h.y += ((w.stars >= 3 ? 33 : 60) - h.y) * Math.min(1, dt);
  const yawT = Math.atan2(h.vx, h.vz);
  if (Math.hypot(h.vx, h.vz) > 2) h.yaw += angDiff(yawT, h.yaw) * Math.min(1, dt * 1.5);
  h.group.position.set(h.x, h.y + Math.sin(game.time * 1.7) * 0.4, h.z);
  h.group.rotation.set(Math.hypot(h.vx, h.vz) * 0.004, h.yaw, 0, 'YXZ');
  h.rotor.rotation.y += dt * 40;
  // spotlight: apex under the heli, aimed at the player
  const on = w.stars >= 3;
  h.cone.visible = h.pool.visible = on;
  if (on) {
    const sx = h.x + Math.sin(h.yaw) * 1.8, sy = h.y - 1.0, sz = h.z + Math.cos(h.yaw) * 1.8;
    const ex = tgt.x, ez = tgt.z, len = Math.hypot(ex - sx, sy, ez - sz);
    h.cone.position.set(sx, sy, sz);
    h.cone.lookAt(ex, 0, ez);
    h.cone.rotateX(-Math.PI / 2); // geometry runs along -Y after translate; point it at the target
    h.cone.scale.set(1, len, 1);
    h.pool.position.set(ex, 0.12, ez);
  }
  if (!on && Math.hypot(h.x - p.x, h.z - p.z) > 260) removeHeli(game);
  game.heliSees = on && Math.hypot(h.x - tgt.x, h.z - tgt.z) < HELI_SIGHT;
}

// ---------------- main update ----------------
export function updatePolice(game, dt) {
  const w = game.wanted, p = game.player;
  w.flash = Math.max(0, w.flash - dt);
  // flashing light bars
  const ph = Math.floor(game.time * 5) % 2;
  game.copFlash = ph;
  if (w.stars > 0 || game.cars.some((c) => c.siren)) {
    lightPulse(ph);
  }
  // cruiser dispatch
  const cruisers = game.cars.filter((c) => c.driver === 'cop' && !c.dead);
  const want = CRUISERS_PER_STAR[w.stars];
  w.spawnT -= dt;
  if (cruisers.length < want && w.spawnT <= 0) { spawnCruiser(game); w.spawnT = 2.4; }
  for (const c of game.cars) {
    if (c.driver === 'cop') {
      if (w.stars === 0) {
        c.ctl.throttle = 0.5; c.ctl.steer = 0; c.siren = false;
        if (Math.hypot(c.x - p.x, c.z - p.z) > 70) removeCar(game, c);
        continue;
      }
      driveCruiser(game, c, dt);
      if (Math.hypot(c.x - p.x, c.z - p.z) > 380) removeCar(game, c);
    } else if (c.type === 'police' && c.role === 'ABANDONED' && w.stars === 0 && Math.hypot(c.x - p.x, c.z - p.z) > 70) removeCar(game, c);
  }
  updateRoadblocks(game);
  updateCops(game, dt);
  updateHeli(game, dt);
  // sight + cooldown + busted
  w.losT -= dt;
  if (w.losT <= 0) {
    w.losT = 0.25;
    let seen = false;
    const tgt = p.inCar || p;
    for (const c of game.cars) {
      if (c.type !== 'police' || c.dead || c === p.inCar) continue;
      if (c.role === 'ABANDONED') continue;
      const d = Math.hypot(c.x - tgt.x, c.z - tgt.z);
      if (d < SIGHT_RANGE && (d < 22 || segBlocked(game.city, c.x, c.z, tgt.x, tgt.z, 1.0, 3) < 0)) { seen = true; break; }
    }
    if (!seen) for (const c of game.cops) {
      if (c.dead || c.kind !== 'cop') continue;
      const d = Math.hypot(c.x - tgt.x, c.z - tgt.z);
      if (d < 55 && segBlocked(game.city, c.x, c.z, tgt.x, tgt.z, 1.3, 3) < 0) { seen = true; break; }
    }
    if (!seen && game.heliSees) seen = true;
    w.seen = seen;
  }
  if (w.stars > 0) {
    if (w.seen) w.cool = 0;
    else {
      w.cool += dt;
      if (w.cool > COOLDOWN_BASE + w.stars * COOLDOWN_PER_STAR) {
        w.stars--; w.pts = w.stars ? THRESH[w.stars] : 0; w.cool = 0;
        if (w.stars === 0) game.banner && game.banner('WANTED LEVEL CLEARED', 'YOU LOST THEM', 'pass');
        else game.notify && game.notify('Heat dropping - stay out of sight');
      }
    }
    // bust
    if (p.bustT > 0) {
      p.bustT = Math.max(0, p.bustT - dt * 0.25);
      if (p.bustT >= BUST_TIME) { p.bustT = 0; game.events.push({ type: 'busted' }); }
    }
  } else p.bustT = 0;
  setPlayerKillsStat(game);
}

let flashReds = 0;
function lightPulse() { flashReds++; }
void flashReds;

// Units for the HUD dispatch panel.
export function getDispatch(game) {
  const p = game.player, out = [];
  for (const c of game.cars) {
    if (c.type !== 'police' || c.dead || !c.unit || c.role === 'ABANDONED') continue;
    out.push({ name: c.unit, role: c.role, dist: Math.round(Math.hypot(c.x - p.x, c.z - p.z)) });
  }
  if (game.heli && game.wanted.stars >= 3) out.push({ name: 'AIR-1', role: 'AIR UNIT', dist: Math.round(Math.hypot(game.heli.x - p.x, game.heli.z - p.z)) });
  out.sort((a, b) => a.dist - b.dist);
  return out;
}
