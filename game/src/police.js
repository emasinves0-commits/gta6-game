// Wanted level, police cars and foot cops, roadblocks, and the bust / wasted respawn rules.
import {
  MAX_STARS, COOLDOWN_BASE, COOLDOWN_PER_STAR, SIGHT_RANGE, COPS_PER_STAR, BUST_TIME, BUSTED_FINE, WASTED_FINE,
  PLAYER_MAX_HP, ROAD_W,
} from './config.js';
import { lineBlocked, resolveCircle, nearestNode, nodePosition } from './city.js';
import { createCar, carSpeed } from './vehicles.js';
import { driveAlongRoads, findRoadSpot } from './traffic.js';
import { spawnBullet } from './combat.js';
import { emitPuff } from './effects.js';
import { play } from './audio.js';

export function createWanted() {
  return { stars: 0, cooldown: 0, bust: 0, spawnTimer: 0, roadblockTimer: 8, seen: false, flash: 0 };
}

export function setWanted(game, stars, announce = true) {
  const w = game.wanted;
  const next = Math.max(0, Math.min(MAX_STARS, stars));
  if (next > w.stars && announce) { play('wanted'); w.flash = 1.5; }
  w.stars = next;
  w.cooldown = next > 0 ? COOLDOWN_BASE + COOLDOWN_PER_STAR * next : 0;
  if (next === 0) w.bust = 0;
}

export function raiseWanted(game, minStars) {
  if (game.wanted.stars < minStars) setWanted(game, minStars);
  else game.wanted.cooldown = COOLDOWN_BASE + COOLDOWN_PER_STAR * game.wanted.stars;
}

function witnessNear(game, radius) {
  const p = game.player;
  return game.peds.some((ped) => !ped.dead && Math.hypot(ped.x - p.x, ped.y - p.y) < radius) || game.cops.some((c) => !c.dead && c.kind === 'cop' && Math.hypot(c.x - p.x, c.y - p.y) < radius * 1.5);
}

// Crime table: what each kind of offence does to the wanted level.
export function reportCrime(game, kind) {
  if (game.noCrime) return;
  switch (kind) {
    case 'carTheft': raiseWanted(game, 1); break;
    case 'parkedTheft': if (witnessNear(game, 220)) raiseWanted(game, 1); break;
    case 'assault': raiseWanted(game, 1); break;
    case 'pedHit': raiseWanted(game, 1); break;
    case 'pedKill': raiseWanted(game, 2); break;
    case 'shooting': if (witnessNear(game, 260)) raiseWanted(game, 1); break;
    case 'copKill': setWanted(game, Math.max(3, game.wanted.stars + 1)); break;
    default: break;
  }
}

export function createCop(game, x, y, kind = 'cop') {
  return {
    x, y, angle: 0, hp: kind === 'goon' ? 70 : 60, kind, dead: false, fade: 0, shootCd: 1 + Math.random(), blockedT: 0, turnDir: 1,
    speed: kind === 'guard' ? 0 : 92 + Math.random() * 14, walk: Math.random() * 6, active: kind !== 'guard',
  };
}

export function hurtCop(game, cop, amount, byPlayer) {
  if (cop.dead) return;
  cop.hp -= amount;
  cop.active = true;
  if (byPlayer && cop.kind === 'cop' && game.wanted.stars === 0) setWanted(game, 2);
  if (cop.hp <= 0) {
    cop.dead = true; cop.fade = 5;
    emitPuff(game, cop.x, cop.y, 'rgba(255,255,255,0.7)', 5, 50, 4);
    game.pickups.push({ kind: 'cash', x: cop.x, y: cop.y, amount: 30 + Math.floor(Math.random() * 60), life: 30 });
    if (byPlayer) {
      if (cop.kind === 'cop' || cop.kind === 'guard') reportCrime(game, 'copKill');
      game.events.push({ type: cop.kind === 'goon' ? 'goonKilled' : 'copKilled' });
    }
  }
}

// Active police cars plus roadblock cruisers: the units the HUD dispatch panel lists.
export function dispatchUnits(game) { return game.cars.filter((c) => (c.driver === 'police' && !c.wrecked) || (c.roadblock && !c.wrecked)); }

function policeCars(game) { return game.cars.filter((c) => c.driver === 'police' && !c.wrecked); }

