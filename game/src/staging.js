// Staged ?shot= scenes for the screenshots: deterministic seed-1 frames of the real game (chase, stats, drive in a storm, foot at night).
import { LANE } from './config.js';
import { forceStartMission, restoreMissionProgress } from './missions.js';
import { applyLook } from './weather.js';
import { nodePos } from './city.js';
import { createCar, syncCar, CIVILIAN_TYPES } from './vehicles.js';
import { placeOnLane } from './traffic.js';
import { createPed } from './pedestrians.js';
import { setWanted, createCop } from './police.js';
import { addPickup } from './combat.js';

let stepGame; // injected by main.js
export function bindStaging(step) { stepGame = step; }

// ------------------------------------------------------------------ staged screenshot scenes
function laneAutopilot(game, { z, dir, speed }) {
  // drive along a horizontal road in the right-hand lane at `speed` m/s
  game.autopilot = () => {
    const c = game.player.inCar;
    if (!c) return;
    const laneZ = z + (dir > 0 ? LANE : -LANE);
    const desired = Math.atan2(dir * 14, laneZ - c.z);
    let err = desired - c.heading; err = Math.atan2(Math.sin(err), Math.cos(err));
    c.ctl.steer = Math.max(-1, Math.min(1, err * 2.4));
    const rb = game.roadblocks.find((r) => (r.x - c.x) * dir > 0 && (r.x - c.x) * dir < 15);
    c.ctl.throttle = Math.max(-1, Math.min(1, ((rb ? 0 : speed) - c.speed) * 0.5));
    c.ctl.handbrake = false;
  };
}

function putPlayerInCar(game, type, x, z, heading, speed, opts = {}) {
  const car = createCar(game, type, x, z, heading, { color: opts.color, driver: 'player' });
  car.vx = Math.sin(heading) * speed; car.vz = Math.cos(heading) * speed; car.speed = speed; car.owner = 'player';
  const p = game.player;
  p.inCar = car; p.x = x; p.z = z; p.heading = heading;
  syncCar(car, 0);
  game.cam.yaw = heading;
  return car;
}

function simulate(game, seconds, dt = 1 / 30) {
  for (let t = 0; t < seconds; t += dt) stepGame(game, dt);
}

function clearAround(game, x, z, r) { // keep the staged street readable: no parked/idle car sitting where we spawn
  for (const c of [...game.cars]) {
    if (c === game.player.inCar || c.driver === 'player') continue;
    if (Math.hypot(c.x - x, c.z - z) < r && c.driver === 'none') { game.scene.remove(c.obj); game.cars.splice(game.cars.indexOf(c), 1); }
  }
}

// ?shot= staging only: extra moving traffic on one road edge and pedestrians on its sidewalks, so the frame reads as a busy city.
// `d` is the DIRS index (0 = east, 2 = west) of the lane; `alongs` are metres past node (i,j); the normal-game balance is untouched.
function addLaneTraffic(game, i, j, d, alongs, speed = 12) {
  for (const along of alongs) {
    const car = createCar(game, game.rng.pick(CIVILIAN_TYPES), 0, 0, 0, { driver: 'ai' });
    placeOnLane(car, i, j, d, along);
    car.cruise = speed; car.speed = speed; car.vx = Math.sin(car.heading) * speed; car.vz = Math.cos(car.heading) * speed;
    syncCar(car, 0);
  }
}

function addSidewalkPeds(game, xs, roadZ, flee = false) {
  xs.forEach((x, k) => {
    const side = k % 2 ? 1 : -1, z = roadZ + side * 11.2;
    const q = createPed(game, x, z, flee ? { flee: true } : {});
    q.x = x; q.z = z; q.tx = x + (k % 3 ? 14 : -14); q.tz = z; q.fx = q.tx; q.fz = z; q.fleeT = 6;
    q.heading = Math.atan2(q.tx - x, 0);
  });
}

// Drop AI cars that sit near the camera path (behind or beside the player) so none clips the lens.
function clearNearCamera(game, radius) {
  const f = game.player.inCar || game.player;
  for (const c of [...game.cars]) {
    if (c === game.player.inCar || c.driver === 'cop') continue;
    if (Math.hypot(c.x - f.x, c.z - f.z) < radius && ((c.x - f.x) * Math.sin(game.cam.yaw) + (c.z - f.z) * Math.cos(game.cam.yaw)) < 14) { game.scene.remove(c.obj); game.cars.splice(game.cars.indexOf(c), 1); }
  }
}

