// The four-mission story of Jax Merrin: First Job, The Pickup, The Getaway, The Big Score.
// Stages, waypoint targets, banners, dialogue (named characters), failure rules and rewards.
import * as THREE from 'three';
import { nodePos, pushOut } from './city.js';
import { createCar } from './vehicles.js';
import { setWanted, createCop } from './police.js';
import { makeHuman } from './characters.js';
import { play } from './audio.js';
import { ROADS_H } from './config.js';

const RADIUS = 6.5;
const at = (i, j, dx = 0, dz = 0) => { const n = nodePos(i, j); return { x: n.x + dx, z: n.z + dz }; };

// Each stage: text (string or fn), target {x,z}, kind 'reach' | 'clear' | 'kill', needCar, requireClear, onEnter, failIf.
const MISSIONS = [
  {
    id: 'first-job', chapter: 1, title: 'First Job', reward: 400, rp: 120, start: at(3, 3, 0, 0), giver: 'Lola',
    briefing: ['Lola: Jax! Out of the can and already late. I need a ride across Solmar Bay.', 'Lola: Grab any car and pick me up at the Sunrise Diner.'],
    onStart(game, m) {
      const s = at(3, 3);
      createCar(game, 'sedan', s.x - 11, s.z + 5.2, Math.PI / 2, { missionCar: true, color: 0xe8b84a });
      const pos = at(1, 4);
      const npc = makeHuman({ skin: 0xd9a577, shirt: 0xe27ab0, pants: 0x2b3a55, hair: 0x2a1408 });
      npc.group.position.set(pos.x, 0, pos.z); game.scene.add(npc.group);
      game.mission.npc = { ...pos, obj: npc.group };
    },
    stages: [
      { target: at(1, 4), needCar: true, text: (g) => (g.player.inCar ? 'Pick up Lola at the Sunrise Diner' : 'Get a car (E) and pick up Lola'),
        onEnter(game, m) { say(game, 'Lola', 'Finally. Palm Tower, east side. No scenic route.'); removeNpc(game); m.data.car = game.player.inCar; } },
      { target: at(7, 5), needCar: true, text: (g) => (g.player.inCar ? 'Drive Lola to Palm Tower' : 'Get back in the car - Lola is waiting'),
        failIf: (g, m) => {
          if (m.data.car && m.data.car.dead) return 'The car was destroyed';
          if (g.player.inCar === m.data.car) { m.data.outSince = null; return null; }
          if (m.data.outSince == null) m.data.outSince = g.time;
          return g.time - m.data.outSince > 6 ? "You abandoned Lola's car" : null;
        },
        onEnter(game) { say(game, 'Lola', 'Not bad, Jax. Ostrander wants to meet you. Find Mina at her garage.'); } },
    ],
  },
  {
    id: 'the-pickup', chapter: 2, title: 'The Pickup', reward: 900, rp: 200, start: at(6, 6),
    briefing: ['Mina: Ostrander keeps a box at the old cannery. Bring it to Dock 9.', 'Mina: The alarm trips when you lift it. Expect company.'],
    stages: [
      { target: at(1, 1), text: 'Collect the package at the Old Cannery',
        onEnter(game) { setWanted(game, 2); say(game, 'Mina', 'Alarm just went off - cops are rolling! Lose them before you deliver.'); } },
      { target: at(8, 6), requireClear: true, text: (g) => (g.wanted.stars > 0 ? 'Lose the cops, then deliver the package' : 'Deliver the package to Dock 9'),
        onEnter(game) { say(game, 'Mina', 'Ostrander will be pleased. Maybe.'); } },
    ],
  },
  {
    id: 'the-getaway', chapter: 3, title: 'The Getaway', reward: 1500, rp: 300, start: at(7, 6),
    briefing: ['Lola: Ostrander sold you out! The police know your face.', 'Lola: Take the Vesper, lose the heat and reach the safehouse.'],
    onStart(game) {
      const s = at(7, 6);
      createCar(game, 'sports', s.x + 10, s.z + 5.2, 0, { missionCar: true, color: 0xe0342b });
      setWanted(game, 3);
    },
    stages: [
      { kind: 'clear', text: 'Lose the cops (break line of sight)', onEnter() {} },
      { target: at(0, 3), text: 'Reach the safehouse', onEnter(game) { say(game, 'Lola', 'Clean. Get some rest. Tomorrow we hit his vault.'); } },
    ],
  },
  {
    id: 'the-big-score', chapter: 4, title: 'The Big Score', reward: 5000, rp: 600, start: at(1, 3),
    briefing: ["Lola: Bayfront Bank vault. Ostrander's whole fortune.", "Lola: His guards are already waiting. Shoot your way in, grab the cash, run."],
    stages: [
      { target: at(8, 1), text: 'Drive to Bayfront Bank',
        onEnter(game, m) { spawnGuards(game, at(8, 1)); m.data.total = 6; say(game, 'Lola', 'Guards everywhere. Clear them out, Jax!'); } },
      { kind: 'kill', text: (g) => `Eliminate the guards (${g.cops.filter((c) => c.kind === 'goon' && !c.dead).length} left)`, onEnter() {} },
      { target: at(8, 1), text: 'Grab the cash from the vault',
        onEnter(game) { setWanted(game, 4); say(game, 'Lola', 'Alarms! Four stars - get to Pier 5, my boat is waiting!'); } },
      { kind: 'clear', text: 'Lose the police', onEnter() {} },
      { target: at(5, 7, 0, ROADS_H - at(5, 7).z + 38), text: 'Reach Pier 5', onEnter(game) { say(game, 'Lola', 'Jax Merrin, king of Solmar Bay. Drinks are on you.'); } },
    ],
  },
];