function spawnPoliceCar(game) {
  const p = game.player;
  const spot = findRoadSpot(game, p.x, p.y, 520, 850);
  if (!spot) return;
  const car = createCar('police', spot.x, spot.y, spot.angle, { driver: 'police' });
  car.nodeI = spot.i; car.nodeJ = spot.j; car.dir = spot.dir;
  car.vx = Math.cos(spot.angle) * 140; car.vy = Math.sin(spot.angle) * 140;
  game.cars.push(car);
}

function spawnRoadblock(game) {
  const p = game.player;
  const ahead = { x: p.x + (p.inCar ? p.inCar.vx : p.vx) * 2.4, y: p.y + (p.inCar ? p.inCar.vy : p.vy) * 2.4 };
  const n = nearestNode(ahead.x, ahead.y), pos = nodePosition(n.i, n.j);
  if (Math.hypot(pos.x - p.x, pos.y - p.y) < 350) return;
  const horizontal = Math.abs(p.inCar ? p.inCar.vx : p.vx) > Math.abs(p.inCar ? p.inCar.vy : p.vy);
  for (const k of [-1, 1]) {
    const car = createCar('police', pos.x + (horizontal ? 0 : k * 18) + (horizontal ? -ROAD_W : 0), pos.y + (horizontal ? k * 18 : 0) + (horizontal ? 0 : -ROAD_W), horizontal ? Math.PI / 2 : 0, { parked: true });
    car.keep = false; car.roadblock = true; car.sirenOn = true;
    game.cars.push(car);
    const cop = createCop(game, car.x + (horizontal ? 24 : 0), car.y + (horizontal ? 0 : 24), 'guard');
    game.cops.push(cop);
  }
}

export function updatePolice(game, dt) {
  const w = game.wanted, p = game.player;
  w.flash = Math.max(0, w.flash - dt);
  const px = p.x, py = p.y;
  const pCar = p.inCar;
  const target = { x: px + (pCar ? pCar.vx * 0.35 : 0), y: py + (pCar ? pCar.vy * 0.35 : 0) };
  const cars = policeCars(game);
  let seen = false, nearestPolice = Infinity;

  // Police cars drive: chase at high stars, cruise otherwise.
  for (const car of cars) {
    const d = Math.hypot(car.x - px, car.y - py);
    nearestPolice = Math.min(nearestPolice, d);
    if (w.stars > 0) {
      car.sirenOn = true;
      driveAlongRoads(game, car, dt, { goal: target, cruise: car.spec.maxSpeed * (0.62 + 0.07 * w.stars), ram: true });
      if (d < SIGHT_RANGE && !lineBlocked(game.city, car.x, car.y, px, py)) seen = true;
    } else {
      car.sirenOn = false;
      driveAlongRoads(game, car, dt, { cruise: car.spec.maxSpeed * 0.4, idle: true });
      if (d > 900) car.driver = 'ai';
    }
  }
  game.sirenLevel = w.stars > 0 && nearestPolice < 900 ? 1 - nearestPolice / 900 : 0;

  if (w.stars > 0) {
    w.spawnTimer -= dt;
    if (cars.length < COPS_PER_STAR[w.stars] && w.spawnTimer <= 0) { w.spawnTimer = 1.5; spawnPoliceCar(game); }
    if (w.stars >= 3) {
      w.roadblockTimer -= dt;
      if (w.roadblockTimer <= 0) { w.roadblockTimer = 28 - w.stars * 2; spawnRoadblock(game); }
    }
    dismountCops(game, cars);
  }

  let nearCops = 0;
  for (let i = game.cops.length - 1; i >= 0; i--) {
    const cop = game.cops[i];
    if (cop.dead) { cop.fade -= dt; if (cop.fade <= 0) game.cops.splice(i, 1); continue; }
    const d = Math.hypot(cop.x - px, cop.y - py);
    if (cop.kind === 'goon' || w.stars > 0) {
      const sees = d < 420 && !lineBlocked(game.city, cop.x, cop.y, px, py);
      if (cop.kind !== 'goon' && sees && d < SIGHT_RANGE) seen = true;
      if (cop.kind === 'guard' && d < 380) cop.active = true;
      if (cop.active) updateFootCop(game, cop, dt, d, sees);
      if (cop.kind === 'cop' && d < 34) nearCops++;
    } else if (cop.kind !== 'goon' && d > 300) game.cops.splice(i, 1);
  }
  if (w.stars > 0) {
    for (const car of cars) if (Math.hypot(car.x - px, car.y - py) < 46 && !pCar) nearCops++;
    updateWantedTimers(game, dt, seen, nearCops);
  }
}

