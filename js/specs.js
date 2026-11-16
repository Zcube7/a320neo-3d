// A320neo 的公开数据与操纵面混合逻辑。纯数据 + 纯函数，不依赖 three.js，可直接在 Node 里测试。
// 坐标约定（机体系）：X 向后（机头 x=0，机尾 x=37.57），Y 向上（0 = 等直段机身中心线），+Z = 左机翼。

export const SPEC = {
  name: 'Airbus A320neo',
  length: 37.57,        // 机长 m
  span: 35.80,          // 翼展（含鲨鳍小翼）m
  spanNoTip: 34.10,     // 不含小翼的翼展 m
  height: 11.76,        // 机高 m
  fuselageW: 3.95,      // 机身外宽 m
  fuselageH: 4.14,      // 机身外高 m
  cabinW: 3.70,         // 客舱内宽 m
  wheelbase: 12.64,     // 前后轮距 m
  track: 7.59,          // 主轮距 m
  noseGearX: 5.07,      // 前起落架站位（距机头）m
  sweep: 25,            // 1/4 弦线后掠角 °
  dihedral: 5.1,        // 上反角 °
  sharkletH: 2.4,       // 鲨鳍小翼高度 m
  engineZ: 5.75,        // 发动机轴线到机身对称面 m
  fanDia: 1.98,         // LEAP-1A 风扇直径 m（78 in）
  axisH: 3.85,          // 机身中心线离地高度 m（停机状态，近似）
  mtow: 79,             // 最大起飞重量 t
  cruiseMach: 0.78,
  mmo: 0.82,
  ceilingFt: 39800,
};

// 发动机本地系：x 从进气道唇口向后，轴线即 x 轴
export const ENG = {
  x0: 10.9, y0: -2.09,                 // 唇口在机体系中的位置
  fanX: 1.15, fanR: 0.99,
  cowlSplit: 2.15, exitX: 3.75, coreExitX: 4.5, plugEnd: 5.25, reverseTravel: 0.55,
};

// 襟翼手柄 5 个卡位 → 缝翼/襟翼角度（°）。卡位 1 在地面/起飞时是 1+F，空中从 0 放出时只放缝翼。
export const FLAP_LEVER = ['0', '1', '2', '3', 'FULL'];
export function flapConfig(lever, airborne) {
  switch (lever) {
    case 1: return airborne ? { name: '1', slat: 18, flap: 0 } : { name: '1+F', slat: 18, flap: 10 };
    case 2: return { name: '2', slat: 22, flap: 15 };
    case 3: return { name: '3', slat: 22, flap: 20 };
    case 4: return { name: 'FULL', slat: 27, flap: 35 };
    default: return { name: '0', slat: 0, flap: 0 };
  }
}

