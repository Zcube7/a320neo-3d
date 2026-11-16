// 机身外形（放样）+ 涂装贴图（Canvas 生成：舷窗、舱门、驾驶舱风挡、尾部色带）+ 机腹整流罩。
import * as THREE from 'three';
import { loft, v3, clamp, lerp, smooth, mesh } from './geom.js';
import { SPEC } from './specs.js';

const L = SPEC.length;

// 单调三次插值（PCHIP），用手选控制点描出机身侧影
function pchip(pts) {
  const n = pts.length, x = pts.map((p) => p[0]), y = pts.map((p) => p[1]);
  const h = [], d = [], m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) { h.push(x[i + 1] - x[i]); d.push((y[i + 1] - y[i]) / h[i]); }
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m[i] = 0;
    else { const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1]; m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]); }
  }
  return (s) => {
    if (s <= x[0]) return y[0];
    if (s >= x[n - 1]) return y[n - 1];
    let i = 0; while (s > x[i + 1]) i++;
    const t = (s - x[i]) / h[i], t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * y[i] + (t3 - 2 * t2 + t) * h[i] * m[i] + (-2 * t3 + 3 * t2) * y[i + 1] + (t3 - t2) * h[i] * m[i + 1];
  };
}

const R = SPEC.fuselageH / 2, HW = SPEC.fuselageW / 2;
const topC = pchip([[0, -0.45], [0.1, -0.1], [0.3, 0.1], [0.6, 0.25], [1.0, 0.38], [1.6, 0.52], [2.1, 0.62], [2.75, 1.06], [3.35, 1.45], [4.0, 1.76], [4.8, 1.96], [5.6, 2.05], [6.3, R],
  [28.5, R], [31, 2.0], [33.5, 1.82], [36, 1.52], [L, 1.28]]);
const botC = pchip([[0, -0.45], [0.1, -0.82], [0.3, -1.12], [0.7, -1.42], [1.3, -1.67], [2.0, -1.85], [3.0, -1.99], [4.0, -2.05], [5.0, -R],
  [24.0, -R], [25.5, -1.93], [27.5, -1.52], [30, -0.88], [33, -0.05], [36, 0.62], [L, 0.9]]);
const widC = pchip([[0, 0], [0.1, 0.32], [0.3, 0.54], [0.7, 0.83], [1.3, 1.13], [2.0, 1.4], [3.0, 1.7], [4.0, 1.87], [5.0, 1.95], [5.6, HW],
  [24.5, HW], [27, 1.8], [30, 1.42], [33, 0.98], [36, 0.5], [L, 0.24]]);

// 站位 s 处的截面：中心高度 cy、竖向半径 ry、横向半径 rz
export function fusSection(s) {
  const t = topC(s), b = botC(s);
  return { cy: (t + b) / 2, ry: Math.max((t - b) / 2, 1e-3), rz: Math.max(widC(s), 1e-3) };
}
// 机身表面点：theta = 0 在机背，向左舷（+Z）增大；off 为沿法向的外偏量
export function fusPoint(s, theta, off = 0) {
  const c = fusSection(s);
  return v3(s, c.cy + (c.ry + off) * Math.cos(theta), (c.rz + off) * Math.sin(theta));
}
// 给定站位和高度，求表面上的角度（左舷为正）
export function thetaAt(s, y) {
  const c = fusSection(s);
  return Math.acos(clamp((y - c.cy) / c.ry, -1, 1));
}

// 机腹整流罩截面：半宽 w、底部高度 bottom、与机身相接的高度 yTop
export const BELLY = { s0: 10.7, s1: 21.9 };
export function bellySection(s) {
  const k = smooth((s - BELLY.s0) / 2.6) * (1 - smooth((s - 19.1) / 2.8));
  const bay = Math.exp(-(((s - 17.6) / 1.5) ** 2));      // 主起落架舱处更宽、更方
  return { w: lerp(1.5, 2.3, k) + 0.25 * bay * k, bottom: lerp(-1.95, -2.5, k), yTop: lerp(-1.2, -0.92, k), p: lerp(0.62, 0.42, bay) };
}
// phi = 0 在左舷上沿，PI/2 在正下方，PI 在右舷上沿
export function bellyPoint(s, phi, off = 0) {
  const b = bellySection(s), sn = Math.sin(phi), cs = Math.cos(phi);
  return v3(s, b.yTop - (b.yTop - b.bottom) * Math.pow(sn, b.p) - off * sn, b.w * Math.sign(cs) * Math.pow(Math.abs(cs), b.p) + off * cs);
}
// 机腹上横向坐标 z 对应的 phi
export function bellyPhi(s, z) {
  const b = bellySection(s);
  return Math.acos(clamp(Math.sign(z) * Math.pow(Math.min(1, Math.abs(z) / b.w), 1 / b.p), -1, 1));
}

