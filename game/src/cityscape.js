// Builds the static 3D city: ground, roads with markings, sidewalks, buildings with canvas window textures,
// palms, park, plaza, parking lots, beach, sea, pier, marina and distant hills. All merged into a few meshes.
import * as THREE from 'three';
import { GeoBuilder } from './geometry.js';
import { COLS, ROWS, BLOCK, ROAD_W, PITCH, WORLD_W, ROADS_H, WORLD_H } from './config.js';
import { nodePos, blockRect } from './city.js';

function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function windowTexture(rng) {
  return canvasTex(256, 256, (g) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 256);
    for (let cy = 0; cy < 4; cy++) for (let cx = 0; cx < 4; cx++) {
      const x = cx * 64, y = cy * 64, lit = rng.chance(0.28);
      g.fillStyle = '#dcd3c8'; g.fillRect(x, y + 58, 64, 6); // floor slab
      const grad = g.createLinearGradient(x, y + 12, x + 40, y + 52);
      if (lit) { grad.addColorStop(0, '#ffe7a4'); grad.addColorStop(1, '#ffb867'); }
      else { grad.addColorStop(0, '#6f8da3'); grad.addColorStop(0.5, '#33505f'); grad.addColorStop(1, '#27404d'); }
      g.fillStyle = grad; g.fillRect(x + 11, y + 12, 42, 40);
      g.fillStyle = 'rgba(255,255,255,0.45)'; g.fillRect(x + 11, y + 12, 42, 3);
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + 31, y + 12, 2, 40);
    }
  });
}

function roadTexture() {
  return canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = '#3b3d44'; g.fillRect(0, 0, w, h);
    for (let n = 0; n < 900; n++) { const v = 52 + Math.random() * 22; g.fillStyle = `rgb(${v},${v},${v + 4})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    g.fillStyle = '#e9e2d4'; g.fillRect(4, 0, 3, h); g.fillRect(w - 7, 0, 3, h); // edge lines
    g.fillStyle = '#f2c230'; g.fillRect(w / 2 - 4, 0, 3, h); g.fillRect(w / 2 + 1, 0, 3, h); // centre double line
    g.fillStyle = '#e9e2d4';
    for (const lx of [w * 0.25, w * 0.75]) { g.fillRect(lx - 1, 20, 2, 70); g.fillRect(lx - 1, 148, 2, 70); } // lane dashes
  });
}

function plainAsphalt() {
  return canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#3d3f46'; g.fillRect(0, 0, w, h);
    for (let n = 0; n < 200; n++) { const v = 54 + Math.random() * 20; g.fillStyle = `rgb(${v},${v},${v + 4})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  });
}

function paverTexture(base, line) {
  return canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    g.fillStyle = line; g.fillRect(0, 0, w, 2); g.fillRect(0, 0, 2, h); g.fillRect(w / 2, 0, 2, h / 2); g.fillRect(w / 2, h / 2, 2, h / 2);
  });
}

function seaTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#1d86ad'; g.fillRect(0, 0, w, h);
    for (let n = 0; n < 70; n++) { g.fillStyle = `rgba(255,${200 + Math.random() * 40},${150 + Math.random() * 60},${0.1 + Math.random() * 0.2})`; g.fillRect(Math.random() * w, Math.random() * h, 8 + Math.random() * 26, 1.5); }
  });
}

