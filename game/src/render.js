// Camera and all canvas drawing: ground, roads, buildings with shadows, vehicles, people, particles and day lighting.
import { COLS, ROWS, BLOCK, ROAD_W, PITCH, SIDEWALK, WORLD_W, WORLD_H, ROADS_H, WATER_Y } from './config.js';
import { getObjective } from './missions.js';

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
}

// Pixels per world unit: base camera scale times the zoom (zoom is 1.5 on foot, ~0.8-1 in cars, 1.3-1.4 in ?shot= scenes).
export function viewScale(game) { return game.camera.scale * (game.camera.zoom || 1); }

export function setViewport(game, w, h) {
  game.camera.w = w; game.camera.h = h;
  game.camera.scale = Math.max(0.7, Math.min(1.6, h / 720));
}

export function screenToWorld(game, sx, sy) {
  const c = game.camera, s = viewScale(game);
  return { x: c.x + (sx - c.w / 2) / s, y: c.y + (sy - c.h / 2) / s };
}

// Keep the view inside the city bounds (centred on an axis if the view is larger than the world).
export function clampCamera(game) {
  const cam = game.camera, s = viewScale(game);
  const hw = cam.w / 2 / s, hh = cam.h / 2 / s;
  cam.x = WORLD_W <= hw * 2 ? WORLD_W / 2 : Math.max(hw, Math.min(WORLD_W - hw, cam.x));
  cam.y = WORLD_H <= hh * 2 ? WORLD_H / 2 : Math.max(hh, Math.min(WORLD_H - hh, cam.y));
}

export function renderGame(ctx, game) {
  clampCamera(game);
  const cam = game.camera, s = viewScale(game);
  const shakeX = (Math.random() - 0.5) * cam.shake, shakeY = (Math.random() - 0.5) * cam.shake;
  const view = { x0: cam.x - cam.w / 2 / s - 40, y0: cam.y - cam.h / 2 / s - 40, x1: cam.x + cam.w / 2 / s + 40, y1: cam.y + cam.h / 2 / s + 40 };
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#2f6d8f'; ctx.fillRect(0, 0, cam.w, cam.h);
  ctx.setTransform(s, 0, 0, s, cam.w / 2 - cam.x * s + shakeX, cam.h / 2 - cam.y * s + shakeY);
  const t = game.time;
  drawGround(ctx, game, view, t);
  drawRoads(ctx, view);
  drawSkids(ctx, game, view);
  drawShadows(ctx, game, view);
  drawPickups(ctx, game, view, t);
  drawCorpses(ctx, game, view);
  drawPeople(ctx, game, view, t);
  drawCars(ctx, game, view, t);
  drawBullets(ctx, game);
  drawBuildings(ctx, game, view);
  drawTrees(ctx, game, view);
  drawPlayerOnFoot(ctx, game);
  drawParticles(ctx, game, view);
  drawMarkers(ctx, game, view, t);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  drawLighting(ctx, game, cam.w, cam.h);
  drawWaypointArrow(ctx, game, cam.w, cam.h, s);
}

