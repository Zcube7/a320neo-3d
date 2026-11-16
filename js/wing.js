// 机翼：固定翼盒 + 5 段缝翼 + 2 段襟翼 + 副翼 + 5 块扰流板 + 鲨鳍小翼 + 襟翼滑轨整流罩；内部油箱与翼梁翼肋。
import * as THREE from 'three';
import { Surface, hingeLR } from './surface.js';
import { loft, latheX, mesh, v3, lerp, DEG, airfoil, chordSamples } from './geom.js';
import { SPEC } from './specs.js';

// 平面形状（半翼）：前缘后掠 27°（1/4 弦线约 25°），内段后缘近似平直，折点在 6.4 m
export const WING = { xLE0: 12.0, tanLE: Math.tan(27 * DEG), zKink: 6.4, zTip: SPEC.spanNoTip / 2, cRoot: 7.0, cKink: 3.94, cTip: 1.5, yRoot: -1.4 };
export const FS = 0.155;   // 缝翼占弦长比例
export const FF = 0.74;    // 襟翼 / 副翼前缘所在弦向位置

export function wingSurface(side) {
  const w = WING, out = (z) => (z - w.zKink) / (w.zTip - w.zKink);
  return new Surface({
    xLE: (z) => w.xLE0 + w.tanLE * z,
    chord: (z) => (z <= w.zKink ? lerp(w.cRoot, w.cKink, z / w.zKink) : lerp(w.cKink, w.cTip, out(z))),
    tc: (z) => (z <= w.zKink ? lerp(0.15, 0.118, z / w.zKink) : lerp(0.118, 0.105, out(z))),
    twist: (z) => lerp(3.2, -0.6, z / w.zTip) * DEG,
    place: (z, x, t) => v3(x, w.yRoot + Math.max(0, z - 1.0) * Math.tan(SPEC.dihedral * DEG) + t, side * z),
    flip: side > 0,
  });
}

export const SLAT_SPANS = [[2.87, 5.13], [6.42, 8.885], [8.885, 11.35], [11.35, 13.815], [13.815, 16.28]];
export const FLAP_SPANS = [[2.27, 6.38], [6.42, 13.08]];
export const AILERON_SPAN = [13.12, 16.28];
export const SPOILER_SPANS = [[3.7, 5.9], [6.6, 8.15], [8.18, 9.73], [9.76, 11.31], [11.34, 12.9]];
export const CANOE_Z = [5.3, 8.6, 11.9];

