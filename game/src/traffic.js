// Ambient traffic: cars follow the right-hand lane of the road grid, turn at intersections, brake for obstacles.
// Also places parked cars along curbs and in parking lots.
import { COLS, ROWS, ROAD_W, LANE, TRAFFIC_COUNT, SPAWN_RING_MIN, SPAWN_RING_MAX, DESPAWN_DIST } from './config.js';
import { DIRS, nodePos, nodeValid } from './city.js';
import { createCar, removeCar, CAR_TYPES, CIVILIAN_TYPES } from './vehicles.js';

const right = (d) => { const f = DIRS[d]; return [-f[1], f[0]]; };
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

// Put a car on the lane of the edge leaving node (i,j) in direction d, `along` metres past the node.
export function placeOnLane(car, i, j, d, along) {
  const n = nodePos(i, j), f = DIRS[d], r = right(d);
  car.x = n.x + f[0] * along + r[0] * LANE; car.z = n.z + f[1] * along + r[1] * LANE;
  car.heading = Math.atan2(f[0], f[1]);
  car.ai = { i: i + f[0], j: j + f[1], dir: d, turning: false, newDir: d, wait: 0, ghost: 0 };
}

export function pickEdge(game, near, minD = SPAWN_RING_MIN, maxD = SPAWN_RING_MAX) {
  const rng = game.rng;
  for (let t = 0; t < 40; t++) {
    const i = rng.int(0, COLS), j = rng.int(0, ROWS), d = rng.int(0, 3), f = DIRS[d];
    if (!nodeValid(i + f[0], j + f[1])) continue;
    const n = nodePos(i, j), along = rng.range(12, 50);
    const x = n.x + f[0] * along, z = n.z + f[1] * along;
    if (near) { const dd = Math.hypot(x - near.x, z - near.z); if (dd < minD || dd > maxD) continue; }
    return { i, j, d, along };
  }
  return { i: 1, j: 1, d: 0, along: 20 };
}

export function spawnTraffic(game) {
  const rng = game.rng;
  for (let k = 0; k < TRAFFIC_COUNT; k++) {
    const e = pickEdge(game);
    const car = createCar(game, rng.pick(CIVILIAN_TYPES), 0, 0, 0, { driver: 'ai' });
    placeOnLane(car, e.i, e.j, e.d, e.along);
    car.cruise = rng.range(11, 16);
    car.vx = Math.sin(car.heading) * 6; car.vz = Math.cos(car.heading) * 6;
  }
}

export function spawnParked(game) {
  const rng = game.rng, city = game.city;
  let n = 0;
  for (const s of city.curbSpots) {
    if (n >= 26) break;
    if (!rng.chance(0.55)) continue;
    const car = createCar(game, rng.pick(CIVILIAN_TYPES.filter((t) => t !== 'sports' || rng.chance(0.3))), s.x, s.z, s.h, {});
    car.parked = true; n++;
  }
  for (const L of city.parkLots) for (const s of L.spots) {
    if (n >= 40) break;
    const car = createCar(game, rng.pick(['sedan', 'sedan', 'pickup', 'van', 'sports']), s.x, s.z, s.h, {});
    car.parked = true; n++;
  }
}

