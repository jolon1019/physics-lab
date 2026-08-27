// =============================================================
// 滑轮组物理沙盒 - 最小可运行 Demo 框架 (Vanilla JS + Canvas)
// 真实物理: PBD/Verlet 绳索长度约束 + 动滑轮刚体受重力/绳拉力
// 几何: 每个滑轮按 route 顺序，由两点求外公切线 + 外圆弧绕行
// =============================================================
'use strict';

// ---------- 向量小工具 ----------
const V = {
  sub: (a, b) => ({ x: a.x - b.x, y: a.y - b.y }),
  len: (a) => Math.hypot(a.x, a.y),
};

// ---------- 全局状态 ----------
const state = {
  anchor: { x: 250, y: 40, locked: false },
  freeEnd: { x: 640, y: 300 },       // 手拉绳端（受力输入点）
  pulleys: [
    { id: 'P1', type: 'fixed',   x: 430, y: 90,  r: 24, wrap: 'cw',   vy: 0, oy: 0 },
    { id: 'P2', type: 'movable', x: 360, y: 250, r: 24, wrap: 'ccw',  vy: 0, oy: 250 },
    { id: 'P3', type: 'fixed',   x: 620, y: 90,  r: 24, wrap: 'cw',   vy: 0, oy: 0 },
  ],
  route: ['P1', 'P2', 'P3'],        // 绳索穿过滑轮的先后顺序
  ropeLength: 0,                     // 绳总长（不可伸长）
  warning: '',
};

const GROUND_Y = 520;
const TOP_Y = 30;
const LOAD_MASS = 2.0;     // 动滑轮挂载重物质量(等效 N)
const PULLEY_SELF = 0.4;  // 单个动滑轮自重 N
const FRICTION = 0.08;    // 摩擦系数（演示用）

// 取滑轮对象
function byId(id) { return state.pulleys.find(p => p.id === id); }

// ---------- 几何: 外切线切点 ----------
// 从外部点 P 向圆(C,r)作切线，sign=+1/-1 选两条切线之一
function tangentFrom(P, C, r, sign) {
  const dx = P.x - C.x, dy = P.y - C.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= r + 0.5) return null;           // 点在圆内/上 -> 无解
  const a = Math.atan2(dy, dx);
  const phi = Math.acos(r / dist);
  const ang = a + sign * phi;
  return { x: C.x + r * Math.cos(ang), y: C.y + r * Math.sin(ang), ang };
}

// 计算滑轮绕绳段: prev ->(切线)-> 入切点T1 ->(外圆弧)-> 出切点T2 -> next
// wrap: 'cw' (屏幕坐标 y 向下, +角度方向) / 'ccw'
function computeWrap(prev, C, r, next, wrap) {
  const sign = wrap === 'cw' ? 1 : -1;
  const t1 = tangentFrom(prev, C, r, sign);
  const t2 = tangentFrom(next, C, r, sign);
  if (!t1 || !t2) return null;                // 非法配置 -> 容错
  // 选择“远离弦中点”的那段弧，使绳贴着滑轮外缘而不穿入圆盘
  const a1 = t1.ang, a2 = t2.ang;
  let d = a2 - a1; while (d < 0) d += 2 * Math.PI; while (d >= 2 * Math.PI) d -= 2 * Math.PI;
  const mid = Math.atan2(((prev.y + next.y) / 2) - C.y, ((prev.x + next.x) / 2) - C.x);
  let m = mid - a1; while (m < 0) m += 2 * Math.PI; while (m >= 2 * Math.PI) m -= 2 * Math.PI;
  let start, sweep;
  if (m <= d) { start = a1 + d; sweep = 2 * Math.PI - d; } // 取补集(外侧弧)
  else { start = a1; sweep = d; }
  const arc = [];
  const steps = Math.max(2, Math.round(sweep / (Math.PI / 10)));
  for (let i = 0; i <= steps; i++) {
    const ang = start + sweep * (i / steps);
    arc.push({ x: C.x + r * Math.cos(ang), y: C.y + r * Math.sin(ang) });
  }
  return { T1: { x: C.x + r * Math.cos(a1), y: C.y + r * Math.sin(a1) }, T2: { x: C.x + r * Math.cos(a2), y: C.y + r * Math.sin(a2) }, arc };
}

// ---------- 重建绳索路径(几何, 给定当前滑轮位置) ----------
function rebuildRopePath() {
  const pts = [];
  let prev = { x: state.anchor.x, y: state.anchor.y };
  pts.push({ ...prev });
  state.warning = '';
  for (let i = 0; i < state.route.length; i++) {
    const p = byId(state.route[i]);
    if (!p) continue;
    const C = { x: p.x, y: p.y, r: p.r };
    const nextP = (i + 1 < state.route.length) ? byId(state.route[i + 1]) : null;
    const next = nextP ? { x: nextP.x, y: nextP.y } : { x: state.freeEnd.x, y: state.freeEnd.y };
    const w = computeWrap(prev, C, C.r, next, p.wrap);
    if (!w) {
      state.warning = `滑轮 ${p.id} 切点无解（绳端进入圆内），已用直线容错`;
      pts.push({ x: next.x, y: next.y });   // 退化为直线，避免崩溃
      prev = next; continue;
    }
    pts.push(w.T1);
    for (const a of w.arc) pts.push(a);
    prev = w.T2;
  }
  pts.push({ x: state.freeEnd.x, y: state.freeEnd.y });
  return pts;
}

