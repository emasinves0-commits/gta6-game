// Weapons (fists / pistol / SMG / shotgun), hitscan bullets, melee, blasts and pickups (health, armour, ammo, weapons, cash).
import * as THREE from 'three';
import { WEAPONS, MELEE_RANGE } from './config.js';
import { segBlocked, sidewalkPoint, nodePos } from './city.js';
import { tracer, muzzleFlash, sparks, dust } from './effects.js';
import { hurtPed } from './pedestrians.js';
import { damageCop } from './police.js';
import { damageCar, CAR_TYPES } from './vehicles.js';
import { hurtPlayer, giveWeapon } from './player.js';
import { addWanted } from './police.js';
import { play } from './audio.js';

// Fire one ray. shooter: 'player' | 'cop' | 'goon'. Returns the impact point.
export function hitscan(game, ox, oz, dx, dz, weapon, shooter, ignoreCar = null) {
  const range = weapon.range;
  const wall = segBlocked(game.city, ox, oz, ox + dx * range, oz + dz * range, 1.3, 1.0);
  const maxT = wall >= 0 ? wall : range;
  let best = null;
  const consider = (ent, type, cx, cz, rad) => {
    const rx = cx - ox, rz = cz - oz, along = rx * dx + rz * dz;
    if (along < 0.3 || along > maxT + rad) return;
    const perp = Math.abs(rx * dz - rz * dx);
    if (perp > rad) return;
    const t = along - Math.sqrt(Math.max(0, rad * rad - perp * perp));
    if (!best || t < best.t) best = { t: Math.max(0.3, t), ent, type };
  };
  for (const q of game.peds) if (q.state !== 'dead') consider(q, 'ped', q.x, q.z, 0.5);
  for (const c of game.cops) if (!c.dead && shooter === 'player') consider(c, 'cop', c.x, c.z, 0.5);
  if (shooter !== 'player' && !game.player.inCar) consider(game.player, 'player', game.player.x, game.player.z, 0.55);
  for (const car of game.cars) {
    if (car === ignoreCar) continue;
    const t = CAR_TYPES[car.type], fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    for (const o of [-0.3, 0, 0.3]) consider(car, 'car', car.x + fx * t.len * o, car.z + fz * t.len * o, 1.05);
  }
  if (shooter !== 'player' && game.player.inCar) {
    const c = game.player.inCar; if (c !== ignoreCar) consider(c, 'car', c.x, c.z, 1.6);
  }
  const t = best ? best.t : maxT;
  const ex = ox + dx * t, ez = oz + dz * t;
  tracer(game, ox, 1.35, oz, ex, 1.3, ez);
  if (best) {
    const e = best.ent;
    if (best.type === 'ped') hurtPed(game, e, weapon.damage, shooter === 'player' ? 'player' : null, dx, dz);
    else if (best.type === 'cop') damageCop(game, e, weapon.damage, shooter === 'player' ? 'player' : null);
    else if (best.type === 'player') hurtPlayer(game, weapon.damage * (shooter === 'goon' ? 0.45 : 0.32));
    else if (best.type === 'car') {
      damageCar(game, e, weapon.damage * 0.22, shooter === 'player' ? 'player' : null);
      sparks(game, ex, 1.0, ez, 4);
      if (shooter === 'player' && e.driver === 'cop') addWanted(game, 12, 'shot police car');
      if (shooter === 'player' && e.driver === 'ai') addWanted(game, 4, 'shot at car');
    }
    if (best.type !== 'car') dust(game, ex, 1.2, ez, 0xaa3030);
  } else if (wall >= 0) sparks(game, ex, 1.2, ez, 3);
  return { x: ex, z: ez };
}

export function playerAttack(game, input, dt) {
  const p = game.player;
  if (p.inCar || p.dead) { p.wasDown = false; return; }
  const w = WEAPONS[p.weapon];
  const wantMelee = input.pressed('f') || game.wantPunch;
  game.wantPunch = false;
  if (wantMelee) { punch(game); }
  if (input.pressed('r') && p.weapon > 0 && p.reloadT <= 0 && p.mag[p.weapon] < w.mag && p.reserve[p.weapon] > 0) startReload(p, w);
  if (p.reloadT <= 0 && p.reloading) finishReload(p);
  const down = input.mouse.down;
  const fresh = down && !p.wasDown;
  p.wasDown = down;
  if (!down || p.reloadT > 0 || p.fireCd > 0) return;
  if (p.weapon === 0) { if (fresh) punch(game); return; }
  const auto = p.weapon === 2;
  if (!auto && !fresh && p.fireCd > -0.02) return;
  if (p.mag[p.weapon] <= 0) { if (p.reserve[p.weapon] > 0) startReload(p, w); else play('click'); return; }
  fire(game, p, w);
}

