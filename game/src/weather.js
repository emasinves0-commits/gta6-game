// Per-scene lighting looks for the ?shot= staged scenes: night (lit windows + lamps) and storm (rain streaks, wet roads, dark sky).
// Overrides only - the live game keeps its fixed golden-hour sky.
import * as THREE from 'three';

function skyTexture(stops) {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const g = c.getContext('2d'), grad = g.createLinearGradient(0, 0, 0, 256);
  for (const [at, col] of stops) grad.addColorStop(at, col);
  g.fillStyle = grad; g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Window texture -> emissive texture that keeps only the warm lit panes, so towers glow once the sun is gone.
function litWindowsOnly(map) {
  const src = map.image, c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const g = c.getContext('2d');
  g.drawImage(src, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height), px = d.data;
  for (let i = 0; i < px.length; i += 4) {
    const warm = px[i] > 225 && px[i + 1] > 150 && px[i + 2] < 190 && px[i] - px[i + 2] > 60;
    if (!warm) { px[i] = px[i + 1] = px[i + 2] = 0; }
  }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = map.wrapS; t.wrapT = map.wrapT; t.repeat.copy(map.repeat);
  return t;
}

function eachMaterial(scene, fn) {
  scene.traverse((o) => { if (o.isMesh && o.material && o.material.isMeshLambertMaterial) fn(o.material); });
}

function makeRain(count) {
  const pos = new Float32Array(count * 6);
  for (let i = 0; i < count; i++) {
    const x = (Math.random() - 0.5) * 70, y = Math.random() * 26, z = Math.random() * 60 - 8, len = 0.9 + Math.random() * 0.9;
    pos.set([x, y, z, x - len * 0.18, y - len, z - len * 0.06], i * 6);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xcfe0f2, transparent: true, opacity: 0.5, fog: false, depthWrite: false }));
  rain.frustumCulled = false; rain.renderOrder = 5;
  return rain;
}

/** look: 'night' | 'storm'. Call once, after the scene is staged. */
export function applyLook(game, look) {
  const { scene, sky, sunLight, renderer } = game;
  const hemi = scene.children.find((o) => o.isHemisphereLight);
  game.look = look;
  sky.sun.visible = false;
  if (look === 'night') {
    sky.dome.material.map = skyTexture([[0, '#070b1d'], [0.4, '#16214a'], [0.5, '#3a3a68'], [0.54, '#5a4566'], [1, '#1a1a2c']]);
    scene.fog.color.set(0x1a2040); scene.fog.near = 60; scene.fog.far = 420;
    hemi.color.set(0x5b6fb0); hemi.groundColor.set(0x1c1c30); hemi.intensity = 0.62;
    sunLight.color.set(0x8fa6e8); sunLight.intensity = 0.7;
    renderer.toneMappingExposure = 1.25;
    eachMaterial(scene, (m) => {
      if (m.map && m.vertexColors && m.map.image && m.map.image.width === 256 && m.map.image.height === 256 && !m.emissiveMap) {
        m.emissiveMap = litWindowsOnly(m.map); m.emissive.set(0xffffff); m.emissiveIntensity = 1.5; m.needsUpdate = true;
      }
    });
  } else if (look === 'storm') {
    sky.dome.material.map = skyTexture([[0, '#2a3138'], [0.4, '#4a545c'], [0.5, '#6d767c'], [0.54, '#59626a'], [1, '#3a4148']]);
    scene.fog.color.set(0x59636b); scene.fog.near = 40; scene.fog.far = 300;
    hemi.color.set(0x8a9aa8); hemi.groundColor.set(0x3a3f44); hemi.intensity = 0.9;
    sunLight.color.set(0xb4c4d4); sunLight.intensity = 1.0;
    renderer.toneMappingExposure = 1.15;
    eachMaterial(scene, (m) => { if (m.map && !m.vertexColors) m.color.multiplyScalar(0.62); }); // wet, dark asphalt + pavers
    game.rain = makeRain(2600);
    scene.add(game.rain);
  }
  sky.dome.material.needsUpdate = true;
}

/** Per-frame: keep the rain volume around the camera and let the streaks fall. */
export function updateWeather(game) {
  const r = game.rain;
  if (!r) return;
  const cam = game.camera, f = new THREE.Vector3();
  cam.getWorldDirection(f); f.y = 0; f.normalize();
  r.position.set(cam.position.x, 0, cam.position.z);
  r.rotation.y = Math.atan2(f.x, f.z);
}
