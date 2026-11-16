// 入口：渲染器、场景、状态机与每帧更新。所有界面操作都落到 app.set / app.select / app.setPhase 三个接口上。
import * as THREE from 'three';
import { makeMaterials, setXray } from './materials.js';
import { buildEnv } from './env.js';
import { buildAircraft } from './aircraft.js';
import { Orbit } from './orbit.js';
import { buildEngineFlow, buildWingFlow } from './flow.js';
import { SPEC, flapConfig, mixSurfaces, PHASES } from './specs.js';
import { PARTS, PART } from './content.js';
import { initUI } from './ui.js';
import { layoutMode, freeRect, lowPower } from './layout.js';

const DEG = Math.PI / 180;
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.localClippingEnabled = true;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, 0.3, 30000);
const env = buildEnv(scene, renderer);
const M = makeMaterials();
const ac = buildAircraft(M, renderer.capabilities.maxTextureSize >= 8192 && !lowPower());
scene.add(ac.rig);
env.sun.target.position.set(0, SPEC.axisH, 0);
const orbit = new Orbit(camera, canvas);
const engFlow = ac.engines.map((e) => buildEngineFlow(e));
const wingFlow = buildWingFlow(ac.root, ac.wingL);

// ---------------- 状态 ----------------
const state = {
  part: 'overview', phase: 'park', phaseNote: false, tour: false,
  airborne: false, runway: false, basePitch: 0,
  roll: 0, pitch: 0, rudder: 0, flap: 0, speedbrake: 0, groundSpoilers: false,
  gearUp: false, engines: false, throttle: 0, reverse: false, ths: 0, tiller: 0, rat: false,
  lights: { nav: true, beacon: false, strobe: false, landing: false },
  xray: false, cut: false, flow: true, labels: true,
};
// 各活动部件当前的实际位置（朝目标值按速率逼近）
const cur = { slat: 0, flap: 0, ailL: 0, ailR: 0, spL: [0, 0, 0, 0, 0], spR: [0, 0, 0, 0, 0], elev: 0, ths: 0, rud: 0, gear: 0, rev: 0, n1: 0, n2: 0, rat: 0, pitch: 0, bank: 0, yaw: 0, steer: 0, speed: 0 };
const toward = (v, target, rate, dt) => (v < target ? Math.min(target, v + rate * dt) : Math.max(target, v - rate * dt));

let ui = null, tourT = 0, time = 0;
const changed = () => ui && ui.refresh();
const app = { state, cur, ac, orbit, camera, scene, renderer, M, env };

function applyModes() {
  setXray(M, state.xray); ac.setInternals(state.xray);
  ac.engines[0].setCut(state.cut);
  env.setMode(state.airborne ? 'air' : state.runway ? 'runway' : 'apron');
  orbit.useFloor = !state.airborne;
  const fm = state.flow ? PART[state.part].flow : null;
  engFlow.forEach((f) => { f.points.visible = fm === 'engine'; });
  wingFlow.points.visible = fm === 'wing';
}

app.set = (key, value) => {
  const S = state;
  switch (key) {
    case 'gearUp':
      if (value && !S.airborne) { S.airborne = true; S.runway = false; S.groundSpoilers = false; S.reverse = false; S.basePitch = 3; ui.toast('地面上起落架手柄有防误收保护，已切到空中演示收放。'); }
      S.gearUp = value; break;
    case 'airborne':
      S.airborne = value; S.runway = false; S.basePitch = value ? 2.5 : 0;
      if (!value) { S.gearUp = false; cur.gear = Math.min(cur.gear, 0.0); } else { S.groundSpoilers = false; S.reverse = false; }
      break;
    case 'reverse':
      if (value && S.airborne) { S.airborne = false; S.gearUp = false; cur.gear = 0; S.basePitch = 0; ui.toast('反推只能在地面使用，已切回地面。'); }
      if (value) { S.engines = true; S.runway = true; if (S.throttle < 0.4) S.throttle = 0.55; }
      S.reverse = value; break;
    case 'groundSpoilers':
      if (value && S.airborne) { S.airborne = false; S.gearUp = false; cur.gear = 0; S.basePitch = 0; ui.toast('地面扰流板只在主轮接地后才会放出，已切回地面。'); }
      S.groundSpoilers = value; break;
    case 'engines':
      S.engines = value; if (!value) { S.throttle = 0; S.reverse = false; } else if (S.throttle < 0.02) S.throttle = 0.12;
      S.lights.beacon = value; break;
    case 'throttle':
      S.throttle = value; if (value > 0.02 && !S.engines) { S.engines = true; S.lights.beacon = true; } break;
    case 'tour':
      S.tour = value; tourT = 0; if (value) ui.toast('导览开始：每 14 秒自动切到下一个部件，再点一次停止。'); break;
    default: S[key] = value;
  }
  applyModes(); changed();
};
app.setLight = (k, on) => { state.lights[k] = on; changed(); };

