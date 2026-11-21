// Shooting, bullets, melee and damage between the player, pedestrians, police and cars.
import { PISTOL_MAG, PISTOL_DAMAGE, FIRE_DELAY, RELOAD_TIME, BULLET_SPEED, MELEE_DAMAGE, MELEE_RANGE } from './config.js';
import { pointSolid } from './city.js';
import { emitMuzzleFlash, emitPuff, emitSparks } from './effects.js';
import { hurtPed, scarePeds } from './pedestrians.js';
import { hurtCop, reportCrime } from './police.js';
import { damageCar } from './vehicles.js';
import { play } from './audio.js';

// Bullets are plain {x,y,vx,vy,owner,damage} records stepped in updateBullets; owner is 'player' or 'cop'.
export function spawnBullet(game, owner, x, y, angle, damage, speed = BULLET_SPEED) {
  game.bullets.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0.75, owner, damage });
}

export function startReload(game) {
  const p = game.player;
  if (p.reloadT > 0 || p.ammo >= PISTOL_MAG || p.reserve <= 0) return;
  p.reloadT = RELOAD_TIME;
  play('reload');
}

function fireWeapon(game) {
  const p = game.player;
  p.fireT = FIRE_DELAY;
  p.ammo--;
  const spread = (Math.random() - 0.5) * 0.05;
  const mx = p.x + Math.cos(p.angle) * 14, my = p.y + Math.sin(p.angle) * 14;
  spawnBullet(game, 'player', mx, my, p.angle + spread, PISTOL_DAMAGE);
  emitMuzzleFlash(game, mx, my, p.angle);
  play('shot');
  scarePeds(game, p.x, p.y, 260);
  reportCrime(game, 'shooting');
}

export function updateCombat(game, dt, input) {
  const p = game.player;
  p.fireT = Math.max(0, p.fireT - dt);
  if (p.reloadT > 0) {
    p.reloadT -= dt;
    if (p.reloadT <= 0) {
      const take = Math.min(PISTOL_MAG - p.ammo, p.reserve);
      p.ammo += take; p.reserve -= take;
    }
  }
  if (!p.inCar && game.state === 'playing') {
    if (input.wasPressed('KeyR')) startReload(game);
    if (input.mouseDown && p.fireT <= 0 && p.reloadT <= 0) {
      if (p.ammo > 0) fireWeapon(game);
      else if (p.reserve > 0) startReload(game);
      else if (input.mouseClicked) play('empty');
    }
  }
  updateBullets(game, dt);
}

function updateBullets(game, dt) {
  const bullets = game.bullets;
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    let dead = false;
    for (let s = 0; s < 3 && !dead; s++) {
      b.x += b.vx * dt / 3; b.y += b.vy * dt / 3;
      if (pointSolid(game.city, b.x, b.y)) { emitPuff(game, b.x, b.y, 'rgba(210,200,180,0.8)', 3, 40, 3); dead = true; break; }
      dead = bulletHitsTarget(game, b);
    }
    b.life -= dt;
    if (dead || b.life <= 0) { bullets[i] = bullets[bullets.length - 1]; bullets.pop(); }
  }
}

function bulletHitsTarget(game, b) {
  if (b.owner === 'player') {
    for (const ped of game.peds) {
      if (!ped.dead && Math.hypot(ped.x - b.x, ped.y - b.y) < 8) { hurtPed(game, ped, b.damage, true, 'gun'); emitPuff(game, b.x, b.y, 'rgba(255,255,255,0.8)', 4, 50, 3); return true; }
    }
    for (const cop of game.cops) {
      if (!cop.dead && Math.hypot(cop.x - b.x, cop.y - b.y) < 9) { hurtCop(game, cop, b.damage, true); emitPuff(game, b.x, b.y, 'rgba(255,255,255,0.8)', 4, 50, 3); return true; }
    }
  } else if (!game.player.inCar && Math.hypot(game.player.x - b.x, game.player.y - b.y) < 9) {
    game.hurtPlayer(b.damage);
    emitPuff(game, b.x, b.y, 'rgba(255,255,255,0.8)', 3, 40, 3);
    return true;
  }
  for (const car of game.cars) {
    if (Math.abs(car.x - b.x) > 30 || Math.abs(car.y - b.y) > 30) continue;
    const c = Math.cos(car.angle), s = Math.sin(car.angle), dx = b.x - car.x, dy = b.y - car.y;
    const along = dx * c + dy * s, side = -dx * s + dy * c;
    if (Math.abs(along) < car.spec.len / 2 && Math.abs(side) < car.spec.wid / 2) {
      if (car.driver === 'player') { if (b.owner !== 'player') { damageCar(game, car, b.damage * 0.25); game.hurtPlayer(b.damage * 0.3); } else continue; }
      else damageCar(game, car, b.damage * 0.3);
      emitSparks(game, b.x, b.y, 3);
      return true;
    }
  }
  return false;
}

// Punch whatever is in front of the player.
export function playerMelee(game) {
  const p = game.player;
  if (p.meleeT > 0 || p.inCar) return;
  p.meleeT = 0.32;
  play('punch');
  const fx = Math.cos(p.angle), fy = Math.sin(p.angle);
  const inReach = (e) => {
    const dx = e.x - p.x, dy = e.y - p.y, along = dx * fx + dy * fy;
    return along > -4 && along < MELEE_RANGE && Math.abs(-dx * fy + dy * fx) < 16;
  };
  for (const ped of game.peds) {
    if (!ped.dead && inReach(ped)) { hurtPed(game, ped, MELEE_DAMAGE, true, 'fist'); reportCrime(game, 'assault'); emitPuff(game, ped.x, ped.y, 'rgba(255,255,255,0.8)', 4, 50, 3); }
  }
  for (const cop of game.cops) {
    if (!cop.dead && inReach(cop)) { hurtCop(game, cop, MELEE_DAMAGE, true); emitPuff(game, cop.x, cop.y, 'rgba(255,255,255,0.8)', 4, 50, 3); }
  }
}
