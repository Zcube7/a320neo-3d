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
      b.onclick = () => { app.select(p.id, { user: true }); if (cl.contains('sList')) sheet(infoWasOpen ? 'sInfo' : 'sList', infoWasOpen); };
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
    pad.onpointerdown = (e) => { down = true; try { pad.setPointerCapture(e.pointerId); } catch { /* 合成事件没有活动指针 */ } setFrom(e); e.preventDefault(); };
    pad.onpointermove = (e) => { if (down) setFrom(e); };
    pad.onpointerup = pad.onpointercancel = () => { down = false; app.set('roll', 0); app.set('pitch', 0); };
    tickers.push(() => {
      const R = (pad.clientWidth || 74) / 2 - 11;          // 手机上摇杆底座大一圈，行程跟着变
      knob.style.transform = `translate(${S.roll * R}px, ${S.pitch * R}px)`;
      v.innerHTML = Math.abs(S.roll) + Math.abs(S.pitch) < 0.02 ? '松杆回中' : `${S.roll > 0.02 ? '右' : S.roll < -0.02 ? '左' : ''}${Math.abs(S.roll) > 0.02 ? pct(Math.abs(S.roll)) + '%' : ''} ${S.pitch > 0.02 ? '拉' : S.pitch < -0.02 ? '推' : ''}${Math.abs(S.pitch) > 0.02 ? pct(Math.abs(S.pitch)) + '%' : ''}`;
    });
  }
  { // 方向舵
    const g = cg('rudder', '方向舵脚蹬'), inp = el('input'), v = val(g);
    Object.assign(inp, { type: 'range', min: -100, max: 100, step: 1, value: 0 }); g.insertBefore(inp, v);
    inp.oninput = () => app.set('rudder', +inp.value / 100);
    const back = () => { inp.value = 0; app.set('rudder', 0); };
    inp.onchange = back; inp.onpointerup = back; inp.onpointercancel = back; inp.ontouchend = back;
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
    const g = cg('speedbrake', '减速板'), inp = el('input'), gs = el('button', 'tg warn', '地面扰流板'), pair = el('div', 'pair'), v = val(g);
    Object.assign(inp, { type: 'range', min: 0, max: 100, step: 1, value: 0 });
    pair.append(inp, gs); g.insertBefore(pair, v);
    inp.oninput = () => app.set('speedbrake', +inp.value / 100); gs.onclick = () => app.set('groundSpoilers', !S.groundSpoilers);
    refreshers.push(() => { inp.value = S.speedbrake * 100; gs.classList.toggle('on', S.groundSpoilers); });
    tickers.push(() => { v.textContent = `3 号板 ${Math.max(app.cur.spL[2], app.cur.spR[2]).toFixed(0)}°（上限 ${LIMITS.groundSpoiler}°）`; });
  }
  { // 起落架 + 地面 / 空中
    const g = cg('gear', '起落架'), b = el('button', 'tg', '收起'), pair = el('div', 'pair'), v = val(g);
    b.onclick = () => app.set('gearUp', !S.gearUp);
    const seg = el('div', 'seg'), bg = el('button', '', '地面'), ba = el('button', '', '空中');
    seg.append(bg, ba); pair.append(b, seg); g.insertBefore(pair, v); g.dataset.k2 = 'airborne';
    bg.onclick = () => app.set('airborne', false); ba.onclick = () => app.set('airborne', true);
    refreshers.push(() => { b.classList.toggle('on', S.gearUp); b.textContent = S.gearUp ? '放下' : '收起'; bg.classList.toggle('on', !S.airborne); ba.classList.toggle('on', S.airborne); });
    tickers.push(() => { const q = app.cur.gear; v.textContent = q < 0.01 ? '已放下锁定' : q > 0.99 ? '已收上锁定' : `收放中 ${pct(q)}%`; });
  }
  baseRefreshers = refreshers.length;

  // ---------------- 顶栏按钮、翻页、移动端 ----------------
  $('btnXray').onclick = () => app.set('xray', !S.xray);
  $('btnLabels').onclick = () => app.set('labels', !S.labels);
  const compact = () => app.view.mode === 'port' || app.view.mode === 'land';
  $('btnTour').onclick = () => { const on = !S.tour; app.set('tour', on); if (on && compact()) sheet('sInfo', true); };   // 手机上导览时顺手把说明展开
  $('btnHome').onclick = () => app.select('overview', { user: true });
  const step = (d) => { const i = PARTS.findIndex((p) => p.id === S.part); app.select(PARTS[(i + d + PARTS.length) % PARTS.length].id, { user: true }); };
  $('btnPrev').onclick = $('pkPrev').onclick = () => step(-1); $('btnNext').onclick = $('pkNext').onclick = () => step(1);

  // 手机版的三个弹层互斥：部件 / 说明 / 操纵台。开关之后让相机按新的空白区域重新取景。
  const cl = document.body.classList, SHEETS = ['sList', 'sInfo', 'sCtl'];
  let infoWasOpen = false;
  function sheet(name, on) {
    const was = cl.contains(name);
    if (on == null) on = !was;
    if (name === 'sList' && on) infoWasOpen = cl.contains('sInfo');      // 选完部件后回到原来的状态
    cl.remove(...SHEETS); if (on) cl.add(name);
    app.relayout();
    if (on && name === 'sList') { const b = partBtns[S.part], c = $('parts'); c.scrollTop = b.offsetTop - c.offsetTop - (c.clientHeight - b.offsetHeight) / 2; }
    if (on && name === 'sInfo') $('infoBody').scrollTop = 0;
    if (on && name === 'sCtl') revealHot();
  }
  // 操纵台是横向长条的版式下（屏幕很矮时），把和当前部件有关的那组控件滑到看得见的地方
  function revealHot() {
    const g = con.querySelector('.cg.hot');
    if (g && con.scrollWidth > con.clientWidth + 2) con.scrollLeft = g.offsetLeft - 10;
  }
  $('mList').onclick = () => sheet('sList'); $('mInfo').onclick = $('pkT').onclick = () => sheet('sInfo'); $('mCtl').onclick = () => sheet('sCtl');
  $('view').addEventListener('pointerdown', () => { if (cl.contains('sList')) sheet(infoWasOpen ? 'sInfo' : 'sList', infoWasOpen); });   // 点一下画面就收起部件列表
  document.addEventListener('gesturestart', (e) => e.preventDefault());   // iOS：不让双指把整个页面放大
  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'x') app.set('xray', !S.xray); else if (k === 'l') app.set('labels', !S.labels); else if (k === 't') app.set('tour', !S.tour);
    else if (k === 'h') app.select('overview', { user: true }); else if (k === 'arrowright') step(1); else if (k === 'arrowleft') step(-1);
    else if (k === 'g') app.set('gearUp', !S.gearUp); else if (k === 'f') app.set('flap', (S.flap + (e.shiftKey ? 4 : 1)) % 5);
    else if (k === 'u') { cl.toggle('clean'); app.relayout(true); } else return;
    e.preventDefault();
  });

  // ---------------- 对外接口 ----------------
  let toastT = 0, noteT = 0, lastTick = 0, lastPhase = null;
  const plain = (s) => s.replace(/<[^>]+>/g, '');
  const ui = {
    refresh() {
      const p = PART[S.part], no = `${PARTS.indexOf(p) + 1} / ${PARTS.length}`, newPart = shown !== S.part;
      if (newPart) {
        renderInfo(p);
        const [b, s1, s2] = $('pkT').children;
        b.textContent = p.id === 'overview' ? '总览' : p.name; s1.textContent = `${no} · ${plain(p.tagline)}`; s2.textContent = `${no} · ${p.group} · ${p.en}`;
      }
      for (const id in partBtns) partBtns[id].classList.toggle('on', id === S.part);
      for (const id in phaseBtns) phaseBtns[id].classList.toggle('on', id === S.phase);
      if (lastPhase !== S.phase) {            // 窄屏上阶段条可能要横向滚：把当前阶段滚到中间
        lastPhase = S.phase;
        const c = $('phases'), b = phaseBtns[S.phase];
        if (b && c.scrollWidth > c.clientWidth + 2) c.scrollLeft = b.offsetLeft - c.offsetLeft - (c.clientWidth - b.offsetWidth) / 2;
      }
      const ph = PHASES.find((x) => x.id === S.phase), note = ph && S.phaseNote ? `${ph.name}：${ph.note}` : '';
      if ($('phaseNote').textContent !== note) {
        $('phaseNote').textContent = note; clearTimeout(noteT);
        if (note && compact()) noteT = setTimeout(() => { S.phaseNote = false; ui.refresh(); }, 7000);   // 手机上画面小，说明停 7 秒就让开
      }
      $('btnXray').classList.toggle('on', S.xray); $('btnLabels').classList.toggle('on', S.labels);
      $('btnTour').classList.toggle('on', !!S.tour); $('btnTour').textContent = S.tour ? '停止导览' : '导览';
      $('pageNo').textContent = no;
      const hot = PART[S.part].controls || [];
      for (const k in groups) groups[k].classList.toggle('hot', hot.includes(k) || (k === 'throttle' && hot.includes('reverse')) || (k === 'speedbrake' && hot.includes('groundSpoilers')) || (k === 'gear' && hot.includes('airborne')));
      for (const f of refreshers) f();
      if (newPart && cl.contains('sCtl')) revealHot();
    },
    // 每帧调用：pts[i] = { x, y, ok }（屏幕像素），与当前部件的 callouts 一一对应
    tick(now, pts) {
      if (now - lastTick > 90) { lastTick = now; for (const f of tickers) f(); }
      // 标签不许钻到面板下面：只在空白区域里摆。竖屏横向窄、纵向宽裕，所以偏移量横向收紧、纵向基本保留。
      const show = S.labels, f = app.view.free, m = app.view.mode;
      const kx = m === 'port' ? 0.5 : m === 'land' ? 0.8 : 1, ky = m === 'port' ? 0.9 : m === 'land' ? 0.6 : 1;
      const cx = (o, x) => Math.max(f.x0 + o.w / 2, Math.min(f.x1 - o.w / 2, x)), cy = (o, y) => Math.max(f.y0 + o.h / 2, Math.min(f.y1 - o.h / 2, y));
      const live = [];
      coEls.forEach((o, i) => {
        const p = pts[i], vis = show && p && p.ok;
        o.d.style.display = vis ? '' : 'none'; o.ln.style.display = o.dot.style.display = vis ? '' : 'none';
        if (!vis) return;
        if (!o.w) { o.w = o.d.offsetWidth; o.h = o.d.offsetHeight; }
        const off = o.c.o || [50, -50];
        o.p = p; o.x = cx(o, p.x + off[0] * kx); o.y = cy(o, p.y + off[1] * ky);
        live.push(o);
      });
      // 互相压住的标签先上下推开（屏幕窄的时候很常见）；空白区域太矮、上下推不开时，后几轮改成左右让
      for (let pass = 0, moved = live.length > 1; pass < 9 && moved; pass++) {
        moved = false;
        for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
          const a = live[i], b = live[j], ox = (a.w + b.w) / 2 + 6 - Math.abs(a.x - b.x), oy = (a.h + b.h) / 2 + 4 - Math.abs(a.y - b.y);
          if (ox <= 0 || oy <= 0) continue;
          moved = true;
          if (pass < 6) { const s = a.y < b.y || (a.y === b.y && a.p.y <= b.p.y) ? -1 : 1; a.y = cy(a, a.y + s * oy / 2); b.y = cy(b, b.y - s * oy / 2); }
          else { const s = a.x < b.x || (a.x === b.x && a.p.x <= b.p.x) ? -1 : 1; a.x = cx(a, a.x + s * ox / 2); b.x = cx(b, b.x - s * ox / 2); }
        }
      }
      for (const o of live) {
        o.d.style.transform = `translate(${Math.round(o.x - o.w / 2)}px, ${Math.round(o.y - o.h / 2)}px)`;
        o.ln.setAttribute('x1', o.p.x); o.ln.setAttribute('y1', o.p.y); o.ln.setAttribute('x2', o.x); o.ln.setAttribute('y2', o.y);
        o.dot.setAttribute('cx', o.p.x); o.dot.setAttribute('cy', o.p.y);
      }
    },
    relaid() { for (const o of coEls) o.w = 0; },         // 版式变了，标签字号可能跟着变：下一帧重新量尺寸
    tip(text, x, y) { const t = $('tip'); if (!text) { t.style.opacity = 0; return; } t.textContent = text; t.style.left = x + 14 + 'px'; t.style.top = y + 16 + 'px'; t.style.opacity = 1; },
    toast(msg) {
      const t = $('toast'), n = $('phaseNote');
      t.style.top = compact() && n.textContent ? `${Math.round(n.getBoundingClientRect().bottom + 6)}px` : '';   // 手机上提示在顶部：阶段说明还挂着就排到它下面
      t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 3600);
    },
    ready() { $('loading').classList.add('hide'); setTimeout(() => $('loading').remove(), 700); },
  };
  return ui;
}