export function buildWing(M, side) {
  const S = wingSurface(side), g = new THREE.Group(), internals = new THREE.Group();
  const out = { group: g, internals, S, side, slats: [], flaps: [], spoilers: [], aileron: null };
  const add = (geo, mat, part, parent = g) => { const m = mesh(geo, mat, part); parent.add(m); return m; };

  // ---- 固定部分 ----
  add(S.piece(0, 2.25, 0, 1), M.paintGrey, 'wing');
  add(S.piece(2.25, 2.85, 0, FF), M.paintGrey, 'wing');
  add(S.piece(2.85, 5.15, FS, FF, { roundFront: 0.9 }), M.paintGrey, 'wing');
  add(S.piece(5.15, 6.4, 0, FF), M.paintGrey, 'wing');
  add(S.piece(6.4, 16.3, FS, FF, { roundFront: 0.9 }), M.paintGrey, 'wing');
  add(S.piece(16.3, WING.zTip, 0, 1), M.paintGrey, 'wing');

  // ---- 缝翼：绕翼盒前下方的轴转出，前缘前伸下垂并让出一道缝 ----
  for (const [a, b] of SLAT_SPANS) {
    const m = mesh(S.piece(a + 0.012, b - 0.012, 0, FS), M.alu, 'slat');
    const pv = (u) => S.mid(u, 0.225, -0.15 * S.chord(u));
    const h = hingeLR(m, pv(a), pv(b), side); g.add(h); out.slats.push(h);
  }

  // ---- 襟翼：转轴在翼下，放出时后退 + 下偏（富勒襟翼），后半截滑轨整流罩随动 ----
  const canoe = (z, t0, t1) => {
    const c = S.chord(z), xA = S.xLE(z) + 0.42 * c, xB = S.xLE(z) + 1.08 * c, rm = lerp(0.25, 0.17, z / 13);
    const prof = [];
    for (let i = 0; i <= 12; i++) { const t = lerp(t0, t1, i / 12); prof.push([lerp(xA, xB, t), rm * Math.pow(4 * t * (1 - t), 0.6)]); }
    const geo = latheX(prof, 16); geo.scale(1, 1.15, 0.72);
    const yc = S.P(z, FF, false).y - 0.1;
    geo.translate(0, yc, side * z);
    return geo;
  };
  FLAP_SPANS.forEach(([a, b]) => {
    const grp = new THREE.Group();
    grp.add(mesh(S.piece(a, b, FF, 1, { roundFront: 0.8 }), M.paintGrey, 'flap'));
    for (const z of CANOE_Z) if (z > a && z < b) grp.add(mesh(canoe(z, 0.515, 1), M.paintGrey, 'flap'));
    const pv = (u) => S.P(u, FF, false, -0.15 * S.chord(u));
    const h = hingeLR(grp, pv(a), pv(b), side); g.add(h); out.flaps.push(h);
  });
  for (const z of CANOE_Z) add(canoe(z, 0, 0.515), M.paintGrey, 'flap');

  // ---- 副翼 ----
  {
    const [a, b] = AILERON_SPAN;
    const m = mesh(S.piece(a, b, FF, 1, { roundFront: 0.7 }), M.panel, 'aileron');
    const h = hingeLR(m, S.mid(a, FF + 0.012), S.mid(b, FF + 0.012), side); g.add(h); out.aileron = h;
  }

  // ---- 扰流板：贴在襟翼前方上表面的薄板，绕前缘向上翻 ----
  for (const [a, b] of SPOILER_SPANS) {
    add(S.slab(a + 0.02, b - 0.02, 0.605, 0.73, 0.004, 0.01), M.bay, 'spoiler').castShadow = false;      // 板下的深色凹槽，升起后才露出来
    const m = mesh(S.slab(a, b, 0.6, 0.735), M.panel, 'spoiler');
    const h = hingeLR(m, S.P(a, 0.6, true, 0.012), S.P(b, 0.6, true, 0.012), side); g.add(h); out.spoilers.push(h);
  }

  // ---- 鲨鳍小翼 ----
  {
    const zT = WING.zTip, N = 18, Rb = 0.5, phM = 80 * DEG, Ls = 2.017, tot = Rb * phM + Ls;
    const yT = S.place(zT, 0, 0).y, rings = [];
    for (let i = 0; i <= N; i++) {
      const s = tot * (i / N), t = s / tot;
      let ph, dz, dy;
      if (s < Rb * phM) { ph = s / Rb; dz = Rb * Math.sin(ph); dy = Rb * (1 - Math.cos(ph)); }
      else { ph = phM; const l = s - Rb * phM; dz = Rb * Math.sin(ph) + l * Math.cos(ph); dy = Rb * (1 - Math.cos(ph)) + l * Math.sin(ph); }
      const c = lerp(WING.cTip, 0.46, Math.pow(t, 0.85)), x0 = S.xLE(zT) + 1.95 * Math.pow(t, 1.35), tc = lerp(0.105, 0.085, t);
      const fs = chordSamples(0, 1, 12);
      const pt = (f, up) => { const yy = airfoil(f, tc, 0.01)[up ? 0 : 1] * c; return v3(x0 + f * c, yT + dy + Math.cos(ph) * yy, side * (zT + dz - Math.sin(ph) * yy)); };
      rings.push([...fs.map((f) => pt(f, true)), ...fs.slice().reverse().map((f) => pt(f, false))]);
    }
    add(loft(rings, { closed: true, flip: side > 0, capEnd: true, crease: 40 }), M.paintBlue, 'sharklet');
    out.tip = v3(S.xLE(zT) + 0.6, yT + 0.02, side * (zT + 0.05));
  }

  // ---- 内部：油箱、翼梁、翼肋（透视模式下可见） ----
  const tankIn = add(S.piece(2.05, 11.4, 0.17, 0.585, { thick: 0.8 }), M.fuel, 'fuel', internals);
  const tankOut = add(S.piece(11.5, 14.9, 0.17, 0.585, { thick: 0.78 }), M.fuel2, 'fuel', internals);
  const vent = add(S.piece(15.0, 16.2, 0.17, 0.585, { thick: 0.75 }), M.fuelVent, 'fuel', internals);
  [tankIn, tankOut, vent].forEach((m) => { m.castShadow = false; });
  add(S.piece(0.4, 16.9, 0.148, 0.158, { thick: 0.93, nf: 3 }), M.structure, 'wing', internals);
  add(S.piece(0.4, 16.9, 0.592, 0.602, { thick: 0.93, nf: 3 }), M.structure, 'wing', internals);
  for (let z = 2.4; z < 16.8; z += 0.8) add(S.piece(z, z + 0.03, 0.16, 0.59, { thick: 0.93, nu: 2, nf: 6 }), M.structure, 'wing', internals);
  g.add(internals);
  return out;
}
