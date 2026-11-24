// DOM HUD: reads live game state every frame and writes only what changed.
// Panels: mission tracker, SBPD dispatch, wanted stars, cash/clock, district standing, rank + RP, minimap,
// health + armour, radio, weapon slots, vehicle readout, crew cards, dialogue box, banner, notifications.
import { WEAPONS, DISTRICTS } from './config.js';
import { districtAt } from './city.js';
import { getObjective, PORTRAITS } from './missions.js';
import { getDispatch } from './police.js';
import { CAR_TYPES } from './vehicles.js';
import { STATION, currentTrack } from './audio.js';
import { rankInfo, standingOf } from './stats.js';

const $ = (id) => document.getElementById(id);

// Portrait palette (canvas fill colours) and the vignette's damage colour, named once.
const COL_PORTRAIT_BG = '#2d3650', COL_SUIT = '#111', COL_SHIRT_FRONT = '#fff', COL_EYES = '#111', COL_MOUTH = '#7a2a2a', COL_CAP_DEFAULT = '#f2f2f2';
const VIGNETTE_RGB = '210,20,20';
// Class names toggled on HUD elements.
const CLS_ON = 'on', CLS_FLASH = 'flash', CLS_HAVE = 'have', CLS_SEL = 'sel', CLS_COOL = 'cool', CLS_ACT = 'act';

