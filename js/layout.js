// 版式判定与"空白区域"计算。三种版式和 css/style.css 里的媒体查询一一对应：
//   wide  桌面三栏：左列表、右说明、底部操纵台
//   port  紧凑竖屏（手机竖着拿、窄窗口）：底部标签栏 + 弹层
//   land  紧凑横屏（手机横过来，高度很矮）：侧边抽屉 + 底部一行
//   clean 隐藏全部界面（截图用）
const mqCompact = matchMedia('(max-width: 900px), (max-height: 520px)');
const mqLand = matchMedia('(max-height: 520px) and (orientation: landscape)');

export const layoutMode = () => (document.body.classList.contains('clean') ? 'clean' : !mqCompact.matches ? 'wide' : mqLand.matches ? 'land' : 'port');

// 手机 / 平板：贴图用低一档的分辨率，省显存
export const lowPower = () => mqCompact.matches || matchMedia('(pointer: coarse)').matches;

const box = (id) => { const e = document.getElementById(id); return e && e.getClientRects().length ? e.getBoundingClientRect() : null; };

// 画面里没被面板挡住的矩形（像素）。相机取景和标注摆放都以它为准。
export function freeRect(mode) {
  const W = innerWidth, H = innerHeight;
  if (mode === 'clean') return { x0: 6, y0: 6, x1: W - 6, y1: H - 6 };
  if (mode === 'wide') { const big = W > 1180; return { x0: big ? 222 : 194, y0: 104, x1: W - (big ? 374 : 334), y1: H - 162 }; }
  const top = box('top'), bar = box('mbar'), info = box('info'), con = box('console');
  const r = { x0: 6, y0: (top ? top.bottom : 0) + 6, x1: W - 6, y1: (bar ? bar.top : H) - 6 };
  if (con) r.y1 = Math.min(r.y1, con.top - 6);
  if (info) { if (mode === 'port') r.y1 = Math.min(r.y1, info.top - 6); else if (document.body.classList.contains('sInfo')) r.x1 = info.left - 6; }
  if (r.x1 - r.x0 < 80) r.x1 = r.x0 + 80;
  if (r.y1 - r.y0 < 60) r.y1 = r.y0 + 60;
  return r;
}
