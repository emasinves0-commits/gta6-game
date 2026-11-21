// City generation for Solmar Bay: road grid, blocks, buildings, park, beach, trees, and collision queries.
import { COLS, ROWS, BLOCK, ROAD_W, PITCH, SIDEWALK, WORLD_W, WORLD_H, WATER_Y, ROADS_H, BUILDING_PALETTE } from './config.js';
import { createRng } from './random.js';

const CELL = 128;

export function roadCenterX(i) { return i * PITCH + ROAD_W / 2; }
export function roadCenterY(j) { return j * PITCH + ROAD_W / 2; }
export function nodePosition(i, j) { return { x: roadCenterX(i), y: roadCenterY(j) }; }

export function createCity(seed) {
  const rng = createRng(seed * 7919 + 11);
  const city = {
    width: WORLD_W, height: WORLD_H, waterY: WATER_Y, blocks: [], buildings: [], trees: [], decor: [],
    solids: [], buckets: new Map(), landmarks: {}, parkBlock: null,
  };
  const special = { '4,3': 'park', '2,1': 'hospital', '6,2': 'police', '7,5': 'lot', '1,5': 'lot', '4,6': 'lot', '2,3': 'plaza' };

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const block = { c, r, x: c * PITCH + ROAD_W, y: r * PITCH + ROAD_W, w: BLOCK, h: BLOCK, kind: special[`${c},${r}`] || 'buildings' };
      city.blocks.push(block);
      if (block.kind === 'park') { city.parkBlock = block; addParkTrees(city, block, rng); continue; }
      if (block.kind === 'lot' || block.kind === 'plaza') { addStreetTrees(city, block, rng); continue; }
      if (block.kind === 'hospital' || block.kind === 'police') {
        const b = addBuilding(city, block.x + SIDEWALK + 10, block.y + SIDEWALK + 20, BLOCK - 2 * SIDEWALK - 20, BLOCK - 2 * SIDEWALK - 40,
          block.kind === 'hospital' ? ['#f4f6f8', '#c9d4dc'] : ['#7a94c4', '#32487a'], 16, rng);
        b.label = block.kind;
        addStreetTrees(city, block, rng);
        continue;
      }
      subdivideBlock(city, block, rng);
      addStreetTrees(city, block, rng);
    }
  }

  // Waterfront: sand strip below the shore road, then impassable sea.
  city.solids.push({ x: -200, y: WATER_Y, w: WORLD_W + 400, h: 800, water: true });
  for (let i = 0; i < 26; i++) {
    city.trees.push({ x: rng.range(30, WORLD_W - 30), y: rng.range(ROADS_H + 30, WATER_Y - 30), r: 15, palm: true });
  }
  for (let i = 0; i < 18; i++) {
    city.decor.push({ kind: 'umbrella', x: rng.range(60, WORLD_W - 60), y: rng.range(ROADS_H + 50, WATER_Y - 30), color: rng.pick(['#e8574a', '#f2c744', '#3fa9c9', '#ffffff']) });
  }
  // Boundary walls so nothing leaves the map.
  city.solids.push({ x: -100, y: -100, w: 100, h: WORLD_H + 300 }, { x: WORLD_W, y: -100, w: 100, h: WORLD_H + 300 },
    { x: -100, y: -100, w: WORLD_W + 200, h: 100 });

  const hos = blockAt(city, 2, 1), pol = blockAt(city, 6, 2), park = city.parkBlock;
  city.landmarks = {
    hospital: { x: hos.x + 7, y: hos.y + BLOCK / 2 },
    police: { x: pol.x + 7, y: pol.y + BLOCK / 2 },
    park: { x: park.x + BLOCK / 2, y: park.y + BLOCK / 2 },
    start: { x: blockAt(city, 3, 3).x + 7, y: blockAt(city, 3, 3).y + 40 },
  };
  for (const s of city.solids) insertSolid(city, s);
  return city;
}

export function blockAt(city, c, r) { return city.blocks[r * COLS + c]; }

// Named districts: each is anchored on a block (col,row); the label is the nearest anchor, with the beach strip as The Strand.
const DISTRICTS = [
  { name: 'Old Cannery', c: 1, r: 1 }, { name: 'Solmar General', c: 2, r: 1 }, { name: 'Dock 9', c: 7, r: 0 },
  { name: 'Marina Row', c: 7, r: 5 }, { name: 'Central Plaza', c: 2, r: 3 }, { name: 'City Park', c: 4, r: 4 },
  { name: 'Precinct Hill', c: 6, r: 2 }, { name: 'Palm Avenue', c: 1, r: 5 }, { name: 'Harbor Heights', c: 4, r: 1 },
  { name: 'Coral Flats', c: 4, r: 6 },
];
export function districtAt(x, y) {
  if (y > ROADS_H) return 'The Strand';
  let best = DISTRICTS[0].name, bestD = Infinity;
  for (const d of DISTRICTS) {
    const dx = x - (d.c * PITCH + ROAD_W + BLOCK / 2), dy = y - (d.r * PITCH + ROAD_W + BLOCK / 2), dd = dx * dx + dy * dy;
    if (dd < bestD) { bestD = dd; best = d.name; }
  }
  return best;
}

function addBuilding(city, x, y, w, h, palette, height, rng) {
  const b = { x, y, w, h, wall: palette[0], roof: palette[1], height, decor: [] };
  const n = rng.int(0, 3);
  for (let i = 0; i < n && w > 30 && h > 30; i++) {
    b.decor.push({ x: rng.range(6, w - 22), y: rng.range(6, h - 18), w: rng.range(10, 18), h: rng.range(8, 14) });
  }
  city.buildings.push(b);
  city.solids.push(b);
  return b;
}

