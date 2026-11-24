// City layout data and collision queries for Solmar Bay: road grid, blocks, districts, solids, parking, sidewalks.
import { COLS, ROWS, BLOCK, ROAD_W, PITCH, WORLD_W, ROADS_H, WORLD_H, BUILDING_PALETTE } from './config.js';

export const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // E, S, W, N  (x east, z south)
const CELL = 24;

export const nodePos = (i, j) => ({ x: i * PITCH + ROAD_W / 2, z: j * PITCH + ROAD_W / 2 });
export function blockRect(i, j) {
  const x0 = i * PITCH + ROAD_W, z0 = j * PITCH + ROAD_W;
  return { x0, z0, x1: x0 + BLOCK, z1: z0 + BLOCK };
}
export const nodeValid = (i, j) => i >= 0 && j >= 0 && i <= COLS && j <= ROWS;
export function nearestNode(x, z) {
  return { i: Math.max(0, Math.min(COLS, Math.round((x - ROAD_W / 2) / PITCH))), j: Math.max(0, Math.min(ROWS, Math.round((z - ROAD_W / 2) / PITCH))) };
}

export function districtOfBlock(i, j) {
  if (j >= 6) return i <= 2 ? 'Marina Row' : 'The Strand';
  if (i >= 6) return 'Harbor Heights';
  if (i <= 2) return j <= 3 ? 'City Park' : 'Marina Row';
  return j <= 2 ? 'Downtown' : 'Central Plaza';
}
export function districtAt(x, z) {
  const i = Math.max(0, Math.min(COLS - 1, Math.floor(x / PITCH)));
  const j = Math.max(0, Math.min(ROWS - 1, Math.floor(z / PITCH)));
  return districtOfBlock(i, j);
}
export function blockAt(x, z) { return { i: Math.floor((x - ROAD_W) / PITCH + 0.0001 * 0), j: Math.floor((z - ROAD_W) / PITCH) }; }

export function onRoad(x, z) {
  if (x < 0 || x > WORLD_W || z < 0 || z > ROADS_H) return false;
  const fx = x % PITCH, fz = z % PITCH;
  return fx < ROAD_W || fz < ROAD_W;
}

function addSolid(city, s) {
  const x0 = (s.x0 ?? s.x - s.r), x1 = (s.x1 ?? s.x + s.r), z0 = (s.z0 ?? s.z - s.r), z1 = (s.z1 ?? s.z + s.r);
  for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) {
    for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
      const k = cx * 4096 + cz;
      (city.grid.get(k) || city.grid.set(k, []).get(k)).push(s);
    }
  }
}