export const MISSION_COUNT = MISSIONS.length;
export const missionDefs = MISSIONS;

function removeNpc(game) {
  const n = game.mission.npc;
  if (n && n.obj) game.scene.remove(n.obj);
  game.mission.npc = null;
}

function spawnGuards(game, center) {
  let placed = 0, tries = 0;
  while (placed < 6 && tries++ < 120) {
    const a = game.rng.range(0, Math.PI * 2), d = game.rng.range(8, 26);
    const x = center.x + Math.cos(a) * d, z = center.z + Math.sin(a) * d;
    const t = { x, z };
    if (pushOut(game.city, t, 0.6, 0.3)) continue;
    createCop(game, x, z, 'goon');
    placed++;
  }
}

// Staging helper: jump straight into a mission (screenshots and tests).
export function forceStartMission(game, index) {
  game.mission.index = index;
  startMission(game);
}

export const PORTRAITS = {
  Lola: { skin: '#d9a577', hair: '#2a1408', shirt: '#e27ab0', long: true },
  Mina: { skin: '#b27c52', hair: '#111', shirt: '#2fa3b8', long: true },
  Ostrander: { skin: '#e8c9a6', hair: '#888', shirt: '#222', long: false, suit: true },
  Kenji: { skin: '#f0c7a0', hair: '#111', shirt: '#f2b630', long: false },
  Dez: { skin: '#7d5336', hair: '#111', shirt: '#3f9d57', long: false },
  Jax: { skin: '#d9a577', hair: '#1b120c', shirt: '#2fa3b8', long: false, cap: true },
  'SBPD Dispatch': { skin: '#f0c7a0', hair: '#222', shirt: '#1f3a73', long: false, cap: true },
};

// Show a speech box under the HUD for ~6 seconds; hud.js renders game.dialog.
export function say(game, speaker, text, t = 6.5) {
  game.dialog = { speaker, text, t, t0: t };
}

export function createMissionState() {
  return { index: 0, active: null, completed: 0, banner: null, npc: null, storyComplete: false, armed: true, noWanted: false };
}

export function currentDefinition(game) { return MISSIONS[game.mission.index] || null; }
function stageOf(m) { return m.def.stages[m.stage]; }
const resolveText = (game, text) => (typeof text === 'function' ? text(game) : text);

function stageDistance(game, st) {
  if (!st.target) return 0;
  return Math.hypot(st.target.x - game.player.x, st.target.z - game.player.z);
}

function startMission(game) {
  const def = MISSIONS[game.mission.index];
  const m = { def, stage: 0, data: {}, d0: 1 };
  game.mission.active = m;
  game.banner(def.title.toUpperCase(), `CHAPTER ${def.chapter}`, 'start');
  play('click');
  if (def.onStart) def.onStart(game, m);
  const speaker = def.briefing[0].split(':')[0];
  say(game, speaker, def.briefing.map((b) => b.split(': ').slice(1).join(': ')).join(' '), 8);
  m.d0 = Math.max(30, stageDistance(game, def.stages[0]));
}

export function failMission(game, reason) {
  const ms = game.mission;
  if (!ms.active) return;
  game.banner('MISSION FAILED', reason, 'fail');
  ms.active = null; ms.armed = false; removeNpc(game);
  for (let k = game.cops.length - 1; k >= 0; k--) if (game.cops[k].kind === 'goon') { game.scene.remove(game.cops[k].human.group); game.cops.splice(k, 1); }
  play('fail');
}

