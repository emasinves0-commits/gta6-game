// Round, heading-up minimap drawn on a canvas from the live 3D world state.
// The static street map is rasterised once; blips (mission, police, crabs, race) are drawn every frame.
import { WORLD_W, WORLD_H, ROADS_H, ROAD_W } from './config.js';
import { getObjective } from './missions.js';

const SIZE = 184;           // CSS pixels of the dial
const VIEW_R = 105;         // metres from centre to rim
export const RES = 2;              // pixels per metre in the static layer
export const PAD = 60;             // margin around the city in the static layer
const RIM_HALO = 'rgba(255,236,200,0.85)', RIM_HALO_W = 2; // outer halo ring so the dial edge never merges with dark road behind it

export function paintStatic(city) {
  const c = document.createElement('canvas');
  c.width = (WORLD_W + PAD * 2) * RES; c.height = (WORLD_H + PAD * 2 + 40) * RES;
  const g = c.getContext('2d');
  g.scale(RES, RES); g.translate(PAD, PAD);
  g.fillStyle = '#6a7a52'; g.fillRect(-PAD, -PAD, c.width, c.height);                  // land
  g.fillStyle = '#e3cb92'; g.fillRect(-PAD, ROADS_H, WORLD_W + PAD * 2, WORLD_H - ROADS_H); // sand
  g.fillStyle = '#2a86ad'; g.fillRect(-PAD, WORLD_H, WORLD_W + PAD * 2, PAD + 80);          // sea
  g.fillStyle = '#4a4d57'; g.fillRect(0, 0, WORLD_W, ROADS_H);                          // every road
  g.strokeStyle = '#8a8d97'; g.lineWidth = 0.7; g.setLineDash([3, 4]);
  for (const b of city.blocks) { // dashed centre lines show the street grid
    const r = b.rect;
    g.beginPath(); g.moveTo(r.x0 - ROAD_W / 2, r.z0 - ROAD_W / 2); g.lineTo(r.x1 + ROAD_W / 2, r.z0 - ROAD_W / 2); g.stroke();
    g.beginPath(); g.moveTo(r.x0 - ROAD_W / 2, r.z0 - ROAD_W / 2); g.lineTo(r.x0 - ROAD_W / 2, r.z1 + ROAD_W / 2); g.stroke();
  }
  g.setLineDash([]);
  const fill = { bld: '#cdb892', park: '#5fae4a', plaza: '#e6d7b8', lot: '#6a6c74' };
  for (const b of city.blocks) {
    const r = b.rect;
    g.fillStyle = '#d9cdb7'; g.fillRect(r.x0, r.z0, r.x1 - r.x0, r.z1 - r.z0);
    if (b.kind === 'bld') {
      g.fillStyle = fill.bld;
      for (const l of b.lots) g.fillRect(l.x0, l.z0, l.x1 - l.x0, l.z1 - l.z0);
    } else { g.fillStyle = fill[b.kind]; g.fillRect(r.x0 + 3, r.z0 + 3, r.x1 - r.x0 - 6, r.z1 - r.z0 - 6); }
  }
  return c;
}

