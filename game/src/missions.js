// The four-mission story arc of Jax Merrin in Solmar Bay: start triggers, objectives, waypoints, success/fail.
import { nodePosition, pointSolid } from './city.js';
import { createCar } from './vehicles.js';
import { setWanted, createCop } from './police.js';
import { play } from './audio.js';

const RADIUS = 44;
const at = (i, j) => nodePosition(i, j);

// Each stage: text (string or fn), target {i,j}, kind 'reach' | 'clear' | 'kill', needCar, requireClear, onEnter, failIf.
const MISSIONS = [
  {
    id: 'first-job', title: 'First Job', reward: 400, start: at(3, 3), giver: 'Lola',
    briefing: ['Lola: Jax! Out of the can and already late. I need a ride across Solmar Bay.', 'Lola: Grab any car and pick me up at the Sunrise Diner.'],
    onStart(game, m) {
      const spot = at(3, 3);
      const car = createCar('sedan', spot.x - 36, spot.y + 82, Math.PI / 2, { missionCar: true, color: '#e8b84a' });
      game.cars.push(car);
      m.data.npc = { ...at(1, 4) };
      game.mission.npc = m.data.npc;
    },
    stages: [
      { target: at(1, 4), needCar: true, text: (g) => (g.player.inCar ? 'Pick up Lola at the Sunrise Diner' : 'Get a car (E) and pick up Lola'),
        onEnter(game, m) { say(game, 'Lola', 'Finally. Palm Tower, east side. No scenic route.'); game.mission.npc = null; m.data.car = game.player.inCar; } },
      { target: at(7, 5), needCar: true, text: (g) => (g.player.inCar ? 'Drive Lola to Palm Tower' : 'Get back in the car - Lola is waiting'),
        failIf: (g, m) => {
          if (m.data.car && m.data.car.wrecked) return 'The car was destroyed';
          if (g.player.inCar === m.data.car) { m.data.outSince = null; return null; }
          if (m.data.outSince == null) m.data.outSince = g.time;
          return g.time - m.data.outSince > 6 ? 'You abandoned Lola\'s car' : null;
        },
        onEnter(game) { say(game, 'Lola', 'Not bad, Jax. Ostrander wants to meet you. Find Mina at her garage.'); } },
    ],
  },
  {
    id: 'the-pickup', title: 'The Pickup', reward: 900, start: at(6, 6), giver: 'Mina',
    briefing: ['Mina: Ostrander keeps a box at the old cannery. Bring it to Dock 9.', 'Mina: The alarm trips when you lift it. Expect company.'],
    stages: [
      { target: at(1, 1), text: 'Collect the package at the Old Cannery',
        onEnter(game) { setWanted(game, 2); say(game, 'Mina', 'Alarm just went off - cops are rolling! Lose them before you deliver.'); } },
      { target: at(8, 7), requireClear: true, text: (g) => (g.wanted.stars > 0 ? 'Lose the cops, then deliver the package' : 'Deliver the package to Dock 9'),
        onEnter(game) { say(game, 'Mina', 'Ostrander will be pleased. Maybe.'); } },
    ],
  },
  {
    id: 'the-getaway', title: 'The Getaway', reward: 1500, start: at(7, 7), giver: 'Lola',
    briefing: ['Lola: Ostrander sold you out! The police know your face.', 'Lola: Take the Vesper, lose the heat and reach the safehouse.'],
    onStart(game) {
      const s = at(7, 7);
      game.cars.push(createCar('sports', s.x + 40, s.y - 4, 0, { missionCar: true, color: '#e0342b' }));
      setWanted(game, 3);
    },
    stages: [
      { kind: 'clear', text: 'Lose the cops (break line of sight)', onEnter() {} },
      { target: at(0, 3), text: 'Reach the safehouse', onEnter(game) { say(game, 'Lola', 'Clean. Get some rest. Tomorrow we hit his vault.'); } },
    ],
  },
  {
    id: 'the-big-score', title: 'The Big Score', reward: 5000, start: at(1, 3), giver: 'Lola',
    briefing: ['Lola: Bayfront Bank vault. Ostrander\'s whole fortune.', 'Lola: His guards are already waiting. Shoot your way in, grab the cash, run.'],
    stages: [
      { target: at(8, 1), needCar: false, text: 'Drive to Bayfront Bank',
        onEnter(game, m) { spawnGuards(game, at(8, 1)); m.data.total = 6; say(game, 'Lola', 'Guards everywhere. Clear them out, Jax!'); } },
      { kind: 'kill', text: (g) => `Eliminate the guards (${g.cops.filter((c) => c.kind === 'goon' && !c.dead).length} left)`, onEnter() {} },
      { target: at(8, 1), text: 'Grab the cash from the vault',
        onEnter(game) { setWanted(game, 4); say(game, 'Lola', 'Alarms! Four stars - get to Pier 5, my boat is waiting!'); } },
      { kind: 'clear', text: 'Lose the police', onEnter() {} },
      { target: at(5, 8), text: 'Reach Pier 5', onEnter(game) { say(game, 'Lola', 'Jax Merrin, king of Solmar Bay. Drinks are on you.'); } },
    ],
  },
];