app.select = (id, o = {}) => {
  const p = PART[id]; if (!p) return;
  const S = state;
  if (o.user) S.tour = false;
  S.part = id; S.xray = !!p.xray; S.cut = !!p.cut; S.phaseNote = false;
  if (p.ground && S.airborne) { S.airborne = false; S.gearUp = false; cur.gear = 0; S.basePitch = 0; }
  if (p.needEngine && !S.engines) { S.engines = true; S.lights.beacon = true; if (S.throttle < 0.3) S.throttle = 0.4; }
  if (id === 'lights') Object.assign(S.lights, { nav: true, beacon: true, strobe: true, landing: true });
  applyModes(); flyTo(p); pulse(id); changed();
  if (o.jump) orbit.jump();
};

app.setPhase = (id) => {
  const ph = PHASES.find((x) => x.id === id); if (!ph) return;
  const S = state;
  Object.assign(S, { phase: id, phaseNote: true, airborne: ph.airborne, flap: ph.flap, gearUp: !!ph.gear, throttle: ph.throttle, reverse: ph.reverse, speedbrake: ph.speedbrake, groundSpoilers: ph.groundSpoilers });
  S.engines = id !== 'park'; S.runway = id === 'takeoff' || id === 'rollout';
  S.basePitch = { climb: 8, cruise: 2.5, descent: -1.5, approach: 3.5 }[id] || 0;
  if (!ph.airborne) cur.gear = 0;
  Object.assign(S.lights, { nav: true, beacon: S.engines, strobe: id !== 'park', landing: ['takeoff', 'approach', 'rollout'].includes(id) });
  applyModes(); changed();
  if (S.part === 'overview') flyTo(PART.overview);
};

