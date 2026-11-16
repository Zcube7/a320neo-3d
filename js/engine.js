// CFM LEAP-1A 涡扇发动机：短舱（进气道唇口、风扇罩、反推平移罩、核心机罩、尾喷管、尾锥）、吊架，
// 内部双转子：N1（风扇 + 3 级增压级 + 7 级低压涡轮）与 N2（10 级高压压气机 + 2 级高压涡轮）。
import * as THREE from 'three';
import { latheX, loft, mesh, v3, lerp, DEG } from './geom.js';
import { SPEC, ENG } from './specs.js';

export { ENG };

const OUTER_FWD = [[0, 1.07], [0.04, 1.135], [0.14, 1.19], [0.35, 1.24], [0.8, 1.285], [1.4, 1.3], [ENG.cowlSplit, 1.3]];
const OUTER_AFT = [[ENG.cowlSplit, 1.3], [2.7, 1.265], [3.2, 1.18], [3.55, 1.1], [ENG.exitX, 1.045]];
const INLET = [[ENG.fanX + 0.1, 0.995], [0.8, 0.985], [0.45, 0.962], [0.28, 0.955], [0.14, 0.975], [0.04, 1.02], [0, 1.07]];
const DUCT_FWD = [[ENG.cowlSplit, 1.025], [1.6, 1.01], [ENG.fanX + 0.1, 0.995]];
const DUCT_AFT = [[ENG.exitX, 1.03], [3.2, 1.035], [2.6, 1.03], [ENG.cowlSplit, 1.025]];
const CORE_COWL = [[1.36, 0.44], [1.6, 0.52], [1.95, 0.58], [2.6, 0.66], [3.3, 0.655], [3.75, 0.62], [4.2, 0.56], [ENG.coreExitX, 0.47]];
const PLUG = [[3.95, 0.24], [4.3, 0.26], [ENG.coreExitX, 0.24], [4.9, 0.12], [ENG.plugEnd, 0.005]];
const CASING = [[1.38, 0.475], [1.82, 0.455], [2.03, 0.38], [2.82, 0.295], [2.86, 0.42], [3.15, 0.42], [3.18, 0.39], [3.38, 0.39], [3.44, 0.43], [4.17, 0.47], [ENG.coreExitX, 0.43]];

function fanBladeGeo() {
  const rings = [], N = 7;
  for (let i = 0; i <= N; i++) {
    const t = i / N, r = lerp(0.29, ENG.fanR - 0.006, t);
    const c = lerp(0.34, 0.4, t) + 0.1 * Math.sin(Math.PI * t), b = lerp(22, 61, t) * DEG, th = lerp(0.04, 0.012, t);
    const x = ENG.fanX + 0.1 * t * t - 0.03 * Math.sin(Math.PI * t);
    const d = v3(Math.cos(b), 0, Math.sin(b)), n = v3(-Math.sin(b), 0, Math.cos(b)), ctr = v3(x, r, 0.05 * Math.sin(Math.PI * t));
    const at = (u, w) => ctr.clone().addScaledVector(d, u * c).addScaledVector(n, w * th);
    rings.push([at(-0.5, 0), at(-0.2, 0.5), at(0.2, 0.42), at(0.5, 0), at(0.2, -0.42), at(-0.2, -0.5)]);
  }
  return loft(rings, { closed: true, capEnd: true, crease: 60 });
}

function bladeRow(parent, o) {
  const geo = new THREE.BoxGeometry(o.chord, o.r1 - o.r0, o.th || 0.008);
  const im = new THREE.InstancedMesh(geo, o.mat, o.n);
  const m = new THREE.Matrix4(), rx = new THREE.Matrix4(), tr = new THREE.Matrix4(), ry = new THREE.Matrix4();
  tr.makeTranslation(o.x, (o.r0 + o.r1) / 2, 0); ry.makeRotationY((o.stagger || 35) * DEG);
  for (let k = 0; k < o.n; k++) { rx.makeRotationX((k / o.n) * Math.PI * 2); m.copy(rx).multiply(tr).multiply(ry); im.setMatrixAt(k, m); }
  im.userData.part = 'engine'; im.castShadow = false;
  parent.add(im);
  return im;
}