function pathLengthOf(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return L;
}

// ---------- 物理: 动滑轮刚体 + 绳长约束(PBD) ----------
function physicsStep() {
  // 1) Verlet 积分动滑轮(受重力)
  for (const p of state.pulleys) {
    if (p.type !== 'movable') continue;
    const g = 0.35;                       // 重力加速度(像素/帧^2, 演示)
    const tmp = p.y;
    p.y += (p.y - p.oy) + g;              // Verlet: x' = 2x - x_old + a
    p.oy = tmp;
  }
  // 2) 距离约束: 绳总长必须 == ropeLength（投影法，Gauss-Seidel 迭代）
  const movables = state.pulleys.filter(p => p.type === 'movable');
  for (let iter = 0; iter < 12; iter++) {
    let maxErr = 0;
    for (const p of movables) {
      const L0 = pathLengthOf(rebuildRopePath());
      const err = L0 - state.ropeLength;
      maxErr = Math.max(maxErr, Math.abs(err));
      const saveY = p.y; p.y += 1;
      const L1 = pathLengthOf(rebuildRopePath()); p.y = saveY;
      const dL = L1 - L0;
      if (Math.abs(dL) < 1e-4) continue;
      p.y -= (err / dL) * 0.9;            // 牛顿步: 让长度回到 ropeLength
      p.y = Math.max(TOP_Y + 40, Math.min(GROUND_Y - 30, p.y));
    }
    if (maxErr < 0.4) break;
  }
  // 3) 同步 old 位置避免约束引入速度尖刺
  for (const p of movables) p.oy = p.y;
}

// ---------- 省力比 / 机械参数 ----------
function mechanics() {
  const M = state.pulleys.filter(p => p.type === 'movable').length;
  const n = M > 0 ? 2 * M : 1;                 // 简化: 标准绕法承担段数
  const gLoad = LOAD_MASS;
  const gSelf = M * PULLEY_SELF;
  const fIdeal = (gLoad + gSelf) / n;
  const fMeas = +(fIdeal * (1 + FRICTION * state.pulleys.length)).toFixed(2);
  return { M, n, gLoad, gSelf, fIdeal: +fIdeal.toFixed(2), fMeas };
}

// =============================================================
//  以下为渲染 + 交互(浏览器部分)
// =============================================================
const canvas = document.getElementById('cv');
const ctx = canvas.getContext('2d');
const W = 900, H = 560;
canvas.width = W * 2; canvas.height = H * 2; ctx.scale(2, 2);

let drag = null; // {kind:'anchor'|'free'|'pulley', obj, dx, dy}

function toCanvas(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) };
}

canvas.addEventListener('pointerdown', (e) => {
  const p = toCanvas(e);
  if (!state.anchor.locked && Math.hypot(p.x - state.anchor.x, p.y - state.anchor.y) < 18) {
    drag = { kind: 'anchor', obj: state.anchor, dx: p.x - state.anchor.x, dy: p.y - state.anchor.y };
  } else if (Math.hypot(p.x - state.freeEnd.x, p.y - state.freeEnd.y) < 22) {
    drag = { kind: 'free', obj: state.freeEnd, dx: p.x - state.freeEnd.x, dy: p.y - state.freeEnd.y };
  } else {
    for (const pl of state.pulleys) {
      if (Math.hypot(p.x - pl.x, p.y - pl.y) < pl.r + 4) {
        drag = { kind: 'pulley', obj: pl, dx: p.x - pl.x, dy: p.y - pl.y }; break;
      }
    }
  }
  if (drag) canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const p = toCanvas(e);
  drag.obj.x = p.x - drag.dx; drag.obj.y = p.y - drag.dy;
  if (drag.kind === 'anchor' && drag.obj.locked) return;
  drag.obj.y = Math.max(TOP_Y, Math.min(GROUND_Y, drag.obj.y));
  // 定滑轮水平可移、竖直锁定; 动滑轮自由
  if (drag.kind === 'pulley' && drag.obj.type === 'fixed') drag.obj.y = drag.obj.oy;
});
canvas.addEventListener('pointerup', () => { drag = null; });

// 初始化 ropeLength（以当前默认布局的绷紧长度为准）
state.ropeLength = pathLengthOf(rebuildRopePath());

