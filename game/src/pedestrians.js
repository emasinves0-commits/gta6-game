// Pedestrian AI: citizens stroll along sidewalks, flee from gunfire and oncoming cars, and can be hit by vehicles.
import { PED_COUNT, DESPAWN_DIST } from './config.js';
import { randomSidewalkPoint, walkableForPed } from './city.js';
import { carSpeed } from './vehicles.js';
import { emitPuff } from './effects.js';
import { play } from './audio.js';

const SHIRTS = ['#e85d5d', '#4da3d6', '#f2c94c', '#6fcf97', '#bb86fc', '#ff9e5e', '#ffffff', '#2d3a4a', '#e07bb0'];
const SKINS = ['#f1c9a0', '#d9a579', '#a8754f', '#7a4e32', '#f6d9bd'];

export function createPed(game, x, y) {
  const rng = game.rng;
  return {
    x, y, angle: rng.range(0, Math.PI * 2), hp: 30, state: 'walk', fleeT: 0, color: rng.pick(SHIRTS), skin: rng.pick(SKINS),
    speed: rng.range(28, 48), turnT: rng.range(1, 4), dead: false, bob: rng.range(0, 6), fade: 0,
  };
}

// Spawn pedestrians on sidewalks between minR and maxR of the player, up to `limit` in total.
export function spawnPedestrians(game, minR = 0, maxR = 900, limit = PED_COUNT) {
  const p = game.player;
  let tries = 0;
  while (game.peds.length < limit && tries++ < 300) {
    const pt = randomSidewalkPoint(game.city, game.rng);
    const d = Math.hypot(pt.x - p.x, pt.y - p.y);
    if (d < minR || d > maxR || !walkableForPed(game.city, pt.x, pt.y)) continue;
    game.peds.push(createPed(game, pt.x, pt.y));
  }
}

// Make nearby pedestrians run away from a point (gunshot, car, punch).
export function scarePeds(game, x, y, radius) {
  for (const p of game.peds) {
    if (p.dead) continue;
    if (Math.hypot(p.x - x, p.y - y) < radius) { p.state = 'flee'; p.fleeT = 5 + Math.random() * 3; p.fromX = x; p.fromY = y; p.roadOk = true; }
  }
}

export function killPed(game, ped, byPlayer, how) {
  if (ped.dead) return;
  ped.dead = true; ped.fade = 6; ped.state = 'down';
  emitPuff(game, ped.x, ped.y, 'rgba(255,255,255,0.7)', 5, 50, 4);
  if (byPlayer) {
    game.pickups.push({ kind: 'cash', x: ped.x, y: ped.y, amount: 10 + Math.floor(Math.random() * 40), life: 30 });
    game.events.push({ type: 'pedKilled', how });
  }
}

export function hurtPed(game, ped, amount, byPlayer, how) {
  if (ped.dead) return;
  ped.hp -= amount;
  scarePeds(game, ped.x, ped.y, 140);
  if (ped.hp <= 0) killPed(game, ped, byPlayer, how);
  else { ped.state = 'flee'; ped.fleeT = 6; }
}

export function updatePedestrians(game, dt) {
  const p = game.player;
  if (game.peds.length < PED_COUNT) spawnPedestrians(game, 420, 900, game.peds.length + 1);
  for (let i = game.peds.length - 1; i >= 0; i--) {
    const ped = game.peds[i];
    if (ped.dead) {
      ped.fade -= dt;
      if (ped.fade <= 0) game.peds.splice(i, 1);
      continue;
    }
    if (Math.hypot(ped.x - p.x, ped.y - p.y) > DESPAWN_DIST) { game.peds.splice(i, 1); continue; }
    // Cars heading straight at a pedestrian scare it.
    for (const car of game.cars) {
      if (car.parked && !car.driver) continue;
      const dx = ped.x - car.x, dy = ped.y - car.y;
      if (Math.abs(dx) > 110 || Math.abs(dy) > 110) continue;
      const sp = carSpeed(car);
      if (sp > 90 && dx * car.vx + dy * car.vy > 0 && Math.hypot(dx, dy) < 100) { ped.state = 'flee'; ped.fleeT = 3; ped.fromX = car.x; ped.fromY = car.y; ped.roadOk = false; }
      if (sp > 70 && car.driver && Math.hypot(dx, dy) < car.spec.len * 0.55 + 4 && !car.wrecked) {
        const byPlayer = car.driver === 'player';
        hurtPed(game, ped, sp * 0.35, byPlayer, 'car');
        ped.x += car.vx * 0.05; ped.y += car.vy * 0.05;
        if (byPlayer) { game.events.push({ type: 'pedHit' }); play('punch'); }
      }
    }
    if (ped.dead) continue;
    ped.bob += dt * 8;
    if (ped.state === 'flee') {
      ped.fleeT -= dt;
      const away = Math.atan2(ped.y - (ped.fromY ?? p.y), ped.x - (ped.fromX ?? p.x));
      ped.angle += (Math.atan2(Math.sin(away - ped.angle), Math.cos(away - ped.angle))) * Math.min(1, dt * 6);
      moveOrTurn(game, ped, 120 * dt, !!ped.roadOk);
      if (ped.fleeT <= 0) { ped.state = 'walk'; }
    } else {
      ped.turnT -= dt;
      if (ped.turnT <= 0) { ped.turnT = 1.5 + Math.random() * 4; ped.angle += (Math.random() - 0.5) * 1.6; }
      moveOrTurn(game, ped, ped.speed * dt, false);
    }
  }
}

function moveOrTurn(game, ped, step, fleeing) {
  const nx = ped.x + Math.cos(ped.angle) * step, ny = ped.y + Math.sin(ped.angle) * step;
  const ahead = ped.x + Math.cos(ped.angle) * (step + 8), ay = ped.y + Math.sin(ped.angle) * (step + 8);
  if (walkableForPed(game.city, nx, ny, fleeing) && walkableForPed(game.city, ahead, ay, fleeing)) { ped.x = nx; ped.y = ny; return; }
  // Blocked by a wall or road edge: turn a quarter turn at random and slide along the edge.
  ped.angle += (Math.random() < 0.5 ? 1 : -1) * (Math.PI / 2 + Math.random() * 0.5);
}
