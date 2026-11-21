// Car types, arcade driving physics, collisions, damage, and entering/exiting/stealing cars.
import { resolveCircle } from './city.js';
import { emitParticle, emitPuff, emitSparks, emitExplosion, addSkid, addShake } from './effects.js';
import { play } from './audio.js';

export const CAR_TYPES = {
  sedan: { name: 'Alder Sedan', len: 44, wid: 22, colors: ['#3d6fb5', '#b8453a', '#6e7f8d', '#3f8f5a', '#d9d4c7'], maxSpeed: 300, accel: 250, brake: 420, turn: 2.5, grip: 7, hp: 100, mass: 1 },
  taxi: { name: 'Sunrise Cab', len: 45, wid: 22, colors: ['#f2c21b'], maxSpeed: 310, accel: 260, brake: 430, turn: 2.6, grip: 7, hp: 100, mass: 1 },
  pickup: { name: 'Brawn Pickup', len: 50, wid: 24, colors: ['#8a3b2a', '#2f5d4a', '#c9c1ae'], maxSpeed: 280, accel: 215, brake: 380, turn: 2.2, grip: 6.2, hp: 130, mass: 1.4 },
  sports: { name: 'Vesper GT', len: 42, wid: 21, colors: ['#e0342b', '#f0a21a', '#2fb5c4', '#8e44c9'], maxSpeed: 430, accel: 380, brake: 520, turn: 3.1, grip: 8.5, hp: 80, mass: 0.85 },
  van: { name: 'Hauler Van', len: 54, wid: 26, colors: ['#e8e8e4', '#c9a64a', '#5b7aa0'], maxSpeed: 250, accel: 180, brake: 340, turn: 1.9, grip: 5.8, hp: 150, mass: 1.8 },
  police: { name: 'Patrol Cruiser', len: 46, wid: 23, colors: ['#1f2a44'], maxSpeed: 390, accel: 340, brake: 480, turn: 2.9, grip: 7.8, hp: 130, mass: 1.2 },
};

let nextCarId = 1;

export function createCar(type, x, y, angle, opts = {}) {
  const spec = CAR_TYPES[type];
  return {
    id: nextCarId++, type, spec, x, y, angle, vx: 0, vy: 0, steer: 0, throttle: 0, brake: 0, handbrake: false,
    hp: spec.hp, maxHp: spec.hp, color: opts.color || spec.colors[Math.floor(Math.random() * spec.colors.length)],
    driver: opts.driver || null, parked: !!opts.parked, wrecked: false, burn: 0, smokeT: 0, nodeI: 0, nodeJ: 0, dir: 0,
    wait: 0, plan: null, stuck: 0, reverseT: 0, sirenOn: false, missionCar: !!opts.missionCar, skidPhase: 0,
  };
}

export function carSpeed(car) { return Math.hypot(car.vx, car.vy); }
export function carForwardSpeed(car) { return car.vx * Math.cos(car.angle) + car.vy * Math.sin(car.angle); }

// Three overlapping circles along the car's axis approximate its rectangular hull for collision tests.
export function carCircles(car) {
  const c = Math.cos(car.angle), s = Math.sin(car.angle), o = car.spec.len / 3, r = car.spec.wid / 2 + 1;
  return [[car.x - c * o, car.y - s * o, r], [car.x, car.y, r], [car.x + c * o, car.y + s * o, r]];
}

export function damageCar(game, car, amount) {
  if (car.wrecked) return;
  car.hp -= amount;
  if (car.hp <= 0) wreckCar(game, car);
}

function wreckCar(game, car) {
  car.wrecked = true; car.hp = 0; car.burn = 22; car.throttle = 0; car.steer = 0; if (car.driver === 'player') ejectPlayer(game, car); // must run before the driver reference is cleared
  car.driver = null;
  emitExplosion(game, car.x, car.y);
  play('explosion');
  addShake(game, 8);
  const p = game.player;
  if (Math.hypot(p.x - car.x, p.y - car.y) < 70 && !p.inCar) p.hp -= 35;
  for (const o of game.cars) if (o !== car && Math.hypot(o.x - car.x, o.y - car.y) < 70) damageCar(game, o, 30);
  game.events.push({ type: 'carWrecked', car });
}

function ejectPlayer(game, car) {
  const p = game.player;
  p.inCar = null; p.hp -= 40; p.x = car.x + 30; p.y = car.y;
  const r = resolveCircle(game.city, p.x, p.y, 7); p.x = r.x; p.y = r.y;
}

