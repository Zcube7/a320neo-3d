// 尾翼：垂直安定面 + 方向舵；可配平水平安定面（整体转动）+ 升降舵。
import * as THREE from 'three';
import { Surface, hingeLR } from './surface.js';
import { hinge, mesh, v3, lerp, DEG } from './geom.js';
import { SPEC } from './specs.js';

const FIN_Y0 = 1.6, FIN_H = SPEC.height - SPEC.axisH - FIN_Y0;   // 垂尾根部埋在机身里，翼尖离地 11.76 m
const HT_SEMI = 6.225, HT_Y0 = 0.78;
export const THS_PIVOT = v3(33.5, HT_Y0, 0);

export function buildTail(M) {
  const g = new THREE.Group(), out = { group: g, elevators: [] };

  // ---- 垂直安定面 ----
  const F = new Surface({
    xLE: (u) => 29.9 + Math.tan(41 * DEG) * u,
    chord: (u) => lerp(6.3, 1.75, u / FIN_H),
    tc: () => 0.1, camber: 0,
    place: (u, x, t) => v3(x, FIN_Y0 + u, t),
  });
  const RF = 0.68, r0 = 0.75, r1 = FIN_H - 0.06;
  g.add(mesh(F.piece(0, FIN_H, 0, RF, { nu: 8 }), M.paintBlue, 'rudder'));
  g.add(mesh(F.piece(0, r0, RF, 1), M.paintBlue, 'rudder'));
  g.add(mesh(F.piece(r1, FIN_H, RF, 1, { nu: 2 }), M.paintBlue, 'rudder'));
  const rud = mesh(F.piece(r0 + 0.015, r1 - 0.015, RF, 1, { roundFront: 0.7, nu: 8 }), M.paintBlue2, 'rudder');
  out.rudder = hinge(rud, F.mid(r0, RF + 0.012), F.mid(r1, RF + 0.012));   // 正角度 = 后缘向右
  g.add(out.rudder);
  out.finTip = F.mid(FIN_H, 0.5);
  out.F = F;

  // ---- 水平安定面（THS）：左右两半 + 升降舵装在同一个可转动的组里 ----
  const ths = new THREE.Group();
  for (const side of [1, -1]) {
    const H = new Surface({
      xLE: (u) => 31.0 + Math.tan(33 * DEG) * u,
      chord: (u) => lerp(4.0, 1.35, u / HT_SEMI),
      tc: () => 0.09, camber: 0,
      place: (u, x, t) => v3(x, HT_Y0 + u * Math.tan(6 * DEG) + t, side * u),
      flip: side > 0,
    });
    const EF = 0.7, e0 = 0.95, e1 = HT_SEMI - 0.08;
    ths.add(mesh(H.piece(0, HT_SEMI, 0, EF, { nu: 7 }), M.paintGrey, 'ths'));
    ths.add(mesh(H.piece(0, e0, EF, 1, { nu: 2 }), M.paintGrey, 'ths'));
    ths.add(mesh(H.piece(e1, HT_SEMI, EF, 1, { nu: 2 }), M.paintGrey, 'ths'));
    const el = mesh(H.piece(e0 + 0.015, e1 - 0.015, EF, 1, { roundFront: 0.7, nu: 6 }), M.panel, 'ths');
    const h = hingeLR(el, H.mid(e0, EF + 0.012), H.mid(e1, EF + 0.012), side);   // 正角度 = 后缘向上
    ths.add(h); out.elevators.push(h);
    if (side > 0) out.H = H;
  }
  // 整个安定面绕横轴转动；正角度 = 前缘向下 = 机头上仰配平
  out.ths = hinge(ths, THS_PIVOT.clone().add(v3(0, 0, -1)), THS_PIVOT.clone().add(v3(0, 0, 1)));
  g.add(out.ths);
  return out;
}
