// 气流示意粒子：发动机内外涵气流（含反推折转）与机翼剖面绕流（随缝翼 / 襟翼 / 扰流板变化）。
import * as THREE from 'three';
import { lerp, clamp, DEG, v3 } from './geom.js';
import { ENG } from './engine.js';
import { FS, FF, SLAT_SPANS, FLAP_SPANS, AILERON_SPAN, SPOILER_SPANS } from './wing.js';

function dotTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}
let TEX = null;
function makePoints(n, size) {
  TEX = TEX || dotTexture();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 4), 4));
  const mat = new THREE.PointsMaterial({ size, map: TEX, vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false; pts.renderOrder = 5; pts.visible = false;
  pts.raycast = () => {};
  return pts;
}
// 分段线性表：rows = [[x, a, b], ...] → 返回 [a, b]
function table(rows, x) {
  if (x <= rows[0][0]) return [rows[0][1], rows[0][2]];
  for (let i = 1; i < rows.length; i++) {
    if (x <= rows[i][0]) { const t = (x - rows[i - 1][0]) / (rows[i][0] - rows[i - 1][0]); return [lerp(rows[i - 1][1], rows[i][1], t), lerp(rows[i - 1][2], rows[i][2], t)]; }
  }
  const l = rows[rows.length - 1]; return [l[1], l[2]];
}
// 流管内外半径随轴向位置的变化（发动机本地系）
const BYPASS = [[-2.4, 0.5, 1.3], [0, 0.44, 0.97], [1.15, 0.5, 0.98], [1.8, 0.56, 1.0], [2.6, 0.68, 1.02], [3.75, 0.64, 1.02], [5.2, 0.6, 0.98], [9, 0.55, 0.95]];
const CORE = [[-2.4, 0.04, 0.5], [0, 0.04, 0.44], [1.15, 0.31, 0.48], [1.8, 0.33, 0.45], [2.05, 0.2, 0.37], [2.8, 0.23, 0.29], [3.0, 0.27, 0.38], [3.3, 0.26, 0.37], [3.5, 0.26, 0.41], [4.15, 0.25, 0.46], [4.5, 0.26, 0.42], [5.4, 0.04, 0.38], [9, 0.02, 0.34]];

export function buildEngineFlow(engine) {
  const N = 640, pts = makePoints(N, 0.085);
  engine.group.add(pts);
  const P = [];
  for (let i = 0; i < N; i++) P.push({ core: i % 5 < 2, phi: Math.random() * Math.PI * 2, rho: Math.random(), t: Math.random(), k: 0.8 + Math.random() * 0.4 });
  const pos = pts.geometry.attributes.position, col = pts.geometry.attributes.color;
  const X0 = -2.4, X1 = 9, SPLIT = ENG.cowlSplit + 0.25;
  /** thr: 0~1 推力；rev: 0~1 反推开度；halfOnly: 只画靠内侧的半圈（配合剖视） */
  return {
    points: pts,
    update(dt, thr, rev, running) {
      if (!pts.visible) return;
      const sp = running ? 0.1 + 0.42 * thr : 0.0;
      for (let i = 0; i < N; i++) {
        const p = P[i];
        p.t += dt * sp * p.k * (p.core ? 1.15 : 1);
        if (p.t > 1) { p.t -= 1; p.phi = Math.random() * Math.PI * 2; p.rho = Math.random(); }
        let x = lerp(X0, X1, p.t), r, cr, cg, cb, a = 1;
        if (p.core) {
          const [ri, ro] = table(CORE, x); r = lerp(ri, ro, p.rho);
          if (x < 2.05) { cr = 0.35; cg = 0.75; cb = 1; }
          else if (x < 2.85) { const u = (x - 2.05) / 0.8; cr = lerp(0.35, 1, u); cg = lerp(0.75, 0.9, u); cb = lerp(1, 0.3, u); }
          else if (x < 3.2) { cr = 1; cg = 0.75; cb = 0.2; }
          else { const u = clamp((x - 3.2) / 3, 0, 1); cr = 1; cg = lerp(0.42, 0.55, u); cb = lerp(0.12, 0.35, u); a = 1 - u * 0.5; }
        } else {
          const [ri, ro] = table(BYPASS, x); r = lerp(ri, ro, p.rho);
          cr = 0.25; cg = 0.62; cb = 1;
          if (rev > 0.02 && x > SPLIT) {
            // 反推：外涵气流被阻流门挡住，从叶栅斜向前喷出
            const u = (x - SPLIT) / (X1 - SPLIT), fwd = lerp(SPLIT + (x - SPLIT), SPLIT + 0.25 - 3.6 * u, rev);
            r = lerp(r, 1.15 + 3.0 * Math.pow(u, 0.75), rev); x = fwd; a = 1 - u * 0.8; cr = lerp(0.25, 0.75, rev); cg = lerp(0.62, 0.85, rev);
          }
        }
        const edge = Math.min(1, p.t * 12, (1 - p.t) * 6);
        pos.setXYZ(i, x, r * Math.cos(p.phi), r * Math.sin(p.phi));
        col.setXYZW(i, cr, cg, cb, a * edge * (running ? 0.95 : 0));
      }
      pos.needsUpdate = true; col.needsUpdate = true;
    },
  };
}

// 机翼绕流：在三个展向站位各画几条流线（细线）+ 沿线移动的粒子，路径是「来流 → 前缘 → 上/下表面 → 后缘尾流」
export function buildWingFlow(root, wing) {
  const S = wing.S, stations = [4.4, 9.6, 14.6], lanes = [[true, 0.09], [true, 0.3], [true, 0.58], [false, 0.09], [false, 0.34]], PER = 9, NS = 46;
  const L = [];
  for (const z of stations) for (const [up, off] of lanes) L.push({ z, up, off });
  const N = L.length * PER, pts = makePoints(N, 0.2), group = new THREE.Group();
  group.add(pts); group.visible = false; pts.visible = true; root.add(group);
  const P = [];
  L.forEach((ln, li) => { for (let k = 0; k < PER; k++) P.push({ li, t: (k + Math.random() * 0.5) / PER }); });
  // 每条流线一条折线，逐帧按当前构型重算
  const lineMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false });
  for (const ln of L) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NS * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(NS * 4), 4));
    ln.line = new THREE.Line(g, lineMat); ln.line.frustumCulled = false; ln.line.raycast = () => {}; ln.line.renderOrder = 4;
    group.add(ln.line);
  }
  const find = (spans, z) => spans.findIndex(([a, b]) => z >= a && z <= b);
  const viaHinge = (p, h) => { const inner = h.children[0]; inner.updateMatrix(); h.updateMatrix(); return p.applyMatrix4(inner.matrix).applyMatrix4(h.matrix); };
  const tmp = v3(0, 0, 0), F0 = -0.75, F1 = 2.1;
  let sep = false;
  // 流线上弦向位置 f 处的点（写入 tmp）；wob 给粒子加一点紊流抖动
  function at(ln, f, cfg, wob) {
    const z = ln.z, c = S.chord(z), sg = ln.up ? 1 : -1;
    const si = find(SLAT_SPANS, z), fi = find(FLAP_SPANS, z), sp = find(SPOILER_SPANS, z);
    const te = fi >= 0 ? wing.flaps[fi] : (z >= AILERON_SPAN[0] && z <= AILERON_SPAN[1] ? wing.aileron : null);
    if (f < 0) {
      tmp.copy(S.P(z, 0, ln.up, sg * ln.off * (1 + 0.8 * -f)));
      if (si >= 0) viaHinge(tmp, wing.slats[si]);
      tmp.x += f * c; tmp.y -= 0.1 * f * c * (cfg.flap / 35 + 0.25);            // 前方来流略微上洗
    } else if (f <= 1) {
      tmp.copy(S.P(z, f, ln.up, sg * ln.off));
      if (f < FS && si >= 0) viaHinge(tmp, wing.slats[si]);
      else if (f > FF && te) viaHinge(tmp, te);
    } else {
      tmp.copy(S.P(z, 1, ln.up, sg * ln.off));
      if (te) viaHinge(tmp, te);
      const eps = (3 + 0.42 * cfg.flap) * DEG, d = (f - 1) * c;
      tmp.x += d * Math.cos(eps); tmp.y -= d * Math.sin(eps);                      // 尾流下洗：襟翼越大偏得越多
    }
    const spa = sp >= 0 ? cfg.spoilers[sp] : 0;
    sep = ln.up && spa > 4 && f > 0.6;
    if (sep) {                                                                     // 扰流板升起：上表面气流在板后分离
      const k = clamp((f - 0.6) / 0.5, 0, 1), amp = Math.sin(spa * DEG) * c * 0.2;
      if (wob == null) tmp.y += amp * k * (0.9 + 0.12 * Math.sin(f * 26 + ln.off * 9));                // 流线：鼓起一个分离泡
      else { tmp.y += amp * k * (0.85 + 0.5 * Math.sin(wob * 7 + f * 20)); tmp.x += amp * 0.2 * Math.sin(wob * 11 + f * 31); }
    }
    return tmp;
  }
  const pos = pts.geometry.attributes.position, col = pts.geometry.attributes.color;
  return {
    points: group,
    /** cfg: { flap, spoilers[5] }（度） */
    update(dt, cfg, speed) {
      if (!group.visible) return;
      for (const ln of L) {
        const lp = ln.line.geometry.attributes.position, lc = ln.line.geometry.attributes.color;
        for (let i = 0; i < NS; i++) {
          const u = i / (NS - 1); at(ln, lerp(F0, F1, u), cfg, null);
          lp.setXYZ(i, tmp.x, tmp.y, tmp.z);
          const a = Math.min(1, u * 8, (1 - u) * 6) * 0.8;
          if (sep) lc.setXYZW(i, 1, 0.6, 0.25, a); else lc.setXYZW(i, ln.up ? 0.45 : 0.3, ln.up ? 0.9 : 0.62, 1, a);
        }
        lp.needsUpdate = true; lc.needsUpdate = true;
      }
      for (let i = 0; i < N; i++) {
        const p = P[i], ln = L[p.li], f0 = lerp(F0, F1, p.t);
        p.t += dt * speed * (ln.up && f0 > 0 && f0 < 1 ? 0.3 : 0.23);              // 上表面流得更快
        if (p.t > 1) p.t -= 1;
        at(ln, lerp(F0, F1, p.t), cfg, i + p.t * 9);
        pos.setXYZ(i, tmp.x, tmp.y, tmp.z);
        const e = Math.min(1, p.t * 10, (1 - p.t) * 8);
        if (sep) col.setXYZW(i, 1, 0.62, 0.25, e); else col.setXYZW(i, ln.up ? 0.55 : 0.3, ln.up ? 0.95 : 0.65, 1, e);
      }
      pos.needsUpdate = true; col.needsUpdate = true;
    },
  };
}