// One physics step for a car. Input comes from car.throttle (-1..1), car.steer (-1..1), car.brake, car.handbrake.
export function updateCar(game, car, dt) {
  if (car.wrecked) {
    car.vx *= 1 - 3 * dt; car.vy *= 1 - 3 * dt; car.burn -= dt;
    if (Math.random() < 0.5) emitParticle(game, car.x + (Math.random() - 0.5) * 20, car.y + (Math.random() - 0.5) * 20, 0, -25, 0.8, 5, Math.random() < 0.4 ? '#ff7a1e' : '#2b2b2b', 9, Math.random() < 0.4);
    if (car.burn <= 0) car.burn = 0;
  } else if (!car.driver && carSpeed(car) < 2) {
    return;
  }
  const spec = car.spec, c = Math.cos(car.angle), s = Math.sin(car.angle);
  let vf = car.vx * c + car.vy * s, vl = -car.vx * s + car.vy * c;
  const maxSpeed = spec.maxSpeed * (car.hp < spec.hp * 0.3 ? 0.75 : 1);
  const thr = car.wrecked ? 0 : car.throttle;
  if (thr > 0) vf += thr * spec.accel * Math.max(0, 1 - Math.max(vf, 0) / (maxSpeed * 1.02)) * dt;
  else if (thr < 0) {
    if (vf > 12) vf = Math.max(0, vf - spec.brake * -thr * dt);
    else vf = Math.max(-maxSpeed * 0.4, vf + thr * spec.accel * 0.7 * dt);
  } else vf -= vf * Math.min(1, 0.7 * dt);
  if (car.brake > 0) vf -= Math.sign(vf) * Math.min(Math.abs(vf), spec.brake * car.brake * dt);
  let grip = spec.grip;
  if (car.handbrake) { grip = 1.3; vf -= vf * 0.6 * dt; }
  vl *= Math.exp(-grip * dt);
  const speedFactor = Math.min(1, Math.abs(vf) / 90) * (1 - 0.3 * Math.min(1, Math.abs(vf) / maxSpeed));
  const turn = car.steer * spec.turn * speedFactor * (car.handbrake ? 1.45 : 1) * (vf >= 0 ? 1 : -1);
  if (!car.wrecked) car.angle += turn * dt;
  const c2 = Math.cos(car.angle), s2 = Math.sin(car.angle);
  car.vx = c2 * vf - s2 * vl; car.vy = s2 * vf + c2 * vl;
  car.x += car.vx * dt; car.y += car.vy * dt;

  if (!car.wrecked && (Math.abs(vl) > 70 || (car.handbrake && Math.abs(vf) > 90))) {
    for (const side of [-1, 1]) addSkid(game, car.x - c2 * spec.len * 0.32 - s2 * side * spec.wid * 0.4, car.y - s2 * spec.len * 0.32 + c2 * side * spec.wid * 0.4, car.angle);
    if (Math.random() < 0.3) emitPuff(game, car.x - c2 * spec.len * 0.4, car.y - s2 * spec.len * 0.4, 'rgba(235,235,235,0.6)', 1, 20, 4);
  }
  collideWithCity(game, car);
  if (!car.wrecked) {
    if (car.hp < spec.hp * 0.45) {
      car.smokeT -= dt;
      if (car.smokeT <= 0) { car.smokeT = 0.07; emitParticle(game, car.x + c2 * spec.len * 0.35, car.y + s2 * spec.len * 0.35, (Math.random() - 0.5) * 20, -30, 0.9, 4, car.hp < spec.hp * 0.2 ? '#2a2a2a' : '#8a8a8a', 10); }
    }
    if (Math.abs(thr) > 0.3 && Math.random() < 0.25 && Math.abs(vf) < maxSpeed * 0.6) emitPuff(game, car.x - c2 * spec.len * 0.5, car.y - s2 * spec.len * 0.5, 'rgba(180,180,180,0.35)', 1, 12, 3);
  }
}

function collideWithCity(game, car) {
  for (const [cx, cy, r] of carCircles(car)) {
    const res = resolveCircle(game.city, cx, cy, r);
    if (!res.hit) continue;
    car.x += res.x - cx; car.y += res.y - cy;
    const vn = car.vx * res.nx + car.vy * res.ny;
    if (vn < 0) {
      car.vx -= 1.3 * vn * res.nx; car.vy -= 1.3 * vn * res.ny;
      const impact = -vn;
      if (impact > 70) onCrash(game, car, impact, res.nx, res.ny, cx, cy);
    }
  }
}

