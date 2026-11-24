// Boot + wiring for Solmar Bay 3D: renderer, sky and lighting, the game object, the fixed update order,
// the third-person camera, menus, saves, the ?shot= staging scenes and the render loop.
import * as THREE from 'three';
import { START_HOUR, CLOCK_SPEED, WORLD_W, WORLD_H, LANE, BUSTED_FINE, WASTED_FINE, PLAYER_MAX_HP } from './config.js';
import { createRng } from './random.js';
import { buildCity, nodePos, solidAt, districtAt } from './city.js';
import { buildCityScene, updateScenery } from './cityscape.js';
import { createInput } from './input.js';
import { initEffects, updateEffects } from './effects.js';
import { createCar, updateCars, syncCar, CAR_TYPES, CIVILIAN_TYPES } from './vehicles.js';
import { spawnTraffic, spawnParked, updateTraffic, placeOnLane } from './traffic.js';
import { spawnPeds, updatePeds, createPed } from './pedestrians.js';
import { createWanted, updatePolice, clearWanted, setWanted, removeHeli, createCop } from './police.js';
import { createPlayer, updatePlayer, syncPlayer, wrapAngle, exitCar, enterCar } from './player.js';
import { playerAttack, processBlasts, spawnPickups, updatePickups } from './combat.js';
import { createMissionState, updateMissions, say, forceStartMission, restoreMissionProgress, MISSION_COUNT } from './missions.js';
import { createCrew, updateCrew, spawnCrabs, updateCrabs, createRace, updateRace } from './activities.js';
import { createStats, createRep, addRP, addRep } from './stats.js';
import { nearestCar } from './vehicles.js';
import { createHud } from './hud.js';
import { createMinimap } from './minimap.js';
import { createCityMap } from './citymap.js';
import { hasSave, readSave, writeSave } from './save.js';
import * as audio from './audio.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const SHOT = params.get('shot');
const SEED = Number(params.get('seed')) || 1;
const SUN = new THREE.Vector3(-0.62, 0.34, 0.5).normalize(); // low western sun, golden hour
const FOG = 0xf0b98f;
// Third-person chase camera tuning (metres / seconds). `CAM_CAR_*` apply in a vehicle, `CAM_FOOT_*` on foot.
const CAM_CAR_DIST = 8.6, CAM_CAR_DIST_SPEED_GAIN = 0.11, CAM_CAR_DIST_SPEED_MAX = 3.4; // follow distance grows with speed
const CAM_FOOT_DIST = 4.7;
const CAM_CAR_HEIGHT = 3.5, CAM_FOOT_HEIGHT = 2.1;
const CAM_CAR_FOCUS_Y = 1.3, CAM_FOOT_FOCUS_Y = 1.55; // height of the point the camera orbits
const CAM_FOOT_SHOULDER = -0.55; // over-the-shoulder offset on foot
const CAM_FOLLOW_RATE = 14; // position smoothing, per second

// ------------------------------------------------------------------ renderer, sky, light
function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setSize(1280, 720, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;
  return renderer;
}

function gradientTexture(stops, w = 4, h = 256) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d'), grad = g.createLinearGradient(0, 0, 0, h);
  for (const [at, col] of stops) grad.addColorStop(at, col);
  g.fillStyle = grad; g.fillRect(0, 0, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function createSky(scene) {
  const tex = gradientTexture([[0, '#2d5d9c'], [0.33, '#6d9ccf'], [0.46, '#f6c9a0'], [0.5, '#ffb783'], [0.54, '#f2a574'], [1, '#d78f69']]);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1500, 24, 16), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false }));
  dome.renderOrder = -2;
  scene.add(dome);
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d'), rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  rg.addColorStop(0, 'rgba(255,250,225,1)'); rg.addColorStop(0.16, 'rgba(255,236,170,.95)'); rg.addColorStop(0.4, 'rgba(255,170,90,.35)'); rg.addColorStop(1, 'rgba(255,140,70,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
  sun.scale.set(520, 520, 1); sun.renderOrder = -1;
  scene.add(sun);
  return { dome, sun };
}

