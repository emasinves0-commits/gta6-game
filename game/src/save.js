// localStorage persistence: cash, story progress, position, progression and collectibles.
import { STORAGE_KEY } from './config.js';

export function hasSave() {
  try { return !!localStorage.getItem(STORAGE_KEY); } catch { return false; }
}

export function writeSave(game) {
  const p = game.player;
  const data = {
    v: 1,
    money: Math.round(game.money), rp: game.rp, rep: game.rep, missionIndex: game.mission.index,
    x: p.inCar ? p.inCar.x : p.x, z: p.inCar ? p.inCar.z : p.z, heading: p.heading,
    crabs: game.crabs.map((c) => (c.got ? 1 : 0)), stats: game.stats,
    owned: p.owned, mag: p.mag, reserve: p.reserve, hp: Math.round(p.hp),
  };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); return true; } catch { return false; }
}

export function readSave() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const d = raw ? JSON.parse(raw) : null;
    return d && d.v === 1 ? d : null;
  } catch { return null; }
}

export function clearSave() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* storage unavailable */ }
}