function onCrash(game, car, impact, nx, ny, x, y) {
  damageCar(game, car, Math.max(0, (impact - 60) * 0.14));
  emitSparks(game, x - nx * 8, y - ny * 8, 5);
  if (car.driver === 'player' || Math.hypot(game.player.x - car.x, game.player.y - car.y) < 450) {
    addShake(game, Math.min(10, impact * 0.03));
    if (game.crashSoundCooldown <= 0) { play('crash', Math.min(1, impact / 250)); game.crashSoundCooldown = 0.15; }
  }
  if (car.driver === 'ai' || car.driver === 'police') car.reverseT = car.reverseT > 0 ? car.reverseT : (impact > 100 ? 0.7 : 0);
}

// Car-to-car collisions: circle pairs, impulse exchange, damage by closing speed.
export function collideCars(game) {
  const cars = game.cars;
  for (let a = 0; a < cars.length; a++) {
    const A = cars[a];
    for (let b = a + 1; b < cars.length; b++) {
      const B = cars[b];
      if (Math.abs(A.x - B.x) > 60 || Math.abs(A.y - B.y) > 60) continue;
      if (!A.driver && !B.driver && carSpeed(A) < 2 && carSpeed(B) < 2) continue;
      collidePair(game, A, B);
    }
  }
}

function collidePair(game, A, B) {
  const ca = carCircles(A), cb = carCircles(B);
  for (const [ax, ay, ar] of ca) for (const [bx, by, br] of cb) {
    let dx = bx - ax, dy = by - ay;
    const d = Math.hypot(dx, dy), min = ar + br;
    if (d >= min || d < 0.001) continue;
    dx /= d; dy /= d;
    const push = min - d, wa = B.spec.mass / (A.spec.mass + B.spec.mass), wb = 1 - wa;
    A.x -= dx * push * wa; A.y -= dy * push * wa; B.x += dx * push * wb; B.y += dy * push * wb;
    const rel = (A.vx - B.vx) * dx + (A.vy - B.vy) * dy;
    if (rel > 0) {
      const j = rel * 1.35;
      A.vx -= dx * j * wa; A.vy -= dy * j * wa; B.vx += dx * j * wb; B.vy += dy * j * wb;
      if (rel > 60) {
        damageCar(game, A, (rel - 40) * 0.1 * wb * 2); damageCar(game, B, (rel - 40) * 0.1 * wa * 2);
        emitSparks(game, (ax + bx) / 2, (ay + by) / 2, 4);
        if (A.driver === 'player' || B.driver === 'player') {
          addShake(game, Math.min(9, rel * 0.03));
          if (game.crashSoundCooldown <= 0) { play('crash', Math.min(1, rel / 250)); game.crashSoundCooldown = 0.15; }
        }
        game.events.push({ type: 'carCrash', a: A, b: B, speed: rel });
      }
    }
    return;
  }
}

// Player pressed E: enter the nearest car within reach. Returns 'parked' | 'traffic' | 'police' | 'own' | null.
export function tryEnterCar(game) {
  const p = game.player;
  let best = null, bd = 56;
  for (const car of game.cars) {
    if (car.wrecked || car.driver === 'player') continue;
    const d = Math.hypot(car.x - p.x, car.y - p.y);
    if (d < bd) { bd = d; best = car; }
  }
  if (!best) return null;
  const was = best.driver ? (best.driver === 'police' ? 'police' : 'traffic') : (best.owned ? 'own' : 'parked');
  if (best.driver) {
    // Driver is yanked out and runs away.
    game.peds.push({ x: best.x + 26, y: best.y, angle: 0, hp: 40, state: 'flee', fleeT: 6, color: '#c0a060', speed: 130, home: null, turnT: 0, dead: false, bob: 0 });
  }
  best.driver = 'player'; best.parked = false; best.throttle = 0; best.steer = 0; best.wait = 0;
  p.inCar = best; p.x = best.x; p.y = best.y;
  play('door');
  if (best.missionCar) best.missionCar = false;
  best.owned = true;
  return was;
}

export function exitCar(game) {
  const p = game.player, car = p.inCar;
  if (!car) return false;
  if (Math.hypot(car.vx, car.vy) > 170) return false;
  const c = Math.cos(car.angle), s = Math.sin(car.angle);
  for (const side of [-1, 1]) {
    const x = car.x - s * side * (car.spec.wid / 2 + 12), y = car.y + c * side * (car.spec.wid / 2 + 12);
    const r = resolveCircle(game.city, x, y, 7);
    if (!r.hit || r.depth < 3) { p.x = r.x; p.y = r.y; break; }
    p.x = car.x; p.y = car.y;
  }
  car.driver = null; car.throttle = 0; car.steer = 0; car.handbrake = true;
  p.inCar = null;
  play('door');
  return true;
}
