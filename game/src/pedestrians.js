// Pedestrians: stroll sidewalk corner to corner (crossing roads at crosswalks), flee gunfire and speeding cars, get run over.
import { PED_COUNT, DESPAWN_DIST, COLS, ROWS } from './config.js';
import { makeHuman, poseHuman, SKINS, SHIRTS, PANTS } from './characters.js';
import { cornerPoint, blockValid, pushOut, clampToWorld, blockRect } from './city.js';
import { CAR_TYPES } from './vehicles.js';
import { addWanted } from './police.js';
import { dust } from './effects.js';
import { play } from './audio.js';

const INSET = 2.4;

export function createPed(game, x, z, opts = {}) {
  const rng = game.rng;
  const human = makeHuman({ skin: rng.pick(SKINS), shirt: rng.pick(SHIRTS), pants: rng.pick(PANTS), hair: rng.pick([0x1b120c, 0x4a3020, 0xc9a45a, 0x888888, 0x111111]), scale: rng.range(0.93, 1.07) });
  game.scene.add(human.group);
  const ped = {
    kind: 'ped', x, z, heading: rng.range(0, 6.28), vx: 0, vz: 0, hp: 30, state: opts.flee ? 'flee' : 'walk', human, tx: x, tz: z, bi: 0, bj: 0, sx: 0, sz: 0,
    speed: rng.range(1.3, 1.9), fleeT: 0, deadT: 0, fromX: x, fromZ: z, fall: 0, ghost: false, cash: rng.int(15, 70),
  };
  game.peds.push(ped);
  if (!opts.flee) placeOnCorner(game, ped);
  else ped.fleeT = 6;
  return ped;
}

function placeOnCorner(game, ped, near) {
  const rng = game.rng;
  let bi, bj;
  if (near) {
    bi = Math.max(0, Math.min(COLS - 1, Math.floor((near.x - 18) / 74) + rng.int(-2, 2)));
    bj = Math.max(0, Math.min(ROWS - 1, Math.floor((near.z - 18) / 74) + rng.int(-2, 2)));
  } else { bi = rng.int(0, COLS - 1); bj = rng.int(0, ROWS - 1); }
  ped.bi = bi; ped.bj = bj; ped.sx = rng.int(0, 1); ped.sz = rng.int(0, 1);
  const c = cornerPoint(bi, bj, ped.sx, ped.sz, INSET);
  ped.x = c.x + rng.range(-1, 1); ped.z = c.z + rng.range(-1, 1);
  chooseNext(game, ped);
}

function chooseNext(game, ped) {
  const rng = game.rng;
  const opts = [];
  opts.push([ped.bi, ped.bj, 1 - ped.sx, ped.sz], [ped.bi, ped.bj, ped.sx, 1 - ped.sz]);
  const nbx = ped.bi + (ped.sx ? 1 : -1), nbz = ped.bj + (ped.sz ? 1 : -1);
  if (blockValid(nbx, ped.bj) && rng.chance(0.6)) opts.push([nbx, ped.bj, 1 - ped.sx, ped.sz]);
  if (blockValid(ped.bi, nbz) && rng.chance(0.6)) opts.push([ped.bi, nbz, ped.sx, 1 - ped.sz]);
  const [bi, bj, sx, sz] = rng.pick(opts);
  ped.bi = bi; ped.bj = bj; ped.sx = sx; ped.sz = sz;
  const c = cornerPoint(bi, bj, sx, sz, INSET);
  ped.tx = c.x; ped.tz = c.z;
}

export function spawnPeds(game) {
  for (let k = 0; k < PED_COUNT; k++) createPed(game, 0, 0);
}

export function killPed(game, ped, by, dirx = 0, dirz = 0) {
  if (ped.state === 'dead') return;
  ped.state = 'dead'; ped.deadT = 0; ped.hp = 0;
  ped.vx = dirx * 3; ped.vz = dirz * 3;
  dust(game, ped.x, 0.4, ped.z, 0x9a2a2a);
  if (by === 'player') {
    addWanted(game, 22, 'murder');
    game.stats.kills++;
    game.pickups.push({ type: 'cash', x: ped.x, z: ped.z, value: ped.cash, t: 0, ttl: 40 });
    game.events.push({ type: 'pedKilled', ped });
  }
}

export function hurtPed(game, ped, dmg, by, dx = 0, dz = 0) {
  if (ped.state === 'dead') return;
  ped.hp -= dmg;
  scare(game, ped, game.player.x, game.player.z);
  if (ped.hp <= 0) killPed(game, ped, by, dx, dz);
  else if (by === 'player') addWanted(game, 6, 'assault');
}