function drawGround(ctx, game, v, t) {
  const city = game.city;
  // Off-map area: neutral dark ground, then the city ground on top.
  ctx.fillStyle = '#2a2b30'; ctx.fillRect(v.x0, v.y0, v.x1 - v.x0, v.y1 - v.y0);
  ctx.fillStyle = '#d7c9a0'; ctx.fillRect(0, 0, WORLD_W, ROADS_H);
  // Sand + sea
  if (v.y1 > ROADS_H) {
    ctx.fillStyle = '#efdca2'; ctx.fillRect(0, ROADS_H, WORLD_W, WATER_Y - ROADS_H);
    const g = ctx.createLinearGradient(0, WATER_Y, 0, WATER_Y + 300);
    g.addColorStop(0, '#5ec2d1'); g.addColorStop(1, '#1d5f8a');
    ctx.fillStyle = g; ctx.fillRect(-200, WATER_Y, WORLD_W + 400, 600);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = Math.floor(v.x0 / 24) * 24; x < v.x1; x += 24) ctx.lineTo(x, WATER_Y + 4 + Math.sin(x * 0.05 + t * 1.6) * 4);
    ctx.stroke();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    for (let k = 1; k < 6; k++) {
      ctx.beginPath();
      for (let x = Math.floor(v.x0 / 30) * 30; x < v.x1; x += 30) ctx.lineTo(x, WATER_Y + 28 * k + Math.sin(x * 0.03 + t * 1.2 + k) * 5);
      ctx.stroke();
    }
    for (const d of city.decor) {
      if (d.kind !== 'umbrella' || d.x < v.x0 || d.x > v.x1 || d.y < v.y0 || d.y > v.y1) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(d.x + 5, d.y + 5, 13, 9, 0, 0, 7); ctx.fill();
      ctx.fillStyle = d.color; ctx.beginPath(); ctx.arc(d.x, d.y, 12, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(d.x, d.y, 4, 0, 7); ctx.fill();
    }
  }
  for (const b of city.blocks) {
    if (b.x > v.x1 || b.x + BLOCK < v.x0 || b.y > v.y1 || b.y + BLOCK < v.y0) continue;
    ctx.fillStyle = '#cfcabb'; ctx.fillRect(b.x, b.y, BLOCK, BLOCK);
    ctx.fillStyle = '#b9b4a4'; ctx.fillRect(b.x, b.y, BLOCK, 2); ctx.fillRect(b.x, b.y + BLOCK - 2, BLOCK, 2); ctx.fillRect(b.x, b.y, 2, BLOCK); ctx.fillRect(b.x + BLOCK - 2, b.y, 2, BLOCK);
    if (b.kind === 'park') drawPark(ctx, game, b);
    else if (b.kind === 'lot') drawLot(ctx, b);
    else if (b.kind === 'plaza') drawPlaza(ctx, b, t);
  }
}

