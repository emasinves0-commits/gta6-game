// Full-screen city map (key M): the minimap's street raster at large size, district labels, mission markers, crabs, police.
import { WORLD_W, WORLD_H, DISTRICTS } from './config.js';
import { getObjective, missionDefs } from './missions.js';
import { paintStatic, PAD, RES } from './minimap.js';

const W = 1280, H = 720, K = 0.92;          // overlay size and metres-to-pixels scale
const OX = (W - WORLD_W * K) / 2, OY = 46;  // world origin on the overlay

export function createCityMap(stage, game) {
  const root = document.createElement('div');
  root.id = 'citymap';
  root.style.cssText = 'position:absolute;inset:0;display:none;z-index:6;background:rgba(8,12,20,0.97);';
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H; canvas.style.cssText = 'width:1280px;height:720px;display:block;';
  root.appendChild(canvas);
  stage.appendChild(root);
  const g = canvas.getContext('2d');
  const base = paintStatic(game.city);
  // district label anchors: centre of each district's blocks
  const labels = DISTRICTS.map((name) => {
    const bs = game.city.blocks.filter((b) => b.district === name);
    const x = bs.reduce((a, b) => a + (b.rect.x0 + b.rect.x1) / 2, 0) / bs.length, z = bs.reduce((a, b) => a + (b.rect.z0 + b.rect.z1) / 2, 0) / bs.length;
    return { name, x, z };
  });
  const toMap = (x, z) => ({ x: OX + x * K, y: OY + z * K });
  const dot = (x, z, r, color) => { const q = toMap(x, z); g.beginPath(); g.arc(q.x, q.y, r, 0, Math.PI * 2); g.fillStyle = color; g.fill(); g.lineWidth = 1.5; g.strokeStyle = '#101218'; g.stroke(); };
  const text = (t, x, y, size, color, align = 'center') => { g.font = `bold ${size}px Trebuchet MS, sans-serif`; g.textAlign = align; g.textBaseline = 'middle'; g.lineWidth = 3; g.lineJoin = 'round'; g.strokeStyle = 'rgba(10,14,22,0.85)'; g.strokeText(t, x, y); g.fillStyle = color; g.fillText(t, x, y); };

  return {
    root,
    set open(on) { root.style.display = on ? 'block' : 'none'; },
    draw() {
      g.clearRect(0, 0, W, H);
      g.drawImage(base, 0, 0, base.width, base.height, OX - PAD * K, OY - PAD * K, (base.width / RES) * K, (base.height / RES) * K);
      for (const l of labels) { const q = toMap(l.x, l.z); text(l.name.toUpperCase(), q.x, q.y, 15, 'rgba(255,255,255,0.92)'); }
      for (const cr of game.crabs) if (!cr.got) dot(cr.x, cr.z, 3, '#ffc933');
      if (game.wanted.stars > 0) for (const c of game.cars) if (c.type === 'police' && !c.dead) dot(c.x, c.z, 4, game.copFlash ? '#ff3b30' : '#3b82ff');
      const obj = getObjective(game);
      for (const m of obj.markers) { const q = toMap(m.x, m.z); dot(m.x, m.z, 7, m.color); text(m.label, q.x, q.y - 15, 13, '#ffffff'); }
      const p = game.player, f = p.inCar || p, q = toMap(f.x, f.z);
      g.save(); g.translate(q.x, q.y); g.rotate(Math.PI - f.heading);
      g.beginPath(); g.moveTo(0, -11); g.lineTo(8, 9); g.lineTo(0, 4); g.lineTo(-8, 9); g.closePath();
      g.fillStyle = '#ffffff'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#101218'; g.stroke(); g.restore();
      text('SOLMAR BAY - CITY MAP', W / 2, 24, 22, '#ffd23f');
      const next = missionDefs[game.mission.index];
      text(obj.active ? `Chapter ${obj.chapter}: ${obj.title}` : next ? `Next: Chapter ${next.chapter} - ${next.title} (green marker)` : 'Story complete - free roam', 24, H - 26, 16, '#e9eef9', 'left');
      text('M / Esc - close   |   white arrow: you   gold: objective   green: next mission   yellow dots: golden crabs', W - 24, H - 26, 14, '#9aa6bd', 'right');
    },
  };
}