/** side: +1 左发（1 号）/ -1 右发（2 号）；cut: 是否带剖切面（剖开外侧一半看内部） */
export function buildEngine(M, side, cut) {
  const g = new THREE.Group();
  g.position.set(ENG.x0, ENG.y0, side * SPEC.engineZ);
  const out = { group: g, side, cutMats: [], plane: new THREE.Plane(), localPlane: new THREE.Plane(v3(0, 0, -side), 0) };
  const C = (mat, key) => {
    if (!cut) return mat;
    const c = mat.clone(); c.clipShadows = true; out.cutMats.push(c); M['cut_' + key] = c; return c;
  };
  const add = (geo, mat, part = 'engine', parent = g, shadow = true) => { const m = mesh(geo, mat, part, shadow); parent.add(m); return m; };

  // ---- 短舱外壳 ----
  add(latheX(OUTER_FWD.slice(0, 4), 56), C(M.lip, 'lip'));
  add(latheX(INLET.slice(-4), 56), C(M.lip, 'lip2'));
  const nac = C(M.nacelle, 'nac'), dark = C(M.liner, 'dark');
  add(latheX(OUTER_FWD.slice(3), 56), nac);
  add(latheX(INLET.slice(0, 4), 56), dark, 'engine', g, false);
  add(latheX(DUCT_FWD, 56), dark, 'engine', g, false);
  // 反推平移罩（后半段外罩 + 外涵道外壁）整体向后滑动
  const cowl = new THREE.Group();
  add(latheX(OUTER_AFT, 56), nac, 'reverser', cowl);
  add(latheX(DUCT_AFT, 56), dark, 'reverser', cowl, false);
  g.add(cowl); out.cowl = cowl;
  // 叶栅：平移罩后退后露出的一圈导流格栅
  const casc = [];
  for (let i = 0; i <= 5; i++) casc.push([ENG.cowlSplit + 0.02 + i * 0.1, 1.245]);
  const cg = add(latheX(casc, 56), C(M.cascade, 'casc'), 'reverser');
  cg.material.wireframe = false;
  for (let i = 0; i < 6; i++) add(latheX([[ENG.cowlSplit + 0.03 + i * 0.1, 1.05], [ENG.cowlSplit + 0.03 + i * 0.1, 1.25]], 56), C(M.cascade, 'casc2'), 'reverser', g, false);

  // ---- 核心机罩、尾喷管、尾锥、机匣、燃烧室 ----
  add(latheX(CORE_COWL, 48), C(M.coreCowl, 'corecowl'));
  add(latheX(PLUG, 32), M.steel);
  add(latheX(CASING, 40), C(M.liner, 'casing'), 'engine', g, false);
  out.burner = C(M.burner.clone(), 'burner');
  add(latheX([[2.86, 0.25], [2.86, 0.405], [3.15, 0.385], [3.15, 0.26], [2.86, 0.25]], 40), out.burner, 'engine', g, false);
  // 出口导向叶片（静止，兼作风扇机匣的承力支板）
  bladeRow(g, { x: 1.78, r0: 0.54, r1: 1.01, n: 40, chord: 0.2, th: 0.012, stagger: 8, mat: M.casing });
  // 附件齿轮箱
  const agb = mesh(new THREE.BoxGeometry(0.7, 0.2, 0.42), M.box, 'engine', false); agb.position.set(2.45, -0.52, 0); g.add(agb);

  // ---- N1 低压转子 ----
  const n1 = new THREE.Group(); g.add(n1); out.n1 = n1;
  const fan = new THREE.InstancedMesh(fanBladeGeo(), M.fanBlade, 18);
  const mm = new THREE.Matrix4();
  for (let k = 0; k < 18; k++) { mm.makeRotationX((k / 18) * Math.PI * 2); fan.setMatrixAt(k, mm); }
  fan.userData.part = 'engine'; n1.add(fan);
  add(latheX([[0.7, 0.004], [0.76, 0.09], [0.9, 0.2], [1.05, 0.275], [ENG.fanX + 0.12, 0.3], [1.36, 0.3]], 32), M.spinner, 'engine', n1);
  add(latheX([[1.36, 0.3], [1.84, 0.335]], 28), M.lpc, 'engine', n1, false);
  for (let i = 0; i < 3; i++) bladeRow(n1, { x: 1.46 + i * 0.13, r0: 0.3 + i * 0.012, r1: 0.465 - i * 0.008, n: 44, chord: 0.07, stagger: 40, mat: M.lpc });
  add(latheX([[3.42, 0.25], [4.18, 0.23]], 28), M.lpt, 'engine', n1, false);
  for (let i = 0; i < 7; i++) bladeRow(n1, { x: 3.48 + i * 0.105, r0: 0.25 - i * 0.003, r1: 0.415 + i * 0.008, n: 64, chord: 0.055, stagger: -42, mat: M.lpt });
  const lpShaft = mesh(new THREE.CylinderGeometry(0.045, 0.045, 2.9, 12), M.shaft, 'engine', false);
  lpShaft.rotation.z = Math.PI / 2; lpShaft.position.x = 2.75; n1.add(lpShaft);

  // ---- N2 高压转子 ----
  const n2 = new THREE.Group(); g.add(n2); out.n2 = n2;
  add(latheX([[2.02, 0.17], [2.83, 0.225]], 28), M.hpc, 'engine', n2, false);
  for (let i = 0; i < 10; i++) bladeRow(n2, { x: 2.07 + i * 0.079, r0: 0.175 + i * 0.005, r1: 0.37 - i * 0.009, n: 38, chord: 0.045, stagger: 45, mat: M.hpc });
  add(latheX([[3.16, 0.24], [3.39, 0.24]], 28), M.hpt, 'engine', n2, false);
  for (let i = 0; i < 2; i++) bladeRow(n2, { x: 3.22 + i * 0.11, r0: 0.24, r1: 0.38, n: 54, chord: 0.06, stagger: -48, mat: M.hpt });
  const hpShaft = mesh(new THREE.CylinderGeometry(0.085, 0.085, 1.3, 14), M.shaft, 'engine', false);
  hpShaft.rotation.z = Math.PI / 2; hpShaft.position.x = 2.72; n2.add(hpShaft);

  out.setReverse = (t) => { cowl.position.x = ENG.reverseTravel * t; };
  out.setCut = (on) => { for (const m of out.cutMats) { m.clippingPlanes = on ? [out.plane] : null; m.needsUpdate = true; } };
  out.updatePlane = () => { g.updateMatrixWorld(); out.plane.copy(out.localPlane).applyMatrix4(g.matrixWorld); };
  return out;
}

