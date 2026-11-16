// 几何工具：三角形汤、放样、折痕法线、翼型、回转体、铰链。
import * as THREE from 'three';

const V3 = THREE.Vector3;
export const v3 = (x, y, z) => new V3(x, y, z);
export const DEG = Math.PI / 180;
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

// ---------- 三角形汤 ----------
export class Soup {
  constructor() { this.p = []; this.uv = []; }
  tri(a, b, c, ua, ub, uc) {
    // 丢掉退化三角形（例如机头尖点处）
    const ex = b.x - a.x, ey = b.y - a.y, ez = b.z - a.z;
    const fx = c.x - a.x, fy = c.y - a.y, fz = c.z - a.z;
    const nx = ey * fz - ez * fy, ny = ez * fx - ex * fz, nz = ex * fy - ey * fx;
    if (nx * nx + ny * ny + nz * nz < 1e-14) return;
    this.p.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    if (ua) this.uv.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]);
    else this.uv.push(0, 0, 0, 0, 0, 0);
  }
  quad(a, b, c, d, ua, ub, uc, ud) {
    this.tri(a, b, c, ua, ub, uc);
    this.tri(a, c, d, ua, uc, ud);
  }
  build(creaseDeg = 38) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    creaseNormals(g, creaseDeg);
    g.computeBoundingSphere();
    return g;
  }
}

// 非索引几何的折痕法线：同一位置上夹角小于阈值的面共享平滑法线，大于阈值的保持棱边。
export function creaseNormals(geo, creaseDeg = 38) {
  const pos = geo.attributes.position, n = pos.count, tris = n / 3;
  const cosT = Math.cos(creaseDeg * DEG);
  const fn = new Float32Array(tris * 3);      // 面法线（未归一，带面积权）
  const fu = new Float32Array(tris * 3);      // 面法线（单位）
  const a = new V3(), b = new V3(), c = new V3(), e = new V3(), f = new V3();
  const buckets = new Map();
  const key = (i) => Math.round(pos.getX(i) * 2e3) + '_' + Math.round(pos.getY(i) * 2e3) + '_' + Math.round(pos.getZ(i) * 2e3);
  for (let t = 0; t < tris; t++) {
    a.fromBufferAttribute(pos, t * 3); b.fromBufferAttribute(pos, t * 3 + 1); c.fromBufferAttribute(pos, t * 3 + 2);
    e.subVectors(b, a); f.subVectors(c, a); e.cross(f);
    fn[t * 3] = e.x; fn[t * 3 + 1] = e.y; fn[t * 3 + 2] = e.z;
    e.normalize();
    fu[t * 3] = e.x; fu[t * 3 + 1] = e.y; fu[t * 3 + 2] = e.z;
    for (let k = 0; k < 3; k++) {
      const kk = key(t * 3 + k);
      let arr = buckets.get(kk);
      if (!arr) buckets.set(kk, arr = []);
      arr.push(t);
    }
  }
  const out = new Float32Array(n * 3);
  for (let t = 0; t < tris; t++) {
    const ux = fu[t * 3], uy = fu[t * 3 + 1], uz = fu[t * 3 + 2];
    for (let k = 0; k < 3; k++) {
      const i = t * 3 + k, arr = buckets.get(key(i));
      let x = 0, y = 0, z = 0;
      for (const o of arr) {
        if (ux * fu[o * 3] + uy * fu[o * 3 + 1] + uz * fu[o * 3 + 2] >= cosT) {
          x += fn[o * 3]; y += fn[o * 3 + 1]; z += fn[o * 3 + 2];
        }
      }
      const l = Math.hypot(x, y, z) || 1;
      out[i * 3] = x / l; out[i * 3 + 1] = y / l; out[i * 3 + 2] = z / l;
    }
  }
  geo.setAttribute('normal', new THREE.BufferAttribute(out, 3));
  return geo;
}

/**
 * 放样：rings[i][j] 是第 i 个截面上的第 j 个点。法线朝向 = (j 方向) × (i 方向)，flip 取反。
 * closed: 每个截面首尾相接；capStart/capEnd: 用扇形封口；uv(i,j) 可选。
 */
