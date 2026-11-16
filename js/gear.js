// 起落架：前起落架（向前收、可转弯）+ 两个主起落架（向内收进机腹）+ 舱门，按真实时序收放。
import * as THREE from 'three';
import { hinge, latheX, loft, mesh, cyl, box, v3, DEG } from './geom.js';
import { SPEC, gearSequence } from './specs.js';
import { fusPoint, bellyPoint, bellyPhi } from './fuselage.js';

const GROUND = -SPEC.axisH;
export const NOSE = { x: SPEC.noseGearX, pivotY: -1.55, r: 0.38, w: 0.22, halfTrack: 0.26, swing: -95 * DEG };
export const MAIN = { x: SPEC.noseGearX + SPEC.wheelbase, pivotY: -1.22, pivotZ: SPEC.track / 2, wheelZ: SPEC.track / 2, r: 0.585, w: 0.43, halfTrack: 0.4635, swing: 84 * DEG };

// 轮胎 + 轮毂，轴线沿 Z，中心在原点
function wheel(M, r, w, brake) {
  const g = new THREE.Group(), rim = r * 0.52;
  const prof = [[-w / 2 + 0.03, rim], [-w / 2, rim + 0.05], [-w / 2, r - 0.08], [-w / 2 + 0.05, r - 0.018], [-w / 4, r], [w / 4, r], [w / 2 - 0.05, r - 0.018], [w / 2, r - 0.08], [w / 2, rim + 0.05], [w / 2 - 0.03, rim]];
  const tire = latheX(prof, 36); tire.rotateY(-Math.PI / 2);
  g.add(mesh(tire, M.rubber));
  const hub = cyl(rim + 0.01, rim + 0.01, w * 0.72, M.hub, 'z', 24); g.add(hub);
  const cap = cyl(rim * 0.35, rim * 0.35, w * 0.86, M.steel, 'z', 16); g.add(cap);
  if (brake) { const b = cyl(rim * 0.86, rim * 0.86, w * 0.5, M.carbon, 'z', 24); b.position.z = brake * w * 0.2; g.add(b); }
  return g;
}

// 贴合机身 / 机腹曲面的薄板（舱门、舱口深色底板）
function patch(pt, s0, s1, a0, a1, off, mat, part, ns = 6, na = 6) {
  const rings = [];
  for (let i = 0; i <= ns; i++) {
    const s = s0 + (s1 - s0) * (i / ns), top = [], bot = [];
    for (let j = 0; j <= na; j++) { const a = a0 + (a1 - a0) * (j / na); top.push(pt(s, a, off)); bot.unshift(pt(s, a, off - 0.02)); }
    rings.push([...top, ...bot]);
  }
  return mesh(loft(rings, { closed: true, capStart: true, capEnd: true, crease: 50 }), mat, part);
}

