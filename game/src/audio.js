// WebAudio synthesis: engine hum, sirens, gunshots, pickups, explosions and a looping radio sequencer (SOLMAR FM 98.4).
let ctx = null, master = null, engineOsc = null, engineOsc2 = null, engineGain = null, sirenOsc = null, sirenGain = null, radioGain = null, noiseBuf = null;
let muted = false, radioOn = false, step = 0, nextT = 0, timer = null, track = 0, radioMix = 0.5;

export const STATION = 'SOLMAR FM 98.4';
export const TRACKS = [
  { name: 'Golden Hour Drive', bpm: 104, root: 45, scale: [0, 3, 5, 7, 10], bass: [0, 0, 3, 5], lead: [7, 10, 12, 10, 7, 5, 3, 5] },
  { name: 'Neon Palms', bpm: 116, root: 43, scale: [0, 2, 4, 7, 9], bass: [0, 7, 5, 3], lead: [12, 9, 7, 9, 12, 14, 12, 9] },
  { name: 'Harbor Lights', bpm: 92, root: 41, scale: [0, 3, 5, 7, 10], bass: [0, 5, 3, 7], lead: [10, 7, 5, 3, 5, 7, 10, 12] },
];
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.55; master.connect(ctx.destination);
    engineOsc = ctx.createOscillator(); engineOsc.type = 'sawtooth';
    engineOsc2 = ctx.createOscillator(); engineOsc2.type = 'square';
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    engineGain = ctx.createGain(); engineGain.gain.value = 0;
    engineOsc.connect(lp); engineOsc2.connect(lp); lp.connect(engineGain); engineGain.connect(master);
    engineOsc.start(); engineOsc2.start();
    sirenOsc = ctx.createOscillator(); sirenOsc.type = 'triangle';
    sirenGain = ctx.createGain(); sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain); sirenGain.connect(master); sirenOsc.start();
    radioGain = ctx.createGain(); radioGain.gain.value = 0.0; radioGain.connect(master);
    const n = ctx.sampleRate * 1.2;
    noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { ctx = null; }
}

export function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.55;
  return muted;
}
export const isMuted = () => muted;

function env(g, t, a, d, peak) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}
function tone(freq, dur, type = 'square', vol = 0.2, slide = 0, delay = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  env(g, t, 0.01, dur, vol);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur, vol, freq = 1800, type = 'lowpass', delay = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + delay, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; f.type = type; f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(Math.max(80, freq * 0.2), t + dur);
  env(g, t, 0.004, dur, vol);
  s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.05);
}

export function play(name, vol = 1) {
  if (!ctx || muted) return;
  switch (name) {
    case 'shot': noise(0.16, 0.5 * vol, 3200); tone(160, 0.1, 'sawtooth', 0.25 * vol, -90); break;
    case 'smg': noise(0.08, 0.35 * vol, 3600); tone(200, 0.06, 'sawtooth', 0.15 * vol, -100); break;
    case 'shotgun': noise(0.3, 0.7 * vol, 2400); tone(110, 0.2, 'sawtooth', 0.4 * vol, -70); break;
    case 'copshot': noise(0.12, 0.2 * vol, 2600); break;
    case 'punch': noise(0.07, 0.3 * vol, 700); tone(90, 0.08, 'sine', 0.3, -40); break;
    case 'reload': tone(900, 0.04, 'square', 0.1); tone(600, 0.05, 'square', 0.1, 0, 0.35); break;
    case 'pickup': tone(660, 0.08, 'square', 0.16); tone(990, 0.12, 'square', 0.16, 0, 0.07); break;
    case 'crab': tone(880, 0.08, 'triangle', 0.2); tone(1320, 0.08, 'triangle', 0.2, 0, 0.07); tone(1760, 0.14, 'triangle', 0.2, 0, 0.14); break;
    case 'click': tone(520, 0.05, 'square', 0.1); break;
    case 'jingle': [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'triangle', 0.22, 0, i * 0.11)); break;
    case 'fail': [330, 262, 196].forEach((f, i) => tone(f, 0.25, 'sawtooth', 0.18, 0, i * 0.16)); break;
    case 'crash': noise(0.25, 0.5 * vol, 900); tone(70, 0.2, 'sine', 0.4 * vol, -30); break;
    case 'explosion': noise(1.1, 0.9, 1200); tone(55, 0.8, 'sine', 0.6, -30); break;
    case 'horn': tone(330, 0.35, 'sawtooth', 0.18); tone(415, 0.35, 'sawtooth', 0.14); break;
    case 'door': noise(0.09, 0.25, 500); tone(120, 0.06, 'square', 0.12); break;
    case 'wanted': tone(880, 0.12, 'square', 0.2); tone(660, 0.12, 'square', 0.2, 0, 0.14); break;
    case 'heli': noise(0.5, 0.15, 400, 'bandpass'); break;
    default: break;
  }
}