function drawPark(ctx, game, b) {
  ctx.fillStyle = '#6fae5a'; ctx.fillRect(b.x + SIDEWALK / 2, b.y + SIDEWALK / 2, BLOCK - SIDEWALK, BLOCK - SIDEWALK);
  ctx.fillStyle = '#7dbb66';
  for (let i = 0; i < 6; i++) ctx.fillRect(b.x + 20 + i * 26, b.y + 18, 12, BLOCK - 36);
  ctx.strokeStyle = '#e4d6a8'; ctx.lineWidth = 7; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(b.x + 10, b.y + BLOCK / 2); ctx.lineTo(b.x + BLOCK - 10, b.y + BLOCK / 2); ctx.moveTo(b.x + BLOCK / 2, b.y + 10); ctx.lineTo(b.x + BLOCK / 2, b.y + BLOCK - 10); ctx.stroke();
  const pond = game.city.decor.find((d) => d.kind === 'pond');
  if (pond) {
    ctx.fillStyle = '#8fd3e0'; ctx.beginPath(); ctx.ellipse(pond.x, pond.y, pond.rx, pond.ry, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = '#d9f4f7'; ctx.lineWidth = 2; ctx.stroke();
  }
}

function drawLot(ctx, b) {
  ctx.fillStyle = '#5b5e66'; ctx.fillRect(b.x + SIDEWALK / 2, b.y + SIDEWALK / 2, BLOCK - SIDEWALK, BLOCK - SIDEWALK);
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2; ctx.beginPath();
  for (let r = 0; r < 2; r++) for (let i = 0; i <= 8; i++) { const x = b.x + 22 + i * 18, y = b.y + 24 + r * 94; ctx.moveTo(x, y); ctx.lineTo(x, y + 38); }
  ctx.stroke();
}

function drawPlaza(ctx, b, t) {
  ctx.fillStyle = '#e0d2b0'; ctx.fillRect(b.x + SIDEWALK / 2, b.y + SIDEWALK / 2, BLOCK - SIDEWALK, BLOCK - SIDEWALK);
  ctx.strokeStyle = '#cdbd96'; ctx.lineWidth = 1;
  for (let i = 0; i < 9; i++) { ctx.strokeRect(b.x + 12 + i * 18, b.y + 12, 18, BLOCK - 24); }
  ctx.fillStyle = '#7fcfe0'; ctx.beginPath(); ctx.arc(b.x + BLOCK / 2, b.y + BLOCK / 2, 30, 0, 7); ctx.fill();
  ctx.strokeStyle = '#f4f1e8'; ctx.lineWidth = 5; ctx.stroke();
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(b.x + BLOCK / 2, b.y + BLOCK / 2, 5 + Math.sin(t * 3) * 1.5, 0, 7); ctx.fill();
}

function drawRoads(ctx, v) {
  const i0 = Math.max(0, Math.floor(v.x0 / PITCH)), i1 = Math.min(COLS, Math.ceil(v.x1 / PITCH));
  const j0 = Math.max(0, Math.floor(v.y0 / PITCH)), j1 = Math.min(ROWS, Math.ceil(v.y1 / PITCH));
  ctx.fillStyle = '#4a4d55';
  for (let i = i0; i <= i1; i++) ctx.fillRect(i * PITCH, 0, ROAD_W, ROADS_H);
  for (let j = j0; j <= j1; j++) ctx.fillRect(0, j * PITCH, WORLD_W, ROAD_W);
  // Curb lines
  ctx.fillStyle = '#d9d4c4';
  for (let i = i0; i <= i1; i++) { ctx.fillRect(i * PITCH - 1, 0, 2, ROADS_H); ctx.fillRect(i * PITCH + ROAD_W - 1, 0, 2, ROADS_H); }
  for (let j = j0; j <= j1; j++) { ctx.fillRect(0, j * PITCH - 1, WORLD_W, 2); ctx.fillRect(0, j * PITCH + ROAD_W - 1, WORLD_W, 2); }
  ctx.fillStyle = '#4a4d55';
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) ctx.fillRect(i * PITCH, j * PITCH, ROAD_W, ROAD_W);
  // Lane markings: broken yellow centre lines, skipping junctions.
  ctx.strokeStyle = '#e8c547'; ctx.lineWidth = 2; ctx.setLineDash([16, 14]);
  ctx.beginPath();
  for (let i = i0; i <= i1; i++) for (let j = Math.max(0, j0 - 1); j <= Math.min(ROWS - 1, j1); j++) {
    const x = i * PITCH + ROAD_W / 2; ctx.moveTo(x, j * PITCH + ROAD_W + 4); ctx.lineTo(x, (j + 1) * PITCH - 4);
  }
  for (let j = j0; j <= j1; j++) for (let i = Math.max(0, i0 - 1); i <= Math.min(COLS - 1, i1); i++) {
    const y = j * PITCH + ROAD_W / 2; ctx.moveTo(i * PITCH + ROAD_W + 4, y); ctx.lineTo((i + 1) * PITCH - 4, y);
  }
  ctx.stroke(); ctx.setLineDash([]);
  // Zebra crossings at every junction arm
  ctx.fillStyle = 'rgba(240,240,235,0.8)';
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const x = i * PITCH, y = j * PITCH;
    for (let k = 0; k < 6; k++) {
      const o = 6 + k * 9;
      ctx.fillRect(x + o, y - 12, 5, 8); ctx.fillRect(x + o, y + ROAD_W + 4, 5, 8);
      ctx.fillRect(x - 12, y + o, 8, 5); ctx.fillRect(x + ROAD_W + 4, y + o, 8, 5);
    }
  }
}