// 吊架：把短舱挂在机翼前下方（机体系坐标）
export function buildPylon(M, side, wingS) {
  const z = SPEC.engineZ, xs = [], rings = [];
  for (let x = 11.8; x <= 17.31; x += 0.5) xs.push(x);
  const xLE = wingS.xLE(z), c = wingS.chord(z);
  for (const x of xs) {
    const f = (x - xLE) / c;
    const top = f < 0 ? lerp(ENG.y0 + 1.27, wingS.P(z, 0, true).y, (x - 11.8) / (xLE - 11.8)) : wingS.P(z, Math.min(f, 0.9), false).y + 0.06;
    const xe = x - ENG.x0;
    const bot = xe < ENG.exitX ? ENG.y0 + 1.0 : lerp(ENG.y0 + 0.72, wingS.P(z, 0.5, false).y, Math.min(1, (xe - ENG.exitX) / (17.3 - ENG.x0 - ENG.exitX)));
    const w = 0.19 * Math.sin(Math.PI * Math.min(1, Math.max(0.03, (x - 11.8) / 5.5))) + 0.02;
    const ring = [];
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2, cy = (top + bot) / 2, hy = Math.max(0.02, (top - bot) / 2);
      ring.push(v3(x, cy + hy * Math.sign(Math.cos(a)) * Math.pow(Math.abs(Math.cos(a)), 0.5), side * z + w * Math.sin(a)));
    }
    rings.push(ring);
  }
  return mesh(loft(rings, { closed: true, capStart: true, capEnd: true, crease: 50 }), M.paintGrey, 'engine');
}
