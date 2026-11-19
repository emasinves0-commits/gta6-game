// World state creation and the per-frame simulation step that wires every gameplay system together.
import { CLOCK_SPEED, START_HOUR, PLAYER_MAX_HP } from './config.js';
import { createCity, randomSidewalkPoint, walkableForPed } from './city.js';
import { createRng } from './random.js';
import { createPlayer, updatePlayer, hurtPlayer, healPlayer } from './player.js';
import { updateCar, collideCars, carSpeed } from './vehicles.js';
import { spawnParkedCars, populateTraffic, updateTraffic } from './traffic.js';
import { spawnPedestrians, updatePedestrians } from './pedestrians.js';
import { updateCombat } from './combat.js';
import { createWanted, updatePolice, reportCrime, resolveBusted, resolveWasted, hurtCop } from './police.js';
import { createMissionState, updateMissions, failMission } from './missions.js';
import { updateEffects } from './effects.js';
import { setEngine, setSiren, play } from './audio.js';

export function createGame(seed) {
  const city = createCity(seed);
  const rng = createRng(seed);
  const start = city.landmarks.start;
  const game = {
    seed, rng, city, state: 'title', stateT: 0, time: 0, clock: START_HOUR * 60, money: 250,
    player: createPlayer(start.x, start.y), cars: [], peds: [], cops: [], bullets: [], particles: [], skids: [], pickups: [],
    wanted: createWanted(), mission: createMissionState(), camera: { x: start.x, y: start.y, scale: 1, w: 1280, h: 720, shake: 0, lookX: 0, lookY: 0 },
    events: [], mouseWorld: { x: start.x + 60, y: start.y }, trafficTimer: 0, crashSoundCooldown: 0, hurtSoundCooldown: 0,
    autopilot: null, dialog: null, noCrime: false, sirenLevel: 0, notice: null, lastResult: null,
  };
  game.hurtPlayer = (amount) => hurtPlayer(game, amount);
  spawnParkedCars(game);
  populateTraffic(game);
  spawnPedestrians(game);
  spawnPickups(game);
  return game;
}

function spawnPickups(game) {
  for (let i = 0; i < 16; i++) {
    const pt = randomSidewalkPoint(game.city, game.rng);
    if (!walkableForPed(game.city, pt.x, pt.y)) continue;
    game.pickups.push({ kind: i % 3 === 2 ? 'ammo' : 'health', x: pt.x, y: pt.y, respawn: 0, taken: false });
  }
}

function showNotice(game, text) { game.notice = { text, t: 3 }; }

function updatePickups(game, dt) {
  const p = game.player;
  for (let i = game.pickups.length - 1; i >= 0; i--) {
    const k = game.pickups[i];
    if (k.kind === 'cash') { k.life -= dt; if (k.life <= 0) { game.pickups.splice(i, 1); continue; } }
    if (k.taken) { k.respawn -= dt; if (k.respawn <= 0) k.taken = false; continue; }
    if (p.inCar && k.kind !== 'cash') continue;
    if (Math.hypot(k.x - p.x, k.y - p.y) > (p.inCar ? 30 : 18)) continue;
    if (k.kind === 'health') { if (p.hp >= PLAYER_MAX_HP) continue; healPlayer(game, 35); showNotice(game, '+ Health'); }
    else if (k.kind === 'ammo') { p.reserve += 24; showNotice(game, '+ Ammo'); }
    else { game.money += k.amount; showNotice(game, `+$${k.amount}`); }
    play('pickup');
    if (k.kind === 'cash') game.pickups.splice(i, 1); else { k.taken = true; k.respawn = 45; }
  }
}

function processEvents(game) {
  const p = game.player;
  for (const e of game.events) {
    if (e.type === 'pedKilled') reportCrime(game, 'pedKill');
    else if (e.type === 'pedHit') reportCrime(game, 'pedHit');
    else if (e.type === 'missionComplete' && game.onMissionComplete) game.onMissionComplete();
    else if (e.type === 'busted' && game.state === 'playing') beginEnd(game, 'busted');
    else if (e.type === 'carCrash' && p.inCar && (e.a === p.inCar || e.b === p.inCar) && e.speed > 140) hurtPlayer(game, e.speed * 0.03);
  }
  game.events.length = 0;
}

function beginEnd(game, state) {
  game.state = state; game.stateT = 0;
  game.lastResult = null;
  failMission(game, state === 'busted' ? 'Busted by the police' : 'You were wasted');
  play('fail');
}

function updateEndState(game, dt) {
  game.stateT += dt;
  if (game.stateT < 3.2) return;
  const amount = game.state === 'busted' ? resolveBusted(game) : resolveWasted(game);
  game.lastResult = amount;
  game.state = 'playing';
  game.camera.x = game.player.x; game.camera.y = game.player.y;
  showNotice(game, game.lastResult ? `-$${amount}` : 'Back on your feet');
}

function carsHitCops(game) {
  const car = game.player.inCar;
  if (!car || carSpeed(car) < 90) return;
  for (const cop of game.cops) {
    if (!cop.dead && Math.hypot(cop.x - car.x, cop.y - car.y) < car.spec.len * 0.55) hurtCop(game, cop, carSpeed(car) * 0.3, true);
  }
}

function updateCamera(game, dt) {
  const cam = game.camera, p = game.player, car = p.inCar;
  const vx = car ? car.vx : p.vx, vy = car ? car.vy : p.vy;
  const lookScale = car ? 0.45 : 0.2;
  cam.lookX += (vx * lookScale - cam.lookX) * Math.min(1, dt * 2.5);
  cam.lookY += (vy * lookScale - cam.lookY) * Math.min(1, dt * 2.5);
  const tx = p.x + cam.lookX, ty = p.y + cam.lookY;
  const k = Math.min(1, dt * 6);
  cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
  const zoomTarget = car ? 1 - Math.min(0.22, carSpeed(car) / 2200) : 1.5;
  cam.zoom = (cam.zoom || 1) + (zoomTarget - (cam.zoom || 1)) * Math.min(1, dt * 1.5);
}

// Advance the whole simulation by dt seconds. `input` drives the player (pass an idle input for non-playing states).
export function stepGame(game, dt, input) {
  game.time += dt;
  game.clock = (game.clock + dt * CLOCK_SPEED) % 1440;
  game.crashSoundCooldown -= dt; game.hurtSoundCooldown -= dt;
  if (game.notice) { game.notice.t -= dt; if (game.notice.t <= 0) game.notice = null; }
  const playing = game.state === 'playing';
  updateTraffic(game, dt);
  updatePolice(game, dt);
  updatePlayer(game, dt, input);
  updateCombat(game, dt, input);
  for (const car of game.cars) updateCar(game, car, dt);
  collideCars(game);
  carsHitCops(game);
  updatePedestrians(game, dt);
  updatePickups(game, dt);
  if (playing) updateMissions(game, dt);
  processEvents(game);
  updateEffects(game, dt);
  updateCamera(game, dt);
  if (playing && game.player.hp <= 0) beginEnd(game, 'wasted');
  else if (!playing && (game.state === 'busted' || game.state === 'wasted')) updateEndState(game, dt);
  updateAudioLevels(game);
}

function updateAudioLevels(game) {
  const car = game.player.inCar;
  if (car) setEngine(Math.min(1, carSpeed(car) / car.spec.maxSpeed), 1);
  else setEngine(0, 0);
  setSiren(game.state === 'playing' || game.state === 'busted' ? game.sirenLevel : 0);
}