function drawSkids(ctx, game, v) {
  ctx.fillStyle = '#23252a';
  for (const s of game.skids) {
    if (s.x < v.x0 || s.x > v.x1 || s.y < v.y0 || s.y > v.y1) continue;
    ctx.globalAlpha = Math.min(0.5, s.life / 14 * 0.5);
    ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.angle); ctx.fillRect(-3, -1.2, 6, 2.4); ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function drawShadows(ctx, game, v) {
  ctx.fillStyle = 'rgba(30,25,40,0.28)';
  for (const b of game.city.buildings) {
    if (b.x > v.x1 || b.x + b.w < v.x0 || b.y - 20 > v.y1 || b.y + b.h + 30 < v.y0) continue;
    const sx = b.height * 0.9, sy = b.height * 0.55, y = b.y - b.height;
    ctx.beginPath();
    ctx.moveTo(b.x, y + b.h + b.height); ctx.lineTo(b.x, y); ctx.lineTo(b.x + b.w, y); ctx.lineTo(b.x + b.w + sx, y + sy);
    ctx.lineTo(b.x + b.w + sx, b.y + b.h + sy); ctx.lineTo(b.x + sx, b.y + b.h + sy); ctx.closePath(); ctx.fill();
  }
  for (const car of game.cars) {
    if (car.x < v.x0 || car.x > v.x1 || car.y < v.y0 || car.y > v.y1) continue;
    ctx.save(); ctx.translate(car.x + 4, car.y + 5); ctx.rotate(car.angle); ctx.fillStyle = 'rgba(20,15,30,0.3)';
    rrect(ctx, -car.spec.len / 2, -car.spec.wid / 2, car.spec.len, car.spec.wid, 5); ctx.fill(); ctx.restore();
  }
  ctx.fillStyle = 'rgba(30,25,40,0.2)';
  for (const tr of game.city.trees) {
    if (tr.x < v.x0 || tr.x > v.x1 || tr.y < v.y0 || tr.y > v.y1) continue;
    ctx.beginPath(); ctx.ellipse(tr.x + 8, tr.y + 7, tr.r, tr.r * 0.8, 0, 0, 7); ctx.fill();
  }
}

function drawBuildings(ctx, game, v) {
  for (const b of game.city.buildings) {
    if (b.x > v.x1 || b.x + b.w < v.x0 || b.y - 20 > v.y1 || b.y + b.h + 30 < v.y0) continue;
    const h = b.height, top = b.y - h;
    ctx.fillStyle = shade(b.wall, -28); ctx.fillRect(b.x, top, b.w, b.h + h);
    // windows on the visible south wall
    ctx.fillStyle = 'rgba(40,70,100,0.75)';
    for (let x = b.x + 5; x < b.x + b.w - 7; x += 11) ctx.fillRect(x, b.y + b.h - h + 2, 6, Math.max(3, h - 5));
    ctx.fillStyle = b.roof; ctx.fillRect(b.x, top, b.w, b.h);
    ctx.fillStyle = shade(b.roof, 22); ctx.fillRect(b.x + 3, top + 3, b.w - 6, 3);
    ctx.strokeStyle = shade(b.roof, -35); ctx.lineWidth = 1.5; ctx.strokeRect(b.x + 0.75, top + 0.75, b.w - 1.5, b.h - 1.5);
    for (const d of b.decor) { ctx.fillStyle = '#b8bec6'; ctx.fillRect(b.x + d.x, top + d.y, d.w, d.h); ctx.fillStyle = '#8a9099'; ctx.fillRect(b.x + d.x + 2, top + d.y + 2, d.w - 4, d.h - 4); }
    if (b.label === 'hospital') {
      ctx.fillStyle = '#e04a4a'; const cx = b.x + b.w / 2, cy = top + b.h / 2;
      ctx.fillRect(cx - 4, cy - 14, 8, 28); ctx.fillRect(cx - 14, cy - 4, 28, 8);
    } else if (b.label === 'police') {
      ctx.fillStyle = '#e8eefc'; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('POLICE', b.x + b.w / 2, top + b.h / 2 + 6);
      ctx.fillStyle = '#d9393b'; ctx.fillRect(b.x + 6, top + 6, 14, 6); ctx.fillStyle = '#3a63d6'; ctx.fillRect(b.x + 20, top + 6, 14, 6);
    }
  }
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt)), g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt)), b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `rgb(${r},${g},${b})`;
}

