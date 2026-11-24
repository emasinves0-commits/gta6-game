// Visual effects: smoke, fire, sparks, muzzle flashes, explosions (sprite pool), skid marks (instanced), bullet tracers.
import * as THREE from 'three';

const MAX_PARTS = 260, MAX_SKIDS = 600, MAX_TRACERS = 28;

function softTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.5, 'rgba(255,255,255,0.55)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function initEffects(game) {
  const tex = softTexture();
  const fx = { parts: [], next: 0, skidI: 0, tracers: [], tNext: 0 };
  for (let k = 0; k < MAX_PARTS; k++) {
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 });
    const s = new THREE.Sprite(mat);
    s.visible = false;
    game.scene.add(s);
    fx.parts.push({ s, life: 0, max: 1, vx: 0, vy: 0, vz: 0, grow: 0, size: 1, a: 1, add: false, gravity: 0 });
  }
  const skidGeo = new THREE.PlaneGeometry(0.3, 1.1).rotateX(-Math.PI / 2);
  fx.skids = new THREE.InstancedMesh(skidGeo, new THREE.MeshBasicMaterial({ color: 0x0c0c0c, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), MAX_SKIDS);
  fx.skids.frustumCulled = false;
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let k = 0; k < MAX_SKIDS; k++) fx.skids.setMatrixAt(k, zero);
  game.scene.add(fx.skids);
  const tg = new THREE.BoxGeometry(0.05, 0.05, 1), tm = new THREE.MeshBasicMaterial({ color: 0xffe9a0 });
  for (let k = 0; k < MAX_TRACERS; k++) { const m = new THREE.Mesh(tg, tm); m.visible = false; game.scene.add(m); fx.tracers.push({ m, life: 0 }); }
  game.fx = fx;
}

function spawn(game, x, y, z, o) {
  const fx = game.fx;
  const p = fx.parts[fx.next]; fx.next = (fx.next + 1) % MAX_PARTS;
  p.life = p.max = o.life; p.vx = o.vx || 0; p.vy = o.vy || 0; p.vz = o.vz || 0; p.grow = o.grow || 0; p.size = o.size; p.a = o.a ?? 0.8; p.gravity = o.gravity || 0;
  p.s.material.color.setHex(o.color);
  p.s.material.blending = o.add ? THREE.AdditiveBlending : THREE.NormalBlending;
  p.s.position.set(x, y, z);
  p.s.scale.setScalar(o.size);
  p.s.visible = true;
}

export function emitSmoke(game, x, y, z, size = 1, color = 0x9a9a9a) {
  spawn(game, x + (Math.random() - 0.5) * 0.4, y, z + (Math.random() - 0.5) * 0.4, { life: 1.4 + Math.random() * 0.8, vx: (Math.random() - 0.5) * 0.8, vy: 1.6 + Math.random(), vz: (Math.random() - 0.5) * 0.8, grow: 1.6, size, color, a: 0.55 });
}
export function emitFire(game, x, y, z) {
  spawn(game, x, y, z, { life: 0.5, vx: (Math.random() - 0.5) * 0.8, vy: 2 + Math.random() * 1.5, vz: (Math.random() - 0.5) * 0.8, grow: -0.8, size: 1.3, color: Math.random() < 0.5 ? 0xff7a1c : 0xffc53a, a: 0.9, add: true });
}
export function sparks(game, x, y, z, n = 6) {
  for (let k = 0; k < n; k++) spawn(game, x, y, z, { life: 0.35 + Math.random() * 0.2, vx: (Math.random() - 0.5) * 7, vy: 1 + Math.random() * 4, vz: (Math.random() - 0.5) * 7, size: 0.18, color: 0xffd36a, a: 1, add: true, gravity: 12 });
}
export function muzzleFlash(game, x, y, z) {
  spawn(game, x, y, z, { life: 0.07, size: 0.9, color: 0xffe08a, a: 1, add: true });
}
export function dust(game, x, y, z, color = 0xc9b79a) {
  for (let k = 0; k < 3; k++) spawn(game, x, y, z, { life: 0.5, vx: (Math.random() - 0.5) * 2, vy: 0.8, vz: (Math.random() - 0.5) * 2, grow: 1.5, size: 0.5, color, a: 0.5 });
}
export function explosion(game, x, y, z) {
  for (let k = 0; k < 14; k++) spawn(game, x + (Math.random() - 0.5) * 1.5, y + Math.random(), z + (Math.random() - 0.5) * 1.5, { life: 0.7 + Math.random() * 0.4, vx: (Math.random() - 0.5) * 7, vy: 1 + Math.random() * 6, vz: (Math.random() - 0.5) * 7, grow: 2.2, size: 2.4, color: k % 2 ? 0xff7a1c : 0xffc53a, a: 1, add: true });
  for (let k = 0; k < 10; k++) spawn(game, x, y + 1, z, { life: 2 + Math.random(), vx: (Math.random() - 0.5) * 5, vy: 3 + Math.random() * 4, vz: (Math.random() - 0.5) * 5, grow: 2.5, size: 2.2, color: 0x2a2a2a, a: 0.65 });
  sparks(game, x, y, z, 14);
}

export function addSkid(game, x, z, heading) {
  const fx = game.fx, m = new THREE.Matrix4();
  m.compose(new THREE.Vector3(x, 0.045, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading), new THREE.Vector3(1, 1, 1));
  fx.skids.setMatrixAt(fx.skidI, m);
  fx.skidI = (fx.skidI + 1) % MAX_SKIDS;
  fx.skids.instanceMatrix.needsUpdate = true;
}

export function tracer(game, x0, y0, z0, x1, y1, z1) {
  const fx = game.fx, t = fx.tracers[fx.tNext]; fx.tNext = (fx.tNext + 1) % MAX_TRACERS;
  const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
  t.m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  t.m.scale.set(1, 1, Math.max(0.1, len));
  t.m.lookAt(x1, y1, z1);
  t.m.visible = true; t.life = 0.07;
}

export function updateEffects(game, dt) {
  const fx = game.fx;
  for (const p of fx.parts) {
    if (p.life <= 0) continue;
    p.life -= dt;
    if (p.life <= 0) { p.s.visible = false; continue; }
    p.vy -= p.gravity * dt;
    p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt;
    const k = p.life / p.max;
    p.s.scale.setScalar(Math.max(0.05, p.size + p.grow * (1 - k)));
    p.s.material.opacity = p.a * Math.min(1, k * 1.6);
  }
  for (const t of fx.tracers) if (t.life > 0) { t.life -= dt; if (t.life <= 0) t.m.visible = false; }
}