function createLights(scene) {
  scene.add(new THREE.HemisphereLight(0xaac8ff, 0xe0a870, 1.0));
  const sun = new THREE.DirectionalLight(0xffd7a0, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -75; sc.right = 75; sc.top = 75; sc.bottom = -75; sc.near = 10; sc.far = 330;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
  scene.add(sun, sun.target);
  return sun;
}

// ------------------------------------------------------------------ the game object
function createGame(canvas) {
  const renderer = createRenderer(canvas);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(FOG, 110, 560);
  const camera = new THREE.PerspectiveCamera(64, 16 / 9, 0.3, 2600);
  const sky = createSky(scene);
  const sunLight = createLights(scene);

  const cityRng = createRng(SEED);
  const city = buildCity(cityRng);
  const scenery = buildCityScene(city, scene, cityRng);

  const game = {
    renderer, scene, camera, sky, sunLight, scenery, city, rng: createRng(SEED * 7919 + 13), input: createInput(canvas),
    cars: [], peds: [], cops: [], pickups: [], roadblocks: [], events: [], blasts: [], crabs: [], notifs: [],
    wanted: createWanted(), mission: createMissionState(), crew: createCrew(), stats: createStats(), rep: createRep(),
    money: 250, rp: 0, time: 0, clock: START_HOUR * 60, shake: 0, hurtFlash: 0, dialog: null, aimPoint: null, heli: null,
    cam: { yaw: 0, zoom: 1, x: 0, y: 5, z: 0 }, state: 'menu', civDrivers: true, respawnT: 0, nearCar: null, lastAutosave: 0,
  };
  game.notify = (t) => { game.notifs.push({ text: t, t: 3.2 }); if (game.notifs.length > 3) game.notifs.shift(); };
  game.banner = (title, sub, kind) => { game.mission.banner = { title, sub, kind, t: kind === 'start' ? 3.4 : 2.8 }; };
  game.say = (who, txt) => say(game, who, txt);
  game.addRP = (v) => addRP(game, v);
  game.addRep = (v) => addRep(game, v);

  initEffects(game);
  game.player = createPlayer(game, nodePos(3, 3).x - 30, nodePos(3, 3).z + 4);
  game.player.heading = Math.PI / 2;
  game.cam.yaw = Math.PI / 2;
  spawnCrabs(game);
  createRace(game);
  spawnParked(game);
  spawnTraffic(game);
  spawnPeds(game);
  spawnPickups(game);
  game.beacon = createBeacon(scene);
  return game;
}

// A tall translucent column over the current objective so it reads from far away in 3D.
function createBeacon(scene) {
  const mat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const col = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 60, 20, 1, true), mat);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.22, 8, 28).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd23f }));
  const g = new THREE.Group();
  col.position.y = 30; ring.position.y = 0.3;
  g.add(col, ring);
  g.visible = false;
  scene.add(g);
  return { g, mat, ring };
}

// ------------------------------------------------------------------ one simulation step
function stepGame(game, dt) {
  const input = game.input;
  game.time += dt;
  game.clock += dt * CLOCK_SPEED * 60 * 0.12; // slow drift so the light never leaves golden hour
  game.shake = Math.max(0, game.shake - dt * 2.4);
  game.hurtFlash = Math.max(0, game.hurtFlash - dt);
  for (const n of game.notifs) n.t -= dt;
  game.notifs = game.notifs.filter((n) => n.t > 0);

  const pl = game.player;
  if (!pl || !Number.isFinite(dt) || dt <= 0) return; // defensive: skip a bad frame instead of corrupting state with NaN
  game.nearCar = !pl.inCar && !pl.dead ? nearestCar(game, pl.x, pl.z, 3.8) : null;
  updateCrew(game, input, dt);
  updatePlayer(game, input, dt);
  if (game.autopilot) game.autopilot(game, dt);
  playerAttack(game, input, dt);
  updateCars(game, dt);
  updateTraffic(game, dt);
  updatePeds(game, dt);
  updatePolice(game, dt);
  processBlasts(game);
  updateMissions(game, dt);
  updatePickups(game, dt);
  updateCrabs(game, dt);
  updateRace(game, dt);
  updateEffects(game, dt);
  handleLifeCycle(game, dt);
  game.events.length = 0;
  syncPlayer(game, dt);
  const p = game.player;
  if (p.inCar) game.stats.distance += Math.abs(p.inCar.speed) * dt;
}