// ---------------- 相机、标注投影 ----------------
const tmpV = new THREE.Vector3();
const toWorld = (p) => ac.root.localToWorld(tmpV.set(p[0], p[1], p[2]));
// 取景：面板挡掉一部分画面后，剩下的空白区域（view.free）才是真正能看到飞机的地方。
//   view.off  把画面中心挪到空白区域中央的像素偏移（平滑过渡，弹层开合时飞机跟着滑过去）
//   view.k    相机后退的倍数：空白区域越窄 / 越矮，退得越远，保证部件完整落在里面
const view = { mode: '', free: { x0: 0, y0: 0, x1: 1, y1: 1 }, k: 0, off: new THREE.Vector2(), goal: new THREE.Vector2() };
app.view = view;
function viewFactor() {
  const w = innerWidth, h = innerHeight, f = view.free;
  if (view.mode === 'wide') return Math.pow(w / (w - (w > 1180 ? 576 : 508)), 0.85) * (h < 700 ? 1.12 : 1);
  if (view.mode === 'clean') return Math.max(1, 1.25 * h / w);
  return Math.max(1, 1.25 * h / (f.x1 - f.x0), 0.87 * h / (f.y1 - f.y0));
}
const anchor = new THREE.Vector3(), anchorW = new THREE.Vector3(), anchorD = new THREE.Vector3();
function flyTo(p) {
  ac.rig.updateMatrixWorld(true);
  const v = view.mode === 'port' && p.viewP ? { ...p.view, ...p.viewP } : p.view;      // 竖屏可以另给一个视角
  anchor.set(v.t[0], v.t[1], v.t[2]); anchorW.copy(toWorld(v.t));
  orbit.flyTo(anchorW.clone(), v.az, v.el, v.dist * view.k);
}
// 空中压杆时飞机会滚转 / 俯仰，翼尖这类离重心远的部件能甩出去好几米：让镜头跟着所看的部件平移，它才不会跑出画面
function followPart() {
  ac.rig.updateWorldMatrix(false, false); ac.root.updateWorldMatrix(false, false);
  anchorD.copy(ac.root.localToWorld(tmpV.copy(anchor))).sub(anchorW);
  if (anchorD.lengthSq() < 1e-10) return;
  orbit.goal.t.add(anchorD); orbit.cur.t.add(anchorD); anchorW.add(anchorD);
}
function applyOffset() {
  const w = innerWidth, h = innerHeight, o = view.off;
  if (Math.abs(o.x) < 0.5 && Math.abs(o.y) < 0.5) camera.clearViewOffset(); else camera.setViewOffset(w, h, o.x, o.y, w, h);
  camera.updateProjectionMatrix();
}
function slideOffset(dt) {
  const d2 = view.off.distanceToSquared(view.goal);
  if (d2 === 0) return;
  if (d2 < 0.3) view.off.copy(view.goal); else view.off.lerp(view.goal, 1 - Math.exp(-dt * 9));
  applyOffset();
}
function layout(jump) {
  const w = innerWidth, h = innerHeight, was = view.mode, k0 = view.k;
  renderer.setSize(w, h, false); camera.aspect = w / h;
  view.mode = layoutMode();
  // 部件列表是点一下就收的临时弹层：它开着的时候画面不跟着挪
  if (!(k0 && view.mode === was && view.mode !== 'wide' && document.body.classList.contains('sList'))) view.free = freeRect(view.mode);
  const f = view.free;
  view.goal.set(w / 2 - (f.x0 + f.x1) / 2, view.mode === 'wide' ? 46 : h / 2 - (f.y0 + f.y1) / 2);
  view.k = Math.min(3.4, viewFactor());
  if (k0 && view.mode !== was) flyTo(PART[state.part]);                                // 横竖屏 / 版式切换：按新版式重新取景
  else if (k0) orbit.goal.dist = Math.min(orbit.maxDist, orbit.goal.dist * view.k / k0);   // 否则只按比例进退，保留用户自己转的角度
  if (jump || !k0) view.off.copy(view.goal);
  applyOffset();
  if (ui) ui.relaid();
}
app.relayout = (jump) => layout(jump);
addEventListener('resize', () => layout(true)); layout(true);
const callPts = [];
function projectCallouts() {
  const cs = PART[state.part].callouts || [];
  callPts.length = cs.length;
  for (let i = 0; i < cs.length; i++) {
    const v = toWorld(cs[i].p).project(camera);
    callPts[i] = { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight, ok: v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 };
  }
  return callPts;
}

// ---------------- 高亮与拾取 ----------------
const hlBase = { color: 0x53b8ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
const hlSel = new THREE.MeshBasicMaterial(hlBase), hlHov = new THREE.MeshBasicMaterial({ ...hlBase, opacity: 0.15 });
const selList = [], hovList = [];
let selT = 9, hovId = null;
const shown = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
function overlays(id, mat, list) {
  const found = [];
  ac.rig.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && o.userData.part === id && !o.userData.hl && shown(o) && !(o.material.clippingPlanes && o.material.clippingPlanes.length)) found.push(o); });
  for (const o of found) { const h = new THREE.Mesh(o.geometry, mat); h.userData.hl = true; h.raycast = () => {}; h.castShadow = false; o.add(h); list.push(h); }
}
const clearList = (list) => { for (const h of list) if (h.parent) h.parent.remove(h); list.length = 0; };
function pulse(id) { clearList(selList); if (id === 'overview') return; overlays(id, hlSel, selList); selT = 0; }
function hover(id) { if (id === hovId) return; hovId = id; clearList(hovList); if (id && id !== state.part) overlays(id, hlHov, hovList); }