function drawTrees(ctx, game, v) {
  for (const tr of game.city.trees) {
    if (tr.x < v.x0 - 20 || tr.x > v.x1 + 20 || tr.y < v.y0 - 20 || tr.y > v.y1 + 20) continue;
    if (tr.palm) {
      ctx.strokeStyle = '#4c9a4a'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      for (let k = 0; k < 7; k++) { const a = k * 0.9; ctx.beginPath(); ctx.moveTo(tr.x, tr.y); ctx.lineTo(tr.x + Math.cos(a) * tr.r, tr.y + Math.sin(a) * tr.r); ctx.stroke(); }
      ctx.fillStyle = '#7a5530'; ctx.beginPath(); ctx.arc(tr.x, tr.y, 3.5, 0, 7); ctx.fill();
    } else {
      ctx.fillStyle = '#2f7a3b'; ctx.beginPath(); ctx.arc(tr.x, tr.y, tr.r, 0, 7); ctx.fill();
      ctx.fillStyle = '#3f9a4a'; ctx.beginPath(); ctx.arc(tr.x - tr.r * 0.25, tr.y - tr.r * 0.3, tr.r * 0.65, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,200,0.2)'; ctx.beginPath(); ctx.arc(tr.x - tr.r * 0.35, tr.y - tr.r * 0.4, tr.r * 0.3, 0, 7); ctx.fill();
    }
  }
}

function drawPickups(ctx, game, v, t) {
  for (const k of game.pickups) {
    if (k.taken || k.x < v.x0 || k.x > v.x1 || k.y < v.y0 || k.y > v.y1) continue;
    const bob = Math.sin(t * 4 + k.x) * 1.5;
    ctx.save(); ctx.translate(k.x, k.y + bob);
    if (k.kind === 'health') {
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(0, 0, 9, 0, 7); ctx.fill();
      ctx.fillStyle = '#e04a4a'; ctx.fillRect(-2.5, -6, 5, 12); ctx.fillRect(-6, -2.5, 12, 5);
    } else if (k.kind === 'ammo') {
      ctx.fillStyle = '#e8b13a'; rrect(ctx, -8, -6, 16, 12, 3); ctx.fill();
      ctx.fillStyle = '#6b4a12'; ctx.fillRect(-4, -3, 2, 6); ctx.fillRect(-1, -3, 2, 6); ctx.fillRect(2, -3, 2, 6);
    } else {
      ctx.fillStyle = '#58c26a'; rrect(ctx, -8, -5, 16, 10, 2); ctx.fill();
      ctx.fillStyle = '#2d7a3d'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('$', 0, 3.5);
    }
    ctx.restore();
  }
}

function drawCorpses(ctx, game, v) {
  for (const ped of game.peds) if (ped.dead && ped.x > v.x0 && ped.x < v.x1 && ped.y > v.y0 && ped.y < v.y1) {
    ctx.globalAlpha = Math.min(1, ped.fade / 2); ctx.fillStyle = ped.color; ctx.save(); ctx.translate(ped.x, ped.y); ctx.rotate(ped.angle);
    ctx.fillRect(-6, -3, 12, 6); ctx.fillStyle = ped.skin; ctx.beginPath(); ctx.arc(7, 0, 3.5, 0, 7); ctx.fill(); ctx.restore(); ctx.globalAlpha = 1;
  }
  for (const c of game.cops) if (c.dead && c.x > v.x0 && c.x < v.x1 && c.y > v.y0 && c.y < v.y1) {
    ctx.globalAlpha = Math.min(1, c.fade / 2); ctx.fillStyle = '#2a3552'; ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.angle);
    ctx.fillRect(-6, -3, 12, 6); ctx.restore(); ctx.globalAlpha = 1;
  }
}