// Wasted / busted: fade, fine, respawn at the hospital or the station, reset the heat.
function handleLifeCycle(game, dt) {
  const p = game.player;
  if (!p.dead && p.hp <= 0) {
    p.dead = true; game.respawnT = 3.2; p.deadKind = 'wasted';
    if (p.inCar) { p.inCar.driver = 'none'; p.inCar = null; }
    game.banner('WASTED', 'THE HOSPITAL BILL IS ON YOU', 'fail');
    audio.play('fail');
  }
  if (!p.dead && game.events.some((e) => e.type === 'busted')) {
    p.dead = true; game.respawnT = 3.2; p.deadKind = 'busted';
    if (p.inCar) { const c = p.inCar; c.driver = 'none'; c.ctl.throttle = 0; c.ctl.handbrake = true; p.inCar = null; }
    game.banner('BUSTED', 'SBPD TOOK A CUT OF YOUR CASH', 'fail');
    audio.play('fail');
  }
  if (!p.dead) return;
  game.respawnT -= dt;
  p.human.group.visible = true;
  if (game.respawnT > 0) return;
  const busted = p.deadKind === 'busted', fine = Math.round(game.money * (busted ? BUSTED_FINE : WASTED_FINE));
  game.money = Math.max(0, game.money - fine);
  const spot = busted ? nodePos(4, 3) : nodePos(2, 5);
  p.x = spot.x + 12; p.z = spot.z + 12; p.hp = PLAYER_MAX_HP; p.armor = 0; p.dead = false; p.bustT = 0; p.vx = p.vz = 0;
  clearWanted(game); removeHeli(game);
  game.notify(`${busted ? 'Released from the station' : 'Discharged from Bay General'} - fine $${fine}`);
  if (game.mission.active) { game.mission.active = null; game.mission.armed = false; }
}

// ------------------------------------------------------------------ camera
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.2), hit = new THREE.Vector3();