function startReload(p, w) { p.reloadT = w.reload; p.reloading = true; play('reload'); }
function finishReload(p) {
  const w = WEAPONS[p.weapon], need = w.mag - p.mag[p.weapon], take = Math.min(need, p.reserve[p.weapon]);
  p.mag[p.weapon] += take; p.reserve[p.weapon] -= take; p.reloading = false;
}

function fire(game, p, w) {
  p.fireCd = w.delay; p.mag[p.weapon]--; p.aimT = 2.2; p.lastShot = game.time;
  const aim = game.aimPoint || { x: p.x + Math.sin(p.heading), z: p.z + Math.cos(p.heading) };
  let ang = Math.atan2(aim.x - p.x, aim.z - p.z);
  const mx = p.x + Math.sin(ang) * 0.7, mz = p.z + Math.cos(ang) * 0.7;
  for (let k = 0; k < w.pellets; k++) {
    const a = ang + (Math.random() - 0.5) * w.spread * 2;
    hitscan(game, mx, mz, Math.sin(a), Math.cos(a), w, 'player');
  }
  muzzleFlash(game, mx, 1.4, mz);
  play(w.id === 'smg' ? 'smg' : w.id === 'shotgun' ? 'shotgun' : 'shot');
  game.events.push({ type: 'shot', x: p.x, z: p.z, by: 'player' });
  game.shake = Math.max(game.shake || 0, w.id === 'shotgun' ? 0.25 : 0.08);
  if (game.peds.some((q) => q.state !== 'dead' && Math.hypot(q.x - p.x, q.z - p.z) < 28)) addWanted(game, 1.2, 'gunfire');
  p.heading = ang;
}

export function punch(game) {
  const p = game.player;
  if (p.punchT > 0.3 || p.inCar) return;
  p.punchT = 1; play('punch');
  let best = null, bd = MELEE_RANGE;
  const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
  const test = (e, type) => {
    const dx = e.x - p.x, dz = e.z - p.z, d = Math.hypot(dx, dz);
    if (d < bd && (dx * fx + dz * fz) / (d || 1) > 0.3) { bd = d; best = { e, type }; }
  };
  for (const q of game.peds) if (q.state !== 'dead') test(q, 'ped');
  for (const c of game.cops) if (!c.dead) test(c, 'cop');
  if (best) {
    if (best.type === 'ped') hurtPed(game, best.e, 24, 'player', fx, fz);
    else damageCop(game, best.e, 24, 'player');
    dust(game, best.e.x, 1.3, best.e.z, 0xe8d8c0);
  }
}

// ---- explosions' area damage
export function processBlasts(game) {
  if (!game.blasts || !game.blasts.length) return;
  for (const b of game.blasts) {
    const p = game.player;
    const dp = Math.hypot(p.x - b.x, p.z - b.z);
    if (dp < b.r && !p.inCar) hurtPlayer(game, (1 - dp / b.r) * 60);
    for (const q of game.peds) { if (q.state !== 'dead' && Math.hypot(q.x - b.x, q.z - b.z) < b.r) hurtPed(game, q, 60, b.by === 'player' ? 'player' : null, q.x - b.x, q.z - b.z); }
    for (const c of game.cops) { if (!c.dead && Math.hypot(c.x - b.x, c.z - b.z) < b.r) damageCop(game, c, 70, b.by === 'player' ? 'player' : null); }
    for (const c of game.cars) {
      if (c.exploded) continue;
      const d = Math.hypot(c.x - b.x, c.z - b.z);
      if (d < b.r && d > 0.5) { damageCar(game, c, 45 * (1 - d / b.r), b.by); c.vx += (c.x - b.x) / d * 4; c.vz += (c.z - b.z) / d * 4; if (p.inCar === c) hurtPlayer(game, 8); }
    }
    if (b.by === 'player') addWanted(game, 10, 'explosion');
  }
  game.blasts.length = 0;
}