function drawPerson(ctx, x, y, angle, body, skin, walk, extra) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
  ctx.fillStyle = 'rgba(20,15,30,0.28)'; ctx.beginPath(); ctx.ellipse(2, 3, 7, 5, 0, 0, 7); ctx.fill();
  const sw = Math.sin(walk) * 2.5;
  ctx.fillStyle = '#33384a'; ctx.fillRect(-2 + sw, -5, 5, 3); ctx.fillRect(-2 - sw, 2, 5, 3);
  ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(0, 0, 4.5, 7, 0, 0, 7); ctx.fill();
  ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(1, 0, 4, 0, 7); ctx.fill();
  if (extra) extra(ctx);
  ctx.restore();
}

function drawPeople(ctx, game, v, t) {
  for (const p of game.peds) {
    if (p.dead || p.x < v.x0 || p.x > v.x1 || p.y < v.y0 || p.y > v.y1) continue;
    drawPerson(ctx, p.x, p.y, p.angle, p.color, p.skin, p.bob, null);
  }
  for (const c of game.cops) {
    if (c.dead || c.x < v.x0 || c.x > v.x1 || c.y < v.y0 || c.y > v.y1) continue;
    const goon = c.kind === 'goon';
    drawPerson(ctx, c.x, c.y, c.angle, goon ? '#5a1f26' : '#2a3a6a', '#e6bf98', c.walk, (g) => {
      g.fillStyle = goon ? '#111' : '#1a2547'; g.beginPath(); g.arc(1, 0, 4.2, Math.PI * 0.9, Math.PI * 2.1); g.fill();
      g.fillStyle = '#222'; g.fillRect(4, 4, 9, 2.5);
    });
  }
  const npc = game.mission.npc;
  if (npc) {
    drawPerson(ctx, npc.x, npc.y, Math.PI / 2, '#d94f9a', '#e8b896', 0, null);
    ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('!', npc.x, npc.y - 14 + Math.sin(t * 5) * 2);
  }
}

// Drawn after the tree canopies so the protagonist is never hidden in the park.
function drawPlayerOnFoot(ctx, game) {
  const p = game.player;
  if (p.inCar) return;
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.arc(p.x, p.y, 11, 0, 7); ctx.fill();
  drawPerson(ctx, p.x, p.y, p.angle, '#1fa89a', '#d9a579', p.walkPhase, (g) => {
    g.fillStyle = '#2b2118'; g.beginPath(); g.arc(0.5, 0, 4.2, Math.PI * 0.6, Math.PI * 2.4); g.fill();
    g.fillStyle = '#2a2a2e'; g.fillRect(3, 4.5, 11, 3);
    if (p.meleeT > 0) { g.fillStyle = '#d9a579'; g.beginPath(); g.arc(10 + (0.32 - p.meleeT) * 40, -3, 3.2, 0, 7); g.fill(); }
  });
}

function drawCars(ctx, game, v, t) {
  for (const car of game.cars) {
    if (car.x < v.x0 - 30 || car.x > v.x1 + 30 || car.y < v.y0 - 30 || car.y > v.y1 + 30) continue;
    drawCar(ctx, car, t, game);
  }
}

