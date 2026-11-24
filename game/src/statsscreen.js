// Career screen (key Tab): city map with district standing, completion checklist, mission log, career totals and the save slot.
import { WORLD_W, WORLD_H, DISTRICTS } from './config.js';
import { getObjective, missionDefs, MISSION_COUNT } from './missions.js';
import { paintStatic, PAD, RES } from './minimap.js';
import { rankInfo, standingOf } from './stats.js';

const W = 1280, H = 720;
const MAP_K = Math.min(640 / WORLD_W, 470 / WORLD_H), MAP_X = 30, MAP_Y = 92;
const STAND_COL = ['#8d97ab', '#7ec8ff', '#5ee08a', '#ffd23f', '#ff7a45'];

export function createStatsScreen(stage, game) {
  const root = document.createElement('div');
  root.style.cssText = 'position:absolute;inset:0;display:none;z-index:7;background:#070a12;';
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H; canvas.style.cssText = 'width:1280px;height:720px;display:block;';
  root.appendChild(canvas); stage.appendChild(root);
  const g = canvas.getContext('2d'), base = paintStatic(game.city);
  const labels = DISTRICTS.map((name) => {
    const bs = game.city.blocks.filter((b) => b.district === name);
    return { name, x: bs.reduce((a, b) => a + (b.rect.x0 + b.rect.x1) / 2, 0) / bs.length, z: bs.reduce((a, b) => a + (b.rect.z0 + b.rect.z1) / 2, 0) / bs.length };
  });
  const toMap = (x, z) => ({ x: MAP_X + x * MAP_K, y: MAP_Y + z * MAP_K });
  const text = (t, x, y, size, color, align = 'left', weight = 'bold') => {
    g.font = `${weight} ${size}px Trebuchet MS, sans-serif`; g.textAlign = align; g.textBaseline = 'middle';
    g.lineWidth = 3; g.lineJoin = 'round'; g.strokeStyle = 'rgba(0,0,0,0.85)'; g.strokeText(t, x, y); g.fillStyle = color; g.fillText(t, x, y);
  };
  const panel = (x, y, w, h, title) => {
    g.fillStyle = 'rgba(22,28,44,0.92)'; g.fillRect(x, y, w, h); g.fillStyle = '#ffd23f'; g.fillRect(x, y, 4, h);
    text(title, x + 16, y + 17, 13, '#ffd23f');
  };
  const barRow = (x, y, w, label, n, total, color) => {
    text(label, x, y, 14, '#e9eef9'); text(`${n}/${total}`, x + w, y, 14, '#ffffff', 'right');
    g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(x, y + 12, w, 6); g.fillStyle = color; g.fillRect(x, y + 12, w * Math.min(1, n / total), 6);
  };

  return {
    root,
    set open(on) { root.style.display = on ? 'block' : 'none'; },
    draw() {
      const s = game.stats, ri = rankInfo(game.rp), p = game.player, f = p.inCar || p;
      g.clearRect(0, 0, W, H);
      text('SOLMAR BAY  -  CAREER', 30, 30, 26, '#ffd23f');
      text(`RANK ${ri.rank} · ${ri.title.toUpperCase()}   ${Math.round(game.rp)} RP`, 30, 60, 15, '#cfd8ea');
      text('$' + Math.round(game.money).toLocaleString('en-US'), W - 30, 32, 30, '#6ee08a', 'right');
      text('TAB / Esc - close', W - 30, 60, 13, '#8d97ab', 'right');
      // city map with district standing
      g.fillStyle = 'rgba(22,28,44,0.92)'; g.fillRect(MAP_X - 10, MAP_Y - 12, WORLD_W * MAP_K + 20, WORLD_H * MAP_K + 24);
      g.save(); g.beginPath(); g.rect(MAP_X - 10, MAP_Y - 12, WORLD_W * MAP_K + 20, WORLD_H * MAP_K + 24); g.clip();
      g.drawImage(base, 0, 0, base.width, base.height, MAP_X - PAD * MAP_K, MAP_Y - PAD * MAP_K, (base.width / RES) * MAP_K, (base.height / RES) * MAP_K);
      g.restore();
      for (const l of labels) {
        const st = standingOf(game, l.name), q = toMap(l.x, l.z);
        text(l.name.toUpperCase(), q.x, q.y - 9, 13, '#ffffff', 'center');
        text(`${st.title.toUpperCase()} ${Math.round(st.value)}`, q.x, q.y + 8, 13, STAND_COL[Math.min(4, Math.floor(st.value / 25))], 'center');
      }
      for (const cr of game.crabs) if (!cr.got) { const q = toMap(cr.x, cr.z); g.fillStyle = '#ffc933'; g.beginPath(); g.arc(q.x, q.y, 2.5, 0, 7); g.fill(); }
      for (const m of getObjective(game).markers) { const q = toMap(m.x, m.z); g.fillStyle = m.color; g.beginPath(); g.arc(q.x, q.y, 6, 0, 7); g.fill(); g.strokeStyle = '#101218'; g.lineWidth = 1.5; g.stroke(); }
      const q = toMap(f.x, f.z);
      g.save(); g.translate(q.x, q.y); g.rotate(Math.PI - f.heading); g.beginPath(); g.moveTo(0, -10); g.lineTo(7, 8); g.lineTo(0, 3); g.lineTo(-7, 8); g.closePath();
      g.fillStyle = '#fff'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#101218'; g.stroke(); g.restore();
      // checklist
      const RX = 730, RW = 520;
      panel(RX, 92, RW, 212, 'COMPLETION');
      const known = DISTRICTS.filter((d) => standingOf(game, d).value >= 25).length;
      barRow(RX + 20, 134, RW - 40, 'Story missions', game.mission.completed, MISSION_COUNT, '#ffd23f');
      barRow(RX + 20, 162, RW - 40, 'Golden crabs', s.crabs, 12, '#ffc933');
      barRow(RX + 20, 190, RW - 40, 'Districts known (standing 25+)', known, DISTRICTS.length, '#5ee08a');
      barRow(RX + 20, 218, RW - 40, 'Street race wins', Math.min(s.races, 1), 1, '#7ec8ff');
      barRow(RX + 20, 246, RW - 40, 'Crew recruited', game.crew.length, 3, '#c78bff');
      barRow(RX + 20, 274, RW - 40, 'Weapons owned', Math.min(4, p.owned.filter(Boolean).length), 4, '#ff7a45');
      // career
      panel(RX, 316, 250, 134, 'CAREER');
      [['People taken out', s.kills], ['Cops down', s.copKills], ['Highest wanted', s.wantedMax + ' ★'], ['Distance driven', (s.distance / 1000).toFixed(1) + ' km']].forEach(([a, b], i) => {
        text(a, RX + 18, 356 + i * 24, 14, '#cfd8ea'); text(String(b), RX + 232, 356 + i * 24, 14, '#fff', 'right');
      });
      // save slot
      panel(RX + 270, 316, 250, 134, 'SAVE SLOT');
      text('AUTOSAVE · SLOT 1', RX + 288, 356, 14, '#ffffff');
      text(`Chapter ${Math.min(game.mission.index + 1, MISSION_COUNT)}/${MISSION_COUNT}`, RX + 288, 380, 14, '#cfd8ea');
      text('$' + Math.round(game.money).toLocaleString('en-US') + ' · ' + Math.round(game.rp) + ' RP', RX + 288, 404, 14, '#cfd8ea');
      text('Saved when you pause', RX + 288, 430, 13, '#6ee08a', 'left', 'normal');
      // mission log
      panel(30, 590, W - 60, 104, 'MISSION LOG');
      const cw = (W - 100) / 4;
      missionDefs.forEach((m, i) => {
        const done = i < game.mission.completed, cur = i === game.mission.index, cx = 46 + (i % 4) * cw, cy = 630 + Math.floor(i / 4) * 34;
        text(done ? '✔' : cur ? '▶' : '·', cx, cy, 16, done ? '#5ee08a' : cur ? '#ffd23f' : '#6b7690');
        text(`${m.chapter}. ${m.title}`, cx + 22, cy, 15, done ? '#e9eef9' : cur ? '#ffd23f' : '#8d97ab');
        text('$' + m.reward.toLocaleString('en-US'), cx + cw - 30, cy, 14, done ? '#6ee08a' : '#8d97ab', 'right');
      });
    },
  };
}
