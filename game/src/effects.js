// Visual effects state: particles (smoke, sparks, flashes), skid marks and camera shake.

const MAX_PARTICLES = 420; // oldest particle is dropped beyond this cap so long chases stay cheap
const MAX_SKIDS = 900;

export function emitParticle(game, x, y, vx, vy, life, size, color, grow = 0, glow = false) {
  if (game.particles.length >= MAX_PARTICLES) game.particles.shift();
  game.particles.push({ x, y, vx, vy, life, maxLife: life, size, color, grow, glow });
}

export function emitPuff(game, x, y, color, count, speed, size = 5) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2, s = Math.random() * speed;
    emitParticle(game, x, y, Math.cos(a) * s, Math.sin(a) * s, 0.5 + Math.random() * 0.5, size, color, 8);
  }
}

export function emitSparks(game, x, y, count) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 180;
    emitParticle(game, x, y, Math.cos(a) * s, Math.sin(a) * s, 0.2 + Math.random() * 0.25, 2, '#ffd36b', -2, true);
  }
}

export function emitMuzzleFlash(game, x, y, angle) {
  emitParticle(game, x, y, Math.cos(angle) * 40, Math.sin(angle) * 40, 0.07, 8, '#fff2a8', -40, true);
  emitParticle(game, x, y, Math.cos(angle) * 90, Math.sin(angle) * 90, 0.1, 4, '#ffb347', -20, true);
}

export function emitExplosion(game, x, y) {
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2, s = Math.random() * 160;
    emitParticle(game, x, y, Math.cos(a) * s, Math.sin(a) * s, 0.5 + Math.random() * 0.7, 8 + Math.random() * 8, i % 3 ? '#ff8a2a' : '#3a3a3a', 14, i % 3 !== 0);
  }
}

export function addSkid(game, x, y, angle) {
  if (game.skids.length >= MAX_SKIDS) game.skids.shift();
  game.skids.push({ x, y, angle, life: 14 });
}

export function addShake(game, amount) {
  game.camera.shake = Math.min(14, Math.max(game.camera.shake, amount));
}

export function updateEffects(game, dt) {
  const ps = game.particles;
  for (let i = ps.length - 1; i >= 0; i--) {
    const p = ps[i];
    p.life -= dt;
    if (p.life <= 0) { ps[i] = ps[ps.length - 1]; ps.pop(); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= 1 - 2 * dt; p.vy *= 1 - 2 * dt;
    p.size = Math.max(0.5, p.size + p.grow * dt);
  }
  for (const s of game.skids) s.life -= dt;
  while (game.skids.length && game.skids[0].life <= 0) game.skids.shift();
  game.camera.shake = Math.max(0, game.camera.shake - 20 * dt);
}