// 舵面偏转极限（°）
export const LIMITS = {
  aileron: 25,
  aileronDroop: 5,        // 襟翼放出时副翼随动下垂
  elevatorUp: 30,
  elevatorDown: 17,
  thsUp: 13.5,            // 机头上仰配平
  thsDown: 4,
  rudder: 25,
  rollSpoiler: 35,
  speedbrake: [0, 20, 40, 40, 0],   // 1~5 号扰流板作减速板时的最大角度
  groundSpoiler: 50,
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/**
 * 把「驾驶舱输入」换算成各舵面目标角度（教学用的直接映射；真机由飞控计算机按控制律决定）。
 * 输入：roll/pitch/rudder ∈ [-1,1]（右滚、抬头、右舵为正），speedbrake ∈ [0,1]，
 *       groundSpoilers 是否升起，flapDeg 当前襟翼角度。
 * 输出角度都以「后缘向上」为正；数组下标 0~4 对应 1~5 号扰流板（从内到外）。
 */
export function mixSurfaces(input) {
  const roll = clamp(input.roll || 0, -1, 1);
  const pitch = clamp(input.pitch || 0, -1, 1);
  const rud = clamp(input.rudder || 0, -1, 1);
  const sb = clamp(input.speedbrake || 0, 0, 1);
  const droop = (input.flapDeg || 0) > 0.5 ? LIMITS.aileronDroop : 0;

  // 右滚：右副翼后缘向上、左副翼向下
  const ailL = clamp(-roll * LIMITS.aileron - droop, -LIMITS.aileron, LIMITS.aileron);
  const ailR = clamp(roll * LIMITS.aileron - droop, -LIMITS.aileron, LIMITS.aileron);

  const spoilers = (downgoing) => {
    const out = [];
    for (let i = 0; i < 5; i++) {
      if (input.groundSpoilers) { out.push(LIMITS.groundSpoiler); continue; }
      let a = sb * LIMITS.speedbrake[i];
      // 2~5 号辅助滚转：只在要下沉的那一侧升起
      if (i >= 1 && downgoing > 0) a += downgoing * LIMITS.rollSpoiler;
      out.push(clamp(a, 0, LIMITS.groundSpoiler));
    }
    return out;
  };

  return {
    aileronL: ailL,
    aileronR: ailR,
    spoilersL: spoilers(Math.max(0, -roll)),
    spoilersR: spoilers(Math.max(0, roll)),
    elevator: pitch >= 0 ? pitch * LIMITS.elevatorUp : pitch * LIMITS.elevatorDown,
    rudder: rud * LIMITS.rudder,           // 正 = 方向舵后缘向右（机头右偏）
  };
}

// 起落架收放时序：g ∈ [0 放下, 1 收上] → 舱门开度与支柱收起比例
export function gearSequence(g) {
  const s = clamp(g, 0, 1);
  const ramp = (a, b) => clamp((s - a) / (b - a), 0, 1);
  const ease = (t) => t * t * (3 - 2 * t);
  const door = ease(ramp(0, 0.16)) * (1 - ease(ramp(0.84, 1)));   // 过程中打开，两端关闭
  const leg = ease(ramp(0.14, 0.86));
  return { door, leg };
}

// 飞行阶段预设：一键把全机构型切到该阶段
export const PHASES = [
  { id: 'park', name: '停机', airborne: false, flap: 0, gear: 0, throttle: 0, reverse: false, speedbrake: 0, groundSpoilers: false, pitch: 0,
    note: '发动机关车，APU 供电供气；起落架承重，所有舵面收平。' },
  { id: 'takeoff', name: '起飞', airborne: false, flap: 1, gear: 0, throttle: 1, reverse: false, speedbrake: 0, groundSpoilers: false, pitch: 0,
    note: '襟翼 1+F：缝翼 18°、襟翼 10°，低速下多拿升力；发动机起飞推力，抬轮时升降舵后缘上偏。' },
  { id: 'climb', name: '爬升', airborne: true, flap: 0, gear: 1, throttle: 0.85, reverse: false, speedbrake: 0, groundSpoilers: false, pitch: 0.45,
    note: '离地后收起落架，随速度增加逐级收襟缝翼，机翼恢复干净构型以减小阻力。' },
  { id: 'cruise', name: '巡航', airborne: true, flap: 0, gear: 1, throttle: 0.6, reverse: false, speedbrake: 0, groundSpoilers: false, pitch: 0.12,
    note: '约 11 km 高度、马赫 0.78。水平安定面缓慢配平，升降舵几乎不偏；小翼在此时省油最多。' },
  { id: 'descent', name: '下降', airborne: true, flap: 0, gear: 1, throttle: 0.05, reverse: false, speedbrake: 0.6, groundSpoilers: false, pitch: -0.15,
    note: '油门慢车；需要更快减速或下降时拉出减速板，2~4 号扰流板在两侧对称升起。' },
  { id: 'approach', name: '进近', airborne: true, flap: 4, gear: 0, throttle: 0.35, reverse: false, speedbrake: 0, groundSpoilers: false, pitch: 0.2,
    note: '襟翼 FULL：缝翼 27°、襟翼 35°，把进近速度压到约 250 km/h；起落架放下并锁定。' },
  { id: 'rollout', name: '着陆滑跑', airborne: false, flap: 4, gear: 0, throttle: 0.55, reverse: true, speedbrake: 0, groundSpoilers: true, pitch: 0,
    note: '主轮接地瞬间 10 块扰流板全部升起卸掉升力，反推打开，机轮刹车承担大部分减速。' },
];
