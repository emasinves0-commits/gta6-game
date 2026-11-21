// Minimap: a pre-rendered city map cropped around the player, with police blips, mission markers and a north indicator.
import { COLS, ROWS, BLOCK, ROAD_W, PITCH, WORLD_W, WORLD_H, WATER_Y, ROADS_H } from './config.js';
import { getObjective } from './missions.js';

const SCALE = 0.25;       // pixels of the pre-rendered map per world unit
const VIEW_RADIUS = 520;  // world units visible from the centre to the edge

let mapCanvas = null, mapSeed = null;

// Rendered once and cached: the static city (roads, blocks, park, beach, water) at SCALE pixels per world unit.
function buildMap(game) {
  mapCanvas = document.createElement('canvas');
  mapCanvas.width = Math.ceil(WORLD_W * SCALE); mapCanvas.height = Math.ceil(WORLD_H * SCALE);
  mapSeed = game.city;
  const c = mapCanvas.getContext('2d');
  c.scale(SCALE, SCALE);
  c.fillStyle = '#2d78a6'; c.fillRect(0, 0, WORLD_W, WORLD_H);
  c.fillStyle = '#e8d79c'; c.fillRect(0, ROADS_H, WORLD_W, WATER_Y - ROADS_H);
  c.fillStyle = '#c9c3b0'; c.fillRect(0, 0, WORLD_W, ROADS_H);
  for (const b of game.city.blocks) {
    c.fillStyle = b.kind === 'park' ? '#6fae5a' : b.kind === 'lot' ? '#777b82' : '#d8d2c0';
    c.fillRect(b.x, b.y, BLOCK, BLOCK);
  }
  for (const b of game.city.buildings) {
    c.fillStyle = b.label === 'hospital' ? '#ffffff' : b.label === 'police' ? '#5c78c8' : '#a39d90';
    c.fillRect(b.x, b.y, b.w, b.h);
  }
  c.fillStyle = '#4e515a';
  for (let i = 0; i <= COLS; i++) c.fillRect(i * PITCH, 0, ROAD_W, ROADS_H);
  for (let j = 0; j <= ROWS; j++) c.fillRect(0, j * PITCH, WORLD_W, ROAD_W);
  const h = game.city.landmarks.hospital;
  c.fillStyle = '#e04a4a'; c.fillRect(h.x - 4, h.y - 16, 8, 32); c.fillRect(h.x - 16, h.y - 4, 32, 8);
}

export function drawMinimap(canvas, game) {
  if (mapSeed !== game.city) buildMap(game);
  const ctx = canvas.getContext('2d'), size = canvas.width, half = size / 2, k = half / VIEW_RADIUS;
  const p = game.player;
  ctx.save();
  ctx.clearRect(0, 0, size, size);
  ctx.beginPath(); ctx.arc(half, half, half - 1, 0, 7); ctx.clip();
  ctx.fillStyle = '#1d4d70'; ctx.fillRect(0, 0, size, size);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(mapCanvas, (p.x - VIEW_RADIUS) * SCALE, (p.y - VIEW_RADIUS) * SCALE, VIEW_RADIUS * 2 * SCALE, VIEW_RADIUS * 2 * SCALE, 0, 0, size, size);

  const toMap = (x, y) => ({ x: half + (x - p.x) * k, y: half + (y - p.y) * k });
  const flash = Math.floor(game.time * 5) % 2 === 0;
  for (const car of game.cars) {
    if (car.driver !== 'police' || car.wrecked) continue;
    const m = toMap(car.x, car.y);
    if (Math.hypot(m.x - half, m.y - half) > half) continue;
    ctx.fillStyle = flash ? '#ff3b3b' : '#4a6bff'; ctx.beginPath(); ctx.arc(m.x, m.y, 4, 0, 7); ctx.fill();
  }
  for (const cop of game.cops) {
    if (cop.dead) continue;
    const m = toMap(cop.x, cop.y);
    if (Math.hypot(m.x - half, m.y - half) > half) continue;
    ctx.fillStyle = cop.kind === 'goon' ? '#ff8a3a' : '#6f8bff'; ctx.beginPath(); ctx.arc(m.x, m.y, 2.5, 0, 7); ctx.fill();
  }
  for (const mk of getObjective(game).markers) {
    let m = toMap(mk.x, mk.y);
    const dx = m.x - half, dy = m.y - half, d = Math.hypot(dx, dy), edge = half - 10;
    if (d > edge) m = { x: half + dx / d * edge, y: half + dy / d * edge };
    ctx.fillStyle = mk.color; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(m.x, m.y, 6, 0, 7); ctx.fill(); ctx.stroke();
  }
  // Player arrow
  const heading = p.inCar ? p.inCar.angle : p.angle;
  ctx.translate(half, half); ctx.rotate(heading);
  ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#0a1a2a'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-6, -6); ctx.lineTo(-3, 0); ctx.lineTo(-6, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
  // Ring and north indicator
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(half, half, half - 2, 0, 7); ctx.stroke();
  ctx.fillStyle = '#ff5a4a'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('N', half, 11);
}
