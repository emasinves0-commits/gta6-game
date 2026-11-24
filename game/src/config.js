// Tuning constants for Solmar Bay 3D: city dimensions (metres), speeds, wanted rules, palette.
export const GAME_TITLE = 'SOLMAR BAY';
export const GAME_SUBTITLE = 'A Tide of Trouble';
export const STORAGE_KEY = 'solmar-bay-3d-save-v1';

// City grid: COLS x ROWS blocks separated by roads of width ROAD_W (all in metres).
export const COLS = 8;
export const ROWS = 7;
export const BLOCK = 56;
export const ROAD_W = 18;
export const PITCH = BLOCK + ROAD_W;
export const SIDEWALK = 3;
export const WORLD_W = COLS * PITCH + ROAD_W;
export const ROADS_H = ROWS * PITCH + ROAD_W;
export const BEACH_D = 70; // sand depth south of the last road
export const WORLD_H = ROADS_H + BEACH_D; // last walkable z
export const LANE = 4.6; // lane centre offset from road centre

// Player on foot
export const WALK_SPEED = 4.2;
export const SPRINT_SPEED = 7.4;
export const PLAYER_RADIUS = 0.45;
export const PLAYER_MAX_HP = 100;
export const MELEE_DAMAGE = 24;
export const MELEE_RANGE = 2.1;

// Weapons: slot 1 fists, 2 pistol, 3 SMG, 4 shotgun
export const WEAPONS = [
  { id: 'fists', name: 'FISTS', mag: 0, damage: MELEE_DAMAGE, delay: 0.45, range: MELEE_RANGE, pellets: 1, spread: 0, reload: 0 },
  { id: 'pistol', name: 'PISTOL', mag: 12, damage: 34, delay: 0.24, range: 70, pellets: 1, spread: 0.02, reload: 1.1 },
  { id: 'smg', name: 'SMG', mag: 30, damage: 15, delay: 0.085, range: 60, pellets: 1, spread: 0.06, reload: 1.5 },
  { id: 'shotgun', name: 'SHOTGUN', mag: 6, damage: 14, delay: 0.8, range: 28, pellets: 7, spread: 0.12, reload: 1.9 },
];

// Population
export const TRAFFIC_COUNT = 26;
export const PED_COUNT = 44;
export const SPAWN_RING_MIN = 110;
export const SPAWN_RING_MAX = 230;
export const DESPAWN_DIST = 300;

// Wanted level rules
export const MAX_STARS = 5;
export const COOLDOWN_BASE = 8;
export const COOLDOWN_PER_STAR = 2.5;
export const SIGHT_RANGE = 85;
export const HELI_SIGHT = 120;
export const CRUISERS_PER_STAR = [0, 1, 2, 3, 4, 4];
export const BUST_TIME = 1.8;
export const BUSTED_FINE = 0.12;
export const WASTED_FINE = 0.08;

export const START_HOUR = 18.3; // golden hour
export const CLOCK_SPEED = 0.12; // in-game minutes per real second
export const RANKS = [0, 150, 400, 800, 1400, 2200, 3200, 4600, 6400, 9000];

export const BUILDING_PALETTE = [
  0xf0d2a8, 0xf5b894, 0xe9a0a0, 0xc8d8c4, 0xa9d0d4, 0xf2e6c8, 0xd9b5d9, 0xf4d38a, 0xb7c7e8, 0xeadfd2,
];
export const DISTRICTS = ['Marina Row', 'City Park', 'The Strand', 'Harbor Heights', 'Central Plaza', 'Downtown'];