export function updateTraffic(game, dt) {
  const p = game.player;
  let live = 0;
  for (const car of game.cars) {
    if (!car.ai) continue;
    if (car.driver !== 'ai') {
      if (car.dead) { car.deadT = (car.deadT || 0) + dt; if (car.deadT > 40 && Math.hypot(car.x - p.x, car.z - p.z) > 40) { removeCar(game, car); } }
      continue;
    }
    live++;
    const ai = car.ai, n = nodePos(ai.i, ai.j), f = DIRS[ai.dir], r = right(ai.dir);
    const dist = Math.hypot(car.x - p.x, car.z - p.z);
    if (dist > DESPAWN_DIST) { respawnNear(game, car); continue; }
    if (car.hp < 30 && !car.dead) { car.driver = 'none'; car.ctl.throttle = 0; car.ctl.handbrake = true; continue; } // abandons a wreck
    const rem = (n.x - car.x) * f[0] + (n.z - car.z) * f[1];
    let ax, az, target = car.cruise;
    if (!ai.turning && rem < 10.5) {
      const opts = [];
      for (let d = 0; d < 4; d++) {
        if (d === (ai.dir + 2) % 4) continue;
        if (!nodeValid(ai.i + DIRS[d][0], ai.j + DIRS[d][1])) continue;
        opts.push(d); if (d === ai.dir) opts.push(d, d);
      }
      ai.newDir = opts.length ? game.rng.pick(opts) : (ai.dir + 2) % 4;
      ai.turning = true;
    }
    if (ai.turning) {
      const nd = ai.newDir, nf = DIRS[nd], nr = right(nd);
      ax = n.x + nf[0] * (ROAD_W / 2 + 5) + nr[0] * LANE; az = n.z + nf[1] * (ROAD_W / 2 + 5) + nr[1] * LANE;
      if (nd !== ai.dir) target = Math.min(target, 7.5);
      const done = (car.x - n.x) * nf[0] + (car.z - n.z) * nf[1] > ROAD_W / 2 + 1.5 && Math.abs((car.x - n.x) * nr[0] + (car.z - n.z) * nr[1] - LANE) < 5;
      if (done || rem < -ROAD_W) { ai.dir = nd; ai.i += nf[0]; ai.j += nf[1]; ai.turning = false; }
    } else {
      if (f[0] !== 0) { ax = car.x + f[0] * 9; az = n.z + r[1] * LANE; } else { ax = n.x + r[0] * LANE; az = car.z + f[1] * 9; }
      if (ai.dir !== 0 && false) target = target;
    }
    // steering by pure pursuit
    const desired = Math.atan2(ax - car.x, az - car.z);
    car.ctl.steer = Math.max(-1, Math.min(1, angDiff(desired, car.heading) * 2.4));
    // obstacle look-ahead
    let block = 99;
    if (ai.ghost > 0) ai.ghost -= dt;
    else {
      const fx = Math.sin(car.heading), fz = Math.cos(car.heading), look = 7 + Math.max(0, car.speed) * 0.9;
      const test = (ox, oz, rad) => {
        const dx = ox - car.x, dz = oz - car.z, along = dx * fx + dz * fz, lat = Math.abs(dx * fz - dz * fx);
        if (along > 1.5 && along < look && lat < rad) block = Math.min(block, along);
      };
      for (const o of game.cars) if (o !== car) test(o.x, o.z, 2.3);
      for (const q of game.peds) if (q.state !== 'dead') test(q.x, q.z, 1.8);
      if (!p.inCar) test(p.x, p.z, 1.8);
    }
    if (block < 99) target = block < 4.5 ? 0 : Math.min(target, block * 0.9);
    const err = target - car.speed;
    car.ctl.throttle = err > 0 ? Math.min(1, err * 0.35) : Math.max(-1, err * 0.5);
    car.ctl.handbrake = false;
    if (car.hornT > 0) car.hornT -= dt;
    // deadlock breaker
    if (Math.abs(car.speed) < 0.6 && block < 99) { car.stuck += dt; if (car.stuck > 4.5) { ai.ghost = 3.5; car.stuck = 0; } } else car.stuck = 0;
    if (Math.abs(car.speed) < 0.4 && block >= 99) { car.stuck += dt; if (car.stuck > 5) { car.ctl.throttle = -1; car.ctl.steer = -car.ctl.steer; if (car.stuck > 7) car.stuck = 0; } }
  }
  // top up the population in the spawn ring when some were removed
  if (live < TRAFFIC_COUNT - 2 && game.rng.chance(0.08)) {
    const e = pickEdge(game, p);
    const car = createCar(game, game.rng.pick(CIVILIAN_TYPES), 0, 0, 0, { driver: 'ai' });
    placeOnLane(car, e.i, e.j, e.d, e.along);
    car.cruise = game.rng.range(11, 16);
  }
}

function respawnNear(game, car) {
  const e = pickEdge(game, game.player);
  placeOnLane(car, e.i, e.j, e.d, e.along);
  car.vx = car.vz = 0; car.speed = 0; car.stuck = 0;
}
void CAR_TYPES;
