// localStorage save/load: story progress, money, clock and the player's position.
import { STORAGE_KEY } from './config.js';

export function hasSave() {
  try { return !!localStorage.getItem(STORAGE_KEY); } catch (e) { return false; }
}

export function saveGame(game) {
  const data = {
    version: 1, money: Math.floor(game.money), missionIndex: game.mission.index, clock: game.clock,
    x: game.player.x, y: game.player.y, reserve: game.player.reserve, savedAt: Date.now(),
  };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); return true; } catch (e) { return false; }
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    return data;
  } catch (e) { return null; }
}

export function applySave(game, data, restoreMissionProgress) {
  game.money = data.money; game.clock = data.clock;
  game.player.x = data.x; game.player.y = data.y; game.player.reserve = data.reserve ?? 48;
  game.camera.x = data.x; game.camera.y = data.y;
  restoreMissionProgress(game, data.missionIndex);
}
