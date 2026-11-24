// Run statistics plus the progression systems: rank + RP, and per-district standing (reputation).
import { RANKS, DISTRICTS } from './config.js';
import { districtAt } from './city.js';

export const RANK_TITLES = ['Fresh Out', 'Street Rat', 'Hustler', 'Wheelman', 'Fixer', 'Crew Boss', 'Underboss', 'Kingpin', 'Legend', 'Solmar Royalty'];
export const STANDING_TITLES = ['Unknown', 'Familiar Face', 'Known', 'Respected', 'Feared'];

export function createStats() { return { kills: 0, copKills: 0, wantedMax: 0, crabs: 0, races: 0, distance: 0 }; }

export function setPlayerKillsStat(game) { if (game.wanted.stars > game.stats.wantedMax) game.stats.wantedMax = game.wanted.stars; }

export function createRep() { return Object.fromEntries(DISTRICTS.map((d) => [d, 0])); }

// Rank, progress inside the rank and the title for a given RP total.
export function rankInfo(rp) {
  let r = 0;
  while (r < RANKS.length - 1 && rp >= RANKS[r + 1]) r++;
  const lo = RANKS[r], hi = r < RANKS.length - 1 ? RANKS[r + 1] : lo;
  return { rank: r + 1, lo, hi, frac: hi > lo ? (rp - lo) / (hi - lo) : 1, title: RANK_TITLES[r] };
}

export function addRP(game, amount) {
  const before = rankInfo(game.rp).rank;
  game.rp += amount;
  const after = rankInfo(game.rp);
  if (after.rank > before) game.banner('RANK UP', `RANK ${after.rank} - ${after.title.toUpperCase()}`, 'pass');
}

export function addRep(game, amount) {
  const d = districtAt(game.player.x, game.player.z);
  game.rep[d] = Math.min(100, (game.rep[d] || 0) + amount);
}

export function standingOf(game, district) {
  const v = game.rep[district] || 0;
  return { value: v, title: STANDING_TITLES[Math.min(STANDING_TITLES.length - 1, Math.floor(v / 25))] };
}