function stations() {
  const out = [0, 0.015, 0.04, 0.08, 0.14, 0.22, 0.32, 0.45, 0.6, 0.8];
  for (let s = 1.0; s < 6.4; s += 0.2) out.push(+s.toFixed(3));
  for (let s = 6.4; s < 23.6; s += 0.86) out.push(+s.toFixed(3));
  for (let s = 23.6; s < L - 0.2; s += 0.35) out.push(+s.toFixed(3));
  out.push(L);
  return out;
}

export function buildFuselage(M, hiRes) {
  const group = new THREE.Group();
  const ss = stations(), NT = 80;
  const rings = ss.map((s) => { const r = []; for (let j = 0; j <= NT; j++) r.push(fusPoint(s, (j / NT) * Math.PI * 2)); return r; });
  const geo = loft(rings, { closed: false, capEnd: true, uv: (i, j) => [ss[i] / L, j / NT], crease: 50 });
  const tex = makeLivery(hiRes ? 8192 : 4096, hiRes ? 2048 : 1024);
  const mat = M.paint.clone();
  mat.map = tex; mat.userData = { skin: true };
  M.fuselagePaint = mat;
  const body = mesh(geo, mat, 'fuselage');
  body.receiveShadow = true;
  group.add(body);

  // 机腹整流罩：包住中央翼盒、空调组件和主起落架舱
  const bs = []; for (let s = BELLY.s0; s <= BELLY.s1 + 0.01; s += 0.4) bs.push(s);
  const NB = 28;
  const bRings = bs.map((s) => {
    const b = bellySection(s), r = [];
    for (let j = 0; j <= NB; j++) r.push(bellyPoint(s, (j / NB) * Math.PI));
    r.push(v3(s, b.yTop + 0.5, -b.w * 0.6), v3(s, b.yTop + 0.5, b.w * 0.6));
    return r;
  });
  const belly = mesh(loft(bRings, { closed: true, capStart: true, capEnd: true, crease: 45 }), M.paintGrey, 'fuselage');
  group.add(belly);
  return group;
}

