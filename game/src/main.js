// Game loop and state machine: title / playing / paused / help / busted / wasted, plus menu wiring.
import { createInput } from './input.js';
import { createGame, stepGame } from './world.js';
import { renderGame, setViewport, screenToWorld } from './render.js';
import { createHud, updateHud, setHudVisible } from './hud.js';
import { drawMinimap } from './minimap.js';
import { initAudio, toggleMute, startMusic, play, setEngine, setSiren } from './audio.js';
import { hasSave, saveGame, loadSave, applySave } from './save.js';
import { restoreMissionProgress, say } from './missions.js';
import { parseShotParams, stageShot, demoInput } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const input = createInput(canvas);
const hud = createHud();
const minimapCanvas = document.getElementById('minimap');
const screens = { title: 'title', paused: 'pause', help: 'help', busted: 'busted', wasted: 'wasted' };
const params = parseShotParams(window.location.search);

let game = createGame(params.seed);
let helpReturn = 'title';

function resize() {
  canvas.width = window.innerWidth; canvas.height = window.innerHeight;
  setViewport(game, canvas.width, canvas.height);
}
window.addEventListener('resize', resize);

function showScreen(state) {
  for (const [key, id] of Object.entries(screens)) document.getElementById(id).classList.toggle('on', key === state);
}

function setState(state) {
  game.state = state;
  showScreen(state);
  setHudVisible(hud, state !== 'title' && state !== 'help' || (state === 'help' && helpReturn === 'paused'));
}

// The title screen shows the drive scene running behind the menu (same staging as ?shot=drive).
function startDemoBackdrop() {
  stageShot(game, 'drive');
  game.state = 'title';
  game.noCrime = true;
}

function beginGame(saved) {
  game = createGame(params.seed);
  game.onMissionComplete = () => saveGame(game);
  if (saved) applySave(game, saved, restoreMissionProgress);
  resize();
  setState('playing');
  say(game, 'Jax', saved ? 'Back in Solmar Bay. Time to get to work.' : 'Out of the can, broke and in Solmar Bay. Follow the green marker.');
  startMusic();
}

function enterShotMode(name) {
  game.onMissionComplete = () => saveGame(game);
  stageShot(game, name);
  resize();
  setState('playing');
  startMusic();
}

function wireMenus() {
  const on = (id, fn) => document.getElementById(id).addEventListener('click', () => { initAudio(); play('click'); fn(); });
  on('btnPlay', () => beginGame(null));
  on('btnContinue', () => { const s = loadSave(); beginGame(s); });
  on('btnHelp', () => { helpReturn = 'title'; setState('help'); });
  on('btnHelpBack', () => setState(helpReturn));
  on('btnResume', () => setState('playing'));
  on('btnSave', () => { document.getElementById('saveNote').textContent = saveGame(game) ? 'Game saved.' : 'Saving is unavailable in this browser.'; });
  on('btnPauseHelp', () => { helpReturn = 'paused'; setState('help'); });
  on('btnQuit', () => { document.getElementById('saveNote').textContent = ''; goToTitle(); });
  document.getElementById('btnContinue').style.display = hasSave() ? 'block' : 'none';
}

function goToTitle() {
  setEngine(0, 0); setSiren(0);
  game = createGame(params.seed);
  resize();
  startDemoBackdrop();
  setState('title');
  document.getElementById('btnContinue').style.display = hasSave() ? 'block' : 'none';
}

function handleGlobalKeys() {
  if (input.wasPressed('KeyM')) { const muted = toggleMute(); game.notice = { text: muted ? 'Sound off' : 'Sound on', t: 1.5 }; }
  if (input.wasPressed('Escape', 'KeyP')) {
    if (game.state === 'playing') setState('paused');
    else if (game.state === 'paused') setState('playing');
    else if (game.state === 'help') setState(helpReturn);
  }
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
  last = now;
  setViewport(game, canvas.width, canvas.height);
  handleGlobalKeys();
  const state = game.state;
  if (state === 'playing' || state === 'title' || state === 'busted' || state === 'wasted') {
    game.mouseWorld = screenToWorld(game, input.mouseX, input.mouseY);
    if (game.autopilot && state === 'playing' && input.wasPressed('KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight')) { game.autopilot = null; game.demoMode = null; game.noCrime = false; }
    const live = state === 'playing' ? demoInput(game, input) : demoInput(game, { isDown: () => false, wasPressed: () => false, mouseDown: false, mouseClicked: false, down: new Set(), pressed: new Set() });
    stepGame(game, dt, live);
    // State may change inside stepGame (busted / wasted / back to playing).
    if (game.state !== state) { showScreen(game.state); setHudVisible(hud, true); }
  }
  renderGame(ctx, game);
  if (game.state !== 'title' && game.state !== 'help') { updateHud(hud, game); drawMinimap(minimapCanvas, game); }
  input.endFrame();
  requestAnimationFrame(frame);
}

function init() {
  wireMenus();
  input.onFirstGesture = () => initAudio();
  resize();
  if (params.shot) enterShotMode(params.shot);
  else startDemoBackdrop();
  if (!params.shot) setState('title');
  requestAnimationFrame(frame);
}

// Read-only handle for automated play-tests.
Object.defineProperty(window, '__solmar', { get: () => ({ game, input }) });
init();