export function buildCityScene(city, scene, rng) {
  const out = { seaTex: null };
  const bld = new GeoBuilder(), props = new GeoBuilder(), glow = new GeoBuilder(), flat = new GeoBuilder(), road = new GeoBuilder(), plain = new GeoBuilder();
  const walkSlab = new GeoBuilder(), grass = new GeoBuilder(), paver = new GeoBuilder();

  // ---- roads: strips between intersections (textured) + intersections (plain) + crosswalks
  for (let i = 0; i <= COLS; i++) for (let j = 0; j <= ROWS; j++) {
    const n = nodePos(i, j), h = ROAD_W / 2;
    plain.floor(n.x - h, n.z - h, n.x + h, n.z + h, 0.03, 0xffffff, [0, 0, 3, 3]);
    if (i < COLS) { // horizontal edge east of the node
      road.floor(n.x + h, n.z - h, n.x + h + BLOCK, n.z + h, 0.02, 0xffffff, [0, 0, 0, 0]); // placeholder replaced below
    }
  }
  road.pos.length = 0; road.nor.length = 0; road.uv.length = 0; road.col.length = 0; road.idx.length = 0; road.n = 0;
  const quadUV = (x0, z0, x1, z1, y, horizontal) => {
    const b = road.n;
    road.pos.push(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1);
    for (let k = 0; k < 4; k++) { road.nor.push(0, 1, 0); road.col.push(1, 1, 1); }
    if (horizontal) road.uv.push(0, 0, 0, 1, 1, 1, 1, 0); // along x runs the texture's v
    else road.uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    road.idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
    road.n += 4;
  };
  for (let i = 0; i <= COLS; i++) for (let j = 0; j <= ROWS; j++) {
    const n = nodePos(i, j), h = ROAD_W / 2;
    if (i < COLS) { // horizontal edge: x from n.x+h .. +BLOCK; uv.u across (z), v along (x)
      const b = road.n, x0 = n.x + h, x1 = x0 + BLOCK, z0 = n.z - h, z1 = n.z + h, rep = BLOCK / 32;
      road.pos.push(x0, 0.02, z0, x1, 0.02, z0, x1, 0.02, z1, x0, 0.02, z1);
      for (let k = 0; k < 4; k++) { road.nor.push(0, 1, 0); road.col.push(1, 1, 1); }
      road.uv.push(0, 0, 0, rep, 1, rep, 1, 0);
      road.idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
      road.n += 4;
    }
    if (j < ROWS) { // vertical edge
      const b = road.n, x0 = n.x - h, x1 = n.x + h, z0 = n.z + h, z1 = z0 + BLOCK, rep = BLOCK / 32;
      road.pos.push(x0, 0.02, z0, x1, 0.02, z0, x1, 0.02, z1, x0, 0.02, z1);
      for (let k = 0; k < 4; k++) { road.nor.push(0, 1, 0); road.col.push(1, 1, 1); }
      road.uv.push(0, 0, 1, 0, 1, rep, 0, rep);
      road.idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
      road.n += 4;
    }
    // zebra crossings on the four arms
    const h2 = ROAD_W / 2;
    for (let s = -3; s <= 3; s++) {
      const o = s * 2.2;
      if (i > 0 || true) { flat.box(n.x - h2 - 1.6, 0.045, n.z + o, 3, 0.02, 1.1, 0xf1ebdd); flat.box(n.x + h2 + 1.6, 0.045, n.z + o, 3, 0.02, 1.1, 0xf1ebdd); }
      flat.box(n.x + o, 0.045, n.z - h2 - 1.6, 1.1, 0.02, 3, 0xf1ebdd); flat.box(n.x + o, 0.045, n.z + h2 + 1.6, 1.1, 0.02, 3, 0xf1ebdd);
    }
  }
  void quadUV;

  // ---- blocks: sidewalk slab, interiors, buildings
  const uvLen = 14, uvH = 13.6;
  for (const b of city.blocks) {
    const r = b.rect;
    walkSlab.box((r.x0 + r.x1) / 2, 0.09, (r.z0 + r.z1) / 2, BLOCK, 0.18, BLOCK, 0xd8ccb8);
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    if (b.kind === 'park') {
      grass.floor(r.x0 + 3, r.z0 + 3, r.x1 - 3, r.z1 - 3, 0.2, 0x6fae48, [0, 0, 6, 6]);
      props.cyl(cx + 6, 0.22, cz + 4, 7, 7, 0.1, 0x3b9ec9, 14); // pond
      props.cyl(cx + 6, 0.2, cz + 4, 8.2, 8.2, 0.1, 0xcdbd95, 14);
      for (let k = 0; k < 4; k++) props.box(r.x0 + 6 + k * 14, 0.5, cz - 12, 2.4, 0.5, 0.8, 0x8a5a32); // benches
      props.box(cx - 10, 0.22, cz + 14, 22, 0.04, 2.2, 0xcaa77a); // path
    } else if (b.kind === 'plaza') {
      paver.floor(r.x0 + 3, r.z0 + 3, r.x1 - 3, r.z1 - 3, 0.2, 0xffffff, [0, 0, 8, 8]);
      props.cyl(cx, 0.6, cz, 5, 5.4, 1.2, 0xe9dfcd, 16);
      props.cyl(cx, 1.3, cz, 4.2, 4.2, 0.2, 0x4fb8da, 16);
      props.cyl(cx, 2.4, cz, 0.5, 0.8, 2.4, 0xe9dfcd, 8);
      props.sphere(cx, 3.8, cz, 0.9, 0xbfe9f5);
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.78; props.box(cx + Math.cos(a) * 14, 0.5, cz + Math.sin(a) * 14, 3, 0.5, 0.8, 0x7a5535, a); }
    } else if (b.kind === 'lot') {
      plain.floor(r.x0 + 3, r.z0 + 3, r.x1 - 3, r.z1 - 3, 0.21, 0xffffff, [0, 0, 6, 6]);
      for (let k = 0; k <= 6; k++) { flat.box(r.x0 + 4 + k * 8, 0.23, r.z0 + 9, 0.2, 0.02, 9, 0xeeeeee); flat.box(r.x0 + 4 + k * 8, 0.23, r.z1 - 9, 0.2, 0.02, 9, 0xeeeeee); }
    }
    for (const lot of b.lots) {
      const { x0, z0, x1, z1, h, color } = lot;
      const tone = new THREE.Color(color);
      const uo = rng.range(0, 1), L = (a, c) => Math.hypot(a, c);
      const wallUV = (len) => [uo, uo + len / uvLen];
      let [ua, ub] = wallUV(x1 - x0), v1 = Math.max(1, Math.round(h / 3.4)) / 4;
      bld.wall(x0, z1, x1, z1, 0.18, h, 0, 1, tone, ua, ub, 0, v1); // south face
      bld.wall(x1, z0, x0, z0, 0.18, h, 0, -1, tone, ua, ub, 0, v1); // north
      [ua, ub] = wallUV(z1 - z0);
      bld.wall(x1, z1, x1, z0, 0.18, h, 1, 0, tone.clone().multiplyScalar(0.92), ua, ub, 0, v1); // east
      bld.wall(x0, z0, x0, z1, 0.18, h, -1, 0, tone.clone().multiplyScalar(0.92), ua, ub, 0, v1); // west
      void L; void uvH;
      bld.floor(x0, z0, x1, z1, h, tone.clone().multiplyScalar(0.9), [0.02, 0.02, 0.02, 0.02]);
      props.box((x0 + x1) / 2 + 1.5, h + 0.5, (z0 + z1) / 2 - 2, 3, 1, 2.4, 0x9a9a9a); // rooftop unit
      if (lot.ac > 1) props.box((x0 + x1) / 2 - 3, h + 0.4, (z0 + z1) / 2 + 3, 2, 0.8, 2, 0xb0b0b0);
      if (lot.tier) {
        const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, sx = (x1 - x0) * 0.3, sz = (z1 - z0) * 0.3, th = h * 0.28;
        bld.wall(mx - sx, mz + sz, mx + sx, mz + sz, h, h + th, 0, 1, tone, 0, 1.2, 0, 0.5);
        bld.wall(mx + sx, mz - sz, mx - sx, mz - sz, h, h + th, 0, -1, tone, 0, 1.2, 0, 0.5);
        bld.wall(mx + sx, mz + sz, mx + sx, mz - sz, h, h + th, 1, 0, tone, 0, 1.2, 0, 0.5);
        bld.wall(mx - sx, mz - sz, mx - sx, mz + sz, h, h + th, -1, 0, tone, 0, 1.2, 0, 0.5);
        bld.floor(mx - sx, mz - sz, mx + sx, mz + sz, h + th, tone, [0.02, 0.02, 0.02, 0.02]);
        props.cyl(mx, h + th + 4, mz, 0.12, 0.2, 8, 0xcccccc, 4);
        glow.sphere(mx, h + th + 8.2, mz, 0.5, 0xff3a2a);
      }
      if (h < 16 && b.district !== 'Downtown') { // striped awning on the street face
        const col = [0xd9534f, 0x2f8f9d, 0xe2a03f, 0x4a8f4a][Math.floor(rng.range(0, 4))];
        props.box((x0 + x1) / 2, 3.2, z1 + 0.7, Math.min(14, x1 - x0 - 4), 0.2, 1.6, col, 0, 0.0, 0.3);
      }
    }
    // beach-side umbrellas / Strand bar neon
  }
  // lamps
  for (const l of city.lamps) {
    props.cyl(l.x, 3.4, l.z, 0.1, 0.14, 6.8, 0x3a3a40, 5);
    props.box(l.x - 0.7, 6.8, l.z, 1.5, 0.12, 0.16, 0x3a3a40);
    glow.sphere(l.x - 1.3, 6.65, l.z, 0.28, 0xffe9a8);
  }
  // palms and trees
  const frondCols = [0x3d9a3b, 0x2f8a3a, 0x4aa543];
  for (const p of city.palms) {
    if (p.tree) {
      props.cyl(p.x, p.h * 0.25, p.z, 0.2, 0.32, p.h * 0.5, 0x6b4a2a, 5);
      props.sphere(p.x, p.h * 0.62, p.z, p.h * 0.34, 0x4c9a3a, 1, 0.9, 1, 6);
      props.sphere(p.x + 0.8, p.h * 0.5, p.z + 0.5, p.h * 0.24, 0x5aa845, 1, 0.9, 1, 6);
      continue;
    }
    const top = new THREE.Vector3(Math.sin(p.lean) * p.h * 0.35, p.h, Math.cos(p.rot) * p.lean * p.h * 0.35);
    props.cyl(p.x + top.x / 2, p.h / 2, p.z + top.z / 2, 0.16, 0.3, p.h, 0x9a7650, 5, top.z * 0.1, -top.x * 0.1);
    for (let f = 0; f < 7; f++) {
      const a = p.rot + (f * Math.PI * 2) / 7;
      props.box(p.x + top.x + Math.cos(a) * 1.5, p.h - 0.2, p.z + top.z + Math.sin(a) * 1.5, 3.4, 0.08, 0.7, frondCols[f % 3], -a, 0, 0.0);
      props.box(p.x + top.x + Math.cos(a) * 2.7, p.h - 0.9, p.z + top.z + Math.sin(a) * 2.7, 1.8, 0.07, 0.5, frondCols[(f + 1) % 3], -a);
    }
    props.sphere(p.x + top.x, p.h - 0.3, p.z + top.z, 0.32, 0x5a3a1c);
  }
  // parking lot spots are decorative (cars come from vehicles.js)

  // ---- beach, sea, pier, umbrellas, marina, hills
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_W + 400, WORLD_H - ROADS_H + 4).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xf0d6a0 }));
  sand.position.set(WORLD_W / 2, 0.01, (ROADS_H + WORLD_H) / 2 + 2);
  sand.receiveShadow = true;
  scene.add(sand);
  const wet = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_W + 400, 8).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xc9ae7a }));
  wet.position.set(WORLD_W / 2, 0.02, WORLD_H - 2);
  scene.add(wet);
  out.seaTex = seaTexture();
  out.seaTex.repeat.set(60, 60);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(3000, 2200).rotateX(-Math.PI / 2), new THREE.MeshPhongMaterial({ map: out.seaTex, color: 0xffffff, specular: 0xffc88a, shininess: 90 }));
  sea.position.set(WORLD_W / 2, -0.25, WORLD_H + 1100 - 2);
  scene.add(sea);
  const foam = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_W + 400, 1.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }));
  foam.position.set(WORLD_W / 2, 0.03, WORLD_H + 0.4);
  out.foam = foam;
  scene.add(foam);
  // land beyond the city edge: dusty scrub plane
  const land = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x5b6a3e }));
  land.position.set(WORLD_W / 2, -0.06, -1900);
  scene.add(land);
  const landE = land.clone(); landE.position.set(WORLD_W / 2 + 2000 + WORLD_W / 2, -0.06, 0); scene.add(landE);
  const landW = land.clone(); landW.position.set(-2000 - WORLD_W / 2 + WORLD_W, -0.06, 0); landW.position.x = WORLD_W / 2 - 2000 - WORLD_W / 2; scene.add(landW);
  // pier
  const px = 5 * PITCH + ROAD_W / 2;
  props.box(px, 0.55, WORLD_H + 28, 6, 0.3, 80, 0x9b7448);
  for (let k = 0; k < 14; k++) { props.cyl(px - 2.8, -0.2, WORLD_H - 8 + k * 6, 0.18, 0.18, 1.6, 0x5a3f26, 5); props.cyl(px + 2.8, -0.2, WORLD_H - 8 + k * 6, 0.18, 0.18, 1.6, 0x5a3f26, 5); }
  props.box(px, 2.2, WORLD_H + 60, 4, 3, 4, 0xe8dcc3); props.box(px, 4.0, WORLD_H + 60, 5, 0.4, 5, 0xc4503a);
  // marina docks and boats (Marina Row, south-west)
  for (let d = 0; d < 3; d++) {
    const dx = 22 + d * 52;
    props.box(dx, 0.5, WORLD_H + 16, 3, 0.3, 36, 0x9b7448);
    for (const s of [-1, 1]) {
      const bz = WORLD_H + 6 + (d + (s > 0 ? 1 : 0)) * 6, hull = [0xf3f0e6, 0x2d5f8a, 0xc9473a][(d + (s > 0 ? 1 : 0)) % 3];
      props.box(dx + s * 4.6, 0.5, bz + 2, 3, 1.1, 8.5, hull);
      props.box(dx + s * 4.6, 1.5, bz + 1, 2.2, 1.0, 3.6, 0xf3f0e6);
      props.cyl(dx + s * 4.6, 4, bz + 1, 0.06, 0.08, 5, 0xdddddd, 4);
    }
  }
  // beach umbrellas + lifeguard tower
  for (let k = 0; k < 16; k++) {
    const ux = 20 + (k * 37) % (WORLD_W - 40), uz = ROADS_H + 14 + ((k * 53) % 38), uc = [0xe2453c, 0xf2b630, 0x2fa3b8, 0xf2f2f2][k % 4];
    if (Math.abs(ux - px) < 8) continue;
    props.cyl(ux, 1.2, uz, 0.05, 0.05, 2.4, 0xeeeeee, 4);
    props.cyl(ux, 2.5, uz, 0.1, 1.7, 0.7, uc, 8);
    props.box(ux + 2.6, 0.1, uz + 0.4, 1.8, 0.1, 0.8, 0x6fb7d6, 0.3);
  }
  props.box(WORLD_W * 0.7, 1.4, ROADS_H + 40, 3, 2.8, 3, 0xf4efe2); props.box(WORLD_W * 0.7, 3.1, ROADS_H + 40, 4, 0.5, 4, 0xe2453c);
  // hills on the north horizon + faint islands on the sea
  const hills = new GeoBuilder();
  for (let k = 0; k < 22; k++) {
    const hx = -300 + k * 75 + rng.range(-20, 20), hz = -420 - rng.range(0, 120), hh = rng.range(60, 150), hr = rng.range(90, 160);
    hills.cyl(hx, hh / 2 - 6, hz, 2, hr, hh, new THREE.Color().setHSL(0.78, 0.16, 0.34 + rng.range(0, 0.06)), 7);
  }
  for (let k = 0; k < 6; k++) hills.cyl(-200 + k * 340, 10, WORLD_H + 900 + rng.range(0, 150), 20, 120 + rng.range(0, 60), 26, 0x55607a, 7);

  const mk = (b, mat, shadow = true, recv = true) => {
    if (!b.n) return null;
    const m = new THREE.Mesh(b.build(), mat);
    m.castShadow = shadow; m.receiveShadow = recv;
    scene.add(m);
    return m;
  };
  const winTex = windowTexture(rng);
  mk(bld, new THREE.MeshLambertMaterial({ map: winTex, vertexColors: true }));
  mk(props, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mk(glow, new THREE.MeshBasicMaterial({ vertexColors: true }), false, false);
  mk(flat, new THREE.MeshLambertMaterial({ vertexColors: true }), false, true);
  const roadTex = roadTexture();
  mk(road, new THREE.MeshLambertMaterial({ map: roadTex }), false, true);
  const asph = plainAsphalt();
  mk(plain, new THREE.MeshLambertMaterial({ map: asph }), false, true);
  mk(walkSlab, new THREE.MeshLambertMaterial({ vertexColors: true }), false, true);
  mk(grass, new THREE.MeshLambertMaterial({ vertexColors: true }), false, true);
  mk(paver, new THREE.MeshLambertMaterial({ map: paverTexture('#e6d7b8', '#cbb78d') }), false, true);
  mk(hills, new THREE.MeshLambertMaterial({ vertexColors: true, fog: true }), false, false);
  // rewrite repeat for plain / paver / grass uses (UVs were authored as tile counts)
  return out;
}

export function updateScenery(scenery, t) {
  if (scenery.seaTex) { scenery.seaTex.offset.x = (t * 0.004) % 1; scenery.seaTex.offset.y = (t * 0.006) % 1; }
  if (scenery.foam) scenery.foam.position.z = WORLD_H + 0.6 + Math.sin(t * 0.8) * 0.5;
}
void blockRect; void ROADS_H;
