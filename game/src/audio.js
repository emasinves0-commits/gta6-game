// WebAudio synthesiser: engine hum, police siren, gunshots, pickups, UI clicks, jingles and a bass-line music loop.
// Nothing is loaded from disk; every sound is generated from oscillators and noise. Starts on a user gesture.

let ctx = null, master = null, noiseBuffer = null, muted = false;
let engine = null, siren = null, sirenFlip = 0;
let musicOn = false, musicStep = 0, musicNext = 0, musicTimer = null;

export function isMuted() { return muted; }

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return;
  ctx = new Ctor();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.55;
  master.connect(ctx.destination);
  noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  buildEngine();
  buildSiren();
}

export function toggleMute() {
  muted = !muted;
  if (master) master.gain.setTargetAtTime(muted ? 0 : 0.55, ctx.currentTime, 0.03);
  return muted;
}

function buildEngine() {
  const low = ctx.createOscillator(), high = ctx.createOscillator(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
  low.type = 'sawtooth'; high.type = 'square';
  filter.type = 'lowpass'; filter.frequency.value = 500;
  gain.gain.value = 0;
  low.connect(filter); high.connect(filter); filter.connect(gain); gain.connect(master);
  low.start(); high.start();
  engine = { low, high, filter, gain };
}

function buildSiren() {
  const osc = ctx.createOscillator(), gain = ctx.createGain(), filter = ctx.createBiquadFilter();
  osc.type = 'square'; osc.frequency.value = 760; filter.type = 'lowpass'; filter.frequency.value = 2200;
  gain.gain.value = 0;
  osc.connect(filter); filter.connect(gain); gain.connect(master);
  osc.start();
  siren = { osc, gain };
}

// speed01 is 0..1 of top speed; loudness 0 silences the engine (on foot).
export function setEngine(speed01, loudness) {
  if (!ctx || !engine) return;
  const t = ctx.currentTime, f = 42 + speed01 * 120;
  engine.low.frequency.setTargetAtTime(f, t, 0.05);
  engine.high.frequency.setTargetAtTime(f * 0.5, t, 0.05);
  engine.filter.frequency.setTargetAtTime(260 + speed01 * 700, t, 0.08);
  engine.gain.gain.setTargetAtTime(loudness * (0.05 + speed01 * 0.08), t, 0.1);
}

// Two-tone siren; volume scales with how close the nearest police car is.
export function setSiren(volume) {
  if (!ctx || !siren) return;
  const t = ctx.currentTime;
  siren.gain.gain.setTargetAtTime(volume * 0.05, t, 0.1);
  if (volume > 0.01 && t > sirenFlip) {
    sirenFlip = t + 0.42;
    const high = Math.round(t / 0.42) % 2 === 0;
    siren.osc.frequency.setValueAtTime(high ? 980 : 720, t);
  }
}

function noiseBurst(duration, freq, q, gainValue, type = 'bandpass', delay = 0) {
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
  src.buffer = noiseBuffer; filter.type = type; filter.frequency.value = freq; filter.Q.value = q;
  gain.gain.setValueAtTime(gainValue, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
  src.connect(filter); filter.connect(gain); gain.connect(master);
  src.start(t, Math.random() * 0.5); src.stop(t + duration + 0.02);
}

function tone(freq, duration, type, gainValue, delay = 0, slideTo = null) {
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.type = type; osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
  gain.gain.setValueAtTime(gainValue, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.connect(gain); gain.connect(master);
  osc.start(t); osc.stop(t + duration + 0.02);
}

export function play(name, vol = 1) {
  if (!ctx || muted) return;
  switch (name) {
    case 'shot': noiseBurst(0.14, 1800, 0.7, 0.5 * vol); tone(150, 0.12, 'triangle', 0.4 * vol, 0, 50); break;
    case 'enemyShot': noiseBurst(0.12, 1300, 0.7, 0.22 * vol); break;
    case 'reload': tone(300, 0.05, 'square', 0.12); tone(480, 0.06, 'square', 0.12, 0.35); break;
    case 'empty': tone(220, 0.04, 'square', 0.1); break;
    case 'punch': noiseBurst(0.09, 400, 0.8, 0.5, 'lowpass'); break;
    case 'pickup': tone(880, 0.08, 'sine', 0.25); tone(1320, 0.12, 'sine', 0.25, 0.07); break;
    case 'click': tone(620, 0.04, 'square', 0.12); break;
    case 'door': noiseBurst(0.07, 250, 1, 0.35, 'lowpass'); break;
    case 'crash': noiseBurst(0.25, 500, 0.5, 0.6 * vol, 'lowpass'); tone(90, 0.2, 'sawtooth', 0.25 * vol, 0, 40); break;
    case 'explosion': noiseBurst(0.9, 300, 0.4, 0.9, 'lowpass'); tone(80, 0.8, 'sawtooth', 0.5, 0, 25); break;
    case 'hurt': tone(200, 0.15, 'sawtooth', 0.25, 0, 110); break;
    case 'wanted': tone(520, 0.1, 'square', 0.15); tone(390, 0.14, 'square', 0.15, 0.1); break;
    case 'fail': [330, 262, 196].forEach((f, i) => tone(f, 0.28, 'sawtooth', 0.2, i * 0.2)); break;
    case 'jingle': [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.28, i * 0.11)); break;
    case 'horn': tone(330, 0.28, 'square', 0.1); tone(415, 0.28, 'square', 0.1); break;
    default: break;
  }
}

// Simple looping bass line with kick and hat, scheduled slightly ahead of the audio clock.
const BASS = [55, 55, 82.4, 55, 65.4, 65.4, 98, 65.4, 73.4, 73.4, 110, 73.4, 61.7, 61.7, 92.5, 82.4];

export function startMusic() {
  if (!ctx || musicOn) return;
  musicOn = true; musicStep = 0; musicNext = ctx.currentTime + 0.1;
  musicTimer = setInterval(scheduleMusic, 80);
}

export function stopMusic() {
  musicOn = false;
  if (musicTimer) clearInterval(musicTimer);
  musicTimer = null;
}

function scheduleMusic() {
  if (!ctx || !musicOn) return;
  const stepLen = 60 / 104 / 2;
  while (musicNext < ctx.currentTime + 0.25) {
    const i = musicStep % 16, delay = Math.max(0, musicNext - ctx.currentTime);
    if (!muted) {
      tone(BASS[i], stepLen * 0.9, 'triangle', 0.16, delay);
      tone(BASS[i] * 2.01, stepLen * 0.5, 'sine', 0.04, delay);
      if (i % 4 === 0) tone(110, 0.14, 'sine', 0.22, delay, 40);
      if (i % 2 === 1) noiseBurst(0.04, 7000, 1, 0.05, 'highpass', delay);
      if (i % 8 === 4) noiseBurst(0.12, 1800, 0.6, 0.08, 'bandpass', delay);
      if (i === 0 && Math.floor(musicStep / 16) % 2 === 1) [220, 261.6, 329.6].forEach((f) => tone(f, stepLen * 7, 'sine', 0.025, delay));
    }
    musicNext += stepLen; musicStep++;
  }
}
