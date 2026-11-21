// The protagonist: on-foot movement, aiming, driving controls, health and pickups.
import { WALK_SPEED, SPRINT_SPEED, PLAYER_RADIUS, PLAYER_MAX_HP, PISTOL_MAG } from './config.js';
import { resolveCircle } from './city.js';
import { tryEnterCar, exitCar } from './vehicles.js';
import { reportCrime } from './police.js';
import { playerMelee } from './combat.js';
import { play } from './audio.js';

export function createPlayer(x, y) {
  return {
    x, y, angle: 0, vx: 0, vy: 0, hp: PLAYER_MAX_HP, inCar: null, ammo: PISTOL_MAG, reserve: 48, reloadT: 0,
    fireT: 0, meleeT: 0, sprinting: false, walkPhase: 0, hurtFlash: 0, aimX: x + 50, aimY: y,
  };
}

export function hurtPlayer(game, amount) {
  const p = game.player;
  if (amount <= 0 || game.state !== 'playing') return;
  p.hp -= amount; p.hurtFlash = 0.3;
  if (game.hurtSoundCooldown <= 0) { play('hurt'); game.hurtSoundCooldown = 0.25; }
}

export function updatePlayer(game, dt, input) {
  const p = game.player;
  p.hurtFlash = Math.max(0, p.hurtFlash - dt);
  p.meleeT = Math.max(0, p.meleeT - dt);
  p.aimX = game.mouseWorld.x; p.aimY = game.mouseWorld.y;
  if (p.inCar) {
    if (game.autopilot) game.autopilot(game, p.inCar, dt);
    else driveControls(game, p.inCar, dt, input);
    p.x = p.inCar.x; p.y = p.inCar.y;
    if (input.wasPressed('KeyE', 'KeyF')) exitCar(game);
    return;
  }
  p.angle = Math.atan2(p.aimY - p.y, p.aimX - p.x);
  let dx = (input.isDown('KeyD', 'ArrowRight') ? 1 : 0) - (input.isDown('KeyA', 'ArrowLeft') ? 1 : 0);
  let dy = (input.isDown('KeyS', 'ArrowDown') ? 1 : 0) - (input.isDown('KeyW', 'ArrowUp') ? 1 : 0);
  const len = Math.hypot(dx, dy);
  if (len > 0) { dx /= len; dy /= len; }
  p.sprinting = input.isDown('ShiftLeft', 'ShiftRight') && len > 0;
  const speed = p.sprinting ? SPRINT_SPEED : WALK_SPEED;
  p.vx += (dx * speed - p.vx) * Math.min(1, dt * 12);
  p.vy += (dy * speed - p.vy) * Math.min(1, dt * 12);
  p.x += p.vx * dt; p.y += p.vy * dt;
  const r = resolveCircle(game.city, p.x, p.y, PLAYER_RADIUS);
  p.x = r.x; p.y = r.y;
  p.walkPhase += Math.hypot(p.vx, p.vy) * dt * 0.09;
  if (input.wasPressed('KeyE')) {
    const result = tryEnterCar(game);
    if (result === 'traffic' || result === 'police') reportCrime(game, 'carTheft');
    else if (result === 'parked') reportCrime(game, 'parkedTheft');
    if (!result) playerMelee(game);
  } else if (input.wasPressed('KeyF')) playerMelee(game);
}

function driveControls(game, car, dt, input) {
  const up = input.isDown('KeyW', 'ArrowUp'), down = input.isDown('KeyS', 'ArrowDown');
  const left = input.isDown('KeyA', 'ArrowLeft'), right = input.isDown('KeyD', 'ArrowRight');
  car.throttle = (up ? 1 : 0) - (down ? 1 : 0);
  car.brake = 0;
  const target = (right ? 1 : 0) - (left ? 1 : 0);
  car.steer += (target - car.steer) * Math.min(1, dt * (target === 0 ? 10 : 7));
  car.handbrake = input.isDown('Space');
  if (input.wasPressed('KeyH')) play('horn');
}

// Heal up to PLAYER_MAX_HP; health pickups call this with +35.
export function healPlayer(game, amount) {
  game.player.hp = Math.min(PLAYER_MAX_HP, game.player.hp + amount);
}
