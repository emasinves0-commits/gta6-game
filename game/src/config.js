// Tuning constants for Solmar Bay: city dimensions, speeds, wanted rules and colours.

export const GAME_TITLE = 'SOLMAR BAY';
export const GAME_SUBTITLE = 'A Tide of Trouble';

// City grid: COLS x ROWS blocks separated by roads of width ROAD_W.
export const COLS = 9;
export const ROWS = 8;
export const BLOCK = 190;
export const ROAD_W = 64;
export const PITCH = BLOCK + ROAD_W;
export const SIDEWALK = 14;
export const BEACH_H = 330;
export const WORLD_W = COLS * PITCH + ROAD_W;
export const ROADS_H = ROWS * PITCH + ROAD_W;
export const WORLD_H = ROADS_H + BEACH_H;
export const WATER_Y = ROADS_H + 150;
export const LANE_OFFSET = 14;

// Player on foot
export const WALK_SPEED = 125;
export const SPRINT_SPEED = 215;
export const PLAYER_RADIUS = 6;
export const PLAYER_MAX_HP = 100;
export const PISTOL_MAG = 12;
export const PISTOL_DAMAGE = 34;
export const FIRE_DELAY = 0.22;
export const RELOAD_TIME = 1.1;
export const BULLET_SPEED = 900;
export const MELEE_DAMAGE = 26;
export const MELEE_RANGE = 34;

// Traffic, peds, police
export const TRAFFIC_COUNT = 22;
export const PARKED_COUNT = 34;
export const PED_COUNT = 46;
export const SPAWN_RING_MIN = 620;
export const SPAWN_RING_MAX = 1000;
export const DESPAWN_DIST = 1250;

// Wanted level rules
export const MAX_STARS = 5;
export const COOLDOWN_BASE = 9;
export const COOLDOWN_PER_STAR = 3;
export const SIGHT_RANGE = 380;
export const COPS_PER_STAR = [0, 1, 2, 3, 4, 5];
export const BUST_TIME = 1.7;
export const CRIME_REWARD_CASH = 40;
export const BUSTED_FINE = 0.12;
export const WASTED_FINE = 0.08;

// Time of day: one real second is this many in-game minutes
export const CLOCK_SPEED = 0.5;
export const START_HOUR = 9.5;

export const BUILDING_PALETTE = [
  ['#e8c9a0', '#c46f4b'], ['#f2e3c4', '#d9825b'], ['#9fc7c9', '#5f8f9a'],
  ['#e6a9a0', '#a64b4b'], ['#d7d2c0', '#8a8f9b'], ['#f0d78c', '#c79a3e'],
  ['#b9cdea', '#5d79b0'], ['#c8e0b4', '#6a9a5f'], ['#e7b8d5', '#a8628f'],
  ['#ffffff', '#9aa5ad'],
];

export const STORAGE_KEY = 'solmar-bay-save-v1';
