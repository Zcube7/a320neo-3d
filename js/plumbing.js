// 机载管路（透视模式可见）：三套液压（绿 / 蓝 / 黄）、交流电源馈线、发动机引气与空调分配。
// 走向按真机的大致布置示意，不是逐根管线的复刻。
import * as THREE from 'three';
import { pipe, mesh, cyl, box, v3 } from './geom.js';
import { ENG } from './engine.js';
import { SPEC } from './specs.js';

export const RAT_PIVOT = v3(19.0, -1.95, 1.2);

export function buildPlumbing(M, { wingL, wingR }) {
  const group = new THREE.Group();
  const EZ = SPEC.engineZ, ex = ENG.x0, ey = ENG.y0;
  const W = { 1: wingL.S, [-1]: wingR.S };
  const line = (pts, r, mat, part) => { const m = mesh(pipe(pts, r), mat, part, false); group.add(m); return m; };
  const put = (m, part) => { m.traverse((o) => { if (o.isMesh) { o.userData.part = part; o.castShadow = false; } }); group.add(m); return m; };
  const tank = (x, y, z, mat, part) => { const c = cyl(0.17, 0.17, 0.42, mat, 'y', 16); c.position.set(x, y, z); return put(c, part); };

  // ================= 液压：绿（1 发）、黄（2 发）、蓝（电动泵 + RAT） =================
  const H = 0.034;
  const engSys = (side, mat) => {
    const S = W[side], z = side * EZ, k = side;
    const pump = cyl(0.09, 0.09, 0.26, mat, 'x', 12); pump.position.set(ex + 2.45, ey - 0.42, z + k * 0.26); put(pump, 'hydraulic');
    const root = S.mid(2.3, 0.635), res = v3(17.3, -1.75, k * 0.78);
    line([v3(ex + 2.45, ey - 0.42, z + k * 0.26), v3(ex + 3.0, ey + 0.9, z), S.mid(EZ, 0.3, -0.05), S.mid(EZ, 0.635), S.mid(4.0, 0.635), root, res], H, mat, 'hydraulic');
    line([root, S.mid(6.4, 0.64), S.mid(10, 0.64), S.mid(13.2, 0.64), S.mid(15.7, 0.66)], H, mat, 'hydraulic');       // 襟翼、扰流板、副翼
    line([res, v3(19.0, -1.7, k * 0.42), v3(24, -1.75, k * 0.4), v3(29.5, -0.9, k * 0.35), v3(32.5, 0.5, k * 0.3), v3(33.6, 0.84, k * 0.7), v3(34.0, 0.98, k * 2.2)], H, mat, 'hydraulic');   // 升降舵
    line([v3(32.5, 0.5, k * 0.3), v3(34.1, 2.2, k * 0.06), v3(35.0 + k * 0.05, 4.2, k * 0.06)], H, mat, 'hydraulic');   // 方向舵
    tank(res.x, res.y + 0.1, res.z, mat, 'hydraulic');
    return res;
  };
  const resG = engSys(1, M.hydG);
  engSys(-1, M.hydY);
  line([resG, v3(16.6, -2.02, 0.45), v3(12.0, -2.02, 0.42), v3(6.0, -1.86, 0.3), v3(5.25, -1.72, 0.2)], H, M.hydG, 'hydraulic');   // 前起落架收放与转弯
  put(box(0.42, 0.22, 0.5, M.box, 17.3, -2.0, 0), 'hydraulic');                                                                    // PTU：绿黄两套之间的动力转换组件
  // 蓝系统
  const resB = v3(18.95, -1.72, 0.5);
  tank(resB.x, resB.y + 0.1, resB.z, M.hydB, 'hydraulic');
  const ep = cyl(0.1, 0.1, 0.32, M.hydB, 'x', 12); ep.position.set(18.5, -1.9, 0.9); put(ep, 'hydraulic');
  line([RAT_PIVOT, v3(18.9, -1.9, 1.05), v3(18.5, -1.9, 0.9), resB], H, M.hydB, 'hydraulic');
  for (const side of [1, -1]) {
    const S = W[side];
    line([resB, v3(16.6, -2.08, 0.15 * side), v3(13.0, -2.05, 0.2 * side), v3(13.2, -1.5, 1.9 * side), S.mid(2.7, 0.13), S.mid(6.4, 0.13), S.mid(11, 0.13), S.mid(15.9, 0.13)], H, M.hydB, 'hydraulic');   // 缝翼
  }
  line([resB, v3(19.6, -1.7, 0), v3(24, -1.75, 0), v3(29.5, -0.9, 0), v3(32.5, 0.5, 0), v3(33.9, 1.9, 0), v3(34.9, 3.6, 0)], H, M.hydB, 'hydraulic');

  // ================= 电源：两台发动机驱动的 IDG + APU 发电机 → 电子舱配电 =================
  const E = 0.024;
  put(box(0.35, 0.5, 1.6, M.box, 6.75, -0.98, 0), 'electrical');
  for (const side of [1, -1]) {
    const S = W[side], z = side * EZ;
    const idg = cyl(0.11, 0.11, 0.3, M.elec, 'x', 12); idg.position.set(ex + 2.2, ey - 0.45, z - side * 0.26); put(idg, 'electrical');
    line([v3(ex + 2.2, ey - 0.45, z - side * 0.26), v3(ex + 2.8, ey + 0.95, z), S.mid(EZ, 0.1), S.mid(2.4, 0.08), v3(12.6, -1.25, side * 1.5), v3(9, -0.95, side * 1.35), v3(6.75, -0.98, side * 0.8)], E, M.elec, 'electrical');
  }
  line([v3(34.6, 1.0, 0), v3(33, 0.2, 0.5), v3(30.5, -0.75, 1.1), v3(20, -0.72, 1.45), v3(12.6, -0.72, 1.5), v3(6.75, -0.9, 0.8)], E, M.elec, 'electrical');
  put(box(0.3, 0.2, 0.22, M.elec, 18.5, -1.62, 0.9), 'electrical');     // RAT 带动的应急发电机

  // ================= 引气与空调 =================
  const B = 0.055, C = 0.07;
  for (const side of [1, -1]) {
    const S = W[side], z = side * EZ;
    line([v3(ex + 2.6, ey + 0.45, z), v3(ex + 3.1, ey + 1.0, z), S.mid(EZ, 0.06, -0.05), S.mid(2.5, 0.06, -0.05), v3(13.0, -1.7, side * 1.7), v3(14.2, -2.12, side * 0.85)], B, M.bleed, 'aircond');
    put(box(1.5, 0.48, 0.9, M.pack, 14.7, -2.16, side * 0.85), 'aircond');                                       // 空调组件（PACK）
    line([v3(14.0, -2.16, side * 0.85), v3(12.7, -1.95, side * 0.6), v3(12.2, -1.4, side * 0.3)], C, M.cold, 'aircond');
    line([v3(12.2, -1.3, side * 0.5), v3(12.0, -0.62, side * 1.72), v3(12.0, 1.3, side * 1.25), v3(12.0, 1.72, side * 0.55)], C, M.cold, 'aircond');
    line([v3(5.6, 1.7, side * 0.5), v3(12.0, 1.72, side * 0.55), v3(21, 1.72, side * 0.55), v3(30.2, 1.6, side * 0.5)], C, M.cold, 'aircond');
  }
  line([v3(13.0, -1.7, 1.7), v3(13.0, -1.93, 0), v3(13.0, -1.7, -1.7)], B, M.bleed, 'aircond');                  // 交输引气
  line([v3(34.9, 0.95, 0.25), v3(32, -0.2, 0.8), v3(28, -0.8, 1.6), v3(22, -0.78, 1.68), v3(16.5, -0.78, 1.75), v3(13.3, -1.2, 1.75), v3(13.0, -1.7, 1.7)], B, M.bleed, 'aircond');   // APU 引气
  put(box(0.6, 0.5, 1.2, M.pack, 12.2, -1.35, 0), 'aircond');                                                    // 混合腔
  line([v3(5.6, 1.7, 0.5), v3(3.7, 1.25, 0.35)], C * 0.8, M.cold, 'aircond');                                    // 驾驶舱供气
  put(box(0.3, 0.3, 0.3, M.cold, 28.4, -1.78, -0.72), 'aircond');                                                // 外流活门
  return { group };
}