function updateCamera(game, dt, closer = 1) {
  const { cam, player: p, input, camera, city } = game;
  const car = p.inCar, tgt = car || p;
  if (car) {
    cam.yaw += wrapAngle(car.heading - cam.yaw) * Math.min(1, dt * (car.speed < -2 ? 1.2 : 2.6));
  } else {
    cam.yaw += ((input.down('arrowleft') ? 1 : 0) - (input.down('arrowright') ? 1 : 0)) * dt * 2.0;
  }
  if (input.mouse.wheel) { cam.zoom = Math.max(0.65, Math.min(1.8, cam.zoom + input.mouse.wheel * 0.08)); input.mouse.wheel = 0; }
  const speed = car ? Math.hypot(car.vx, car.vz) : 0;
  const dist = (car ? CAM_CAR_DIST + Math.min(speed * CAM_CAR_DIST_SPEED_GAIN, CAM_CAR_DIST_SPEED_MAX) : CAM_FOOT_DIST) * cam.zoom * closer;
  const height = (car ? CAM_CAR_HEIGHT : CAM_FOOT_HEIGHT) * (0.7 + 0.3 * cam.zoom) * (closer < 1 ? 0.9 : 1);
  const fy = car ? CAM_CAR_FOCUS_Y : CAM_FOOT_FOCUS_Y;
  const fwdX = Math.sin(cam.yaw), fwdZ = Math.cos(cam.yaw);
  const rx = -fwdZ, rz = fwdX; // screen-right on the ground plane
  const side = car ? 0 : CAM_FOOT_SHOULDER;
  const fx = tgt.x + rx * side, fz = tgt.z + rz * side;
  let d = dist;
  for (let t = 1; t >= 0.15; t -= 0.07) { // pull the camera in front of any wall it would sit inside
    const x = fx - fwdX * dist * t, z = fz - fwdZ * dist * t, y = fy + height * t + 0.4;
    if (!solidAt(city, x, z, y)) { d = dist * t; break; }
    d = dist * 0.15;
  }
  const shake = game.shake * 0.35;
  const tx = fx - fwdX * d, tz = fz - fwdZ * d, ty = fy + height * (d / dist);
  const k = Math.min(1, dt * CAM_FOLLOW_RATE);
  cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k; cam.z += (tz - cam.z) * k;
  camera.position.set(cam.x + (Math.random() - 0.5) * shake, cam.y + (Math.random() - 0.5) * shake, cam.z + (Math.random() - 0.5) * shake);
  const look = car ? 6 + speed * 0.12 : 6;
  camera.lookAt(fx + fwdX * look, fy - (car ? 0.3 : 1.0), fz + fwdZ * look);
  const fov = (car ? 64 + Math.min(14, speed * 0.28) : 60);
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix(); }
  camera.updateMatrixWorld();
  // mouse aim point on the ground plane
  ndc.set((input.mouse.x / 1280) * 2 - 1, -((input.mouse.y / 720) * 2 - 1));
  ray.setFromCamera(ndc, camera);
  game.aimPoint = game.forceAim || (ray.ray.intersectPlane(groundPlane, hit) ? { x: hit.x, z: hit.z } : null);
}

function updateWorldVisuals(game) {
  const { camera, sunLight, sky } = game, f = game.cam;
  sky.dome.position.copy(camera.position);
  sky.sun.position.copy(camera.position).addScaledVector(SUN, 1200);
  const focus = game.player.inCar || game.player;
  sunLight.target.position.set(focus.x, 0, focus.z);
  sunLight.position.set(focus.x + SUN.x * 160, SUN.y * 160, focus.z + SUN.z * 160);
  sunLight.target.updateMatrixWorld();
  updateScenery(game.scenery, game.time);
  // objective beacon
  const m = game.objective, b = game.beacon;
  b.g.visible = !!(m && m.target);
  if (m && m.target) { b.g.position.set(m.target.x, 0, m.target.z); b.mat.color.set(m.active ? 0xffd23f : 0x5ee08a); b.ring.material.color.set(m.active ? 0xffd23f : 0x5ee08a); b.ring.rotation.y = game.time; }
  void f;
}

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

function stageScene(game, name) {
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
    game.stats.crabs = 3; game.rp = 455; game.rep['Central Plaza'] = 62; game.rep['Downtown'] = 38; game.money = 18250;
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
  } else if (name === 'mission') {
    const n = nodePos(2, 4);
    clearAround(game, n.x - 40, n.z, 120);
    game.rp = 210; game.money = 650; game.rep['Marina Row'] = 34; game.stats.crabs = 2;
    p.armor = 40; p.owned[2] = true; p.mag[2] = 24; p.reserve[2] = 90;
    forceStartMission(game, 0);
    const car = game.cars.find((c) => c.missionCar);
    game.scene.remove(car.obj); game.cars.splice(game.cars.indexOf(car), 1);
    laneAutopilot(game, { z: n.z, dir: -1, speed: 9 });
    putPlayerInCar(game, 'sedan', n.x - 14, n.z - LANE, -Math.PI / 2, 8, { color: 0xe8b84a });
    game.mission.active.data.car = p.inCar; p.inCar.missionCar = true;
    game.mission.armed = false;
    simulate(game, 1.6);
    clearNearCamera(game, 24);
    addLaneTraffic(game, 1, 4, 0, [16, 30], 12); // oncoming (east-bound) traffic for the busy street ahead
    addLaneTraffic(game, 0, 4, 0, [30, 52], 11);
    addLaneTraffic(game, 1, 4, 2, [20, 40], 11); // same direction, far ahead
    addSidewalkPeds(game, [n.x - 30, n.x - 52, n.x - 74, n.x - 96, n.x - 118], n.z);
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
  } else if (name === 'foot') {
    const cx = 342, cz = 268; // centre of the Central Plaza block (4,3): The Big Score, guards cleared in the plaza under SBPD fire
    p.x = cx; p.z = cz + 16.5; p.heading = Math.PI + 0.35; game.cam.yaw = Math.PI + 0.35;
    p.weapon = 1; p.mag[1] = 9; p.reserve[1] = 36; p.armor = 55; p.hp = 88;
    game.rp = 140; game.money = 1380; game.stats.crabs = 1; game.rep['Central Plaza'] = 28;
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
    game.wanted.unitSeq = 1; game.wanted.flash = 0; game.mission.banner = null; // steady stars, no half-faded banner in the capture
  }
  game.cam.x = game.camera.position.x;
}