function subdivideBlock(city, block, rng) {
  const inner = BLOCK - 2 * SIDEWALK, gap = 8;
  const x0 = block.x + SIDEWALK, y0 = block.y + SIDEWALK;
  const cols = rng.int(1, 3), rows = rng.int(1, 2);
  const cw = (inner - gap * (cols - 1)) / cols, rh = (inner - gap * (rows - 1)) / rows;
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const pal = rng.pick(BUILDING_PALETTE);
      addBuilding(city, x0 + cx * (cw + gap), y0 + cy * (rh + gap), cw, rh, pal, rng.int(8, 18), rng);
    }
  }
}

function addStreetTrees(city, block, rng) {
  const corners = [[8, 8], [BLOCK - 8, 8], [8, BLOCK - 8], [BLOCK - 8, BLOCK - 8]];
  for (const [dx, dy] of corners) if (rng.chance(0.55)) city.trees.push({ x: block.x + dx, y: block.y + dy, r: 11 });
}

function addParkTrees(city, block, rng) {
  for (let i = 0; i < 22; i++) city.trees.push({ x: block.x + rng.range(16, BLOCK - 16), y: block.y + rng.range(16, BLOCK - 16), r: rng.range(12, 19) });
  city.decor.push({ kind: 'pond', x: block.x + BLOCK * 0.68, y: block.y + BLOCK * 0.66, rx: 34, ry: 22 });
}

function insertSolid(city, rect) {
  const x0 = Math.floor(rect.x / CELL), x1 = Math.floor((rect.x + rect.w) / CELL);
  const y0 = Math.floor(rect.y / CELL), y1 = Math.floor((rect.y + rect.h) / CELL);
  for (let cy = Math.max(-1, y0); cy <= Math.min(y1, 40); cy++) {
    for (let cx = Math.max(-1, x0); cx <= Math.min(x1, 40); cx++) {
      const key = cx * 100 + cy;
      let list = city.buckets.get(key);
      if (!list) { list = []; city.buckets.set(key, list); }
      list.push(rect);
    }
  }
}

function nearbySolids(city, x, y, r) {
  const out = [];
  const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL);
  const y0 = Math.floor((y - r) / CELL), y1 = Math.floor((y + r) / CELL);
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
    const list = city.buckets.get(cx * 100 + cy);
    if (list) for (const s of list) if (!out.includes(s)) out.push(s);
  }
  return out;
}

// Pushes a circle out of every solid. Returns {x, y, hit, nx, ny} with the strongest contact normal.
export function resolveCircle(city, x, y, r) {
  let hit = false, nx = 0, ny = 0, best = 0;
  for (const s of nearbySolids(city, x, y, r)) {
    const px = Math.max(s.x, Math.min(x, s.x + s.w)), py = Math.max(s.y, Math.min(y, s.y + s.h));
    let dx = x - px, dy = y - py;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    let depth;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2); dx /= d; dy /= d; depth = r - d;
    } else {
      const left = x - s.x, right = s.x + s.w - x, top = y - s.y, bottom = s.y + s.h - y;
      const m = Math.min(left, right, top, bottom);
      if (m === left) { dx = -1; dy = 0; } else if (m === right) { dx = 1; dy = 0; } else if (m === top) { dx = 0; dy = -1; } else { dx = 0; dy = 1; }
      depth = r + m;
    }
    x += dx * depth; y += dy * depth;
    hit = true;
    if (depth > best) { best = depth; nx = dx; ny = dy; }
  }
  return { x, y, hit, nx, ny, depth: best };
}

export function pointSolid(city, x, y) {
  for (const s of nearbySolids(city, x, y, 1)) if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) return true;
  return false;
}

export function lineBlocked(city, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, steps = Math.ceil(Math.hypot(dx, dy) / 14);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    for (const s of nearbySolids(city, x1 + dx * t, y1 + dy * t, 1)) {
      if (s.water) continue;
      const px = x1 + dx * t, py = y1 + dy * t;
      if (px >= s.x && px <= s.x + s.w && py >= s.y && py <= s.y + s.h) return true;
    }
  }
  return false;
}

// True when the point lies on the paved road surface (not on a sidewalk, building or beach).
export function onRoad(x, y) {
  if (y > ROADS_H || x < 0 || x > WORLD_W || y < 0) return false;
  const mx = ((x % PITCH) + PITCH) % PITCH, my = ((y % PITCH) + PITCH) % PITCH;
  return mx < ROAD_W || my < ROAD_W;
}

export function nearestNode(x, y) {
  const i = Math.max(0, Math.min(COLS, Math.round((x - ROAD_W / 2) / PITCH)));
  const j = Math.max(0, Math.min(ROWS, Math.round((y - ROAD_W / 2) / PITCH)));
  return { i, j };
}

// Random point on a sidewalk ring around a random block (used for pedestrians and pickups).
export function randomSidewalkPoint(city, rng) {
  const b = rng.pick(city.blocks);
  const edge = rng.int(0, 3), t = rng.range(10, BLOCK - 10), o = SIDEWALK * 0.5;
  if (edge === 0) return { x: b.x + t, y: b.y + o };
  if (edge === 1) return { x: b.x + t, y: b.y + BLOCK - o };
  if (edge === 2) return { x: b.x + o, y: b.y + t };
  return { x: b.x + BLOCK - o, y: b.y + t };
}

export function walkableForPed(city, x, y, anywhere = false) {
  if (y > WATER_Y - 6 || x < 4 || x > WORLD_W - 4 || y < 4) return false;
  if (pointSolid(city, x, y)) return false;
  if (anywhere || y > ROADS_H) return true;
  return !onRoad(x, y);
}