export function createMinimap(canvas, game) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = canvas.height = SIZE * dpr;
  const g = canvas.getContext('2d');
  const base = paintStatic(game.city);
  const k = SIZE / 2 / VIEW_R;

  const toDial = (x, z, ang, px, pz) => {
    const rx = x - px, rz = z - pz, cs = Math.cos(ang), sn = Math.sin(ang);
    return { x: (rx * cs - rz * sn) * k, y: (rx * sn + rz * cs) * k };
  };
  const clampDial = (p, inset) => {
    const d = Math.hypot(p.x, p.y), lim = SIZE / 2 - inset;
    return d > lim ? { x: (p.x / d) * lim, y: (p.y / d) * lim, edge: true } : { ...p, edge: false };
  };
  const dot = (p, r, color, ring = '#101218') => {
    g.beginPath(); g.arc(p.x, p.y, r, 0, Math.PI * 2); g.fillStyle = color; g.fill();
    g.lineWidth = 1.5; g.strokeStyle = ring; g.stroke();
  };

  return function drawMinimap() {
    const p = game.player, focus = p.inCar || p, ang = game.cam.yaw - Math.PI;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, SIZE, SIZE);
    g.save();
    g.translate(SIZE / 2, SIZE / 2);
    g.beginPath(); g.arc(0, 0, SIZE / 2 - 2, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#1b2230'; g.fillRect(-SIZE / 2, -SIZE / 2, SIZE, SIZE);
    g.save();
    g.rotate(ang); g.scale(k, k); g.translate(-focus.x, -focus.z);
    g.drawImage(base, -PAD, -PAD, base.width / RES, base.height / RES);
    g.restore();

    const obj = getObjective(game);
    const lookout = game.crew[2].active > 0;
    // police: cars + officers on foot (wide range with the lookout, short range otherwise)
    const copRange = lookout ? 400 : game.wanted.stars > 0 ? 75 : 0;
    const flash = game.copFlash ? '#ff3b30' : '#3b82ff';
    if (copRange) {
      for (const c of game.cars) {
        if (c.type !== 'police' || c.dead) continue;
        const q = toDial(c.x, c.z, ang, focus.x, focus.z);
        if (Math.hypot(q.x, q.y) < SIZE / 2 - 4 || lookout) dot(clampDial(q, 7), 4, flash);
      }
      for (const c of game.cops) {
        if (c.dead || c.kind !== 'cop' || Math.hypot(c.x - focus.x, c.z - focus.z) > copRange) continue;
        const q = toDial(c.x, c.z, ang, focus.x, focus.z);
        if (Math.hypot(q.x, q.y) < SIZE / 2 - 4) dot(q, 2.5, '#6aa0ff');
      }
      if (game.heli) dot(clampDial(toDial(game.heli.x, game.heli.z, ang, focus.x, focus.z), 7), 5, '#ffe14a');
    }
    for (const c of game.cops) { // armed guards during the bank job
      if (c.dead || c.kind !== 'goon') continue;
      const q = toDial(c.x, c.z, ang, focus.x, focus.z);
      if (Math.hypot(q.x, q.y) < SIZE / 2 - 4) dot(q, 3, '#ff6a3a');
    }
    for (const cr of game.crabs) {
      if (cr.got || Math.hypot(cr.x - focus.x, cr.z - focus.z) > 70) continue;
      dot(toDial(cr.x, cr.z, ang, focus.x, focus.z), 3, '#ffc933');
    }
    if (game.race && game.race.ring.visible) {
      const rp = game.race.ring.position;
      dot(clampDial(toDial(rp.x, rp.z, ang, focus.x, focus.z), 8), 4, '#ffffff', '#e8a000');
    }
    for (const m of obj.markers) {
      const q = clampDial(toDial(m.x, m.z, ang, focus.x, focus.z), 8);
      g.save(); g.translate(q.x, q.y);
      if (q.edge) { g.rotate(Math.atan2(q.y, q.x) + Math.PI / 2); g.beginPath(); g.moveTo(0, -7); g.lineTo(6, 5); g.lineTo(-6, 5); g.closePath(); g.fillStyle = m.color; g.fill(); g.strokeStyle = '#101218'; g.lineWidth = 1.5; g.stroke(); }
      else { g.beginPath(); g.moveTo(0, -8); g.lineTo(7, 0); g.lineTo(0, 8); g.lineTo(-7, 0); g.closePath(); g.fillStyle = m.color; g.fill(); g.strokeStyle = '#101218'; g.lineWidth = 1.5; g.stroke(); }
      g.restore();
    }
    // player arrow (points where the player faces, relative to the rotated map)
    g.save(); g.rotate(focus.heading - game.cam.yaw);
    g.beginPath(); g.moveTo(0, -9); g.lineTo(6.5, 7); g.lineTo(0, 3.5); g.lineTo(-6.5, 7); g.closePath();
    g.fillStyle = '#ffffff'; g.fill(); g.lineWidth = 1.5; g.strokeStyle = '#101218'; g.stroke();
    g.restore();
    g.restore();
    // rim + north marker
    g.save(); g.translate(SIZE / 2, SIZE / 2);
    g.lineWidth = 4; g.strokeStyle = '#0d1018'; g.beginPath(); g.arc(0, 0, SIZE / 2 - 2, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 1.5; g.strokeStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.arc(0, 0, SIZE / 2 - 4, 0, Math.PI * 2); g.stroke();
    g.lineWidth = RIM_HALO_W; g.strokeStyle = RIM_HALO; g.beginPath(); g.arc(0, 0, SIZE / 2 - 1, 0, Math.PI * 2); g.stroke(); // light outer halo: the dial reads as a full circle even over dark asphalt
    const nx = Math.sin(ang) * (SIZE / 2 - 12), ny = -Math.cos(ang) * (SIZE / 2 - 12);
    g.fillStyle = '#d7263d'; g.beginPath(); g.arc(nx, ny, 8, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.font = 'bold 11px Trebuchet MS, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('N', nx, ny + 0.5);
    g.restore();
  };
}
