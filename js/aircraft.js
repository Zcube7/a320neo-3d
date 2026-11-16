// 整机装配：把机身、机翼、尾翼、发动机、起落架、机载系统装到同一个机体系下，并提供按角度驱动各活动部件的接口。
import * as THREE from 'three';
import { DEG } from './geom.js';
import { buildFuselage } from './fuselage.js';
import { buildWing } from './wing.js';
import { buildTail } from './tail.js';
import { buildEngine, buildPylon } from './engine.js';
import { buildGear } from './gear.js';
import { buildSystems } from './systems.js';
import { SPEC } from './specs.js';

export const CG_X = 17.0;   // 姿态转动的参考点（机体系 X）

export function buildAircraft(M, hiRes) {
  const rig = new THREE.Group();            // 世界系里的姿态节点：位置 = 重心，转动 = 俯仰 / 滚转 / 偏航
  const root = new THREE.Group();           // 机体系：机头 x=0，向后为 +X，+Z 为左翼
  root.position.x = -CG_X;
  rig.add(root);
  rig.position.y = SPEC.axisH;

  const fuselage = buildFuselage(M, hiRes);
  const wingL = buildWing(M, 1), wingR = buildWing(M, -1);
  const tail = buildTail(M);
  const engL = buildEngine(M, 1, true), engR = buildEngine(M, -1, false);
  const gear = buildGear(M);
  root.add(fuselage, wingL.group, wingR.group, tail.group, engL.group, engR.group, gear.group);
  root.add(buildPylon(M, 1, wingL.S), buildPylon(M, -1, wingR.S));
  const sys = buildSystems(M, { wingL, wingR, tail });
  root.add(sys.group, sys.ext);            // group 只在透视时显示；ext（探头、天线、RAT、灯光）始终可见

  const ac = { rig, root, fuselage, wingL, wingR, tail, engines: [engL, engR], gear, sys };

  /** 按「度」设置全部活动面。s: { slat, flap, ailL, ailR, spL[5], spR[5], elev, ths, rud } */
  ac.setSurfaces = (s) => {
    for (const w of [wingL, wingR]) {
      w.slats.forEach((h) => h.setAngle(s.slat * DEG));        // 正 = 前缘下垂
      w.flaps.forEach((h) => h.setAngle(-s.flap * DEG));       // 襟翼后缘向下
    }
    wingL.aileron.setAngle(s.ailL * DEG); wingR.aileron.setAngle(s.ailR * DEG);
    wingL.spoilers.forEach((h, i) => h.setAngle(s.spL[i] * DEG));
    wingR.spoilers.forEach((h, i) => h.setAngle(s.spR[i] * DEG));
    tail.elevators.forEach((h) => h.setAngle(s.elev * DEG));
    tail.ths.setAngle(s.ths * DEG);
    tail.rudder.setAngle(s.rud * DEG);
  };

  // 透视模式下才显示内部结构与系统
  ac.setInternals = (on) => { sys.group.visible = on; wingL.internals.visible = on; wingR.internals.visible = on; };
  ac.setInternals(false);
  return ac;
}
