// HUD DOM updates: health, money, wanted stars, ammo, speed, clock, objective tracker, banners and dialog.
import { MAX_STARS, PLAYER_MAX_HP } from './config.js';
import { getObjective } from './missions.js';
import { carSpeed } from './vehicles.js';

const $ = (id) => document.getElementById(id);

export function createHud() {
  const hud = {
    root: $('hud'), healthFill: $('healthFill'), money: $('money'), stars: $('stars'), ammo: $('ammo'), clock: $('clock'),
    objTitle: $('objTitle'), objText: $('objText'), objDist: $('objDist'), speed: $('speed'), speedValue: $('speedValue'),
    carName: $('carName'), banner: $('banner'), dialog: $('dialog'), notice: $('notice'), last: {},
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
  setText(hud, 'objTitle', hud.objTitle, obj.active ? `${obj.title} - step ${obj.step}` : 'Story');
  setText(hud, 'objText', hud.objText, obj.text);
  setText(hud, 'objDist', hud.objDist, obj.target ? `${Math.round(Math.hypot(obj.target.x - p.x, obj.target.y - p.y) / 10)} m to waypoint` : '');

  const car = p.inCar;
  hud.speed.style.display = car ? 'block' : 'none';
  if (car) {
    setText(hud, 'speed', hud.speedValue, String(Math.round(carSpeed(car) * 0.36)));
    setText(hud, 'carName', hud.carName, car.spec.name.toUpperCase());
  }
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
