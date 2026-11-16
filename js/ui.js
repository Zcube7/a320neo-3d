// 界面：部件列表、说明面板、飞行阶段条、底部操纵台、标注引线、提示。只通过 app 提供的接口读写状态。
import { PARTS, PART, GROUPS } from './content.js';
import { PHASES, FLAP_LEVER, flapConfig, LIMITS } from './specs.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const pct = (v) => Math.round(v * 100);
const sgn = (v, pos, neg) => (Math.abs(v) < 0.5 ? '0°' : `${Math.abs(v).toFixed(0)}° ${v > 0 ? pos : neg}`);

export function initUI(app) {
  const S = app.state;
  const refreshers = [];          // 状态变化时调用
  const tickers = [];             // 每 0.1 s 刷新读数

  // ---------------- 部件列表 ----------------
  const partBtns = {};
  for (const g of GROUPS) {
    if (g !== '总览') $('parts').append(el('h4', '', g));
    for (const p of PARTS.filter((x) => x.group === g)) {
      const b = el('button', '', p.id === 'overview' ? '总览' : p.name);
      b.onclick = () => { app.select(p.id, { user: true }); closeSheets(); };
      partBtns[p.id] = b; $('parts').append(b);
    }
  }

  // ---------------- 飞行阶段 ----------------
  const phaseBtns = {};
  for (const ph of PHASES) {
    const b = el('button', '', ph.name); b.title = ph.note;
    b.onclick = () => app.setPhase(ph.id);
    phaseBtns[ph.id] = b; $('phases').append(b);
  }

  // ---------------- 说明面板 ----------------
  const EXTRA = {
    ths: () => {
      const r = el('div', 'row', '<label>安定面配平</label><input type="range" min="-4" max="13.5" step="0.5"><output></output>');
      const inp = r.querySelector('input'), out = r.querySelector('output');
      inp.value = S.ths; inp.oninput = () => app.set('ths', +inp.value);
      refreshers.push(() => { out.textContent = S.ths >= 0 ? `抬头 ${S.ths.toFixed(1)}°` : `低头 ${(-S.ths).toFixed(1)}°`; });
      return r;
    },
    tiller: () => {
      const r = el('div', 'row', '<label>转弯手轮</label><input type="range" min="-75" max="75" step="1"><output></output>');
      const inp = r.querySelector('input'), out = r.querySelector('output');
      inp.value = S.tiller * 75; inp.oninput = () => app.set('tiller', +inp.value / 75);
      refreshers.push(() => { const a = S.tiller * 75; out.textContent = sgn(a, '右', '左'); });
      return r;
    },
    rat: () => toggleBtn('放出 RAT', () => S.rat, () => app.set('rat', !S.rat), '收回 RAT'),
    cut: () => toggleBtn('剖视 1 号发动机', () => S.cut, () => app.set('cut', !S.cut)),
    flow: () => toggleBtn('气流粒子', () => S.flow, () => app.set('flow', !S.flow)),
    lights: () => {
      const f = document.createDocumentFragment();
      for (const [k, n] of [['nav', '航行灯'], ['beacon', '防撞信标'], ['strobe', '频闪灯'], ['landing', '着陆 / 滑行灯']]) f.append(toggleBtn(n, () => S.lights[k], () => app.setLight(k, !S.lights[k])));
      return f;
    },
  };
  function toggleBtn(text, get, onClick, textOn) {
    const b = el('button', 'tg', text); b.onclick = onClick;
    refreshers.push(() => { const on = get(); b.classList.toggle('on', on); if (textOn) b.textContent = on ? textOn : text; });
    return b;
  }
  let shown = null, baseRefreshers = 0;
  function renderInfo(p) {
    refreshers.length = baseRefreshers;
    const body = $('infoBody');
    body.innerHTML = `<div class="grp">${p.group}</div><h2>${p.name}</h2><div class="en">${p.en}</div><div class="tag">${p.tagline}</div>
      <h3>${p.id === 'overview' ? '关于本演示' : '工作原理'}</h3><ol>${p.how.map((t) => `<li>${t}</li>`).join('')}</ol>
      <h3>关键数据</h3><table>${p.facts.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>
      ${p.tryIt ? `<div class="try"><b>动手试试</b>${p.tryIt}</div>` : ''}`;
    if (p.extra) { const box = el('div', 'extra'); for (const k of p.extra) box.append(EXTRA[k]()); body.append(box); }
    body.scrollTop = 0;
    // 标注
    $('callouts').innerHTML = ''; $('leaders').innerHTML = '';
    coEls = (p.callouts || []).map((c) => {
      const d = el('div', 'co', c.text); $('callouts').append(d);
      const ln = document.createElementNS('http://www.w3.org/2000/svg', 'line'), dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('r', 3.2); $('leaders').append(ln, dot);
      return { d, ln, dot, c, w: 0, h: 0 };
    });
    shown = p.id;
  }
  let coEls = [];

  // ---------------- 操纵台 ----------------
  const con = $('console'), groups = {};
  const cg = (key, title) => { const g = el('div', 'cg'); g.dataset.k = key; g.append(el('h5', '', title)); con.append(g); groups[key] = g; return g; };
  const val = (g) => { const v = el('div', 'val'); g.append(v); return v; };

  { // 侧杆
    const g = cg('stick', '侧杆'), pad = el('div', 'pad', '<i></i>'), knob = pad.firstChild, v = val(g);
    g.insertBefore(pad, v);
    let down = false;
    const setFrom = (e) => {
      const r = pad.getBoundingClientRect(), x = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1)), y = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
      app.set('roll', x); app.set('pitch', y);             // 向下拖 = 拉杆（抬头）
    };
    pad.onpointerdown = (e) => { down = true; pad.setPointerCapture(e.pointerId); setFrom(e); };
    pad.onpointermove = (e) => { if (down) setFrom(e); };
    pad.onpointerup = pad.onpointercancel = () => { down = false; app.set('roll', 0); app.set('pitch', 0); };
    tickers.push(() => {
      knob.style.transform = `translate(${S.roll * 26}px, ${S.pitch * 26}px)`;
      v.innerHTML = Math.abs(S.roll) + Math.abs(S.pitch) < 0.02 ? '松杆回中' : `${S.roll > 0.02 ? '右' : S.roll < -0.02 ? '左' : ''}${Math.abs(S.roll) > 0.02 ? pct(Math.abs(S.roll)) + '%' : ''} ${S.pitch > 0.02 ? '拉' : S.pitch < -0.02 ? '推' : ''}${Math.abs(S.pitch) > 0.02 ? pct(Math.abs(S.pitch)) + '%' : ''}`;
    });
  }
  { // 方向舵
    const g = cg('rudder', '方向舵脚蹬'), inp = el('input'), v = val(g);
    Object.assign(inp, { type: 'range', min: -100, max: 100, step: 1, value: 0 }); g.insertBefore(inp, v);
    inp.oninput = () => app.set('rudder', +inp.value / 100);
    const back = () => { inp.value = 0; app.set('rudder', 0); };
    inp.onchange = back; inp.onpointerup = back;
    tickers.push(() => { if (document.activeElement !== inp && Math.abs(S.rudder * 100 - inp.value) > 1) inp.value = S.rudder * 100; v.textContent = `舵面 ${sgn(app.cur.rud, '右', '左')}`; });
  }
  { // 发动机
    const g = cg('throttle', '发动机'), row = el('div', 'rowc'), run = el('button', 'tg', '起动'), rev = el('button', 'tg warn', '反推'), inp = el('input'), v = val(g);
    Object.assign(inp, { type: 'range', min: 0, max: 100, step: 1, value: 0, title: '油门' });
    row.append(run, rev); g.insertBefore(row, v); g.insertBefore(inp, v);
    run.onclick = () => app.set('engines', !S.engines); rev.onclick = () => app.set('reverse', !S.reverse);
    inp.oninput = () => app.set('throttle', +inp.value / 100);
    refreshers.push(() => { run.classList.toggle('on', S.engines); run.textContent = S.engines ? '运转中' : '起动'; rev.classList.toggle('on', S.reverse); inp.value = S.throttle * 100; });
    tickers.push(() => { v.innerHTML = `油门 ${pct(S.throttle)}% · N1 <em>${app.cur.n1.toFixed(0)}%</em>`; });
  }
  { // 襟翼
    const g = cg('flap', '襟翼手柄'), row = el('div', 'detents'), v = val(g), btns = [];
    FLAP_LEVER.forEach((n, i) => { const b = el('button', n === 'FULL' ? 'wide' : '', n); b.onclick = () => app.set('flap', i); row.append(b); btns.push(b); });
    g.insertBefore(row, v);
    refreshers.push(() => btns.forEach((b, i) => b.classList.toggle('on', i === S.flap)));
    tickers.push(() => { const c = flapConfig(S.flap, S.airborne); v.innerHTML = `构型 <em>${c.name}</em> · 缝翼 ${app.cur.slat.toFixed(0)}° · 襟翼 ${app.cur.flap.toFixed(0)}°`; });
  }
  { // 减速板
    const g = cg('speedbrake', '减速板'), inp = el('input'), gs = el('button', 'tg warn', '地面扰流板'), v = val(g);
    Object.assign(inp, { type: 'range', min: 0, max: 100, step: 1, value: 0 });
    g.insertBefore(inp, v); g.insertBefore(gs, v);
    inp.oninput = () => app.set('speedbrake', +inp.value / 100); gs.onclick = () => app.set('groundSpoilers', !S.groundSpoilers);
    refreshers.push(() => { inp.value = S.speedbrake * 100; gs.classList.toggle('on', S.groundSpoilers); });
    tickers.push(() => { v.textContent = `3 号板 ${Math.max(app.cur.spL[2], app.cur.spR[2]).toFixed(0)}°（上限 ${LIMITS.groundSpoiler}°）`; });
  }
  { // 起落架 + 地面 / 空中
    const g = cg('gear', '起落架'), b = el('button', 'tg', '收起'), v = val(g);
    g.insertBefore(b, v); b.onclick = () => app.set('gearUp', !S.gearUp);
    const seg = el('div', 'seg'), bg = el('button', '', '地面'), ba = el('button', '', '空中');
    seg.append(bg, ba); g.insertBefore(seg, v); g.dataset.k2 = 'airborne';
    bg.onclick = () => app.set('airborne', false); ba.onclick = () => app.set('airborne', true);
    refreshers.push(() => { b.classList.toggle('on', S.gearUp); b.textContent = S.gearUp ? '放下' : '收起'; bg.classList.toggle('on', !S.airborne); ba.classList.toggle('on', S.airborne); });
    tickers.push(() => { const q = app.cur.gear; v.textContent = q < 0.01 ? '已放下锁定' : q > 0.99 ? '已收上锁定' : `收放中 ${pct(q)}%`; });
  }
  baseRefreshers = refreshers.length;

  // ---------------- 顶栏按钮、翻页、移动端 ----------------
  $('btnXray').onclick = () => app.set('xray', !S.xray);
  $('btnLabels').onclick = () => app.set('labels', !S.labels);
  $('btnTour').onclick = () => app.set('tour', !S.tour);
  $('btnHome').onclick = () => app.select('overview', { user: true });
  const step = (d) => { const i = PARTS.findIndex((p) => p.id === S.part); app.select(PARTS[(i + d + PARTS.length) % PARTS.length].id, { user: true }); };
  $('btnPrev').onclick = () => step(-1); $('btnNext').onclick = () => step(1);
  const sheets = { mList: 'sList', mInfo: 'sInfo', mCtl: 'sCtl' };
  const closeSheets = () => document.body.classList.remove('sList', 'sCtl');
  for (const id in sheets) $(id).onclick = () => { const c = sheets[id], on = document.body.classList.contains(c); document.body.classList.remove('sList', 'sInfo', 'sCtl'); if (!on) document.body.classList.add(c); };
  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'x') app.set('xray', !S.xray); else if (k === 'l') app.set('labels', !S.labels); else if (k === 't') app.set('tour', !S.tour);
    else if (k === 'h') app.select('overview', { user: true }); else if (k === 'arrowright') step(1); else if (k === 'arrowleft') step(-1);
    else if (k === 'g') app.set('gearUp', !S.gearUp); else if (k === 'f') app.set('flap', (S.flap + (e.shiftKey ? 4 : 1)) % 5);
    else if (k === 'u') document.body.classList.toggle('clean'); else return;
    e.preventDefault();
  });

  // ---------------- 对外接口 ----------------
  let toastT = 0, lastTick = 0;
  const ui = {
    refresh() {
      if (shown !== S.part) renderInfo(PART[S.part]);
      for (const id in partBtns) partBtns[id].classList.toggle('on', id === S.part);
      for (const id in phaseBtns) phaseBtns[id].classList.toggle('on', id === S.phase);
      const ph = PHASES.find((x) => x.id === S.phase);
      $('phaseNote').textContent = ph && S.phaseNote ? `${ph.name}：${ph.note}` : '';
      $('btnXray').classList.toggle('on', S.xray); $('btnLabels').classList.toggle('on', S.labels);
      $('btnTour').classList.toggle('on', !!S.tour); $('btnTour').textContent = S.tour ? '停止导览' : '导览';
      $('pageNo').textContent = `${PARTS.findIndex((p) => p.id === S.part) + 1} / ${PARTS.length}`;
      const hot = PART[S.part].controls || [];
      for (const k in groups) groups[k].classList.toggle('hot', hot.includes(k) || (k === 'throttle' && hot.includes('reverse')) || (k === 'speedbrake' && hot.includes('groundSpoilers')) || (k === 'gear' && hot.includes('airborne')));
      for (const f of refreshers) f();
    },
    // 每帧调用：pts[i] = { x, y, ok }（屏幕像素），与当前部件的 callouts 一一对应
    tick(now, pts) {
      if (now - lastTick > 90) { lastTick = now; for (const f of tickers) f(); }
      const show = S.labels, W = innerWidth, H = innerHeight, wide = W > 900 && !document.body.classList.contains('clean'), k = W < 900 ? 0.55 : 1;
      // 标签不许钻到两侧面板和操纵台下面
      const x0 = wide ? (W > 1180 ? 222 : 194) : 6, x1 = wide ? W - (W > 1180 ? 374 : 334) : W - 6, y0 = wide ? 104 : 60, y1 = wide ? H - 162 : H - 70;
      coEls.forEach((o, i) => {
        const p = pts[i], vis = show && p && p.ok;
        o.d.style.display = vis ? '' : 'none'; o.ln.style.display = o.dot.style.display = vis ? '' : 'none';
        if (!vis) return;
        if (!o.w) { o.w = o.d.offsetWidth; o.h = o.d.offsetHeight; }
        const off = o.c.o || [50, -50];
        const lx = Math.max(x0 + o.w / 2, Math.min(x1 - o.w / 2, p.x + off[0] * k)), ly = Math.max(y0, Math.min(y1, p.y + off[1] * k));
        o.d.style.transform = `translate(${Math.round(lx - o.w / 2)}px, ${Math.round(ly - o.h / 2)}px)`;
        o.ln.setAttribute('x1', p.x); o.ln.setAttribute('y1', p.y); o.ln.setAttribute('x2', lx); o.ln.setAttribute('y2', ly);
        o.dot.setAttribute('cx', p.x); o.dot.setAttribute('cy', p.y);
      });
    },
    tip(text, x, y) { const t = $('tip'); if (!text) { t.style.opacity = 0; return; } t.textContent = text; t.style.left = x + 14 + 'px'; t.style.top = y + 16 + 'px'; t.style.opacity = 1; },
    toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 3600); },
    ready() { $('loading').classList.add('hide'); setTimeout(() => $('loading').remove(), 700); },
  };
  return ui;
}
