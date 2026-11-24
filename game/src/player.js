// Jax Merrin: on-foot movement, car driving input, enter/exit, health + armour.
import * as THREE from 'three';
import { WALK_SPEED, SPRINT_SPEED, PLAYER_RADIUS, PLAYER_MAX_HP, WEAPONS, WORLD_H } from './config.js';
import { makeHuman, poseHuman } from './characters.js';
import { pushOut, clampToWorld } from './city.js';
import { nearestCar, CAR_TYPES, carForward } from './vehicles.js';
import { addWanted } from './police.js';
import { play } from './audio.js';
import { createPed } from './pedestrians.js';

export function createPlayer(game, x, z) {
  const human = makeHuman({ skin: 0xd9a577, shirt: 0x2fa3b8, pants: 0x2b3a55, hair: 0x1b120c, cap: 0xf2f2f2 });
  game.scene.add(human.group);
  return {
    x, z, y: 0, heading: 0, vx: 0, vz: 0, hp: PLAYER_MAX_HP, armor: 0, inCar: null, human,
    weapon: 1, owned: [true, true, false, false], mag: [0, 12, 0, 0], reserve: [0, 48, 0, 0],
    fireCd: 0, reloadT: 0, punchT: 0, aimT: 0, dead: false, moving: 0, bustT: 0, lastShot: -9,
  };
}

const wrapAngle = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
export { wrapAngle };

export function hurtPlayer(game, amount) {
  const p = game.player;
  if (p.dead || game.godMode) return;
  if (p.armor > 0) { const a = Math.min(p.armor, amount * 0.7); p.armor -= a; amount -= a; }
  p.hp -= amount;
  game.hurtFlash = 0.35;
}

export function giveWeapon(p, slot, mags = 3) {
  p.owned[slot] = true;
  p.mag[slot] = WEAPONS[slot].mag;
  p.reserve[slot] += WEAPONS[slot].mag * mags;
}

export function updatePlayer(game, input, dt) {
  const p = game.player;
  if (p.dead) return;
  const cam = game.cam;
  const k = (n) => input.down(n);
  p.fireCd -= dt; p.reloadT = Math.max(0, p.reloadT - dt); p.punchT = Math.max(0, p.punchT - dt * 2.4); p.aimT = Math.max(0, p.aimT - dt);

  // weapon switching
  for (let s = 1; s <= 4; s++) if (input.pressed(String(s)) && p.owned[s - 1]) { p.weapon = s - 1; p.reloadT = 0; play('click'); }

  if (input.pressed('e')) {
    if (p.inCar) exitCar(game);
    else {
      const car = nearestCar(game, p.x, p.z, 3.8);
      if (car) enterCar(game, car);
      else game.wantPunch = true;
    }
  }

  if (p.inCar) {
    const car = p.inCar;
    const up = k('w') || k('arrowup'), down = k('s') || k('arrowdown');
    car.ctl.throttle = (up ? 1 : 0) - (down ? 1 : 0);
    car.ctl.steer = ((k('a') ? 1 : 0) - (k('d') ? 1 : 0));
    car.ctl.handbrake = k('space');
    if (input.pressed('h')) { play('horn'); car.hornT = 0.4; game.events.push({ type: 'horn', x: car.x, z: car.z }); }
    p.x = car.x; p.z = car.z; p.heading = car.heading;
    p.human.group.visible = false;
    return;
  }
  p.human.group.visible = true;

  // on foot: camera-relative WASD
  const yaw = cam.yaw;
  const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -Math.cos(yaw), rz = Math.sin(yaw);
  const f = (k('w') ? 1 : 0) - (k('s') ? 1 : 0), r = (k('d') ? 1 : 0) - (k('a') ? 1 : 0);
  let mx = fx * f + rx * r, mz = fz * f + rz * r;
  const ml = Math.hypot(mx, mz);
  const sprint = k('shift') && ml > 0;
  const maxV = sprint ? SPRINT_SPEED : WALK_SPEED;
  const tvx = ml > 0 ? (mx / ml) * maxV : 0, tvz = ml > 0 ? (mz / ml) * maxV : 0;
  const a = Math.min(1, dt * 12);
  p.vx += (tvx - p.vx) * a; p.vz += (tvz - p.vz) * a;
  // camera follows when steering forward-diagonally (GTA style)
  if (f > 0 && r !== 0) cam.yaw += wrapAngle(Math.atan2(mx, mz) - cam.yaw) * dt * 1.1;
  // facing: toward aim point while aiming/shooting, otherwise movement direction
  const aiming = input.mouse.right || p.aimT > 0 || input.mouse.down;
  if (aiming && game.aimPoint) {
    const th = Math.atan2(game.aimPoint.x - p.x, game.aimPoint.z - p.z);
    p.heading += wrapAngle(th - p.heading) * Math.min(1, dt * 16);
  } else if (ml > 0) p.heading += wrapAngle(Math.atan2(mx, mz) - p.heading) * Math.min(1, dt * 12);
  p.x += p.vx * dt; p.z += p.vz * dt;
  pushOut(game.city, p, PLAYER_RADIUS, 0.3);
  clampToWorld(p, PLAYER_RADIUS);
  if (p.z > WORLD_H - 1.2) p.z = WORLD_H - 1.2;
  // cars shove the player
  for (const c of game.cars) {
    if (c.dead) continue;
    const dx = p.x - c.x, dz = p.z - c.z;
    if (dx * dx + dz * dz > 14) continue;
    const sp = Math.hypot(c.vx, c.vz), t = CAR_TYPES[c.type];
    const fxc = Math.sin(c.heading), fzc = Math.cos(c.heading);
    const lx = dx * fxc + dz * fzc, lz = dx * -fzc + dz * fxc;
    if (Math.abs(lx) < t.len / 2 + 0.3 && Math.abs(lz) < t.w / 2 + 0.3) {
      if (sp > 4) { hurtPlayer(game, sp * 1.2); play('punch'); game.shake = 0.5; addWanted(game, 0); }
      const push = Math.hypot(dx, dz) || 1;
      p.x += (dx / push) * 1.2 * dt * 8; p.z += (dz / push) * 1.2 * dt * 8;
      if (sp > 4) { p.vx += c.vx * 0.4; p.vz += c.vz * 0.4; }
    }
  }
  p.moving = Math.hypot(p.vx, p.vz);
}

