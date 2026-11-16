// 运行：node --test tests/specs.test.mjs
// 覆盖不依赖浏览器的部分：操纵面混合逻辑、襟缝翼构型、起落架时序、飞行阶段预设、讲解内容的完整性。
import test from 'node:test';
import assert from 'node:assert/strict';
import { SPEC, ENG, LIMITS, PHASES, FLAP_LEVER, flapConfig, mixSurfaces, gearSequence } from '../js/specs.js';
import { PARTS, PART, GROUPS } from '../js/content.js';

test('机体尺寸与公开数据一致', () => {
  assert.equal(SPEC.length, 37.57); assert.equal(SPEC.span, 35.8); assert.equal(SPEC.height, 11.76);
  assert.equal(SPEC.wheelbase, 12.64); assert.equal(SPEC.track, 7.59);
  assert.ok(Math.abs(ENG.fanR * 2 - SPEC.fanDia) < 1e-9, '风扇半径要和 78 in 直径对上');
  assert.ok(SPEC.span - SPEC.spanNoTip > 1 && SPEC.span - SPEC.spanNoTip < 2.5, '小翼只让翼展增加一两米');
});

test('襟翼手柄 5 个卡位的缝翼 / 襟翼角度', () => {
  assert.deepEqual(FLAP_LEVER, ['0', '1', '2', '3', 'FULL']);
  assert.deepEqual(flapConfig(0, false), { name: '0', slat: 0, flap: 0 });
  assert.deepEqual(flapConfig(1, false), { name: '1+F', slat: 18, flap: 10 }, '地面的卡位 1 是 1+F');
  assert.deepEqual(flapConfig(1, true), { name: '1', slat: 18, flap: 0 }, '空中的卡位 1 只放缝翼');
  assert.deepEqual(flapConfig(4, true), { name: 'FULL', slat: 27, flap: 35 });
  for (const air of [false, true]) {
    let ps = -1, pf = -1;
    for (let i = 0; i < 5; i++) { const c = flapConfig(i, air); assert.ok(c.slat >= ps && c.flap >= pf, '卡位越大角度不能变小'); ps = c.slat; pf = c.flap; }
  }
});

test('压杆：副翼左右反向，滚转扰流板只在下沉一侧升起', () => {
  const r = mixSurfaces({ roll: 1 });
  assert.equal(r.aileronR, LIMITS.aileron, '右滚时右副翼后缘向上');
  assert.equal(r.aileronL, -LIMITS.aileron, '右滚时左副翼后缘向下');
  assert.deepEqual(r.spoilersL, [0, 0, 0, 0, 0], '上扬一侧的扰流板不动');
  assert.deepEqual(r.spoilersR, [0, 35, 35, 35, 35], '下沉一侧 2~5 号升起，1 号不参与滚转');
  const l = mixSurfaces({ roll: -0.5 });
  assert.equal(l.aileronL, 12.5); assert.equal(l.aileronR, -12.5);
  assert.ok(l.spoilersL[1] > 0 && l.spoilersR[1] === 0);
});

test('放襟翼时两侧副翼一起下垂 5°，且不超出行程', () => {
  const n = mixSurfaces({ flapDeg: 20 });
  assert.equal(n.aileronL, -5); assert.equal(n.aileronR, -5);
  const full = mixSurfaces({ roll: 1, flapDeg: 35 });
  assert.equal(full.aileronL, -25, '下垂叠加压杆后仍被行程限住');
  assert.equal(full.aileronR, 20);
});

test('减速板只动 2~4 号，地面扰流板 10 块全起', () => {
  const sb = mixSurfaces({ speedbrake: 1 });
  assert.deepEqual(sb.spoilersL, [0, 20, 40, 40, 0]); assert.deepEqual(sb.spoilersR, sb.spoilersL, '减速板必须左右对称');
  const gs = mixSurfaces({ groundSpoilers: true, roll: 0.7, speedbrake: 0.3 });
  assert.deepEqual(gs.spoilersL, [50, 50, 50, 50, 50]); assert.deepEqual(gs.spoilersR, [50, 50, 50, 50, 50]);
  const both = mixSurfaces({ speedbrake: 1, roll: 1 });
  assert.ok(both.spoilersR.every((a) => a <= LIMITS.groundSpoiler), '减速板 + 滚转叠加不能超过机械上限');
  assert.equal(both.spoilersR[2], 50);
});