function completeMission(game) {
  const ms = game.mission, def = ms.active.def;
  game.money += def.reward;
  game.addRP(def.rp);
  game.addRep(def.rp / 2);
  ms.active = null; ms.completed++; ms.index++; ms.armed = false; removeNpc(game);
  if (ms.index >= MISSIONS.length) {
    ms.storyComplete = true;
    game.banner('STORY COMPLETE', `${def.title}  +$${def.reward}  - free roam continues`, 'pass');
  } else game.banner('MISSION PASSED', `${def.title}  +$${def.reward}`, 'pass');
  play('jingle');
  game.events.push({ type: 'missionComplete' });
}

export function updateMissions(game, dt) {
  const ms = game.mission, p = game.player;
  if (ms.banner) { ms.banner.t -= dt; if (ms.banner.t <= 0) ms.banner = null; }
  if (game.dialog) { game.dialog.t -= dt; if (game.dialog.t <= 0) game.dialog = null; }
  if (!ms.active) {
    const def = currentDefinition(game);
    if (!def) return;
    const d = Math.hypot(def.start.x - p.x, def.start.z - p.z);
    if (!ms.armed && d > 28) ms.armed = true;
    if (ms.armed && d < RADIUS && !p.dead) startMission(game);
    return;
  }
  const m = ms.active, st = stageOf(m);
  const fail = st.failIf && st.failIf(game, m);
  if (fail) { failMission(game, fail); return; }
  let done = false;
  if (st.kind === 'clear') done = game.wanted.stars === 0;
  else if (st.kind === 'kill') done = !game.cops.some((c) => c.kind === 'goon' && !c.dead);
  else if (st.target) {
    const d = Math.hypot(st.target.x - p.x, st.target.z - p.z);
    done = d < RADIUS && (!st.needCar || !!p.inCar) && (!st.requireClear || game.wanted.stars === 0);
  }
  if (!done) return;
  play('pickup');
  m.stage++;
  if (st.onEnter) st.onEnter(game, m);
  if (m.stage >= m.def.stages.length) completeMission(game);
  else m.d0 = Math.max(30, stageDistance(game, stageOf(m)));
}

// Everything the HUD, minimap and world need: objective text, stage x/y, progress, waypoint and markers.
export function getObjective(game) {
  const ms = game.mission, markers = [];
  if (ms.active) {
    const m = ms.active, st = stageOf(m), n = m.def.stages.length;
    const text = resolveText(game, st.text);
    let target = st.target || null, frac = 0;
    if (st.kind === 'kill') {
      const alive = game.cops.filter((c) => c.kind === 'goon' && !c.dead);
      if (alive.length) target = { x: alive[0].x, z: alive[0].z };
      frac = 1 - alive.length / (m.data.total || 6);
    } else if (st.kind === 'clear') frac = Math.min(1, 1 - game.wanted.stars / 5 + (game.wanted.cool / 18) * 0.2);
    else if (target) frac = Math.max(0, Math.min(0.98, 1 - stageDistance(game, st) / m.d0));
    if (target) markers.push({ x: target.x, z: target.z, color: '#ffd23f', label: m.def.title });
    if (ms.npc) markers.push({ x: ms.npc.x, z: ms.npc.z, color: '#ff7ac8', label: 'Lola' });
    return { text, title: m.def.title, chapter: m.def.chapter, target, markers, active: true, stage: m.stage + 1, stages: n, progress: (m.stage + frac) / n };
  }
  const def = currentDefinition(game);
  if (def) {
    markers.push({ x: def.start.x, z: def.start.z, color: '#5ee08a', label: def.title, start: true });
    return { text: `Go to the green marker: ${def.title}`, title: null, chapter: def.chapter, target: def.start, markers, active: false, stage: 0, stages: def.stages.length, progress: 0 };
  }
  return { text: 'Story complete - enjoy free roam in Solmar Bay', title: null, chapter: 4, target: null, markers, active: false, stage: 0, stages: 0, progress: 1 };
}

// Restore story progress from a save.
export function restoreMissionProgress(game, index) {
  const ms = game.mission;
  ms.index = Math.min(index, MISSIONS.length);
  ms.completed = ms.index;
  ms.storyComplete = ms.index >= MISSIONS.length;
  ms.active = null;
}
void THREE;