function scare(game, ped, fromX, fromZ, t = 6) {
  if (ped.state === 'dead') return;
  ped.state = 'flee'; ped.fleeT = t; ped.fx = fromX; ped.fz = fromZ;
}

export function updatePeds(game, dt) {
  const p = game.player;
  for (const ev of game.events) {
    if (ev.type === 'shot') for (const q of game.peds) { if (q.state !== 'dead' && Math.hypot(q.x - ev.x, q.z - ev.z) < 38) scare(game, q, ev.x, ev.z, 7); }
    else if (ev.type === 'explosion') for (const q of game.peds) { if (q.state !== 'dead' && Math.hypot(q.x - ev.car.x, q.z - ev.car.z) < 50) scare(game, q, ev.car.x, ev.car.z, 9); }
  }
  for (let k = game.peds.length - 1; k >= 0; k--) {
    const q = game.peds[k];
    if (q.state === 'dead') {
      q.deadT += dt; q.fall = Math.min(1, q.fall + dt * 5);
      q.vx *= Math.exp(-4 * dt); q.vz *= Math.exp(-4 * dt);
      q.x += q.vx * dt; q.z += q.vz * dt;
      if (q.deadT > 16) { removePed(game, q, k); }
    } else {
      const far = Math.hypot(q.x - p.x, q.z - p.z) > DESPAWN_DIST * 0.7;
      if (far) { placeOnCorner(game, q, p); q.state = 'walk'; continue; }
      let sp = q.speed;
      if (q.state === 'flee') {
        q.fleeT -= dt;
        const ax = q.x - (q.fx ?? p.x), az = q.z - (q.fz ?? p.z), l = Math.hypot(ax, az) || 1;
        q.tx = q.x + ax / l * 20; q.tz = q.z + az / l * 20;
        sp = 5.3;
        if (q.fleeT <= 0) { q.state = 'walk'; placeOnCorner(game, q, q); }
      } else {
        const d = Math.hypot(q.tx - q.x, q.tz - q.z);
        if (d < 0.9) chooseNext(game, q);
        for (const c of game.cars) { // nervous about speeding cars
          if (c.dead) continue;
          const dx = c.x - q.x, dz = c.z - q.z;
          if (dx * dx + dz * dz < 30 && Math.hypot(c.vx, c.vz) > 7) scare(game, q, c.x, c.z, 4);
        }
      }
      const dx = q.tx - q.x, dz = q.tz - q.z, l = Math.hypot(dx, dz) || 1;
      q.vx += ((dx / l) * sp - q.vx) * Math.min(1, dt * 8); q.vz += ((dz / l) * sp - q.vz) * Math.min(1, dt * 8);
      q.x += q.vx * dt; q.z += q.vz * dt;
      pushOut(game.city, q, 0.32, 0.3); clampToWorld(q, 0.4, 1.5);
      q.heading += angDiff(Math.atan2(q.vx, q.vz), q.heading) * Math.min(1, dt * 10);
      // run over
      for (const c of game.cars) {
        if (c.dead) continue;
        const rx = q.x - c.x, rz = q.z - c.z;
        if (rx * rx + rz * rz > 16) continue;
        const sp2 = Math.hypot(c.vx, c.vz);
        if (sp2 < 3) continue;
        const fx = Math.sin(c.heading), fz = Math.cos(c.heading), lx = rx * fx + rz * fz, lz = rx * -fz + rz * fx, t = CAR_TYPES[c.type];
        if (Math.abs(lx) < t.len / 2 + 0.2 && Math.abs(lz) < t.w / 2 + 0.3) {
          const by = c.driver === 'player' ? 'player' : null;
          killPed(game, q, by, c.vx / sp2 * sp2 * 0.4, c.vz / sp2 * sp2 * 0.4);
          if (by) { addWanted(game, 12, 'hit and run'); play('punch'); }
          break;
        }
      }
    }
    syncPed(q, dt);
  }
}

const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

export function removePed(game, ped, idx) {
  game.scene.remove(ped.human.group);
  const k = idx ?? game.peds.indexOf(ped);
  if (k >= 0) game.peds.splice(k, 1);
}

function syncPed(q, dt) {
  const h = q.human;
  h.group.position.set(q.x, 0, q.z);
  h.group.rotation.y = q.heading;
  const sp = Math.hypot(q.vx, q.vz);
  poseHuman(h, { walk: sp / 1.6, dt, speed: sp, fall: q.fall });
}
void blockRect;
