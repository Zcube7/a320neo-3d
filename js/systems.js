// 机内结构与机载设备（透视模式可见）：隔框、桁条、地板、座椅、货舱集装箱、中央油箱、电子舱、气象雷达、
// 黑匣子、APU；以及始终可见的外部小件：探头、天线、冲压空气涡轮（RAT）、外部灯光。
import * as THREE from 'three';
import { Soup, hinge, latheX, mesh, box, cyl, v3, DEG } from './geom.js';
import { fusPoint, fusSection } from './fuselage.js';
import { buildPlumbing, RAT_PIVOT } from './plumbing.js';
import { SPEC } from './specs.js';

export const FLOOR_Y = -0.42;

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export function buildSystems(M, { wingL, wingR, tail }) {
  const group = new THREE.Group(), ext = new THREE.Group();
  const add = (m, part, parent = group) => { m.traverse((o) => { if (o.isMesh || o.isLine) { o.userData.part = part; o.castShadow = false; } }); parent.add(m); return m; };
  const halfW = (s, y) => { const c = fusSection(s); return c.rz * Math.sqrt(Math.max(0, 1 - ((y - c.cy) / c.ry) ** 2)); };

  // ---------- 结构：隔框、桁条、地板、前后气密隔框 ----------
  {
    const sp = new Soup(), NT = 48;
    for (let s = 1.7; s < 31.2; s += 1.066) {
      for (let j = 0; j < NT; j++) {
        const a = (j / NT) * Math.PI * 2, b = ((j + 1) / NT) * Math.PI * 2;
        sp.quad(fusPoint(s, a, -0.015), fusPoint(s, b, -0.015), fusPoint(s, b, -0.15), fusPoint(s, a, -0.15));
      }
    }
    const fm = M.structure.clone(); fm.side = THREE.DoubleSide;
    add(mesh(sp.build(20), fm), 'fuselage');
    const pts = [];
    for (let j = 0; j < 30; j++) {
      const a = (j / 30) * Math.PI * 2;
      for (let s = 1.7; s < 31.0; s += 0.8) pts.push(fusPoint(s, a, -0.03), fusPoint(Math.min(s + 0.8, 31.0), a, -0.03));
    }
    const lines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x9fc2e8, transparent: true, opacity: 0.4 }));
    add(lines, 'fuselage');
    const fl = new Soup();
    for (let s = 3.2; s < 30.8; s += 0.6) {
      const s2 = Math.min(s + 0.6, 30.8), a = halfW(s, FLOOR_Y) - 0.04, b = halfW(s2, FLOOR_Y) - 0.04;
      fl.quad(v3(s, FLOOR_Y, a), v3(s2, FLOOR_Y, b), v3(s2, FLOOR_Y, -b), v3(s, FLOOR_Y, -a));
    }
    add(mesh(fl.build(20), M.floor), 'fuselage');
    for (const [s, dome] of [[1.22, 0], [31.0, 0.45]]) {
      const c = fusSection(s), geo = new THREE.SphereGeometry(1, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2);
      geo.rotateZ(-Math.PI / 2); geo.scale(Math.max(dome, 0.02), c.ry - 0.03, c.rz - 0.03);
      const bh = mesh(geo, fm); bh.position.set(s, c.cy, 0); add(bh, 'aircond');
    }
  }

  // ---------- 客舱：180 座（30 排 × 3+3）+ 驾驶舱 ----------
  {
    const rows = 30, zs = [0.52, 1.0, 1.48, -0.52, -1.0, -1.48], n = rows * zs.length;
    const cush = new THREE.InstancedMesh(new THREE.BoxGeometry(0.44, 0.12, 0.43), M.seat, n);
    const back = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 0.66, 0.43), M.seat, n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(v3(0, 0, 1), -0.14), one = v3(1, 1, 1);
    let k = 0;
    for (let r = 0; r < rows; r++) for (const z of zs) {
      const s = 6.9 + r * 0.76;
      m.makeTranslation(s, FLOOR_Y + 0.42, z); cush.setMatrixAt(k, m);
      m.compose(v3(s + 0.24, FLOOR_Y + 0.78, z), q, one); back.setMatrixAt(k, m); k++;
    }
    add(cush, 'fuselage'); add(back, 'fuselage');
    const ck = new THREE.Group();
    for (const z of [0.53, -0.53]) {
      ck.add(box(0.46, 0.14, 0.46, M.dark, 2.95, FLOOR_Y + 0.45, z), box(0.09, 0.75, 0.46, M.dark, 3.2, FLOOR_Y + 0.85, z));
      ck.add(box(0.05, 0.18, 0.05, M.steel, 2.75, FLOOR_Y + 0.62, z + Math.sign(z) * 0.38));          // 侧杆
    }
    ck.add(box(0.5, 0.6, 1.9, M.dark, 2.3, FLOOR_Y + 0.72, 0), box(0.75, 0.3, 0.42, M.dark, 2.85, FLOOR_Y + 0.42, 0));
    const scr = new THREE.MeshStandardMaterial({ color: 0x0b2a4a, emissive: 0x2a8cff, emissiveIntensity: 1.1 });
    for (let i = 0; i < 6; i++) ck.add(box(0.02, 0.19, 0.2, scr, 2.56, FLOOR_Y + 0.84, -0.7 + i * 0.28));
    add(ck, 'fbw');
  }

  // ---------- 货舱集装箱（LD3-45W，前 3 后 4）----------
  {
    const sh = new THREE.Shape();
    [[-0.78, 0], [0.78, 0], [1.22, 0.5], [1.22, 1.14], [-1.22, 1.14], [-1.22, 0.5]].forEach(([z, y], i) => (i ? sh.lineTo(z, y) : sh.moveTo(z, y)));
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 1.45, bevelEnabled: false });
    geo.rotateY(Math.PI / 2);                    // 截面 (z,y)，沿 +X 拉伸
    for (const s of [7.2, 8.8, 10.4, 19.9, 21.5, 23.1, 24.7]) { const c = mesh(geo, M.cargo); c.position.set(s, -1.8, 0); add(c, 'fuselage'); }
  }

  // ---------- 中央油箱（中央翼盒内）----------
  add(box(3.1, 0.9, 3.86, M.fuel, 14.75, -1.4, 0), 'fuel');

  // ---------- 电子设备舱：飞控计算机、蓄电池 ----------
  {
    const names = [];
    const cols = [0x3b82c4, 0x3b82c4, 0x35b0a0, 0x35b0a0, 0x35b0a0, 0x9a7be0, 0x9a7be0];   // 2×ELAC 3×SEC 2×FAC
    cols.forEach((c, i) => {
      const mat = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.35, roughness: 0.5 });
      const side = i % 2 ? -1 : 1, row = Math.floor(i / 2);
      add(box(0.42, 0.22, 0.3, mat, 5.75 + row * 0.5, -0.78, side * 0.75), 'fbw'); names.push(mat);
    });
    for (const z of [0.28, -0.28]) add(box(0.34, 0.24, 0.24, M.elec, 6.3, -1.35, z), 'electrical');
    for (let i = 0; i < 5; i++) add(box(0.45, 0.6, 0.5, M.avionics, 5.7 + (i % 3) * 0.55, -1.3, (i < 3 ? 1 : -1) * 1.15), 'avionics');
  }

  // ---------- 气象雷达天线、黑匣子 ----------
  {
    const dish = cyl(0.38, 0.38, 0.03, M.radar, 'x', 28); dish.position.set(0.72, -0.42, 0); dish.rotation.z = 0.12; add(dish, 'avionics');
    const mount = box(0.3, 0.12, 0.12, M.steel, 0.95, -0.42, 0); add(mount, 'avionics');
    add(box(0.5, 0.16, 0.2, M.recorder, 30.3, 0.35, 0.45), 'avionics');
    add(box(0.42, 0.16, 0.2, M.recorder, 30.3, 0.35, -0.45), 'avionics');
  }

  // ---------- APU（尾锥内）----------
  {
    const cy = fusSection(35.4).cy;
    const body = mesh(latheX([[34.75, 0.12], [34.85, 0.27], [35.5, 0.3], [35.75, 0.24], [36.25, 0.24], [36.45, 0.17]], 20), M.apu);
    body.position.y = cy; add(body, 'apu');
    const ex = mesh(latheX([[36.45, 0.17], [SPEC.length + 0.02, 0.16]], 16), M.steel); ex.position.y = cy + 0.03; add(ex, 'apu');
    add(box(0.36, 0.26, 0.3, M.elec, 34.6, cy, 0), 'electrical');                  // APU 发电机
    const c2 = fusSection(34.2);
    const inlet = cyl(0.14, 0.14, 0.7, M.casing); inlet.position.set(34.75, c2.cy - 0.45, 0); inlet.rotation.z = 0.5; add(inlet, 'apu');
    const fw = fusSection(34.2), wall = cyl(fw.rz - 0.04, fw.rz - 0.04, 0.03, M.structure, 'x', 24); wall.position.set(34.2, fw.cy, 0); wall.scale.y = (fw.ry - 0.04) / (fw.rz - 0.04); add(wall, 'apu');
  }

  // ---------- 管路：液压 / 电源 / 引气与空调 ----------
  const plumb = buildPlumbing(M, { wingL, wingR });
  group.add(plumb.group);

  // ================= 始终可见的外部小件 =================
  // 空速管、迎角传感器、天线
  for (const side of [1, -1]) {
    for (const [s, deg] of [[2.05, 96], [2.05, 118]]) {
      const p = fusPoint(s, side * deg * DEG, 0.05), t = cyl(0.014, 0.014, 0.2, M.steel, 'x', 8);
      t.position.copy(p).add(v3(-0.06, 0, 0)); add(t, 'avionics', ext);
    }
    const a = box(0.12, 0.012, 0.07, M.dark); a.position.copy(fusPoint(2.75, side * 100 * DEG, 0.03)); add(a, 'avionics', ext);
  }
  for (const [s, deg] of [[9.0, 0], [21.0, 0], [8.4, 180], [23.5, 180]]) {
    const p = fusPoint(s, deg * DEG, 0.09), f = box(0.3, 0.2, 0.022, M.paintGrey); f.position.copy(p); f.rotation.z = deg ? 0.4 : -0.4; add(f, 'avionics', ext);
  }
  // APU 排气口
  { const c = fusSection(SPEC.length); const e = cyl(0.17, 0.17, 0.04, M.black, 'x', 18); e.position.set(SPEC.length + 0.005, c.cy, 0); add(e, 'apu', ext); }

  // 冲压空气涡轮：平时收在机腹里，失去正常液压 / 电源时放出，靠迎面气流带动螺旋桨
  const ratG = new THREE.Group();
  {
    const P = RAT_PIVOT, strut = cyl(0.04, 0.05, 1.15, M.strut); strut.position.set(P.x, P.y - 0.575, P.z); ratG.add(strut);
    const hub = cyl(0.075, 0.075, 0.3, M.steel, 'x', 14); hub.position.set(P.x - 0.02, P.y - 1.16, P.z); ratG.add(hub);
    const prop = new THREE.Group(); prop.position.set(P.x - 0.19, P.y - 1.16, P.z);
    const blade = box(0.025, 0.64, 0.09, M.dark); blade.rotation.y = 0.35; prop.add(blade);
    const nose = mesh(new THREE.SphereGeometry(0.06, 12, 8), M.steel); prop.add(nose);
    ratG.add(prop); ratG.userData.prop = prop;
  }
  add(ratG, 'hydraulic', ext);
  const rat = hinge(ratG, RAT_PIVOT.clone().add(v3(0, 0, -1)), RAT_PIVOT.clone().add(v3(0, 0, 1)));
  ext.add(rat);
  rat.setAngle(92 * DEG);           // 收起：向后翻平贴进整流罩

  // 外部灯光：航行灯（左红右绿尾白）、频闪灯、防撞信标、着陆灯
  const tex = glowTexture(), lamps = [];
  const lamp = (pos, color, size, kind) => {
    const sm = new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
    const sp = new THREE.Sprite(sm); sp.position.copy(pos); sp.scale.setScalar(size); sp.userData.part = 'lights';
    const bulb = mesh(new THREE.SphereGeometry(0.045, 10, 8), new THREE.MeshStandardMaterial({ color: 0xd4d8dd, roughness: 0.3, emissive: color, emissiveIntensity: 0 }), 'lights', false);
    bulb.position.copy(pos); ext.add(sp, bulb); lamps.push({ sp, bulb, kind, size });
  };
  const tipL = wingL.tip, tipR = wingR.tip, tailEnd = v3(SPEC.length + 0.05, fusSection(SPEC.length).cy + 0.3, 0);
  lamp(tipL, 0xff2a2a, 1.3, 'nav'); lamp(tipR, 0x2aff5a, 1.3, 'nav'); lamp(tailEnd, 0xffffff, 1.1, 'nav');
  lamp(tipL.clone().add(v3(0.25, 0, 0)), 0xffffff, 3.2, 'strobe'); lamp(tipR.clone().add(v3(0.25, 0, 0)), 0xffffff, 3.2, 'strobe');
  lamp(tailEnd.clone().add(v3(0, -0.2, 0)), 0xffffff, 2.6, 'strobe');
  lamp(fusPoint(16.2, 0, 0.1), 0xff2020, 2.6, 'beacon'); lamp(v3(15.4, -2.62, 0), 0xff2020, 2.6, 'beacon');
  for (const w of [wingL, wingR]) lamp(w.S.P(2.9, 0.12, false, -0.04), 0xfff4d6, 3.4, 'landing');

  const out = { group, ext, rat, ratProp: ratG.userData.prop, lamps, plumb };
  /** on: { nav, strobe, beacon, landing }；t 为秒 */
  out.updateLights = (on, t) => {
    const ph = t % 1.2, strobe = (ph < 0.06 || (ph > 0.16 && ph < 0.22)) ? 1 : 0, beacon = Math.max(0, 1 - Math.abs((t % 1.0) - 0.12) / 0.12);
    for (const l of lamps) {
      const v = !on[l.kind] ? 0 : l.kind === 'strobe' ? strobe : l.kind === 'beacon' ? beacon : 1;
      l.sp.material.opacity = v * 0.95; l.bulb.material.emissiveIntensity = v * 3;
    }
  };
  out.setRat = (t) => rat.setAngle(92 * DEG * (1 - t));
  return out;
}