export function buildCity(rng) {
  const city = { grid: new Map(), blocks: [], palms: [], parkLots: [], curbSpots: [], lamps: [], solids: [] };
  const push = (s) => { city.solids.push(s); addSolid(city, s); };
  city.addSolid = push;
  for (let i = 0; i < COLS; i++) {
    for (let j = 0; j < ROWS; j++) {
      const r = blockRect(i, j);
      const district = districtOfBlock(i, j);
      const block = { i, j, district, rect: r, lots: [], kind: 'bld' };
      if ((i === 1 && j === 1) || (i === 2 && j === 1) || (i === 1 && j === 2)) block.kind = 'park';
      else if (i === 4 && j === 3) block.kind = 'plaza';
      else if (j < 6 && district !== 'Downtown' && rng.chance(0.13)) block.kind = 'lot';
      city.blocks.push(block);
      const inset = 4.2;
      if (block.kind === 'bld') {
        const hRange = district === 'Downtown' ? [26, 74] : district === 'Harbor Heights' ? [10, 26] : district === 'The Strand' ? [6, 13] : [8, 22];
        const layout = district === 'Downtown' ? rng.pick(['A', 'C', 'C']) : rng.pick(['A', 'B', 'B', 'C']);
        const rects = [];
        const x0 = r.x0 + inset, x1 = r.x1 - inset, z0 = r.z0 + inset, z1 = r.z1 - inset, mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, g = 2.2;
        if (layout === 'A') rects.push([x0, z0, x1, z1]);
        else if (layout === 'B') {
          const sp = rng.range(-6, 6);
          if (rng.chance(0.5)) rects.push([x0, z0, mx + sp - g, z1], [mx + sp + g, z0, x1, z1]);
          else rects.push([x0, z0, x1, mz + sp - g], [x0, mz + sp + g, x1, z1]);
        } else rects.push([x0, z0, mx - g, mz - g], [mx + g, z0, x1, mz - g], [x0, mz + g, mx - g, z1], [mx + g, mz + g, x1, z1]);
        for (const q of rects) {
          const h = rng.range(hRange[0], hRange[1]) * (rects.length === 4 ? 0.8 : 1);
          const lot = { x0: q[0], z0: q[1], x1: q[2], z1: q[3], h, color: rng.pick(BUILDING_PALETTE), tier: h > 38, ac: rng.int(1, 3) };
          block.lots.push(lot);
          push({ x0: lot.x0, z0: lot.z0, x1: lot.x1, z1: lot.z1, h });
        }
      } else if (block.kind === 'plaza') {
        push({ x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2, r: 5, h: 1.4 });
      } else if (block.kind === 'lot') {
        const lot = { x0: r.x0 + 4, z0: r.z0 + 4, x1: r.x1 - 4, z1: r.z1 - 4 };
        city.parkLots.push({ block, ...lot, spots: [] });
        const L = city.parkLots[city.parkLots.length - 1];
        for (let k = 0; k < 6; k++) for (const row of [0, 1]) {
          if (rng.chance(0.55)) L.spots.push({ x: lot.x0 + 5 + k * 8, z: row ? lot.z1 - 7 : lot.z0 + 7, h: Math.PI / 2 * (row ? 0 : 2) });
        }
      }
      // palms along the sidewalks (and some trees inside the park)
      const step = 13;
      const sides = [[r.x0, r.z0, 1, 0, 0.0, 1.5], [r.x0, r.z1, 1, 0, 0, -1.5], [r.x0, r.z0, 0, 1, 1.5, 0], [r.x1, r.z0, 0, 1, -1.5, 0]];
      for (const [sx, sz, dx, dz, ox, oz] of sides) {
        for (let t = 8; t < BLOCK - 4; t += step) {
          if (!rng.chance(district === 'The Strand' || district === 'Marina Row' ? 0.85 : 0.5)) continue;
          const p = { x: sx + dx * t + ox, z: sz + dz * t + oz, h: rng.range(5.5, 8.5), lean: rng.range(-0.18, 0.18), rot: rng.range(0, 6.28) };
          city.palms.push(p);
          push({ x: p.x, z: p.z, r: 0.45, h: 6 });
        }
      }
      if (block.kind === 'park') {
        for (let n = 0; n < 9; n++) {
          const p = { x: r.x0 + rng.range(8, BLOCK - 8), z: r.z0 + rng.range(8, BLOCK - 8), h: rng.range(5, 8), lean: rng.range(-0.2, 0.2), rot: rng.range(0, 6.28), tree: true };
          city.palms.push(p);
          push({ x: p.x, z: p.z, r: 0.5, h: 6 });
        }
      }
      // curb parking spots on the south and north faces
      if (block.kind !== 'park') for (let t = 10; t < BLOCK - 6; t += 11) {
        if (rng.chance(0.4)) city.curbSpots.push({ x: r.x0 + t, z: r.z0 - 7.0, h: Math.PI / 2 });
        if (rng.chance(0.4)) city.curbSpots.push({ x: r.x0 + t, z: r.z1 + 7.0, h: -Math.PI / 2 });
      }
    }
  }
  // street lamps at every intersection corner
  for (let i = 0; i <= COLS; i++) for (let j = 0; j <= ROWS; j++) {
    const n = nodePos(i, j);
    city.lamps.push({ x: n.x + 10, z: n.z + 10 });
  }
  // beach pier + marina posts are decorative; the sea blocks travel past WORLD_H
  return city;
}

// Push a circle out of nearby solids. Returns {nx,nz,depth} of the deepest hit or null; mutates pos.
export function pushOut(city, pos, r, minH = 0.3) {
  let best = null;
  const cx0 = Math.floor((pos.x - r) / CELL), cx1 = Math.floor((pos.x + r) / CELL);
  const cz0 = Math.floor((pos.z - r) / CELL), cz1 = Math.floor((pos.z + r) / CELL);
  for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
    const list = city.grid.get(cx * 4096 + cz);
    if (!list) continue;
    for (const s of list) {
      if (s.h < minH) continue;
      let nx, nz, d;
      if (s.r !== undefined) {
        const dx = pos.x - s.x, dz = pos.z - s.z, dist = Math.hypot(dx, dz);
        d = s.r + r - dist;
        if (d <= 0) continue;
        nx = dist > 1e-4 ? dx / dist : 1; nz = dist > 1e-4 ? dz / dist : 0;
      } else {
        const qx = Math.max(s.x0, Math.min(pos.x, s.x1)), qz = Math.max(s.z0, Math.min(pos.z, s.z1));
        const dx = pos.x - qx, dz = pos.z - qz, dist = Math.hypot(dx, dz);
        if (dist > 1e-4) {
          d = r - dist;
          if (d <= 0) continue;
          nx = dx / dist; nz = dz / dist;
        } else {
          const l = pos.x - s.x0, rr = s.x1 - pos.x, t = pos.z - s.z0, b = s.z1 - pos.z;
          const m = Math.min(l, rr, t, b);
          d = m + r;
          if (m === l) { nx = -1; nz = 0; } else if (m === rr) { nx = 1; nz = 0; } else if (m === t) { nx = 0; nz = -1; } else { nx = 0; nz = 1; }
        }
      }
      pos.x += nx * d; pos.z += nz * d;
      if (!best || d > best.depth) best = { nx, nz, depth: d };
    }
  }
  return best;
}