// ------------------------------------------------------------------ menus + loop
function boot() {
  const canvas = $('view');
  const game = createGame(canvas);
  const hud = createHud(game);
  const minimap = createMinimap($('mini'), game);
  const cityMap = createCityMap($('stage'), game);
  window.__solmar = { game, stepGame: (s) => simulate(game, s), THREE };

  // fit the 1280x720 stage into the window
  const stage = $('stage');
  const fit = () => { stage.style.transform = `scale(${Math.min(innerWidth / 1280, innerHeight / 720)})`; };
  addEventListener('resize', fit); fit();

  const show = (id, on) => $(id).classList.toggle('show', on);
  const hudRoot = $('hud');
  const startGame = (continueSave) => {
    audio.initAudio(); audio.startMusic();
    show('start', false); show('help', false);
    game.input.mapOpen = false;
    game.state = 'play';
    if (continueSave) applySave(game, readSave());
    else say(game, 'Lola', "Jax! Welcome to Solmar Bay. Find the green marker - I've got a job for you.", 7);
    game.input.clearEdges();
  };
  const setPaused = (on) => {
    if (game.state === 'menu') return;
    game.state = on ? 'paused' : 'play';
    show('pause', on);
    if (on) { writeSave(game); const s = game.stats; $('p-stats').innerHTML = `Missions <b>${game.mission.completed}/${MISSION_COUNT}</b> &middot; Crabs <b>${s.crabs}/12</b> &middot; Kills <b>${s.kills}</b> &middot; Races won <b>${s.races}</b> &middot; Max heat <b>${s.wantedMax}★</b> &middot; Driven <b>${(s.distance / 1000).toFixed(1)} km</b><br>Progress saved.`; }
  };
  $('b-new').onclick = () => startGame(false);
  $('b-cont').onclick = () => startGame(true);
  $('b-cont').disabled = !hasSave();
  $('b-help').onclick = () => { show('help', true); $('h-back').dataset.from = 'start'; };
  $('p-resume').onclick = () => setPaused(false);
  $('p-save').onclick = () => { writeSave(game); game.notify('Game saved'); setPaused(false); };
  $('p-help').onclick = () => { show('help', true); $('h-back').dataset.from = 'pause'; };
  $('h-back').onclick = () => show('help', false);
  addEventListener('keydown', (e) => {
    if (game.state === 'menu') { if (e.code === 'Enter') startGame(hasSave() && e.shiftKey); return; }
    if (e.code === 'Escape' || e.code === 'KeyP') { if (game.input.mapOpen) game.input.mapOpen = false; else if ($('help').classList.contains('show')) show('help', false); else setPaused(game.state !== 'paused'); }
    else if (e.code === 'KeyN') { audio.toggleMute(); game.notify(audio.isMuted() ? 'Sound muted' : 'Sound on'); }
    else if (e.code === 'KeyT') { audio.setTrack(game.trackIdx = (game.trackIdx || 0) + 1); game.notify('Radio: ' + audio.currentTrack().name); }
  });
  addEventListener('blur', () => { if (game.state === 'play' && !SHOT) setPaused(true); });
  canvas.addEventListener('mousedown', () => audio.initAudio());

  if (SHOT) { // staged screenshot scene: no menu, deterministic frame
    show('start', false);
    stageScene(game, SHOT);
    document.body.dataset.shot = SHOT;
  }
  $('loading').style.display = 'none';

  let last = performance.now(), frames = 0, tracked = -1;
  game.frame = 0;
  function loop(now) {
    // staged scenes freeze after a few settled frames so the capture is a stable frame
    if (!(SHOT && game.frame >= 14)) requestAnimationFrame(loop); else document.body.dataset.ready = '1';
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const p = game.player;
    if (game.state === 'play') {
      if ((!SHOT || game.shotLive) && !game.input.mapOpen) stepGame(game, dt); // the city map freezes the world while it is open
      game.input.clearEdges();
      const car = p.inCar;
      audio.setEngine(car ? Math.abs(car.speed) / CAR_TYPES[car.type].maxSpeed : 0, car ? Math.abs(car.ctl.throttle) : 0, !!car && !p.dead);
      const cop = game.cars.filter((c) => c.siren && !c.dead).reduce((m, c) => Math.min(m, Math.hypot(c.x - p.x, c.z - p.z)), 999);
      audio.setSiren(cop < 150 ? 1 - cop / 150 : 0, game.time);
      const hour = Math.floor(game.clock / 60);
      if (hour !== tracked) { tracked = hour; audio.setTrack(hour); }
      if (game.time - game.lastAutosave > 25 && !SHOT) { game.lastAutosave = game.time; writeSave(game); }
    } else if (game.state === 'menu') {
      game.time += dt; game.cam.yaw += dt * 0.12; // slow orbit behind the start screen
    }
    updateCamera(game, game.state === 'paused' ? 0 : dt, game.shot ? game.shot.closer : 1);
    game.objective = game.state === 'play' || SHOT ? objectiveOf(game) : null;
    updateWorldVisuals(game);
    game.renderer.render(game.scene, game.camera);
    hud(); minimap();
    const mapOn = game.input.mapOpen && game.state === 'play';
    cityMap.open = mapOn;
    if (mapOn) cityMap.draw();
    game.frame++; frames++;
  }
  requestAnimationFrame(loop);
}