export function buildGear(M) {
  const g = new THREE.Group(), out = { group: g, wheels: [], main: [] };
  const tag = (o, part) => { o.traverse((c) => { if (c.isMesh) { c.userData.part = part; c.castShadow = true; } }); return o; };

  // ================= 前起落架 =================
  {
    const leg = new THREE.Group(), axleY = GROUND + NOSE.r, len = NOSE.pivotY - axleY;
    const upper = cyl(0.085, 0.085, len * 0.55, M.strut); upper.position.set(NOSE.x, NOSE.pivotY - len * 0.275, 0); leg.add(upper);
    const dragA = v3(NOSE.x - 0.75, NOSE.pivotY + 0.05, 0), dragB = v3(NOSE.x, NOSE.pivotY - len * 0.45, 0);
    const drag = cyl(0.04, 0.04, dragA.distanceTo(dragB), M.steel); drag.position.copy(dragA).add(dragB).multiplyScalar(0.5);
    drag.quaternion.setFromUnitVectors(v3(0, 1, 0), dragB.clone().sub(dragA).normalize()); leg.add(drag);
    // 转弯部分：活塞杆 + 轮轴 + 双轮，绕支柱轴线转
    const steer = new THREE.Group(); steer.position.set(NOSE.x, 0, 0);
    const piston = cyl(0.058, 0.058, len * 0.55, M.chrome); piston.position.y = axleY + len * 0.27; steer.add(piston);
    const axle = cyl(0.05, 0.05, NOSE.halfTrack * 2 + 0.1, M.steel, 'z'); axle.position.y = axleY; steer.add(axle);
    const link = box(0.3, 0.06, 0.07, M.steel, 0.16, axleY + len * 0.42, 0); link.rotation.z = 0.5; steer.add(link);
    for (const s of [1, -1]) { const w = wheel(M, NOSE.r, NOSE.w, 0); w.position.set(0, axleY, s * NOSE.halfTrack); steer.add(w); out.wheels.push({ obj: w, r: NOSE.r }); }
    // 滑行灯 / 起飞灯装在前起支柱上
    const lamp = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2cc, emissiveIntensity: 0 });
    for (const s of [1, -1]) { const l = cyl(0.07, 0.07, 0.05, lamp, 'x', 14); l.position.set(NOSE.x - 0.12, NOSE.pivotY - len * 0.42, s * 0.13); leg.add(l); }
    out.taxiLamp = lamp;
    leg.add(steer); tag(leg, 'nlg');
    out.noseLeg = hinge(leg, v3(NOSE.x, NOSE.pivotY, -1), v3(NOSE.x, NOSE.pivotY, 1));
    out.steer = steer;
    g.add(out.noseLeg);

    // 舱口底板 + 4 扇舱门：前两扇只在收放过程中打开，后两扇随支柱联动（放下后保持打开）
    const fp = (s, a, off) => fusPoint(s, Math.PI - a, off);       // a = 偏离正下方的角度（左舷为正）
    const x0 = 2.95, xm = 4.72, x1 = 5.42, hw = 0.2;
    g.add(patch(fp, x0, x1, -hw, hw, 0.004, M.bay, 'nlg'));
    out.noseDoorsFwd = []; out.noseDoorsAft = [];
    for (const s of [1, -1]) {
      const mk = (a, b) => {
        const d = patch(fp, a, b, s > 0 ? 0 : -hw, s > 0 ? hw : 0, 0.016, M.door, 'nlg', 5, 3);
        return hinge(d, fp(a, s * hw, 0.016), fp(b, s * hw, 0.016));
      };
      const f = mk(x0, xm), a = mk(xm + 0.02, x1); g.add(f, a);
      out.noseDoorsFwd.push({ h: f, sign: -s }); out.noseDoorsAft.push({ h: a, sign: -s });
    }
  }

  // ================= 主起落架 =================
  for (const side of [1, -1]) {
    const leg = new THREE.Group(), axleY = GROUND + MAIN.r;
    const P = v3(MAIN.x, MAIN.pivotY, side * MAIN.pivotZ), A = v3(MAIN.x, axleY, side * MAIN.wheelZ);
    const dir = A.clone().sub(P), len = dir.length(); dir.normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(v3(0, -1, 0), dir);
    const seg = (r, a, b, mat) => { const c = cyl(r, r, len * (b - a), mat, 'y', 18); c.quaternion.copy(q); c.position.copy(P).addScaledVector(dir, len * (a + b) / 2); leg.add(c); return c; };
    seg(0.125, 0, 0.6, M.strut); seg(0.085, 0.55, 1.0, M.chrome);
    const axle = cyl(0.07, 0.07, MAIN.halfTrack * 2 + 0.16, M.steel, 'z'); axle.position.copy(A); leg.add(axle);
    const tq = box(0.34, 0.07, 0.09, M.steel, MAIN.x + 0.2, axleY + len * 0.3, side * (MAIN.wheelZ - 0.1)); tq.rotation.z = -0.6; leg.add(tq);
    // 侧撑杆：把支柱中部拉到机翼根部
    const sa = P.clone().addScaledVector(dir, len * 0.5), sb = v3(MAIN.x, MAIN.pivotY + 0.05, side * (MAIN.pivotZ - 1.25));
    const stay = cyl(0.045, 0.045, sa.distanceTo(sb), M.steel); stay.position.copy(sa).add(sb).multiplyScalar(0.5);
    stay.quaternion.setFromUnitVectors(v3(0, 1, 0), sb.clone().sub(sa).normalize()); leg.add(stay);
    for (const s of [1, -1]) {
      const w = wheel(M, MAIN.r, MAIN.w, -s);
      w.position.set(MAIN.x, axleY, side * MAIN.wheelZ + s * MAIN.halfTrack); leg.add(w); out.wheels.push({ obj: w, r: MAIN.r });
    }
    // 随支柱一起动的小舱门
    const ld = box(0.62, len * 0.6, 0.03, M.door); ld.quaternion.copy(q); ld.position.copy(P).addScaledVector(dir, len * 0.36).add(v3(0, 0, side * 0.14)); leg.add(ld);
    tag(leg, 'mlg');
    const legH = hinge(leg, v3(MAIN.x - 1, MAIN.pivotY, side * MAIN.pivotZ), v3(MAIN.x + 1, MAIN.pivotY, side * MAIN.pivotZ));
    g.add(legH);

    // 机腹上的轮舱门：收放过程中打开，放下锁好后重新关上
    const x0 = 16.9, x1 = 18.55;
    const bp = (s, z, off) => bellyPoint(s, bellyPhi(s, side * z), off);
    const zIn = 0.22, zOut = 2.4;
    g.add(patch(bp, x0, x1, side > 0 ? zIn : zOut, side > 0 ? zOut : zIn, 0.004, M.bay, 'mlg'));
    const door = patch(bp, x0, x1, side > 0 ? zIn : zOut, side > 0 ? zOut : zIn, 0.016, M.door, 'mlg');
    const doorH = hinge(door, bp(x0, zIn, 0.016), bp(x1, zIn, 0.016));
    g.add(doorH);
    out.main.push({ leg: legH, door: doorH, side });
  }

  /** g ∈ [0 放下, 1 收上]；steer 为前轮转弯角（弧度，向右为正） */
  out.set = (gv, steerRad = 0) => {
    const q = gearSequence(gv);
    out.noseLeg.setAngle(NOSE.swing * q.leg);
    out.steer.rotation.y = -steerRad * (1 - q.leg);
    for (const d of out.noseDoorsFwd) d.h.setAngle(d.sign * 86 * DEG * q.door);
    for (const d of out.noseDoorsAft) d.h.setAngle(d.sign * 82 * DEG * (1 - q.leg));
    for (const m of out.main) { m.leg.setAngle(m.side * MAIN.swing * q.leg); m.door.setAngle(m.side * 84 * DEG * q.door); }
  };
  out.spin = (dist) => { for (const w of out.wheels) w.obj.rotation.z += dist / w.r; };
  out.set(0);
  return out;
}
