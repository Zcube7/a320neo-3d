// 轨道相机：拖动旋转、右键 / Shift 拖动平移、滚轮缩放、双指捏合；带阻尼，可平滑飞到指定视角。
import * as THREE from 'three';

const DEG = Math.PI / 180;

export class Orbit {
  constructor(camera, dom) {
    this.cam = camera; this.dom = dom;
    this.goal = { t: new THREE.Vector3(0, 3, 0), az: -40 * DEG, el: 14 * DEG, dist: 52 };
    this.cur = { t: this.goal.t.clone(), az: this.goal.az, el: this.goal.el, dist: this.goal.dist };
    this.minDist = 1.2; this.maxDist = 220; this.floor = 0.25; this.useFloor = true;
    this.dragged = false; this.onUserMove = null;
    this._ptrs = new Map(); this._pinch = 0;
    dom.addEventListener('pointerdown', (e) => this._down(e));
    dom.addEventListener('pointermove', (e) => this._move(e));
    const up = (e) => this._up(e);
    dom.addEventListener('pointerup', up); dom.addEventListener('pointercancel', up); dom.addEventListener('pointerleave', up);
    dom.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom(Math.exp(e.deltaY * 0.0011)); }, { passive: false });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    this.apply();
  }

  _down(e) {
    this._ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, b: e.button, shift: e.shiftKey });
    this._travel = 0; this.dragged = this._ptrs.size > 1;      // 第二根手指落下就算拖动：抬手时不当成点选
    try { this.dom.setPointerCapture(e.pointerId); } catch { /* 合成事件没有活动指针 */ }
  }
  _up(e) { this._ptrs.delete(e.pointerId); this._pinch = 0; }
  _move(e) {
    const p = this._ptrs.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    this._travel += Math.abs(dx) + Math.abs(dy);
    if (this._travel > (e.pointerType === 'touch' ? 12 : 5)) this.dragged = true;      // 手指点一下难免抖几个像素
    if (this._ptrs.size >= 2) {
      const [a, b] = [...this._ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (this._pinch) this.zoom(this._pinch / d);
      this._pinch = d;
      this.pan(dx * 0.5, dy * 0.5);
    } else if (p.b === 2 || p.b === 1 || p.shift) this.pan(dx, dy);
    else {
      this.goal.az -= dx * 0.0052;
      this.goal.el = Math.min(88 * DEG, Math.max(-88 * DEG, this.goal.el + dy * 0.0045));
    }
    if (this.dragged && this.onUserMove) this.onUserMove();
  }
  zoom(f) { this.goal.dist = Math.min(this.maxDist, Math.max(this.minDist, this.goal.dist * f)); if (this.onUserMove) this.onUserMove(); }
  pan(dx, dy) {
    const k = this.goal.dist * 0.0012;
    const right = new THREE.Vector3().setFromMatrixColumn(this.cam.matrixWorld, 0);
    const upv = new THREE.Vector3().setFromMatrixColumn(this.cam.matrixWorld, 1);
    this.goal.t.addScaledVector(right, -dx * k).addScaledVector(upv, dy * k);
  }

  // 飞到视角：target 为世界坐标，az/el 为角度（度），dist 为米
  flyTo(target, az, el, dist) {
    this.goal.t.copy(target);
    let a = az * DEG;
    while (a - this.cur.az > Math.PI) a -= Math.PI * 2;
    while (a - this.cur.az < -Math.PI) a += Math.PI * 2;
    this.goal.az = a; this.goal.el = el * DEG; this.goal.dist = dist;
  }
  jump() { this.cur.t.copy(this.goal.t); this.cur.az = this.goal.az; this.cur.el = this.goal.el; this.cur.dist = this.goal.dist; this.apply(); }

  update(dt) {
    const k = 1 - Math.exp(-dt * 5.2), c = this.cur, g = this.goal;
    c.t.lerp(g.t, k); c.az += (g.az - c.az) * k; c.el += (g.el - c.el) * k; c.dist += (g.dist - c.dist) * k;
    this.apply();
  }
  apply() {
    const c = this.cur, ce = Math.cos(c.el);
    this.cam.position.set(c.t.x + c.dist * ce * Math.sin(c.az), c.t.y + c.dist * Math.sin(c.el), c.t.z + c.dist * ce * Math.cos(c.az));
    if (this.useFloor && this.cam.position.y < this.floor) this.cam.position.y = this.floor;
    this.cam.lookAt(c.t);
    this.cam.updateMatrixWorld();
  }
}
