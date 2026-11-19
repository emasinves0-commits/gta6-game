// Screenshot staging (?shot=drive|foot|chase|mission, ?seed=N) and the demo autopilot that keeps scenes alive.
import { nodePosition, blockAt } from './city.js';
import { createCar } from './vehicles.js';
import { driveAlongRoads, snapToRoad, spawnTrafficCar } from './traffic.js';
import { setWanted } from './police.js';
import { forceStartMission, getObjective } from './missions.js';
import { stepGame } from './world.js';
import { spawnPedestrians } from './pedestrians.js';
import { createIdleInput } from './input.js';

export function parseShotParams(search) {
  const q = new URLSearchParams(search);
  const seed = parseInt(q.get('seed') || '1', 10);
  return { shot: q.get('shot'), seed: Number.isFinite(seed) ? seed : 1 };
}

function putPlayerInCar(game, type, x, y, angle, color) {
  const car = createCar(type, x, y, angle, { driver: 'player', color });
  car.vx = Math.cos(angle) * 160; car.vy = Math.sin(angle) * 160;
  game.cars.push(car);
  game.player.inCar = car; game.player.x = x; game.player.y = y;
  snapToRoad(car);
  game.camera.x = x; game.camera.y = y;
  return car;
}

function refreshTrafficAround(game) {
  game.cars = game.cars.filter((c) => c.driver === 'player' || (c.parked && !c.driver));
  for (let i = 0; i < 20; i++) spawnTrafficCar(game, game.player.x, game.player.y, 160, 700);
}

// Drives the player's car along roads. With a goal it heads there and halts `stopShort` units before arriving.
function cruiseAutopilot(cruise, goalFn, stopShort = 0) {
  return (game, car, dt) => {
    const goal = goalFn ? goalFn(game) : null;
    const halt = goal && Math.hypot(goal.x - car.x, goal.y - car.y) < stopShort;
    driveAlongRoads(game, car, dt, { cruise: halt ? 0 : cruise, goal });
    if (halt) { car.throttle = 0; car.brake = 1; }
    car.hp = Math.max(car.hp, car.maxHp * 0.5);
  };
}

// Puts the world into a deterministic, lively scene. Returns the name actually staged.
export function stageShot(game, name) {
  game.state = 'playing';
  game.noCrime = false;
  const lane = (i, j, dx, dy) => { const n = nodePosition(i, j); return { x: n.x + dx, y: n.y + dy }; };
  if (name === 'foot') {
    const plaza = blockAt(game.city, 2, 3);
    game.player.x = plaza.x + 50; game.player.y = plaza.y + 60; game.player.angle = 0;
    game.camera.x = game.player.x; game.camera.y = game.player.y; game.camera.zoom = 1.5;
    game.noCrime = true;
    game.autopilot = null;
    game.demoMode = 'foot';
    game.peds.length = 0;
    spawnPedestrians(game, 20, 380, 30);
    refreshTrafficAround(game);
  } else if (name === 'chase') {
    const s = lane(4, 5, 90, 14);
    const car = putPlayerInCar(game, 'sports', s.x, s.y, 0, '#f0a21a');
    game.autopilot = cruiseAutopilot(260);
    refreshTrafficAround(game);
    setWanted(game, 3, false);
    for (let k = 0; k < 3; k++) {
      const c = createCar('police', s.x - 150 - k * 85, s.y + (k === 1 ? -28 : 0), 0, { driver: 'police' });
      c.vx = 220; c.sirenOn = true; snapToRoad(c);
      game.cars.push(c);
    }
    game.demoCar = car;
  } else if (name === 'mission') {
    const s = lane(5, 1, 0, -14);
    putPlayerInCar(game, 'sedan', s.x, s.y, Math.PI, '#3d6fb5');
    forceStartMission(game, 1);
    game.autopilot = cruiseAutopilot(135, () => getObjective(game).target, 110);
    refreshTrafficAround(game);
  } else {
    const s = lane(3, 4, 120, 14);
    putPlayerInCar(game, 'taxi', s.x, s.y, 0, null);
    game.autopilot = cruiseAutopilot(230);
    game.noCrime = true;
    refreshTrafficAround(game);
    spawnPedestrians(game, 20, 500, 36);
  }
  // Pre-roll a couple of seconds so traffic and police are already in motion.
  const idle = createIdleInput();
  for (let i = 0; i < 70; i++) stepGame(game, 1 / 30, demoInput(game, idle));
  game.camera.x = game.player.x + game.camera.lookX; game.camera.y = game.player.y + game.camera.lookY;
  return name;
}

// Scripted input for on-foot demos: strolls around the park in a square, keeping the cursor ahead of the player.
export function demoInput(game, real) {
  if (game.demoMode !== 'foot') return real;
  const phase = Math.floor(game.time / 0.9) % 4, keys = ['KeyD', 'KeyS', 'KeyA', 'KeyW'];
  const held = new Set([keys[phase]]);
  const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  game.mouseWorld = { x: game.player.x + dirs[phase][0] * 80, y: game.player.y + dirs[phase][1] * 80 };
  return {
    down: held, pressed: new Set(), mouseDown: false, mouseClicked: false, mouseX: 0, mouseY: 0,
    isDown: (...codes) => codes.some((c) => held.has(c)), wasPressed: () => false, endFrame() {},
  };
}
