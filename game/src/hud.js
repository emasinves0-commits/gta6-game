// HUD DOM updates: health, money, wanted stars, ammo, speed, clock, objective tracker, banners and dialog.
import { MAX_STARS, PLAYER_MAX_HP } from './config.js';
import { getObjective } from './missions.js';
import { carSpeed } from './vehicles.js';
import { districtAt } from './city.js';
import { dispatchUnits } from './police.js';

// Radio playlist: one track per in-game hour (the WebAudio music is synthesized, the label just names it).
const TRACKS = ['Neon Undertow - Coastline Kiss', 'Sunset Drive - Palm Static', 'Midnight Marina - Velvet Tide', 'Concrete Waves - Jax & The Dealers', 'Saltwater Hearts - Lola Reyes', 'Chrome Horizon - Bay Runners'];
let unitCounter = 0;
const unitIds = new WeakMap(); // police car -> callsign number, assigned in spawn (first-seen) order

const $ = (id) => document.getElementById(id);

export function createHud() {
  const hud = {
    root: $('hud'), healthFill: $('healthFill'), money: $('money'), stars: $('stars'), ammo: $('ammo'), clock: $('clock'),
    objTitle: $('objTitle'), objText: $('objText'), objDist: $('objDist'), speed: $('speed'), speedValue: $('speedValue'),
    carName: $('carName'),
    dispatch: $('dispatch'), dispHead: $('dispHead'), dispCode: $('dispCode'), dispUnits: $('dispUnits'), district: $('district'),
    slotFists: $('slotFists'), slotPistol: $('slotPistol'), slotAmmo: $('slotAmmo'), radioTrack: $('radioTrack'), banner: $('banner'), dialog: $('dialog'), notice: $('notice'), last: {},
  };
  hud.stars.innerHTML = '<span class="star">&#9733;</span>'.repeat(MAX_STARS);
  return hud;
}

function setText(hud, key, el, value) {
  if (hud.last[key] === value) return;
  hud.last[key] = value; el.textContent = value;
}

export function setHudVisible(hud, visible) { hud.root.classList.toggle('on', visible); }

export function updateHud(hud, game) {
  const p = game.player;
  hud.healthFill.style.width = `${Math.max(0, p.hp / PLAYER_MAX_HP) * 100}%`;
  setText(hud, 'money', hud.money, `$${Math.floor(game.money).toLocaleString('en-US')}`);
  const stars = game.wanted.stars;
  if (hud.last.stars !== stars) {
    hud.last.stars = stars;
    [...hud.stars.children].forEach((el, i) => el.classList.toggle('lit', i < stars));
  }
  const mode = stars === 0 ? '' : game.wanted.seen ? 'hot' : 'cool';
  if (hud.last.mode !== mode) { hud.last.mode = mode; hud.stars.className = mode; }
  if (p.inCar) setText(hud, 'ammo', hud.ammo, '');
  else setText(hud, 'ammo', hud.ammo, p.reloadT > 0 ? 'RELOADING...' : `Pistol ${p.ammo} / ${p.reserve}`);
  const hour = Math.floor(game.clock / 60), minute = Math.floor(game.clock % 60);
  setText(hud, 'clock', hud.clock, `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);

  const obj = getObjective(game);
  setText(hud, 'objTitle', hud.objTitle, obj.active ? `Ch. ${game.mission.index + 1} - ${obj.title} - stage ${obj.step}` : 'Story');
  setText(hud, 'objText', hud.objText, obj.text);
  setText(hud, 'objDist', hud.objDist, obj.target ? `${Math.round(Math.hypot(obj.target.x - p.x, obj.target.y - p.y) / 10)} m to waypoint` : '');

  const car = p.inCar;
  hud.speed.style.display = car ? 'block' : 'none';
  if (car) {
    setText(hud, 'speed', hud.speedValue, String(Math.round(carSpeed(car) * 0.36)));
    setText(hud, 'carName', hud.carName, car.spec.name.toUpperCase());
  }
  updateDispatch(hud, game);
  setText(hud, 'district', hud.district, districtAt(p.x, p.y).toUpperCase());
  const pistolOut = !p.inCar;
  hud.slotPistol.classList.toggle('eq', pistolOut); hud.slotFists.classList.toggle('eq', !pistolOut);
  setText(hud, 'slotAmmo', hud.slotAmmo, `${p.ammo} / ${p.reserve}`);
  setText(hud, 'radio', hud.radioTrack, TRACKS[hour % TRACKS.length]);
  const b = game.mission.banner;
  if (b) {
    hud.banner.style.display = 'block'; hud.banner.className = `panel ${b.kind}`;
    const key = b.title + b.sub;
    if (hud.last.banner !== key) { hud.last.banner = key; hud.banner.children[0].textContent = b.title; hud.banner.children[1].textContent = b.sub; }
    hud.banner.style.opacity = Math.min(1, b.t * 2);
  } else { hud.banner.style.display = 'none'; hud.last.banner = ''; }
  const d = game.dialog;
  if (d) {
    hud.dialog.style.display = 'block';
    const key = d.speaker + d.text;
    if (hud.last.dialog !== key) { hud.last.dialog = key; hud.dialog.innerHTML = ''; const b2 = document.createElement('b'); b2.textContent = `${d.speaker}: `; hud.dialog.append(b2, d.text); }
  } else { hud.dialog.style.display = 'none'; hud.last.dialog = ''; }
  if (game.notice) { hud.notice.style.display = 'block'; hud.notice.textContent = game.notice.text; } else hud.notice.style.display = 'none';
}

// SBPD dispatch panel: real police cars, nearest first, with callsign, distance in metres and status.
function updateDispatch(hud, game) {
  const p = game.player, stars = game.wanted.stars;
  const cars = dispatchUnits(game);
  if (stars < 1 || !cars.length) { hud.dispatch.style.display = 'none'; hud.last.dispatch = ''; return; }
  hud.dispatch.style.display = 'block';
  const units = cars.map((c) => {
    if (!unitIds.has(c)) unitIds.set(c, ++unitCounter);
    const d = Math.hypot(c.x - p.x, c.y - p.y);
    const status = c.roadblock ? 'ROADBLOCK' : d < 120 && Math.hypot(c.vx, c.vy) > 120 ? 'RAMMING' : 'PURSUIT';
    return { id: unitIds.get(c), d, status };
  }).sort((a, b) => a.d - b.d).slice(0, 6).sort((a, b) => a.id - b.id);
  const key = `${stars}|${cars.length}|` + units.map((u) => `${u.id}:${Math.round(u.d / 10)}:${u.status}`).join(',');
  if (hud.last.dispatch === key) return;
  hud.last.dispatch = key;
  hud.dispHead.textContent = `SBPD DISPATCH - ${cars.length} UNIT${cars.length === 1 ? '' : 'S'}`;
  hud.dispCode.textContent = `CODE ${stars}`;
  hud.dispUnits.innerHTML = '';
  for (const u of units) {
    const row = document.createElement('div'); row.className = 'unit';
    const name = document.createElement('span'); name.textContent = `SBPD-${String(((u.id - 1) % 99) + 1).padStart(2, '0')}`;
    const dist = document.createElement('span'); dist.textContent = `${Math.round(u.d / 10)} m`;
    const st = document.createElement('i'); st.className = u.status; st.textContent = u.status;
    row.append(name, dist, st); hud.dispUnits.append(row);
  }
}