export function loft(rings, o = {}) {
  const s = new Soup(), m = rings.length, n = rings[0].length;
  const closed = o.closed !== false, flip = !!o.flip, uv = o.uv;
  const jn = closed ? n : n - 1;
  const U = (i, j) => (uv ? uv(i, j) : [j / jn, i / (m - 1)]);
  for (let i = 0; i < m - 1; i++) {
    for (let j = 0; j < jn; j++) {
      const j2 = (j + 1) % n, jj = j + 1;
      const A = rings[i][j], B = rings[i][j2], C = rings[i + 1][j2], D = rings[i + 1][j];
      if (flip) s.quad(A, D, C, B, U(i, j), U(i + 1, j), U(i + 1, jj), U(i, jj));
      else s.quad(A, B, C, D, U(i, j), U(i, jj), U(i + 1, jj), U(i + 1, j));
    }
  }
  const cap = (ring, front) => {
    const c = new V3(); ring.forEach((p) => c.add(p)); c.multiplyScalar(1 / n);
    for (let j = 0; j < jn; j++) {
      const A = ring[j], B = ring[(j + 1) % n];
      if (front !== flip) s.tri(c, A, B); else s.tri(c, B, A);
    }
  };
  if (o.capStart) cap(rings[0], false);
  if (o.capEnd) cap(rings[m - 1], true);
  return s.build(o.crease ?? 38);
}

// ---------- 翼型 ----------
// NACA 四位数厚度分布 + 抛物线弯度；返回 [上表面 y, 下表面 y]（以弦长为 1）
export function airfoil(x, tc, camber = 0.018, cp = 0.42) {
  x = clamp(x, 0, 1);
  const yt = 5 * tc * (0.2969 * Math.sqrt(x) - 0.1260 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
  const yc = x < cp ? camber / (cp * cp) * (2 * cp * x - x * x)
    : camber / ((1 - cp) ** 2) * ((1 - 2 * cp) + 2 * cp * x - x * x);
  return [yc + yt, yc - yt];
}

// 在弦向区间 [fa, fb] 内取 n 个采样；从前缘开始时向前缘加密
export function chordSamples(fa, fb, n) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const t = k / (n - 1);
    out.push(fa + (fb - fa) * (fa < 1e-6 ? t * t : t));
  }
  return out;
}

// ---------- 回转体（轴线沿 +X） ----------
// profile: [[x, r], ...]；外表面按 x 递增给点，法线朝外
export function latheX(profile, segs = 48, phiStart = 0, phiLen = Math.PI * 2) {
  const pts = profile.map(([x, r]) => new THREE.Vector2(Math.max(r, 1e-4), x));
  const g = new THREE.LatheGeometry(pts, segs, phiStart, phiLen);
  g.rotateZ(-Math.PI / 2);
  return g;
}

// 折线管路（转角略带缓入缓出）
export function pipe(points, radius, segPerPoint = 10, radial = 6) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p : new V3(p[0], p[1], p[2]))), false, 'catmullrom', 0.08);
  return new THREE.TubeGeometry(curve, Math.max(8, points.length * segPerPoint), radius, radial, false);
}

// ---------- 铰链 ----------
// 把 obj 挂到一个以 A→B 为转轴的枢轴组上；返回的组有 setAngle(rad)，绕 A→B 右手正向旋转。
export function hinge(obj, A, B) {
  const g = new THREE.Group();
  g.position.copy(A);
  const axis = B.clone().sub(A).normalize();
  const base = new THREE.Quaternion().setFromUnitVectors(new V3(0, 0, 1), axis);
  g.quaternion.copy(base);
  // 内层组抵消枢轴的初始位姿，这样 obj 仍用机体系坐标，铰链也可以嵌套
  const inner = new THREE.Group();
  inner.quaternion.copy(base).invert();
  inner.position.copy(A).negate().applyQuaternion(inner.quaternion);
  inner.add(obj); g.add(inner);
  const q = new THREE.Quaternion(), Z = new V3(0, 0, 1), home = A.clone();
  g.userData.home = home;
  g.userData.axis = axis;
  g.setAngle = (rad, slide) => {
    g.quaternion.copy(base).multiply(q.setFromAxisAngle(Z, rad));
    if (slide) g.position.copy(home).add(slide); else g.position.copy(home);
  };
  return g;
}

// 简单网格工厂
export function mesh(geo, mat, part, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  if (part) m.userData.part = part;
  m.castShadow = shadow; m.receiveShadow = false;
  return m;
}
export function box(w, h, d, mat, x = 0, y = 0, z = 0, part) {
  const m = mesh(new THREE.BoxGeometry(w, h, d), mat, part);
  m.position.set(x, y, z);
  return m;
}
// 轴线沿指定方向的圆柱：axis = 'x' | 'y' | 'z'
export function cyl(r1, r2, len, mat, axis = 'y', segs = 20, part) {
  const g = new THREE.CylinderGeometry(r1, r2, len, segs);
  if (axis === 'x') g.rotateZ(-Math.PI / 2);
  if (axis === 'z') g.rotateX(Math.PI / 2);
  return mesh(g, mat, part);
}