test('升降舵上下行程不对称，方向舵对称', () => {
  assert.equal(mixSurfaces({ pitch: 1 }).elevator, 30); assert.equal(mixSurfaces({ pitch: -1 }).elevator, -17);
  assert.equal(mixSurfaces({ rudder: 1 }).rudder, 25); assert.equal(mixSurfaces({ rudder: -1 }).rudder, -25);
  assert.equal(mixSurfaces({ pitch: 5, roll: -9, rudder: 3 }).elevator, 30, '超量程的输入要被限幅');
});

test('起落架时序：舱门先开、支柱再动、舱门最后关', () => {
  assert.deepEqual(gearSequence(0), { door: 0, leg: 0 }); assert.deepEqual(gearSequence(1), { door: 0, leg: 1 });
  let prev = -1;
  for (let i = 0; i <= 100; i++) {
    const q = gearSequence(i / 100);
    assert.ok(q.leg >= prev - 1e-12, '支柱收起比例单调'); prev = q.leg;
    if (q.leg > 0.02 && q.leg < 0.98) assert.ok(q.door > 0.6, `支柱在动时舱门必须开着（g=${i / 100}，door=${q.door.toFixed(2)}）`);
  }
  assert.ok(gearSequence(0.5).door > 0.99);
});

test('飞行阶段预设自洽', () => {
  assert.equal(new Set(PHASES.map((p) => p.id)).size, PHASES.length);
  for (const p of PHASES) {
    assert.ok(p.flap >= 0 && p.flap <= 4 && p.note.length > 10, p.id);
    if (!p.airborne) assert.equal(p.gear, 0, `${p.id}：在地面起落架必须放下`);
    if (p.reverse || p.groundSpoilers) assert.equal(p.airborne, false, `${p.id}：反推 / 地面扰流板只能在地面`);
  }
  assert.equal(PHASES.find((p) => p.id === 'cruise').flap, 0); assert.equal(PHASES.find((p) => p.id === 'approach').gear, 0);
});

test('讲解内容完整', () => {
  assert.equal(new Set(PARTS.map((p) => p.id)).size, PARTS.length, 'id 不能重复');
  assert.equal(PARTS[0].id, 'overview'); assert.ok(PARTS.length >= 20); assert.ok(GROUPS.length >= 5);
  const consoleKeys = new Set(['stick', 'rudder', 'throttle', 'reverse', 'flap', 'speedbrake', 'groundSpoilers', 'gear', 'airborne']);
  const extraKeys = new Set(['ths', 'tiller', 'rat', 'cut', 'flow', 'lights']);
  for (const p of PARTS) {
    assert.ok(p.name && p.en && p.group && p.tagline.length > 12, p.id);
    assert.ok(p.how.length >= 3 && p.how.every((t) => t.length > 15), `${p.id}：原理至少三段`);
    assert.ok(p.facts.length >= 4 && p.facts.every((f) => f.length === 2 && f[0] && f[1]), `${p.id}：关键数据`);
    assert.ok(p.view.t.length === 3 && p.view.dist > 2 && p.view.dist < 80 && Math.abs(p.view.el) < 89, `${p.id}：视角`);
    if (p.viewP) {                                    // 竖屏视角只能覆盖 view 里已有的项，合并后同样要合法
      const v = { ...p.view, ...p.viewP };
      assert.ok(Object.keys(p.viewP).every((k) => k in p.view), `${p.id}：viewP 里有 view 没有的项`);
      assert.ok(v.t.length === 3 && v.t.every(Number.isFinite) && v.dist > 2 && v.dist < 80 && Math.abs(v.el) < 89 && Number.isFinite(v.az), `${p.id}：竖屏视角`);
    }
    for (const k of p.controls || []) assert.ok(consoleKeys.has(k), `${p.id}：未知操纵台控件 ${k}`);
    for (const k of p.extra || []) assert.ok(extraKeys.has(k), `${p.id}：未知专用控件 ${k}`);
    for (const c of p.callouts || []) {
      assert.ok(c.text && c.p.length === 3 && c.p.every(Number.isFinite), `${p.id}：标注点`);
      assert.ok(c.p[0] > -1 && c.p[0] < SPEC.length + 1 && Math.abs(c.p[2]) < SPEC.span / 2 + 0.5 && c.p[1] > -SPEC.axisH && c.p[1] < 8.5, `${p.id}：标注「${c.text}」跑到飞机外面去了`);
    }
    assert.equal(PART[p.id], p);
  }
});
