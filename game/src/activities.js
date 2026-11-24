// Side activities: crew abilities (driver / mechanic / lookout), 12 golden crabs, and a street race.
import * as THREE from 'three';
import { nodePos, sidewalkPoint, solidAt } from './city.js';
import { repairCar } from './vehicles.js';
import { clearWanted } from './police.js';
import { play } from './audio.js';

export const CREW_DEFS = [
  { role: 'DRIVER', name: 'Kenji Ito', ability: 'Swaps plates: drops 1 wanted star', key: 'z', cd: 55 },
  { role: 'MECHANIC', name: 'Mina Vargas', ability: 'Field repair: car back to 100%', key: 'x', cd: 40 },
  { role: 'LOOKOUT', name: 'Dez Okafor', ability: 'Marks every cop on the minimap', key: 'c', cd: 45 },
];

export function createCrew() { return CREW_DEFS.map((d) => ({ ...d, t: 0, active: 0 })); }

export function updateCrew(game, input, dt) {
  game.crew.forEach((c, k) => {
    c.t = Math.max(0, c.t - dt); c.active = Math.max(0, c.active - dt);
    if (input.pressed(c.key) && c.t <= 0 && !game.player.dead) activateCrew(game, k);
  });
}

export function activateCrew(game, k) {
  const c = game.crew[k], p = game.player;
  if (c.t > 0) return false;
  if (k === 0) {
    if (game.wanted.stars === 0) { game.notify('No heat to shake - plate swap saved'); return false; }
    game.wanted.stars--; game.wanted.pts = [0, 0, 20, 55, 105, 170][game.wanted.stars + 1] || 0; game.wanted.cool = 0;
    if (game.wanted.stars === 0) clearWanted(game);
    game.notify('Kenji swapped the plates: wanted level down');
  } else if (k === 1) {
    if (!p.inCar) { game.notify('Mina needs you in a car to repair it'); return false; }
    repairCar(p.inCar); game.notify('Mina repaired your car');
  } else {
    c.active = 20; game.notify('Dez is marking police units');
  }
  c.t = c.cd; play('pickup');
  return true;
}

// ---------------- golden crabs ----------------
function makeCrab() {
  const g = new THREE.Group();
  const gold = new THREE.MeshLambertMaterial({ color: 0xffc933, emissive: 0xaa7a00, emissiveIntensity: 0.5 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), gold); body.scale.set(1.3, 0.55, 1); body.position.y = 0.45; g.add(body);
  for (const s of [-1, 1]) {
    const claw = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), gold); claw.position.set(s * 0.65, 0.65, 0.35); g.add(claw);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), new THREE.MeshBasicMaterial({ color: 0x111111 })); eye.position.set(s * 0.15, 0.82, 0.32); g.add(eye);
    for (let k = 0; k < 3; k++) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.05), gold); leg.position.set(s * 0.62, 0.32, -0.15 + k * 0.17); leg.rotation.z = s * 0.4; g.add(leg); }
  }
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.95, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd44a, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
  halo.position.y = 0.05; g.add(halo);
  g.scale.setScalar(1.35);
  return g;
}

export function spawnCrabs(game) {
  const rng = game.rng;
  const spots = [];
  let tries = 0;
  while (spots.length < 12 && tries++ < 300) {
    const s = sidewalkPoint(game.city, rng);
    if (spots.every((q) => Math.hypot(q.x - s.x, q.z - s.z) > 70)) spots.push({ x: s.x, z: s.z });
  }
  // a few memorable fixed spots: beach, pier, park
  const fixed = [nodePos(5, 7), nodePos(1, 2), nodePos(7, 7)];
  game.crabs = spots.slice(0, 12).map((s, k) => {
    const f = k < 3 ? { x: fixed[k].x + 6, z: fixed[k].z + (k === 0 ? 38 : k === 2 ? 20 : 12) } : s;
    const mesh = makeCrab(); mesh.position.set(f.x, 0.4, f.z); game.scene.add(mesh);
    return { x: f.x, z: f.z, mesh, got: false };
  });
}

export function updateCrabs(game, dt) {
  const p = game.player;
  for (const c of game.crabs) {
    if (c.got) continue;
    c.mesh.rotation.y += dt * 2;
    c.mesh.position.y = 0.5 + Math.sin(game.time * 3 + c.x) * 0.15;
    if (Math.hypot(c.x - p.x, c.z - p.z) < 2.3) {
      c.got = true; c.mesh.visible = false; game.stats.crabs++;
      game.money += 100; game.addRP(25); game.addRep(8);
      game.banner('GOLDEN CRAB', `${game.stats.crabs} / 12  +$100`, 'pass');
      play('crab');
    }
  }
}

// ---------------- street race ----------------
const RACE_POINTS = [[3, 5], [6, 5], [6, 2], [3, 2], [3, 5]];

export function createRace(game) {
  const start = nodePos(3, 5);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.28, 8, 24), new THREE.MeshBasicMaterial({ color: 0xffe14a }));
  ring.rotation.x = Math.PI / 2; ring.position.set(start.x, 0.35, start.z);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 2.8, 24, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe14a, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  beam.position.set(start.x, 12, start.z);
  game.scene.add(ring, beam);
  game.race = { state: 'idle', start, ring, beam, cp: 0, t: 0, limit: 62, best: 0, armed: true };
}

export function updateRace(game, dt) {
  const r = game.race, p = game.player;
  r.ring.rotation.z += dt * 1.5;
  if (r.state === 'idle') {
    r.ring.visible = r.beam.visible = true;
    const d = Math.hypot(r.start.x - p.x, r.start.z - p.z);
    if (d > 20) r.armed = true;
    if (r.armed && d < 5 && p.inCar && !game.mission.active) {
      r.state = 'run'; r.cp = 1; r.t = 0; r.armed = false;
      game.banner('STREET RACE', 'HIT ALL 4 CHECKPOINTS', 'start'); play('click');
    }
  } else {
    r.t += dt;
    const [ci, cj] = RACE_POINTS[r.cp], n = nodePos(ci, cj);
    r.ring.position.set(n.x, 0.35, n.z); r.beam.position.set(n.x, 12, n.z);
    if (!p.inCar) { r.state = 'idle'; r.ring.position.set(r.start.x, 0.35, r.start.z); r.beam.position.set(r.start.x, 12, r.start.z); game.banner('RACE ABANDONED', 'GET BACK IN A CAR', 'fail'); return; }
    if (Math.hypot(n.x - p.x, n.z - p.z) < 8) {
      play('pickup');
      r.cp++;
      if (r.cp >= RACE_POINTS.length) {
        const time = r.t; r.state = 'idle'; r.best = r.best ? Math.min(r.best, time) : time;
        game.money += 500; game.addRP(90); game.addRep(15); game.stats.races++;
        game.banner('RACE WON', `${time.toFixed(1)}s  +$500`, 'pass'); play('jingle');
        r.ring.position.set(r.start.x, 0.35, r.start.z); r.beam.position.set(r.start.x, 12, r.start.z);
      }
    } else if (r.t > r.limit) {
      r.state = 'idle'; game.banner('RACE LOST', 'OUT OF TIME', 'fail'); play('fail');
      r.ring.position.set(r.start.x, 0.35, r.start.z); r.beam.position.set(r.start.x, 12, r.start.z);
    }
  }
}
void solidAt;