function dismountCops(game, cars) {
  const p = game.player, w = game.wanted;
  const footCops = game.cops.filter((c) => !c.dead && c.kind === 'cop').length;
  if (footCops >= 2 + w.stars) return;
  for (const car of cars) {
    const d = Math.hypot(car.x - p.x, car.y - p.y);
    if (d < 150 && !car.dismounted && (p.inCar ? carSpeed(p.inCar) < 140 : true)) {
      car.dismounted = true;
      for (let k = 0; k < 2; k++) game.cops.push(createCop(game, car.x + (k ? 14 : -14), car.y + 10, 'cop'));
      break;
    }
  }
}

function updateFootCop(game, cop, dt, d, sees) {
  const p = game.player;
  cop.angle = Math.atan2(p.y - cop.y, p.x - cop.x);
  cop.shootCd -= dt;
  const armed = cop.kind === 'goon' || game.wanted.stars >= 2;
  if (armed && sees && d < 260 && cop.shootCd <= 0) {
    cop.shootCd = cop.kind === 'goon' ? 0.9 + Math.random() * 0.5 : 1.0 + Math.random() * 0.8;
    spawnBullet(game, 'enemy', cop.x + Math.cos(cop.angle) * 10, cop.y + Math.sin(cop.angle) * 10, cop.angle + (Math.random() - 0.5) * 0.22, 7, 620);
    play('enemyShot', 0.6);
  }
  const keepAway = cop.kind === 'goon' ? 140 : 0;
  if (d < 26 || (d < keepAway && sees)) return;
  if (cop.kind === 'guard' && d > 60) return;
  let heading = cop.angle;
  if (cop.blockedT > 0) { cop.blockedT -= dt; heading += cop.turnDir * 1.3; }
  const step = cop.speed * dt;
  const nx = cop.x + Math.cos(heading) * step, ny = cop.y + Math.sin(heading) * step;
  const r = resolveCircle(game.city, nx, ny, 6);
  if (r.hit && r.depth > 1.5) { cop.blockedT = 0.6; cop.turnDir = Math.random() < 0.5 ? 1 : -1; }
  cop.x = r.x; cop.y = r.y; cop.walk += dt * 9;
}

function updateWantedTimers(game, dt, seen, nearCops) {
  const w = game.wanted, p = game.player;
  w.seen = seen;
  if (game.autopilot) w.bust = 0;
  if (seen) w.cooldown = COOLDOWN_BASE + COOLDOWN_PER_STAR * w.stars;
  else {
    w.cooldown -= dt;
    if (w.cooldown <= 0) {
      setWanted(game, w.stars - 1, false);
      game.events.push({ type: 'starsDropped', stars: w.stars });
    }
  }
  const speed = p.inCar ? carSpeed(p.inCar) : Math.hypot(p.vx, p.vy);
  if (!game.autopilot && nearCops > 0 && speed < 70) w.bust += dt * nearCops * (w.stars === 1 ? 1.4 : 1);
  else w.bust = Math.max(0, w.bust - dt * 0.8);
  if (w.bust >= BUST_TIME) game.events.push({ type: 'busted' });
}

function loseMoney(game, fraction, minimum) {
  const fine = Math.min(game.money, Math.max(minimum, Math.floor(game.money * fraction)));
  game.money -= fine;
  return fine;
}

function respawnAt(game, spot) {
  const p = game.player;
  if (p.inCar) { p.inCar.driver = null; p.inCar = null; }
  p.x = spot.x; p.y = spot.y; p.vx = 0; p.vy = 0; p.hp = PLAYER_MAX_HP; p.reloadT = 0;
  setWanted(game, 0, false);
  game.wanted.bust = 0;
  game.cops = game.cops.filter((c) => c.kind === 'goon' && !c.dead);
  game.cars = game.cars.filter((c) => !(c.driver === 'police' || c.roadblock));
  game.bullets.length = 0;
}

export function resolveBusted(game) {
  const fine = loseMoney(game, BUSTED_FINE, 50);
  respawnAt(game, game.city.landmarks.police);
  return fine;
}

export function resolveWasted(game) {
  const fee = loseMoney(game, WASTED_FINE, 40);
  respawnAt(game, game.city.landmarks.hospital);
  return fee;
}