export function createHud(game) {
  const el = {};
  for (const id of ['m-chap', 'm-stage', 'm-title', 'm-prog', 'm-next', 'm-dist', 'dispatch', 'd-code', 'd-rows', 'stars', 'cash', 'clock', 'dist-name', 'dist-stand', 'dist-rep',
    'rank-name', 'rank-rp', 'rank-bar', 'x-crabs', 'x-race', 'notifs', 'hp-v', 'ar-v', 'hp', 'ar', 'r-track', 'weapons', 'v-name', 'v-cond', 'v-spd', 'v-bar', 'crew', 'dialog', 'd-face',
    'dl-who', 'dl-txt', 'banner', 'b-big', 'b-sub', 'prompt', 'crosshair', 'vig', 'mission']) el[id] = $(id);
  const cache = new Map();
  // write a value into the DOM only when it differs from the last frame
  const put = (key, value, apply) => { if (cache.get(key) !== value) { cache.set(key, value); apply(value); } };
  const text = (id, v) => put(id, v, (x) => { el[id].textContent = x; });
  const width = (id, f) => put('w' + id, Math.round(Math.max(0, Math.min(1, f)) * 1000), (x) => { el[id].style.width = x / 10 + '%'; });

  // static builders
  el.stars.innerHTML = '<span>★</span>'.repeat(5);
  const starEls = [...el.stars.children];
  const slotEls = WEAPONS.map((w, i) => {
    const d = document.createElement('div');
    d.className = 'slot';
    d.innerHTML = `<span class="k">${i + 1}</span><div class="n">${w.name}</div><div class="a"></div>`;
    el.weapons.appendChild(d);
    return { d, a: d.querySelector('.a') };
  });
  const crewEls = game.crew.map((c) => {
    const d = document.createElement('div');
    d.className = 'card';
    d.innerHTML = `<div class="who"><span class="${c.role}">${c.role}</span><b>${c.key.toUpperCase()}</b></div><div class="nm">${c.name}</div><div class="ab">${c.ability}</div><div class="cd"></div>`;
    el.crew.appendChild(d);
    return { d, cd: d.querySelector('.cd') };
  });
  const bars = { hp: el.hp.firstElementChild, ar: el.ar.firstElementChild };

  function drawPortrait(name) {
    const cv = el['d-face'], g = cv.getContext('2d'), P = PORTRAITS[name] || PORTRAITS.Jax;
    g.clearRect(0, 0, 108, 108);
    g.fillStyle = COL_PORTRAIT_BG; g.fillRect(0, 0, 108, 108);
    g.fillStyle = P.shirt; g.beginPath(); g.moveTo(10, 108); g.quadraticCurveTo(54, 66, 98, 108); g.fill();
    if (P.suit) { g.fillStyle = COL_SUIT; g.fillRect(22, 84, 64, 24); g.fillStyle = COL_SHIRT_FRONT; g.beginPath(); g.moveTo(46, 84); g.lineTo(62, 84); g.lineTo(54, 108); g.fill(); }
    g.fillStyle = P.hair;
    if (P.long) g.fillRect(24, 28, 60, 62);
    g.fillStyle = P.skin; g.beginPath(); g.ellipse(54, 52, 24, 28, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = P.hair; g.beginPath(); g.ellipse(54, 34, 26, 15, 0, Math.PI, 0); g.fill();
    if (P.cap) { g.fillStyle = P.cap === true ? COL_CAP_DEFAULT : P.cap; g.fillRect(28, 26, 52, 10); g.fillRect(48, 34, 38, 5); }
    g.fillStyle = COL_EYES; g.fillRect(42, 52, 5, 6); g.fillRect(62, 52, 5, 6);
    g.fillStyle = COL_MOUTH; g.fillRect(46, 68, 16, 3);
  }

  const MINUTES_PER_DAY = 1440;
  const two = (n) => String(Math.floor(n)).padStart(2, '0');
  const clockText = () => {
    const t = ((game.clock % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY; // wrap into 0..1439, also for negatives
    return `${two(t / 60)}:${two(t % 60)}`;
  };

  return function updateHud() {
    const p = game.player, w = game.wanted, obj = getObjective(game);
    // mission tracker
    text('m-chap', `CHAPTER ${obj.chapter}${obj.active ? '' : ' · NEXT JOB'}`);
    text('m-stage', obj.stages ? `STAGE ${obj.active ? obj.stage : 0}/${obj.stages}` : 'FREE ROAM');
    text('m-title', obj.title || (game.mission.storyComplete ? 'Solmar Bay Royalty' : 'Waiting for a call'));
    width('m-prog', obj.progress);
    text('m-next', obj.text);
    const tgt = obj.target;
    text('m-dist', tgt ? `Waypoint ${Math.round(Math.hypot(tgt.x - p.x, tgt.z - p.z))} m` : '');
    // wanted stars
    starEls.forEach((s, i) => put('star' + i, i < w.stars, (on) => s.classList.toggle(CLS_ON, on)));
    put('starflash', w.flash > 0, (on) => el.stars.classList.toggle(CLS_FLASH, on));
    // dispatch
    const units = w.stars > 0 ? getDispatch(game) : [];
    put('dispatch-show', w.stars > 0, (on) => { el.dispatch.style.display = on ? 'block' : 'none'; });
    if (w.stars > 0) {
      text('d-code', `CODE ${w.stars}`);
      const rows = units.slice(0, 5).map((u) => `<div class="row"><span>${u.name}</span><span class="role ${u.role.split(' ')[0]}">${u.role}</span><span class="d">${u.dist}m</span></div>`).join('')
        || '<div class="row"><span>---</span><span class="role">SEARCHING</span><span class="d"></span></div>';
      put('d-rows', rows, (h) => { el['d-rows'].innerHTML = h; });
    }
    // money, clock, district, rank
    text('cash', '$' + Math.round(game.money).toLocaleString('en-US'));
    text('clock', clockText());
    const dn = districtAt(p.x, p.z), st = standingOf(game, dn);
    text('dist-name', dn); text('dist-stand', st.title.toUpperCase()); width('dist-rep', st.value / 100);
    const ri = rankInfo(game.rp);
    text('rank-name', `RANK ${ri.rank} · ${ri.title.toUpperCase()}`);
    text('rank-rp', ri.hi > ri.lo ? `${Math.round(game.rp)} / ${ri.hi} RP` : `${Math.round(game.rp)} RP`);
    width('rank-bar', ri.frac);
    text('x-crabs', `${game.stats.crabs}/12`);
    const r = game.race;
    text('x-race', r.state === 'run' ? `${Math.max(0, r.limit - r.t).toFixed(0)}s · ${r.cp}/4` : r.best ? `BEST ${r.best.toFixed(1)}s` : 'READY');
    // vitals
    text('hp-v', Math.max(0, Math.round(p.hp))); text('ar-v', Math.round(p.armor));
    bars.hp.style.width = Math.max(0, Math.min(100, p.hp)) + '%'; bars.ar.style.width = Math.max(0, Math.min(100, p.armor)) + '%';
    // radio
    text('r-track', `♪ ${currentTrack().name}`);
    // weapons
    WEAPONS.forEach((wd, i) => {
      const s = slotEls[i], own = p.owned[i];
      put('own' + i, own, (v) => s.d.classList.toggle(CLS_HAVE, v));
      put('sel' + i, p.weapon === i, (v) => s.d.classList.toggle(CLS_SEL, v));
      const label = i === 0 ? '∞' : own ? `${p.mag[i]}/${p.reserve[i]}` : '--';
      put('ammo' + i, p.reloadT > 0 && p.weapon === i ? 'RELOAD' : label, (v) => { s.a.textContent = v; });
    });
    // vehicle
    const car = p.inCar;
    if (car) {
      const t = CAR_TYPES[car.type];
      text('v-name', t.name.toUpperCase()); text('v-cond', `CONDITION ${Math.round(car.hp)}%`);
      text('v-spd', Math.round(Math.abs(car.speed) * 3.6)); width('v-bar', car.hp / 100);
    } else {
      text('v-name', 'ON FOOT'); text('v-cond', p.reloadT > 0 ? 'RELOADING' : 'READY');
      text('v-spd', Math.round(p.moving * 3.6)); width('v-bar', p.hp / 100);
    }
    // crew
    game.crew.forEach((c, i) => {
      const e = crewEls[i];
      put('crewcool' + i, c.t > 0, (v) => e.d.classList.toggle(CLS_COOL, v));
      put('crewact' + i, c.active > 0, (v) => e.d.classList.toggle(CLS_ACT, v));
      width_(e.cd, c.t > 0 ? 1 - c.t / c.cd : 1, 'cd' + i);
    });
    // dialogue
    const dlg = game.dialog;
    put('dlg-show', !!dlg, (on) => { el.dialog.style.display = on ? 'flex' : 'none'; });
    if (dlg) {
      put('dlg-who', dlg.speaker, (v) => { el['dl-who'].textContent = v.toUpperCase(); drawPortrait(v); });
      text('dl-txt', dlg.text);
    }
    // banner
    const b = game.mission.banner;
    put('ban-show', !!b, (on) => { el.banner.style.display = on ? 'block' : 'none'; });
    if (b) {
      text('b-big', b.title); text('b-sub', b.sub);
      put('ban-kind', b.kind, (k) => { el.banner.className = k || ''; });
      el.banner.style.opacity = Math.min(1, b.t * 2.5);
    }
    // contextual prompt
    let prompt = '';
    if (!p.dead && !game.hideHud) {
      if (p.inCar) prompt = Math.abs(p.inCar.speed) < 2.5 ? '<kbd>E</kbd>EXIT VEHICLE' : '';
      else if (game.nearCar) prompt = '<kbd>E</kbd>ENTER ' + CAR_TYPES[game.nearCar.type].name.toUpperCase();
    }
    put('prompt', prompt, (h) => { el.prompt.innerHTML = h; el.prompt.style.display = h ? 'block' : 'none'; });
    // crosshair follows the mouse while aiming on foot
    const aiming = !p.inCar && p.weapon > 0 && (game.input.mouse.right || p.aimT > 0);
    put('xh', aiming, (on) => { el.crosshair.style.display = on ? 'block' : 'none'; });
    if (aiming) { el.crosshair.style.left = game.input.mouse.x + 'px'; el.crosshair.style.top = game.input.mouse.y + 'px'; }
    // damage vignette
    put('vig', Math.round(Math.max(game.hurtFlash || 0, p.hp < 30 ? 0.3 : 0) * 10), (v) => { el.vig.style.boxShadow = `inset 0 0 160px 40px rgba(${VIGNETTE_RGB},${v / 10})`; });
    // notifications
    const nk = game.notifs.map((n) => n.text).join('|');
    put('notifs', nk, () => { el.notifs.innerHTML = game.notifs.map((n) => `<div>${n.text}</div>`).join(''); });
    void DISTRICTS; void STATION;
  };

  function width_(node, f, key) {
    put(key, Math.round(f * 100), (v) => { node.style.width = v + '%'; });
  }
}