export function stageScene(game, name) {
  const p = game.player;
  game.state = 'play';
  game.cam.zoom = 0.92;
  if (name === 'chase') {
    const n = nodePos(0, 4);
    clearAround(game, n.x + 90, n.z, 130);
    forceStartMission(game, 2);
    const spare = game.cars.find((c) => c.missionCar);
    game.scene.remove(spare.obj); game.cars.splice(game.cars.indexOf(spare), 1);
    laneAutopilot(game, { z: n.z, dir: 1, speed: 13 });
    const car = putPlayerInCar(game, 'sports', n.x + 28, n.z + LANE, Math.PI / 2, 12, { color: 0xe0342b });
    car.missionCar = true;
    game.stats.crabs = 3; game.rp = 455; game.rep['Central Plaza'] = 62; game.rep['Downtown'] = 38; game.rep['Marina Row'] = 48; game.money = 18250;
    setWanted(game, 4);
    p.armor = 70; p.hp = 82;
    game.dialog = null;
    simulate(game, 9);
    if (game.heli) { // Air-1 hovering ahead-right so the spotlight reads in the frame
      Object.assign(game.heli, { x: car.x + 40, z: car.z + 7, y: 17, vx: 0, vz: 0, yaw: Math.PI / 2 });
      simulate(game, 0.03);
    }
    car.speed = 15; car.vx = 15; car.vz = 0; car.ctl.handbrake = false; // freeze the frame mid-pursuit, not mid-stop
    game.cam.zoom = 1.0;
    addLaneTraffic(game, 3, 4, 2, [20, 44, 62], 13); // oncoming lane only: the pursuit lane stays clear
    addSidewalkPeds(game, [60, 80, 104, 126, 150].map((v) => car.x + v), n.z);
  } else if (name === 'stats') { // the Tab career screen, mid-campaign
    const n = nodePos(4, 3);
    p.x = n.x; p.z = n.z + 6; p.heading = Math.PI;
    restoreMissionProgress(game, 4);
    game.money = 14260; game.rp = 1210; p.owned[1] = p.owned[2] = true;
    Object.assign(game.stats, { kills: 47, copKills: 9, wantedMax: 4, races: 1, distance: 18400, crabs: 7 });
    game.crabs.forEach((c, k) => { c.got = k < 7; });
    Object.assign(game.rep, { 'Marina Row': 64, 'City Park': 33, 'The Strand': 27, 'Harbor Heights': 12, 'Central Plaza': 71, 'Downtown': 46 });
    game.input.statsOpen = true;
  } else if (name === 'drive') {
    const n = nodePos(1, 3); // the Downtown / Central Plaza avenue: towers on the left, shopfronts on the right, facing east into the city
    clearAround(game, n.x + 120, n.z, 190);
    laneAutopilot(game, { z: n.z, dir: 1, speed: 18 });
    putPlayerInCar(game, 'sports', n.x - 40, n.z + LANE, Math.PI / 2, 17, { color: 0xf2b630 });
    game.rp = 820; game.money = 4210; game.stats.crabs = 5; game.rep['Central Plaza'] = 70; game.rep['Downtown'] = 45;
    forceStartMission(game, 3);
    setWanted(game, 1); // SBPD presence on the avenue, mission unchanged
    game.cam.zoom = 1.0;
    simulate(game, 4);
    clearNearCamera(game, 30);
    addLaneTraffic(game, 2, 3, 0, [22, 46], 14); // same direction, well ahead of the player
    addLaneTraffic(game, 3, 3, 2, [14, 36, 58, 70], 13); // oncoming lane, all beyond the player
    addLaneTraffic(game, 3, 3, 0, [16, 40], 12);
    const patrol = createCar(game, 'police', 0, 0, 0, { driver: 'cop' }); // one SBPD patrol car passing in the oncoming lane
    placeOnLane(patrol, 3, 3, 2, 26);
    Object.assign(patrol, { ai: null, unit: 'SBPD-02', role: 'PURSUIT', siren: true, cp: { path: null, pathT: 0, stuckT: 0, revT: 0, copsOut: 0, flankSide: 1 } });
    syncCar(patrol, 0);
    addSidewalkPeds(game, [n.x + 30, n.x + 42, n.x + 56, n.x + 66, n.x + 76, n.x + 90, n.x + 104, n.x + 118, n.x + 132, n.x + 146], n.z);
    simulate(game, 0.05);
    game.cam.zoom = 1.05;
    applyLook(game, 'storm'); game.clock = 17 * 60 + 52; game.rep['City Park'] = 33;
  } else if (name === 'foot') {
    const cx = 342, cz = 268; // centre of the Central Plaza block (4,3): The Big Score, guards cleared in the plaza under SBPD fire
    p.x = cx; p.z = cz + 16.5; p.heading = Math.PI + 0.35; game.cam.yaw = Math.PI + 0.35;
    p.weapon = 1; p.mag[1] = 9; p.reserve[1] = 36; p.armor = 55; p.hp = 88;
    game.rp = 560; game.money = 11840; game.stats.crabs = 4; game.rep['Central Plaza'] = 42; game.rep['Downtown'] = 31;
    forceStartMission(game, 3);
    const m = game.mission.active; m.stage = 1; m.data.total = 6; // the "eliminate the guards" stage is live
    game.mission.armed = false; game.dialog = null;
    for (const [dx, dz] of [[-2, -13], [5, -10], [11, -15], [-9, -9], [14, -5], [-14, -15]]) createCop(game, cx + dx, cz + dz, 'goon').heading = Math.PI;
    for (let k = 0; k < 10; k++) { // pedestrians scatter across the plaza right in front of the camera
      const q = createPed(game, cx - 18 + (k % 5) * 8, cz + 4 + Math.floor(k / 5) * 7, { flee: true });
      q.fx = k % 2 ? cx + 40 : cx - 40; q.fz = cz + 10 + (k % 3) * 8; q.fleeT = 6; q.tx = q.fx; q.tz = q.fz;
      q.heading = k % 2 ? Math.PI / 2 : -Math.PI / 2;
    }
    p.aimT = 3;
    game.forceAim = { x: cx + 5, z: cz - 10 };
    game.input.mouse.right = true;
    game.input.mouse.down = true; simulate(game, 0.12); game.input.mouse.down = false;
    simulate(game, 0.3);
    game.input.mouse.down = true; simulate(game, 0.12); game.input.mouse.down = false;
    p.aimT = 2.5; p.moving = 0;
    setWanted(game, 3);
    game.cam.zoom = 0.9;
    const cruiser = createCar(game, 'police', cx - 15, cz + 2, 0.9, { driver: 'cop' }); // SBPD cruiser at the plaza kerb, lights on
    Object.assign(cruiser, { unit: 'SBPD-01', role: 'PURSUIT', siren: true, cp: { path: null, pathT: 0, stuckT: 0, revT: 0, copsOut: 0, flankSide: 1 } });
    syncCar(cruiser, 0);
    for (const [dx, dz] of [[-11, -5], [-17, 8]]) { const o = createCop(game, cx + dx, cz + dz, 'cop'); o.heading = Math.PI / 2; }
    const cruiser2 = createCar(game, 'police', cx + 21, cz + 10, -2.2, { driver: 'cop' }); // second SBPD unit boxing in the plaza
    Object.assign(cruiser2, { unit: 'SBPD-02', role: 'FLANKING', siren: true, cp: { path: null, pathT: 0, stuckT: 0, revT: 0, copsOut: 0, flankSide: -1 } });
    syncCar(cruiser2, 0);
    const mark = createCar(game, 'sedan', p.x + 3.0, p.z - 2.2, Math.PI, { color: 0x3a6fb5, driver: 'ai' }); // civilian car right beside Jax: E = hijack
    mark.speed = 0; mark.vx = mark.vz = 0; mark.cruise = 0; syncCar(mark, 0);
    game.nearCar = mark;
    addPickup(game, 'cash', cx - 2.5, cz + 9, { value: 600 }); addPickup(game, 'cash', cx + 0.5, cz + 11.5, { value: 450 }); // dropped guard cash
    applyLook(game, 'night'); game.clock = 22 * 60 + 47;
    game.wanted.unitSeq = 2; game.wanted.flash = 0; game.mission.banner = null; // steady stars, no half-faded banner in the capture
  }
  game.cam.x = game.camera.position.x;
}