function drawCar(ctx, car, t, game) {
  const { len, wid } = car.spec, L = len / 2, W = wid / 2;
  ctx.save(); ctx.translate(car.x, car.y); ctx.rotate(car.angle);
  const wreck = car.wrecked;
  ctx.fillStyle = wreck ? '#2c2c2e' : car.color; rrect(ctx, -L, -W, len, wid, 5); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1; ctx.stroke();
  if (car.type === 'pickup') { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(-L + 2, -W + 2, len * 0.42, wid - 4); }
  if (car.type === 'police' && !wreck) {
    ctx.fillStyle = '#f2f4f8'; ctx.fillRect(-L * 0.2, -W, len * 0.38, wid);
  }
  if (car.type === 'sports' && !wreck) { ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(-L, -1.5, len, 3); }
  // cabin
  ctx.fillStyle = wreck ? '#151515' : 'rgba(25,40,60,0.9)';
  rrect(ctx, -L * 0.28, -W + 2.5, len * 0.4, wid - 5, 3); ctx.fill();
  ctx.fillStyle = wreck ? '#222' : 'rgba(255,255,255,0.15)'; ctx.fillRect(-L * 0.1, -W + 3, len * 0.16, wid - 6);
  if (car.type === 'taxi' && !wreck) { ctx.fillStyle = '#fff'; ctx.fillRect(-3, -4, 6, 8); ctx.fillStyle = '#222'; ctx.fillRect(-1.5, -2, 3, 4); }
  if (!wreck) {
    ctx.fillStyle = '#fff3b0'; ctx.fillRect(L - 3, -W + 1.5, 3, 4); ctx.fillRect(L - 3, W - 5.5, 3, 4);
    ctx.fillStyle = '#c0261f'; ctx.fillRect(-L, -W + 1.5, 2.5, 4); ctx.fillRect(-L, W - 5.5, 2.5, 4);
    if (car.sirenOn && car.type === 'police') {
      const flip = Math.floor(t * 6) % 2 === 0;
      ctx.fillStyle = flip ? '#ff3030' : '#2f5bff'; ctx.fillRect(-2, -W + 2, 4, 7);
      ctx.fillStyle = flip ? '#2f5bff' : '#ff3030'; ctx.fillRect(-2, 1, 4, 7);
    }
    if (car.type === 'police' && !car.sirenOn) { ctx.fillStyle = '#7a8fbf'; ctx.fillRect(-2, -3, 4, 6); }
    if (car.handbrake && car.driver === 'player') { ctx.fillStyle = '#ff3a2a'; ctx.fillRect(-L - 1, -W + 1, 2, wid - 2); }
  } else if (car.burn > 0) {
    ctx.fillStyle = `rgba(255,${100 + Math.random() * 80 | 0},20,0.7)`; ctx.beginPath(); ctx.arc(0, 0, 8 + Math.random() * 4, 0, 7); ctx.fill();
  }
  ctx.restore();
  if (car.sirenOn && car.type === 'police' && !wreck) {
    const flip = Math.floor(t * 6) % 2 === 0;
    const g = ctx.createRadialGradient(car.x, car.y, 2, car.x, car.y, 46);
    g.addColorStop(0, flip ? 'rgba(255,60,60,0.45)' : 'rgba(70,100,255,0.45)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(car.x - 46, car.y - 46, 92, 92);
  }
  if (game && isDusk(game) && car.driver && !wreck) {
    ctx.save(); ctx.translate(car.x, car.y); ctx.rotate(car.angle); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createLinearGradient(L, 0, L + 90, 0); g.addColorStop(0, 'rgba(255,240,170,0.45)'); g.addColorStop(1, 'rgba(255,240,170,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(L, -5); ctx.lineTo(L + 90, -30); ctx.lineTo(L + 90, 30); ctx.lineTo(L, 5); ctx.fill();
    ctx.restore();
  }
}

function drawBullets(ctx, game) {
  ctx.lineWidth = 2; ctx.lineCap = 'round';
  for (const b of game.bullets) {
    ctx.strokeStyle = b.owner === 'player' ? '#fff0a0' : '#ff9a7a';
    ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - b.vx * 0.03, b.y - b.vy * 0.03); ctx.stroke();
  }
}

function drawParticles(ctx, game, v) {
  for (const p of game.particles) {
    if (p.x < v.x0 || p.x > v.x1 || p.y < v.y0 || p.y > v.y1) continue;
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.maxLife));
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawMarkers(ctx, game, v, t) {
  const obj = getObjective(game);
  for (const m of obj.markers) {
    if (m.x < v.x0 - 80 || m.x > v.x1 + 80 || m.y < v.y0 - 80 || m.y > v.y1 + 80) continue;
    const pulse = 0.5 + 0.5 * Math.sin(t * 4);
    ctx.save(); ctx.translate(m.x, m.y);
    ctx.fillStyle = m.color; ctx.globalAlpha = 0.18 + pulse * 0.12; ctx.beginPath(); ctx.arc(0, 0, 40, 0, 7); ctx.fill();
    ctx.globalAlpha = 0.9; ctx.strokeStyle = m.color; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 36 - pulse * 4, 0, 7); ctx.stroke();
    ctx.globalAlpha = 1;
    const g = ctx.createLinearGradient(0, 0, 0, -90); g.addColorStop(0, m.color); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.globalAlpha = 0.55; ctx.fillStyle = g; ctx.fillRect(-7, -90, 14, 90); ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 3;
    ctx.strokeText(m.label, 0, -98); ctx.fillText(m.label, 0, -98);
    ctx.restore();
  }
}