import { getObjective } from './missions.js';
function objectiveOf(game) { return getObjective(game); }

function applySave(game, d) {
  if (!d) return;
  const p = game.player;
  game.money = d.money; game.rp = d.rp; game.rep = { ...game.rep, ...d.rep }; game.stats = { ...game.stats, ...d.stats };
  restoreMissionProgress(game, d.missionIndex);
  p.x = d.x; p.z = d.z; p.heading = d.heading || 0; game.cam.yaw = p.heading; p.hp = d.hp || PLAYER_MAX_HP;
  if (Array.isArray(d.owned)) p.owned = d.owned; // keep the defaults when an older or damaged save lacks the weapon arrays
  if (Array.isArray(d.mag)) p.mag = d.mag;
  if (Array.isArray(d.reserve)) p.reserve = d.reserve;
  (Array.isArray(d.crabs) ? d.crabs : []).forEach((g, k) => { if (g && game.crabs[k]) { game.crabs[k].got = true; game.crabs[k].mesh.visible = false; } });
  game.notify('Save loaded');
}

try { boot(); } catch (e) {
  $('loading').style.display = 'none';
  const f = $('fatal'); f.style.display = 'block'; f.textContent = 'Solmar Bay failed to start:\n' + (e && e.stack ? e.stack : e);
  console.error(e);
}
void WORLD_W; void WORLD_H; void districtAt; void exitCar; void enterCar; void audio;