function drawWheel(pl) {
  ctx.save(); ctx.translate(pl.x, pl.y);
  const g = ctx.createRadialGradient(-pl.r * 0.3, -pl.r * 0.3, 2, 0, 0, pl.r);
  g.addColorStop(0, '#eef3f8'); g.addColorStop(1, pl.type === 'movable' ? '#7fa6c9' : '#9aa6b8');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, pl.r, 0, 7); ctx.fill();
  ctx.strokeStyle = '#445'; ctx.lineWidth = 2; ctx.stroke();
  if (pl.type === 'movable') {
    ctx.fillStyle = '#2b6'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('动', 0, 3);
  } else {
    ctx.fillStyle = '#666'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('定', 0, 3);
  }
  ctx.restore();
}

function render() {
  const pts = rebuildRopePath();
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#0e1726'; ctx.fillRect(0, 0, W, H);
  // 横梁
  ctx.fillStyle = '#33415a'; ctx.fillRect(0, 24, W, 12);
  ctx.fillStyle = '#22303f'; ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
  // 绳
  ctx.strokeStyle = '#e8c98a'; ctx.lineWidth = 3; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
  // 锚点
  ctx.fillStyle = state.anchor.locked ? '#e05' : '#fa3';
  ctx.beginPath(); ctx.arc(state.anchor.x, state.anchor.y, 7, 0, 7); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = '11px sans-serif'; ctx.fillText('锚' + (state.anchor.locked ? '(锁)' : ''), state.anchor.x - 10, state.anchor.y - 12);
  // 滑轮
  for (const pl of state.pulleys) drawWheel(pl);
  // 自由端(手)
  ctx.fillStyle = '#39ff88'; ctx.fillRect(state.freeEnd.x - 14, state.freeEnd.y - 22, 28, 44);
  ctx.fillStyle = '#041'; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center';
  ctx.fillText(mechanics().fMeas + 'N', state.freeEnd.x, state.freeEnd.y + 4);
  // 提示
  if (state.warning) { ctx.fillStyle = '#f55'; ctx.font = '12px sans-serif'; ctx.textAlign = 'left'; ctx.fillText(state.warning, 20, H - 16); }
}

function loop() { physicsStep(); render(); requestAnimationFrame(loop); }
loop();

// ---------- 侧边面板(路由列表 / 控制) ----------
function renderPanel() {
  const list = document.getElementById('route');
  list.innerHTML = '';
  state.route.forEach((id, i) => {
    const pl = byId(id);
    const li = document.createElement('li');
    li.draggable = true; li.dataset.i = i;
    li.innerHTML = `<span>#${i + 1}</span>
      <b>${id}</b> <i>${pl.type === 'movable' ? '动' : '定'}</i>
      <button data-act="up" ${i === 0 ? 'disabled' : ''}>↑</button>
      <button data-act="down" ${i === state.route.length - 1 ? 'disabled' : ''}>↓</button>
      <button data-act="flip">绕向${pl.wrap === 'cw' ? '上' : '下'}</button>`;
    li.querySelector('[data-act="up"]').onclick = () => { if (i > 0) { [state.route[i - 1], state.route[i]] = [state.route[i], state.route[i - 1]]; syncLen(); renderPanel(); } };
    li.querySelector('[data-act="down"]').onclick = () => { if (i < state.route.length - 1) { [state.route[i + 1], state.route[i]] = [state.route[i], state.route[i + 1]]; syncLen(); renderPanel(); } };
    li.querySelector('[data-act="flip"]').onclick = () => { pl.wrap = pl.wrap === 'cw' ? 'ccw' : 'cw'; renderPanel(); };
    li.ondragstart = (e) => e.dataTransfer.setData('text', i);
    li.ondrop = (e) => {
      e.preventDefault();
      const from = +e.dataTransfer.getData('text'); const to = i;
      const r = state.route; const [x] = r.splice(from, 1); r.splice(to, 0, x);
      syncLen(); renderPanel();
    };
    list.appendChild(li);
  });
  const m = mechanics();
  document.getElementById('info').innerHTML =
    `动滑轮数 M=${m.M}　承担段数 n=${m.n}<br>理想 F=${m.fIdeal}N　实测 F=${m.fMeas}N<br>绳总长 L=${state.ropeLength.toFixed(0)}px (不可伸长)`;
}
// 配置改变(增删/移动滑轮/重排)后, 重新以当前绷紧长度为准
function syncLen() { state.ropeLength = pathLengthOf(rebuildRopePath()); }

document.getElementById('addFixed').onclick = () => {
  const id = 'P' + (state.pulleys.length + 1);
  state.pulleys.push({ id, type: 'fixed', x: 300 + Math.random() * 300, y: 90, r: 24, wrap: 'cw', vy: 0, oy: 0 });
  state.route.push(id); syncLen(); renderPanel();
};
document.getElementById('addMov').onclick = () => {
  const id = 'P' + (state.pulleys.length + 1);
  state.pulleys.push({ id, type: 'movable', x: 300 + Math.random() * 300, y: 250, r: 24, wrap: 'ccw', vy: 0, oy: 250 });
  state.route.push(id); syncLen(); renderPanel();
};
document.getElementById('lockAnchor').onclick = () => { state.anchor.locked = !state.anchor.locked; renderPanel(); };

renderPanel();
