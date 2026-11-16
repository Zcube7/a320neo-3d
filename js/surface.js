// 升力面（机翼 / 平尾 / 垂尾）的参数化描述，以及按「展向区间 × 弦向区间」切出实体块的工具。
import { loft, airfoil, chordSamples, hinge, v3 } from './geom.js';

/**
 * def:
 *   xLE(u)    前缘的机体 X 坐标      chord(u)  弦长
 *   tc(u)     相对厚度              twist(u)  扭转角（弧度，前缘向上为正）
 *   place(u, x, t) → Vector3        把（展向坐标 u、机体 X、厚度方向偏移 t）放到机体系里
 *   camber    弯度（对称翼型填 0）  flip      放样是否翻转法线
 */
export class Surface {
  constructor(def) { Object.assign(this, { camber: 0.018, twist: () => 0, flip: false }, def); }

  // 表面点：f 为弦向百分比，upper 取上/下表面，off 为沿厚度方向的额外偏移（米），ts 为厚度缩放
  P(u, f, upper, off = 0, ts = 1) {
    const c = this.chord(u), [yu, yl] = airfoil(f, this.tc(u), this.camber);
    const mid = (yu + yl) / 2, half = (yu - yl) / 2 * ts;
    const dy = (upper ? mid + half : mid - half) * c + off;
    const dx = (f - 0.4) * c, tw = this.twist(u), cs = Math.cos(tw), sn = Math.sin(tw);
    return this.place(u, this.xLE(u) + 0.4 * c + dx * cs + dy * sn, dy * cs - dx * sn);
  }
  // 弦线上的点（厚度中线）
  mid(u, f, off = 0) { return this.P(u, f, true, 0, 0).add(this.place(u, 0, off).sub(this.place(u, 0, 0))); }

  ring(u, fa, fb, o = {}) {
    const nf = o.nf || 14, fs = chordSamples(fa, fb, nf), ts = o.thick ?? 1;
    const up = fs.map((f) => this.P(u, f, true, 0, ts));
    const lo = fs.slice().reverse().map((f) => this.P(u, f, false, 0, ts));
    const arc = (A, B, dirX, k) => {
      const out = [], m = A.clone().add(B).multiplyScalar(0.5), r = A.clone().sub(m), b = r.length() * k;
      for (let i = 1; i <= 4; i++) {
        const ph = (i / 5) * Math.PI;
        out.push(m.clone().addScaledVector(r, Math.cos(ph)).add(v3(dirX * b * Math.sin(ph), 0, 0)));
      }
      return out;
    };
    const ring = [...up];
    if (o.roundRear) ring.push(...arc(up[nf - 1], lo[0], 1, o.roundRear));
    ring.push(...lo);
    if (o.roundFront) ring.push(...arc(lo[nf - 1], up[0], -1, o.roundFront));
    return ring;
  }

  // 展向 [u0,u1] × 弦向 [fa,fb] 的封闭实体
  piece(u0, u1, fa, fb, o = {}) {
    const nu = o.nu || Math.max(2, Math.ceil(Math.abs(u1 - u0) / 1.1) + 1), rings = [];
    for (let i = 0; i < nu; i++) rings.push(this.ring(u0 + (u1 - u0) * (i / (nu - 1)), fa, fb, o));
    return loft(rings, { closed: true, flip: this.flip !== !!o.flipExtra, capStart: true, capEnd: true, crease: o.crease ?? 40 });
  }

  // 贴在上表面的薄板（扰流板）：外表面抬高 lift，厚度 th
  slab(u0, u1, fa, fb, lift = 0.012, th = 0.035) {
    const rings = [];
    for (const u of [u0, u1]) {
      const fs = chordSamples(fa, fb, 6);
      const top = fs.map((f) => this.P(u, f, true, lift));
      const bot = fs.slice().reverse().map((f) => this.P(u, f, true, lift - th));
      rings.push([...top, ...bot]);
    }
    return loft(rings, { closed: true, flip: this.flip, capStart: true, capEnd: true, crease: 30 });
  }
}

// 两侧通用的铰链：转轴统一指向 +Z 一侧，这样「正角度 = 后缘向上」对左右机翼都成立
export function hingeLR(obj, pIn, pOut, side) {
  return side > 0 ? hinge(obj, pIn, pOut) : hinge(obj, pOut, pIn);
}