export function enterCar(game, car) {
  const p = game.player;
  if (car.driver === 'ai' && game.civDrivers) {
    // carjack: the driver gets thrown out and flees
    const d = createPed(game, car.x + 2, car.z, { flee: true });
    d.fleeT = 8;
    addWanted(game, 14, 'carjack');
  } else if (car.driver === 'cop') {
    addWanted(game, 30, 'police car');
    car.siren = false;
  } else if (car.driver === 'none' && !car.missionCar && !car.owned) {
    if (car.type === 'police') addWanted(game, 25, 'police car');
    else if (!car.parked) addWanted(game, 3, 'auto theft');
    else if (game.peds.some((q) => Math.hypot(q.x - car.x, q.z - car.z) < 18)) addWanted(game, 6, 'auto theft');
  }
  car.driver = 'player';
  car.owner = 'player';
  car.parked = false;
  p.inCar = car;
  p.x = car.x; p.z = car.z; p.vx = p.vz = 0;
  play('door');
  game.events.push({ type: 'enterCar', car });
}

export function exitCar(game) {
  const p = game.player, car = p.inCar;
  if (!car) return;
  const t = CAR_TYPES[car.type];
  const fx = Math.sin(car.heading), fz = Math.cos(car.heading), lx = fz, lz = -fx;
  const off = t.w / 2 + 0.9;
  for (const side of [1, -1]) {
    const c = { x: car.x + lx * off * side, z: car.z + lz * off * side };
    const test = { ...c };
    if (!pushOut(game.city, test, PLAYER_RADIUS, 0.3)) { p.x = c.x; p.z = c.z; break; }
    p.x = test.x; p.z = test.z;
  }
  car.driver = 'none'; car.ctl.throttle = 0; car.ctl.steer = 0; car.ctl.handbrake = true;
  p.inCar = null; p.heading = car.heading; p.vx = p.vz = 0;
  play('door');
}

export function syncPlayer(game, dt) {
  const p = game.player, h = p.human;
  h.group.position.set(p.x, 0, p.z);
  h.group.rotation.y = p.heading;
  const aiming = !p.inCar && (p.aimT > 0 || game.input?.mouse.right) && p.weapon > 0;
  poseHuman(h, { walk: p.moving / WALK_SPEED, dt, aim: aiming || (p.weapon > 0 && p.moving < 0.5 && p.aimT > 0), punch: p.punchT, speed: p.moving, fall: p.dead ? 1 : 0 });
  void carForward; void THREE;
}