// Hours -> amount of dusk/night tint.
function darkness(hour) {
  if (hour >= 7 && hour < 17) return 0;
  if (hour >= 17 && hour < 20) return (hour - 17) / 3 * 0.35;
  if (hour >= 20 && hour < 22) return 0.35 + (hour - 20) / 2 * 0.25;
  if (hour >= 22 || hour < 5) return 0.6;
  return 0.6 - (hour - 5) / 2 * 0.6;
}

function isDusk(game) { return darkness(game.clock / 60) > 0.2; }

function drawLighting(ctx, game, w, h) {
  const hour = game.clock / 60, dark = darkness(hour);
  // Warm sun gradient from the upper left.
  const sun = ctx.createLinearGradient(0, 0, w, h);
  sun.addColorStop(0, `rgba(255,222,160,${0.2 * (1 - dark)})`); sun.addColorStop(0.6, 'rgba(255,235,200,0)'); sun.addColorStop(1, `rgba(255,150,90,${0.08 * (1 - dark)})`);
  ctx.fillStyle = sun; ctx.fillRect(0, 0, w, h);
  if (dark > 0) {
    ctx.fillStyle = hour > 17 && hour < 21 ? `rgba(255,120,70,${dark * 0.5})` : `rgba(18,28,70,${dark * 0.85})`;
    ctx.fillRect(0, 0, w, h);
  }
  const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.45, w / 2, h / 2, Math.max(w, h) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(10,8,30,0.35)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
  if (game.player.hurtFlash > 0) { ctx.fillStyle = `rgba(200,30,30,${game.player.hurtFlash * 0.7})`; ctx.fillRect(0, 0, w, h); }
}

// Edge-of-screen arrow pointing at the mission waypoint when it is off-screen.
function drawWaypointArrow(ctx, game, w, h, s) {
  const obj = getObjective(game);
  if (!obj.target) return;
  const cam = game.camera, dx = (obj.target.x - cam.x) * s, dy = (obj.target.y - cam.y) * s;
  const margin = 60;
  if (Math.abs(dx) < w / 2 - margin && Math.abs(dy) < h / 2 - margin) return;
  const k = Math.min((w / 2 - margin) / Math.abs(dx || 1), (h / 2 - margin) / Math.abs(dy || 1));
  const ax = w / 2 + dx * k, ay = h / 2 + dy * k, a = Math.atan2(dy, dx);
  ctx.save(); ctx.translate(ax, ay); ctx.rotate(a);
  ctx.fillStyle = obj.active ? '#ffd23f' : '#5ee08a'; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(-10, -14); ctx.lineTo(-4, 0); ctx.lineTo(-10, 14); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(`${Math.round(Math.hypot(obj.target.x - game.player.x, obj.target.y - game.player.y) / 10)} m`, ax - Math.cos(a) * 26, ay - Math.sin(a) * 26 + 4);
}