// ---------- 涂装贴图 ----------
// 画布横轴 = 站位 s，纵轴 = 绕机身一圈的角度（0 机背 → 0.25 左舷 → 0.5 机腹 → 0.75 右舷）
function makeLivery(W, H) {
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const px = (s) => (s / L) * W;
  const pyT = (theta, side) => ((side > 0 ? theta : Math.PI * 2 - theta) / (Math.PI * 2)) * H;
  const py = (s, y, side) => pyT(thetaAt(s, y), side);
  const k = H / 2048;

  g.fillStyle = '#f3f4f5'; g.fillRect(0, 0, W, H);
  // 机腹浅灰
  const grd = g.createLinearGradient(0, H * 0.33, 0, H * 0.67);
  grd.addColorStop(0, 'rgba(206,212,219,0)'); grd.addColorStop(0.18, 'rgba(206,212,219,1)');
  grd.addColorStop(0.82, 'rgba(206,212,219,1)'); grd.addColorStop(1, 'rgba(206,212,219,0)');
  g.fillStyle = grd; g.fillRect(0, H * 0.33, W, H * 0.34);

  // 尾部色带：从垂尾前缘根部斜向机腹
  const band = (shift, color, width) => {
    g.fillStyle = color; g.beginPath();
    const N = 120, edge = (v) => 30.2 - 4.4 * (1 - Math.cos(v * Math.PI * 2)) / 2 + shift;
    for (let i = 0; i <= N; i++) { const v = i / N; g.lineTo(px(edge(v)), v * H); }
    for (let i = N; i >= 0; i--) { const v = i / N; g.lineTo(px(width ? edge(v) + width : L + 1), v * H); }
    g.closePath(); g.fill();
  };
  band(-1.25, '#7fb4e6', 0.22); band(-0.7, '#2f7fd0', 0.36); band(0, '#12305e', 0);

  // 雷达罩分界线与静电刷条
  g.strokeStyle = 'rgba(120,130,142,0.9)'; g.lineWidth = 2.2 * k;
  g.beginPath(); g.moveTo(px(1.18), 0); g.lineTo(px(1.18), H); g.stroke();
  g.fillStyle = 'rgba(214,218,223,0.6)'; g.fillRect(0, 0, px(1.18), H);

  const rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
  for (const side of [1, -1]) {
    // 客舱舷窗
    const y0 = py(12, 0.69, side), y1 = py(12, 0.35, side);
    const wy = Math.min(y0, y1), wh = Math.abs(y1 - y0), ww = px(0.235);
    for (let s = 6.62; s < 29.0; s += 0.533) {
      const inDoor = Math.abs(s - 4.65) < 0.7 || Math.abs(s - 29.85) < 0.72;
      if (inDoor) continue;
      rr(px(s) - ww / 2, wy, ww, wh, ww * 0.42);
      g.fillStyle = '#18202b'; g.fill();
      g.strokeStyle = 'rgba(150,158,168,0.9)'; g.lineWidth = 1.6 * k; g.stroke();
    }
    // 登机门 / 服务门
    g.strokeStyle = 'rgba(108,118,130,0.95)'; g.lineWidth = 2.6 * k;
    for (const sc of [4.65, 29.85]) {
      const a = py(sc, 1.43, side), b = py(sc, -0.42, side);
      rr(px(sc - 0.405), Math.min(a, b), px(0.81), Math.abs(b - a), px(0.09)); g.stroke();
      const c = py(sc, 0.62, side);
      g.beginPath(); g.ellipse(px(sc), c, px(0.085), px(0.085) * 1.1, 0, 0, 7); g.fillStyle = '#18202b'; g.fill(); g.stroke();
    }
    // 翼上应急出口
    for (const sc of [14.62, 15.69]) {
      const a = py(sc, 0.97, side), b = py(sc, -0.05, side);
      rr(px(sc - 0.255), Math.min(a, b), px(0.51), Math.abs(b - a), px(0.07)); g.stroke();
    }
    // 驾驶舱风挡：前风挡、侧滑窗、后固定窗
    const P = (s, y) => [px(s), py(s, y, side)];
    const Pt = (s, deg) => [px(s), pyT(deg * Math.PI / 180, side)];
    const poly = (pts) => {
      g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath();
      g.fillStyle = '#10161f'; g.fill(); g.strokeStyle = '#59626d'; g.lineWidth = 3 * k; g.lineJoin = 'round'; g.stroke();
    };
    poly([Pt(2.20, 5), Pt(3.26, 5), P(3.80, 1.3), P(2.82, 0.4)]);
    poly([P(2.94, 0.4), P(3.92, 1.29), P(4.36, 1.28), P(4.36, 0.4)]);
    poly([P(4.47, 0.42), P(4.47, 1.26), P(4.82, 1.2), P(5.02, 0.92), P(5.02, 0.42)]);

    // 机身标题
    g.save();
    g.translate(px(9.6), py(9.6, 1.32, side));
    if (side < 0) g.rotate(Math.PI);
    g.scale((W / L) / (H / (Math.PI * 2 * 2.0)), 1);
    g.fillStyle = '#12305e'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `700 ${Math.round(118 * k)}px "Segoe UI", "Helvetica Neue", Arial, sans-serif`;
    g.fillText('A320', -92 * k, 0);
    g.font = `400 ${Math.round(118 * k)}px "Segoe UI", "Helvetica Neue", Arial, sans-serif`;
    g.fillStyle = '#2f7fd0'; g.fillText('neo', 150 * k, 0);
    g.restore();
  }
  // 右舷货舱门（前、后、散货）
  g.strokeStyle = 'rgba(108,118,130,0.95)'; g.lineWidth = 2.6 * k;
  for (const [s0, s1, ya, yb] of [[7.6, 9.42, -0.5, -1.72], [24.2, 26.02, -0.5, -1.7], [27.3, 28.2, -0.45, -1.2]]) {
    const a = py((s0 + s1) / 2, ya, -1), b = py((s0 + s1) / 2, yb, -1);
    rr(px(s0), Math.min(a, b), px(s1 - s0), Math.abs(b - a), px(0.08)); g.stroke();
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping; tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8; tex.generateMipmaps = true;
  return tex;
}