// ---- pickups
const PICKUP_COLORS = { health: 0x38d26a, armor: 0x3d8bff, ammo: 0xffa23a, smg: 0xb0b0b8, shotgun: 0xc8a064, cash: 0x7ee08a };
const pg = new THREE.BoxGeometry(1, 1, 1);

function makePickupMesh(type) {
  const g = new THREE.Group();
  const color = PICKUP_COLORS[type];
  const m = new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.35 });
  const body = new THREE.Mesh(pg, m);
  if (type === 'cash') body.scale.set(0.8, 0.12, 0.45);
  else if (type === 'smg' || type === 'shotgun') body.scale.set(0.3, 0.3, 1.0);
  else body.scale.set(0.6, 0.6, 0.6);
  g.add(body);
  if (type === 'health') {
    const w = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const a = new THREE.Mesh(pg, w), b = new THREE.Mesh(pg, w);
    a.scale.set(0.5, 0.14, 0.14); b.scale.set(0.14, 0.14, 0.5); a.position.y = b.position.y = 0.32; g.add(a, b);
  }
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
  ring.position.y = -0.55; g.add(ring);
  return g;
}

export function addPickup(game, type, x, z, extra = {}) {
  const obj = makePickupMesh(type);
  obj.position.set(x, 1.0, z);
  game.scene.add(obj);
  const pk = { type, x, z, obj, value: extra.value || 0, ttl: extra.ttl || 0, t: Math.random() * 6, taken: false, respawn: extra.respawn ?? 70 };
  game.pickups.push(pk);
  return pk;
}

export function spawnPickups(game) {
  const rng = game.rng;
  for (let k = 0; k < 6; k++) { const s = sidewalkPoint(game.city, rng); addPickup(game, 'health', s.x, s.z); }
  for (let k = 0; k < 4; k++) { const s = sidewalkPoint(game.city, rng); addPickup(game, 'armor', s.x, s.z); }
  for (let k = 0; k < 5; k++) { const s = sidewalkPoint(game.city, rng); addPickup(game, 'ammo', s.x, s.z); }
  const a = nodePos(1, 2), b = nodePos(5, 7);
  addPickup(game, 'smg', a.x + 10, a.z + 10, { respawn: 9999 });
  addPickup(game, 'shotgun', b.x + 8, b.z + 18, { respawn: 9999 });
}

export function updatePickups(game, dt) {
  const p = game.player;
  for (let k = game.pickups.length - 1; k >= 0; k--) {
    const pk = game.pickups[k];
    if (pk.ttl) { pk.ttl -= dt; if (pk.ttl <= 0) { if (pk.obj) game.scene.remove(pk.obj); game.pickups.splice(k, 1); continue; } }
    if (!pk.obj) { pk.obj = makePickupMesh(pk.type); game.scene.add(pk.obj); }
    if (pk.taken) {
      pk.respawnT -= dt;
      if (pk.respawnT <= 0) { pk.taken = false; pk.obj.visible = true; }
      continue;
    }
    pk.t += dt;
    pk.obj.position.set(pk.x, 1.0 + Math.sin(pk.t * 2.5) * 0.15, pk.z);
    pk.obj.rotation.y = pk.t * 1.8;
    if (Math.hypot(pk.x - p.x, pk.z - p.z) < 1.8 && !p.dead) {
      let used = true;
      switch (pk.type) {
        case 'health': if (p.hp >= 100) used = false; else p.hp = Math.min(100, p.hp + 40); break;
        case 'armor': if (p.armor >= 100) used = false; else p.armor = 100; break;
        case 'ammo': for (let s = 1; s < 4; s++) if (p.owned[s]) p.reserve[s] += WEAPONS[s].mag * 2; break;
        case 'smg': giveWeapon(p, 2, 3); break;
        case 'shotgun': giveWeapon(p, 3, 3); break;
        case 'cash': game.money += pk.value; game.cashPopup = { v: pk.value, t: 1.6 }; break;
        default: break;
      }
      if (!used) continue;
      play('pickup');
      game.notify && game.notify(pk.type === 'cash' ? `+$${pk.value}` : pk.type === 'smg' || pk.type === 'shotgun' ? `Picked up ${pk.type.toUpperCase()}` : `Picked up ${pk.type}`);
      if (pk.type === 'cash') { game.scene.remove(pk.obj); game.pickups.splice(k, 1); }
      else { pk.taken = true; pk.respawnT = pk.respawn; pk.obj.visible = false; }
    }
  }
}