// speed01: 0..1.2 of top speed; load: throttle 0..1; on: player is in a car.
export function setEngine(speed01, load, on) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const f = 38 + speed01 * 130 + load * 14;
  engineOsc.frequency.setTargetAtTime(f, t, 0.06); engineOsc2.frequency.setTargetAtTime(f * 0.5, t, 0.06);
  engineGain.gain.setTargetAtTime(on ? 0.06 + load * 0.07 : 0, t, 0.1);
}
export function setSiren(level, time = 0) {
  if (!ctx) return;
  const t = ctx.currentTime;
  sirenGain.gain.setTargetAtTime(level * 0.06, t, 0.1);
  sirenOsc.frequency.setTargetAtTime(760 + 340 * Math.sin(time * 5.5), t, 0.03);
}

// Radio sequencer: lookahead scheduler, one bar pattern per track.
export function startMusic() {
  if (!ctx || timer) return;
  radioOn = true; nextT = ctx.currentTime + 0.1; step = 0;
  timer = setInterval(schedule, 120);
}
export function setTrack(i) { track = ((i % TRACKS.length) + TRACKS.length) % TRACKS.length; }
export const currentTrack = () => TRACKS[track];
export function setRadioLevel(v) { radioMix = v; if (radioGain && ctx) radioGain.gain.setTargetAtTime(muted ? 0 : v, ctx.currentTime, 0.2); }

function schedule() {
  if (!ctx || !radioOn) return;
  const tr = TRACKS[track], dur = 60 / tr.bpm / 2;
  while (nextT < ctx.currentTime + 0.35) {
    const s = step % 16, bar = Math.floor(step / 16) % 4;
    const bassNote = tr.root + tr.bass[bar] - 12;
    const play1 = (m, d, type, vol, t) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.value = mtof(m);
      env(g, t, 0.01, d, vol); o.connect(g); g.connect(radioGain); o.start(t); o.stop(t + d + 0.05);
    };
    if (s % 4 === 0) play1(bassNote, dur * 3, 'triangle', 0.5, nextT);
    if (s % 2 === 0 && s % 8 !== 6) play1(bassNote + 12, dur * 0.8, 'square', 0.1, nextT);
    if (s % 2 === 1) { // hat
      const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      src.buffer = noiseBuf; f.type = 'highpass'; f.frequency.value = 7000; env(g, nextT, 0.002, 0.04, 0.12);
      src.connect(f); f.connect(g); g.connect(radioGain); src.start(nextT); src.stop(nextT + 0.08);
    }
    if (s === 0 || s === 8) { // kick
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(140, nextT); o.frequency.exponentialRampToValueAtTime(40, nextT + 0.12);
      env(g, nextT, 0.003, 0.14, 0.7); o.connect(g); g.connect(radioGain); o.start(nextT); o.stop(nextT + 0.2);
    }
    if (s % 2 === 0) {
      const n = tr.lead[(s / 2 + bar * 3) % tr.lead.length];
      if (((s / 2 + bar) % 3) !== 2) play1(tr.root + 12 + n, dur * 1.6, 'sawtooth', 0.12, nextT);
    }
    nextT += dur; step++;
  }
}