const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
ray.params.Line.threshold = 0.03;
function pick(cx, cy) {
  ndc.set((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  let skin = null;
  for (const h of ray.intersectObject(ac.rig, true)) {
    const o = h.object, m = o.material;
    if (o.userData.hl || !o.userData.part || !PART[o.userData.part] || !shown(o)) continue;
    if (m.clippingPlanes && m.clippingPlanes.length && m.clippingPlanes[0].distanceToPoint(h.point) < 0) continue;
    if (m.transparent && m.opacity < 0.05) continue;
    if (state.xray && m.userData && m.userData.skin) { skin = skin || o.userData.part; continue; }
    return o.userData.part;
  }
  return skin;
}
let lastHover = 0;
canvas.addEventListener('pointermove', (e) => {
  if (e.buttons || performance.now() - lastHover < 70 || e.pointerType === 'touch') return;
  lastHover = performance.now();
  const id = pick(e.clientX, e.clientY);
  hover(id); canvas.classList.toggle('pick', !!id);
  ui.tip(id && id !== state.part ? `${PART[id].name} · 点击查看` : '', e.clientX, e.clientY);
});
canvas.addEventListener('pointerleave', () => { hover(null); ui.tip(''); });
canvas.addEventListener('pointerup', (e) => {
  if (orbit.dragged || e.button !== 0) return;
  const id = pick(e.clientX, e.clientY);
  if (id) { hover(null); ui.tip(''); app.select(id, { user: true }); }
});

// ---------------- 每帧更新 ----------------
function step(dt) {
  const S = state, air = S.airborne;
  const cfg = flapConfig(S.flap, air);
  cur.slat = toward(cur.slat, cfg.slat, 9, dt); cur.flap = toward(cur.flap, cfg.flap, 8, dt);
  const m = mixSurfaces({ roll: S.roll, pitch: S.pitch, rudder: S.rudder, speedbrake: S.speedbrake, groundSpoilers: S.groundSpoilers && !air, flapDeg: cur.flap });
  cur.ailL = toward(cur.ailL, m.aileronL, 70, dt); cur.ailR = toward(cur.ailR, m.aileronR, 70, dt);
  for (let i = 0; i < 5; i++) { cur.spL[i] = toward(cur.spL[i], m.spoilersL[i], 90, dt); cur.spR[i] = toward(cur.spR[i], m.spoilersR[i], 90, dt); }
  cur.elev = toward(cur.elev, m.elevator, 70, dt); cur.rud = toward(cur.rud, m.rudder, 60, dt); cur.ths = toward(cur.ths, S.ths, 2.5, dt);
  ac.setSurfaces(cur);

  cur.gear = toward(cur.gear, S.gearUp ? 1 : 0, 1 / 9, dt);
  const steerT = air ? 0 : THREE.MathUtils.clamp(S.tiller * 75 + S.rudder * 6, -75, 75);
  cur.steer = toward(cur.steer, steerT, 60, dt);
  ac.gear.set(cur.gear, cur.steer * DEG);

  // 发动机：N1 / N2 转速按油门逼近；显示转速大幅放慢
  const n1T = S.engines ? 19 + 81 * S.throttle * (S.reverse ? 0.75 : 1) : 0, n2T = S.engines ? 60 + 40 * S.throttle : 0;
  cur.n1 = toward(cur.n1, n1T, cur.n1 < n1T ? 13 : 17, dt); cur.n2 = toward(cur.n2, n2T, 16, dt);
  cur.rev = toward(cur.rev, S.reverse ? 1 : 0, 0.6, dt);
  for (const e of ac.engines) {
    e.n1.rotation.x -= dt * cur.n1 * 0.055; e.n2.rotation.x -= dt * cur.n2 * 0.11;
    e.setReverse(cur.rev); e.burner.emissiveIntensity = 0.15 + 1.7 * (cur.n2 / 100) ** 2;
    if (S.cut) e.updatePlane();
  }
  const running = cur.n1 > 3;
  engFlow.forEach((f) => f.update(dt, cur.n1 / 100, cur.rev, running));
  wingFlow.update(dt, { flap: cur.flap, spoilers: cur.spL }, 1);

  cur.rat = toward(cur.rat, S.rat ? 1 : 0, 0.7, dt);
  ac.sys.setRat(cur.rat); ac.sys.ratProp.rotation.x += dt * 30 * Math.max(0, cur.rat - 0.6) * 2.5;
  ac.sys.updateLights(S.lights, time);
  ac.gear.taxiLamp.emissiveIntensity = S.lights.landing && cur.gear < 0.2 ? 5 : 0;

  // 姿态：空中随杆量滚转 / 俯仰（教学示意，不是飞行力学仿真）
  const k = 1 - Math.exp(-dt * 2.2);
  cur.bank += ((air ? S.roll * 28 : 0) - cur.bank) * k;
  cur.pitch += ((air ? S.basePitch + S.pitch * 8 : 0) - cur.pitch) * k;
  cur.yaw += ((air ? S.rudder * 6 : 0) - cur.yaw) * k;
  ac.rig.rotation.order = 'YZX';
  ac.rig.rotation.set(-cur.bank * DEG, -cur.yaw * DEG, -cur.pitch * DEG);

  const vT = air ? 230 : S.runway ? (S.reverse ? 45 : 18 + 55 * S.throttle) : 0;
  cur.speed += (vT - cur.speed) * (1 - Math.exp(-dt * 0.9));
  env.update(dt, cur.speed);
  if (!air) ac.gear.spin(-cur.speed * dt);

  // 选中高亮：闪两下后淡出
  if (selList.length) {
    selT += dt; hlSel.opacity = 0.42 * Math.exp(-selT * 1.5) * (0.65 + 0.35 * Math.cos(selT * 9));
    if (selT > 3.2) clearList(selList);
  }
  if (S.tour) {
    tourT += dt; orbit.goal.az += dt * 0.045;
    if (tourT > 14) { tourT = 0; const i = PARTS.findIndex((p) => p.id === S.part); app.select(PARTS[(i + 1) % PARTS.length].id); }
  }
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now; time += dt;
  step(dt); followPart(); orbit.update(dt); slideOffset(dt);
  renderer.render(scene, camera);
  ui.tick(now, projectCallouts());
}

// ---------------- 启动 ----------------
ui = initUI(app);
layout(true);                       // 界面元素建好之后再量一次空白区域
const q = new URLSearchParams(location.search);
applyModes();
if (q.get('phase')) app.setPhase(q.get('phase'));
app.select(PART[q.get('part')] ? q.get('part') : 'overview', { jump: true });
// 链接里可以带初始状态，例如 ?part=flap&set=flap:4,airborne:1 或 ?phase=rollout&part=reverser
for (const kv of (q.get('set') || '').split(',').filter(Boolean)) {
  const [k, v] = kv.split(':');
  if (k in state && typeof state[k] !== 'object') app.set(k, typeof state[k] === 'boolean' ? v === '1' || v === 'true' : +v);
}
if (q.has('clean')) { document.body.classList.add('clean'); layout(true); app.select(state.part, { jump: true }); }
if (q.has('settle')) { for (let i = 0; i < 260; i++) { time += 0.05; step(0.05); } orbit.jump(); }
renderer.setAnimationLoop(frame);
setTimeout(() => ui.ready(), 60);

// 调试接口：__app.step(秒) 可在标签页隐藏（rAF 不跑）时手动推进并渲染一帧
app.step = (sec = 0.016, n = 1) => { for (let i = 0; i < n; i++) { time += sec; step(sec); followPart(); orbit.update(sec); slideOffset(sec); } renderer.render(scene, camera); ui.tick(performance.now() + Math.random() * 1e3 + 100, projectCallouts()); };
app.pick = pick;
window.__app = app;
