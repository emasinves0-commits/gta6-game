// Small geometry-merging helper: collect many coloured primitives into ONE BufferGeometry (cheap to draw).
import * as THREE from 'three';

export class GeoBuilder {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.col = []; this.idx = []; this.n = 0; }

  // Append an indexed THREE geometry transformed by `matrix`, tinted by `color` (hex or THREE.Color).
  addGeo(geo, matrix, color = 0xffffff, uvFn = null) {
    const c = new THREE.Color(color);
    const p = geo.attributes.position, nrm = geo.attributes.normal, uv = geo.attributes.uv;
    const nm = new THREE.Matrix3().getNormalMatrix(matrix);
    const v = new THREE.Vector3();
    for (let k = 0; k < p.count; k++) {
      v.fromBufferAttribute(p, k).applyMatrix4(matrix);
      this.pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(nrm, k).applyMatrix3(nm).normalize();
      this.nor.push(v.x, v.y, v.z);
      if (uvFn) { const t = uvFn(k); this.uv.push(t[0], t[1]); } else if (uv) this.uv.push(uv.getX(k), uv.getY(k)); else this.uv.push(0.02, 0.02);
      this.col.push(c.r, c.g, c.b);
    }
    const ix = geo.index;
    if (ix) for (let k = 0; k < ix.count; k++) this.idx.push(ix.getX(k) + this.n);
    else for (let k = 0; k < p.count; k++) this.idx.push(k + this.n);
    this.n += p.count;
  }

  // Box centred at (x,y,z) with size (w,h,d), optional yaw and tilt.
  box(x, y, z, w, h, d, color, ry = 0, rz = 0, rx = 0) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(w, h, d));
    this.addGeo(UNIT.box, m, color, () => [0.02, 0.02]);
  }
  cyl(x, y, z, rTop, rBot, h, color, seg = 6, rx = 0, rz = 0, ry = 0) {
    const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(1, 1, 1));
    this.addGeo(g, m, color, () => [0.02, 0.02]);
    g.dispose();
  }
  sphere(x, y, z, r, color, sx = 1, sy = 1, sz = 1, seg = 6) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(r * sx, r * sy, r * sz));
    this.addGeo(UNIT.sphere(seg), m, color, () => [0.02, 0.02]);
  }
  // Flat horizontal quad (x0,z0)-(x1,z1) at height y with explicit UVs.
  floor(x0, z0, x1, z1, y, color, uv = [0, 0, 1, 1]) {
    const b = this.n;
    this.pos.push(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1);
    for (let k = 0; k < 4; k++) { this.nor.push(0, 1, 0); this.col.push(...new THREE.Color(color).toArray()); }
    this.uv.push(uv[0], uv[1], uv[2], uv[1], uv[2], uv[3], uv[0], uv[3]);
    this.idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
    this.n += 4;
  }
  // Vertical wall from (ax,az) to (bx,bz), bottom y0, top y1, outward normal (nx,nz).
  wall(ax, az, bx, bz, y0, y1, nx, nz, color, u0, u1, v0, v1) {
    const b = this.n;
    this.pos.push(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az);
    for (let k = 0; k < 4; k++) { this.nor.push(nx, 0, nz); this.col.push(...new THREE.Color(color).toArray()); }
    this.uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
    // winding so the face looks toward (nx,nz)
    const ex = bx - ax, ez = bz - az; // edge dir; outward normal = (ez,-ex)/len for CCW-from-outside
    if (-ez * nx + ex * nz > 0) this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    else this.idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
    this.n += 4;
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

const sphereCache = new Map();
export const UNIT = {
  box: new THREE.BoxGeometry(1, 1, 1),
  sphere: (seg) => sphereCache.get(seg) || sphereCache.set(seg, new THREE.SphereGeometry(1, seg, Math.max(3, seg - 2))).get(seg),
};