export const MISSION_COUNT = MISSIONS.length;

function spawnGuards(game, center) {
  let placed = 0, tries = 0;
  while (placed < 6 && tries++ < 80) {
    const a = game.rng.range(0, Math.PI * 2), d = game.rng.range(60, 170);
    const x = center.x + Math.cos(a) * d, y = center.y + Math.sin(a) * d;
    if (pointSolid(game.city, x, y)) continue;
    const goon = createCop(game, x, y, 'goon');
    game.cops.push(goon);
    placed++;
  }
}

// Staging helper: jump straight into a mission (screenshots and tests).
export function forceStartMission(game, index) {
  game.mission.index = index;
  startMission(game);
}

// Show a speech box under the HUD for ~6 seconds; hud.js renders game.dialog.
export function say(game, speaker, text) {
  game.dialog = { speaker, text, t: 6 };
}

export function createMissionState() {
  return { index: 0, active: null, completed: 0, banner: null, npc: null, storyComplete: false, armed: true };
}

export function currentDefinition(game) { return MISSIONS[game.mission.index] || null; }

function stageOf(m) { return m.def.stages[m.stage]; }

function resolveText(game, text) { return typeof text === 'function' ? text(game) : text; }

function startMission(game) {
  const def = MISSIONS[game.mission.index];
  const m = { def, stage: 0, data: {} };
  game.mission.active = m;
  game.mission.banner = { title: def.title.toUpperCase(), sub: 'MISSION', t: 3.2, kind: 'start' };
  play('click');
  if (def.onStart) def.onStart(game, m);
  say(game, def.briefing[0].split(':')[0], def.briefing.map((b) => b.split(': ').slice(1).join(': ')).join(' '));
}

export function failMission(game, reason) {
  const ms = game.mission;
  if (!ms.active) return;
  ms.banner = { title: 'MISSION FAILED', sub: reason, t: 3.5, kind: 'fail' };
  ms.active = null; ms.npc = null; ms.armed = false;
  game.cops = game.cops.filter((c) => c.kind !== 'goon');
  play('fail');
}

function completeMission(game) {
  const ms = game.mission, def = ms.active.def;
  game.money += def.reward;
  ms.banner = { title: 'MISSION PASSED', sub: `${def.title}  +$${def.reward}`, t: 4.2, kind: 'pass' };
  ms.active = null; ms.completed++; ms.index++; ms.armed = false; ms.npc = null;
  if (ms.index >= MISSIONS.length) {
    ms.storyComplete = true;
    ms.banner = { title: 'STORY COMPLETE', sub: `${def.title}  +$${def.reward}  - free roam continues`, t: 6, kind: 'pass' };
  }
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
    const d = Math.hypot(def.start.x - p.x, def.start.y - p.y);
    if (!ms.armed && d > 140) ms.armed = true;
    if (ms.armed && d < RADIUS) startMission(game);
    return;
  }
  const m = ms.active, st = stageOf(m);
  const fail = st.failIf && st.failIf(game, m);
  if (fail) { failMission(game, fail); return; }
  let done = false;
  if (st.kind === 'clear') done = game.wanted.stars === 0;
  else if (st.kind === 'kill') done = !game.cops.some((c) => c.kind === 'goon' && !c.dead);
  else if (st.target) {
    const d = Math.hypot(st.target.x - p.x, st.target.y - p.y);
    done = d < RADIUS && (!st.needCar || !!p.inCar) && (!st.requireClear || game.wanted.stars === 0);
  }
  if (!done) return;
  play('pickup');
  m.stage++;
  if (st.onEnter) st.onEnter(game, m);
  if (m.stage >= m.def.stages.length) completeMission(game);
}

// Everything the HUD, minimap and world renderer need: objective text, waypoint and markers.
export function getObjective(game) {
  const ms = game.mission, markers = [];
  if (ms.active) {
    const st = stageOf(ms.active);
    const text = resolveText(game, st.text);
    let target = st.target || null;
    if (st.kind === 'kill') {
      const goon = game.cops.find((c) => c.kind === 'goon' && !c.dead);
      if (goon) target = { x: goon.x, y: goon.y };
    }
    if (st.kind === 'clear') target = null;
    if (target) markers.push({ x: target.x, y: target.y, color: '#ffd23f', label: ms.active.def.title });
    return { text, title: ms.active.def.title, target, markers, active: true, step: `${ms.active.stage + 1}/${ms.active.def.stages.length}` };
  }
  const def = currentDefinition(game);
  if (def) {
    markers.push({ x: def.start.x, y: def.start.y, color: '#5ee08a', label: def.title, start: true });
    return { text: `Go to the green marker: ${def.title}`, title: null, target: def.start, markers, active: false };
  }
  return { text: 'Story complete - enjoy free roam in Solmar Bay', title: null, target: null, markers, active: false };
}

// Restore story progress from a save.
export function restoreMissionProgress(game, index) {
  const ms = game.mission;
  ms.index = Math.min(index, MISSIONS.length);
  ms.completed = ms.index;
  ms.storyComplete = ms.index >= MISSIONS.length;
  ms.active = null;
}