// World bounds: the city edge and the sea. Returns a hit normal when clamped.
export function clampToWorld(pos, r, seaMargin = 0) {
  let hit = null;
  if (pos.x < r) { pos.x = r; hit = { nx: 1, nz: 0 }; }
  if (pos.x > WORLD_W - r) { pos.x = WORLD_W - r; hit = { nx: -1, nz: 0 }; }
  if (pos.z < r) { pos.z = r; hit = { nx: 0, nz: 1 }; }
  const zmax = WORLD_H - seaMargin - r;
  if (pos.z > zmax) { pos.z = zmax; hit = { nx: 0, nz: -1 }; }
  return hit;
}

// Is the point inside a tall solid (used for line of sight / bullets / camera)?
export function solidAt(city, x, z, y) {
  const list = city.grid.get(Math.floor(x / CELL) * 4096 + Math.floor(z / CELL));
  if (!list) return false;
  for (const s of list) {
    if (s.h < y) continue;
    if (s.r !== undefined) { if (Math.hypot(x - s.x, z - s.z) < s.r) return true; }
    else if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1) return true;
  }
  return false;
}

export function segBlocked(city, x0, z0, x1, z1, y = 1.5, step = 1.5) {
  const d = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(d / step);
  for (let k = 1; k < n; k++) {
    const t = k / n;
    if (solidAt(city, x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, y)) return t * d;
  }
  return -1;
}

export function randomRoadSpot(city, rng) {
  const n = nodePos(rng.int(0, COLS), rng.int(0, ROWS));
  return n;
}

// A random point on a sidewalk strip (for pedestrians, pickups, crabs).
export function sidewalkPoint(city, rng) {
  for (let tries = 0; tries < 30; tries++) {
    const b = city.blocks[rng.int(0, city.blocks.length - 1)], r = b.rect, side = rng.int(0, 3), t = rng.range(3, BLOCK - 3), o = 1.5;
    const p = side === 0 ? { x: r.x0 + t, z: r.z0 + o } : side === 1 ? { x: r.x0 + t, z: r.z1 - o } : side === 2 ? { x: r.x0 + o, z: r.z0 + t } : { x: r.x1 - o, z: r.z0 + t };
    if (!solidAt(city, p.x, p.z, 0.3)) return { ...p, block: b };
  }
  return { ...nodePos(1, 1), block: city.blocks[0] };
}

// Block corner point (inset into the sidewalk): sx, sz in {0,1}.
export function cornerPoint(i, j, sx, sz, inset = 1.5) {
  const r = blockRect(i, j);
  return { x: sx ? r.x1 - inset : r.x0 + inset, z: sz ? r.z1 - inset : r.z0 + inset };
}
export const blockValid = (i, j) => i >= 0 && j >= 0 && i < COLS && j < ROWS;

// Road path between nodes (BFS over the grid) used by police: returns list of {i,j} from a to b.
export function roadPath(a, b) {
  const key = (n) => n.i * 100 + n.j;
  const prev = new Map([[key(a), null]]);
  const q = [a];
  while (q.length) {
    const c = q.shift();
    if (c.i === b.i && c.j === b.j) break;
    for (const [dx, dz] of DIRS) {
      const n = { i: c.i + dx, j: c.j + dz };
      if (!nodeValid(n.i, n.j) || prev.has(key(n))) continue;
      prev.set(key(n), c);
      q.push(n);
    }
  }
  const out = [];
  let c = prev.has(key(b)) ? b : null;
  while (c) { out.unshift(c); c = prev.get(key(c)); }
  return out;
}
