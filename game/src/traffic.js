// Traffic AI: cars that follow the road grid in their lane, brake for obstacles, turn at junctions and idle at random.
// The same road-following driver is reused by police cars (with a goal) and the shot-staging autopilot.
import { COLS, ROWS, PITCH, ROAD_W, LANE_OFFSET, TRAFFIC_COUNT, PARKED_COUNT, DESPAWN_DIST, SPAWN_RING_MIN, SPAWN_RING_MAX } from './config.js';
import { roadCenterX, roadCenterY, nodePosition, nearestNode, lineBlocked } from './city.js';
import { createCar, carForwardSpeed, carSpeed } from './vehicles.js';
import { play } from './audio.js';

const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const TRAFFIC_TYPES = ['sedan', 'sedan', 'sedan', 'taxi', 'pickup', 'van', 'sports'];

function wrapAngle(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
function inGrid(i, j) { return i >= 0 && i <= COLS && j >= 0 && j <= ROWS; }

// Put a car heading along the nearest road and set its target junction.
export function snapToRoad(car) {
  car.dir = Math.round(wrapAngle(car.angle) / (Math.PI / 2));
  car.dir = ((car.dir % 4) + 4) % 4;
  const n = nearestNode(car.x, car.y);
  if (car.dir % 2 === 0) {
    const j = n.j; let i = car.dir === 0 ? Math.ceil((car.x - ROAD_W / 2) / PITCH) : Math.floor((car.x - ROAD_W / 2) / PITCH);
    car.nodeI = Math.max(0, Math.min(COLS, i)); car.nodeJ = j;
  } else {
    const i = n.i; let j = car.dir === 1 ? Math.ceil((car.y - ROAD_W / 2) / PITCH) : Math.floor((car.y - ROAD_W / 2) / PITCH);
    car.nodeJ = Math.max(0, Math.min(ROWS, j)); car.nodeI = i;
  }
}

// Pick the next heading at a junction. Directions are indices into DIRS; a U-turn (opposite of car.dir) is never
// offered unless the car is at a dead end, and the grid edge is respected via inGrid().
function chooseDirection(car, goal) {
  const options = [];
  const reverse = (car.dir + 2) % 4;
  for (let d = 0; d < 4; d++) {
    if (d === reverse) continue;
    const ti = car.nodeI + DIRS[d][0], tj = car.nodeJ + DIRS[d][1];
    if (inGrid(ti, tj)) options.push(d);
  }
  if (!options.length) return reverse; // dead end: the only way out is back
  // Chasers head for the goal 88% of the time; the 12% random pick keeps them from looking robotic.
  if (goal && Math.random() > 0.12) {
    let best = options[0], bd = Infinity;
    for (const d of options) {
      const p = nodePosition(car.nodeI + DIRS[d][0], car.nodeJ + DIRS[d][1]);
      const dist = Math.hypot(p.x - goal.x, p.y - goal.y);
      if (dist < bd) { bd = dist; best = d; }
    }
    return best;
  }
  // Wander: going straight is weighted 4:1 over turning, so traffic mostly keeps to its street.
  const weighted = [];
  for (const d of options) for (let k = 0; k < (d === car.dir ? 4 : 1); k++) weighted.push(d);
  return weighted[Math.floor(Math.random() * weighted.length)];
}

function obstacleAhead(game, car, ignorePlayerCar) {
  const c = Math.cos(car.angle), s = Math.sin(car.angle), reach = 36 + Math.max(0, carForwardSpeed(car)) * 0.45, half = car.spec.wid / 2 + 7;
  let nearest = Infinity;
  const check = (x, y, extra) => {
    const dx = x - car.x, dy = y - car.y, along = dx * c + dy * s, side = -dx * s + dy * c;
    if (along > 8 && along < reach + extra && Math.abs(side) < half + extra * 0.3) nearest = Math.min(nearest, along);
  };
  for (const o of game.cars) {
    if (o === car) continue;
    if (ignorePlayerCar && o.driver === 'player') continue;
    if (!o.driver && o.parked) continue;
    check(o.x, o.y, o.spec.len / 2);
  }
  for (const p of game.peds) if (!p.dead) check(p.x, p.y, 4);
  if (!game.player.inCar && !ignorePlayerCar) check(game.player.x, game.player.y, 4);
  return nearest;
}

// Core driver. opts: {cruise, goal, ram}. Writes car.steer/throttle/brake.
export function driveAlongRoads(game, car, dt, opts = {}) {
  const dirVec = DIRS[car.dir], node = nodePosition(car.nodeI, car.nodeJ);
  const toNode = (node.x - car.x) * dirVec[0] + (node.y - car.y) * dirVec[1];
  if (car.wait > 0) { car.wait -= dt; car.throttle = 0; car.brake = 1; car.steer = 0; return; }
  if (car.plan == null && toNode < 140) car.plan = chooseDirection(car, opts.goal);
  if (toNode < 12) {
    car.dir = car.plan != null ? car.plan : chooseDirection(car, opts.goal);
    car.plan = null;
    car.nodeI += DIRS[car.dir][0]; car.nodeJ += DIRS[car.dir][1];
    if (opts.idle && Math.random() < 0.12) car.wait = 1 + Math.random() * 3;
  }
  const d = DIRS[car.dir], target = nodePosition(car.nodeI, car.nodeJ);
  const fwd = carForwardSpeed(car), look = 46 + Math.abs(fwd) * 0.22;
  let ax, ay;
  if (d[1] === 0) { ay = target.y + d[0] * LANE_OFFSET; ax = car.x + d[0] * look; }
  else { ax = target.x - d[1] * LANE_OFFSET; ay = car.y + d[1] * look; }
  let cruise = opts.cruise || car.spec.maxSpeed * 0.5, direct = false;
  if (opts.goal) {
    const gd = Math.hypot(opts.goal.x - car.x, opts.goal.y - car.y);
    if (gd < 300 && !lineBlocked(game.city, car.x, car.y, opts.goal.x, opts.goal.y)) {
      direct = true; ax = opts.goal.x; ay = opts.goal.y;
      if (gd < 70 && !opts.ram) cruise = Math.min(cruise, 80);
    }
  }
  if (car.plan != null && car.plan !== car.dir && toNode < 140) cruise = Math.min(cruise, car.plan === (car.dir + 2) % 4 ? 55 : 110);
  if (car.reverseT > 0) {
    car.reverseT -= dt; car.throttle = -1; car.brake = 0; car.steer = -car.steer || 1; car.handbrake = false;
    return;
  }
  const diff = wrapAngle(Math.atan2(ay - car.y, ax - car.x) - car.angle);
  car.steer = Math.max(-1, Math.min(1, diff * 2.4));
  if (Math.abs(diff) > 0.55 && !direct) cruise *= 0.45;
  car.ghostT = Math.max(0, (car.ghostT || 0) - dt);
  const gap = car.ghostT > 0 ? Infinity : obstacleAhead(game, car, opts.ram);
  // Deadlock breaker: after waiting behind something for a while, push through for a moment.
  if (gap < Infinity && carSpeed(car) < 4) { car.blockedT = (car.blockedT || 0) + dt; if (car.blockedT > 2) { car.blockedT = 0; car.ghostT = 2.5; } } else if (gap === Infinity) car.blockedT = 0;
  let brake = 0;
  if (gap < Infinity) {
    const safe = 26 + car.spec.len * 0.5;
    if (gap < safe) { cruise = 0; brake = 1; } else cruise = Math.min(cruise, (gap - safe) * 3);
    if (gap < 60 && car.driver === 'ai' && Math.random() < 0.01) play('horn', 0.4);
  }
  const err = cruise - fwd;
  car.throttle = Math.max(-1, Math.min(1, err / 45));
  car.brake = brake || (err < -30 ? Math.min(1, -err / 150) : 0);
  if (car.throttle < 0) car.throttle = 0;
  car.handbrake = false;
  // Stuck handling: reverse out of dead ends and walls.
  if (carSpeed(car) < 10 && cruise > 40 && gap === Infinity) {
    car.stuck += dt;
    if (car.stuck > 1.6) { car.stuck = 0; car.reverseT = 0.9; if (!direct && Math.random() < 0.5) { car.dir = (car.dir + 2) % 4; snapRetarget(car); } }
  } else car.stuck = 0;
}

function snapRetarget(car) {
  // After a forced U-turn keep the target junction ahead of the new heading.
  car.plan = null;
  const n = { i: car.nodeI, j: car.nodeJ }, d = DIRS[car.dir];
  car.nodeI = Math.max(0, Math.min(COLS, n.i + d[0])); car.nodeJ = Math.max(0, Math.min(ROWS, n.j + d[1]));
}

// Pick a spot on a lane near (nearX, nearY) between minD and maxD away. Returns {x, y, angle, i, j, dir} or null.
export function findRoadSpot(game, nearX, nearY, minD, maxD) {
  const rng = game.rng;
  for (let attempt = 0; attempt < 16; attempt++) {
    const a = rng.range(0, Math.PI * 2), dist = rng.range(minD, maxD);
    const n = nearestNode(nearX + Math.cos(a) * dist, nearY + Math.sin(a) * dist);
    const dir = rng.int(0, 3), d = DIRS[dir];
    const ti = n.i, tj = n.j;
    if (!inGrid(ti - d[0], tj - d[1])) continue;
    const t = rng.range(50, PITCH - 50), tp = nodePosition(ti, tj);
    let x = tp.x - d[0] * t, y = tp.y - d[1] * t;
    if (d[1] === 0) y += d[0] * LANE_OFFSET; else x -= d[1] * LANE_OFFSET;
    const real = Math.hypot(x - nearX, y - nearY);
    if (real < minD || real > maxD + 200) continue;
    if (game.cars.some((c) => Math.hypot(c.x - x, c.y - y) < 60)) continue;
    return { x, y, angle: Math.atan2(d[1], d[0]), i: ti, j: tj, dir };
  }
  return null;
}

export function spawnTrafficCar(game, nearX, nearY, minD, maxD) {
  const spot = findRoadSpot(game, nearX, nearY, minD, maxD);
  if (!spot) return null;
  const type = game.rng.pick(TRAFFIC_TYPES);
  const car = createCar(type, spot.x, spot.y, spot.angle, { driver: 'ai' });
  car.nodeI = spot.i; car.nodeJ = spot.j; car.dir = spot.dir;
  car.vx = Math.cos(spot.angle) * 100; car.vy = Math.sin(spot.angle) * 100;
  game.cars.push(car);
  return car;
}

export function spawnParkedCars(game) {
  const rng = game.rng;
  let placed = 0, guard = 0;
  while (placed < PARKED_COUNT && guard++ < 400) {
    const horizontal = rng.chance(0.5), side = rng.chance(0.5) ? 1 : -1, t = rng.range(ROAD_W + 20, PITCH - 40);
    let x, y, angle;
    if (horizontal) { const j = rng.int(0, ROWS - 1); x = rng.int(0, COLS - 1) * PITCH + t; y = roadCenterY(j) + side * 34; angle = side > 0 ? 0 : Math.PI; }
    else { const i = rng.int(0, COLS - 1); x = roadCenterX(i) + side * 34; y = rng.int(0, ROWS - 1) * PITCH + t; angle = side > 0 ? Math.PI / 2 : -Math.PI / 2; }
    if (game.cars.some((c) => Math.hypot(c.x - x, c.y - y) < 55)) continue;
    const type = rng.pick(['sedan', 'sedan', 'taxi', 'pickup', 'sports', 'van']);
    game.cars.push(createCar(type, x, y, angle, { parked: true }));
    placed++;
  }
}

export function populateTraffic(game) {
  const p = game.player;
  for (let i = 0; i < TRAFFIC_COUNT; i++) spawnTrafficCar(game, p.x, p.y, 120, 900);
}

export function updateTraffic(game, dt) {
  const p = game.player;
  let count = 0;
  for (const car of game.cars) {
    if (car.driver === 'ai') {
      count++;
      driveAlongRoads(game, car, dt, { idle: true });
    }
  }
  // Recycle far traffic and parked/wrecked cars that nobody uses.
  for (let i = game.cars.length - 1; i >= 0; i--) {
    const car = game.cars[i];
    if (car.driver === 'player' || car.missionCar || car.keep) continue;
    const dist = Math.hypot(car.x - p.x, car.y - p.y);
    const far = car.driver === 'ai' || car.driver === 'police' ? dist > DESPAWN_DIST : dist > DESPAWN_DIST * 2.2;
    if (far && (car.driver || car.wrecked || !car.parked)) { game.cars.splice(i, 1); if (car.driver === 'ai') count--; }
  }
  game.trafficTimer -= dt;
  if (count < TRAFFIC_COUNT && game.trafficTimer <= 0) {
    game.trafficTimer = 0.4;
    spawnTrafficCar(game, p.x, p.y, SPAWN_RING_MIN, SPAWN_RING_MAX);
  }
}
