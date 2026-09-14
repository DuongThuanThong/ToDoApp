'use strict';
/* Lõi renderer: helper DOM/ngày tháng, state, theme, toast, lưu & nhận dữ liệu, lọc/tìm. */
const API = typeof window !== 'undefined' ? window.api : null;
const T = API ? API.T : null;

/* ---------------- helpers ---------------- */
function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style') Object.assign(e.style, v);
    else if (k === 'dataset') Object.assign(e.dataset, v);
    else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true && k in e) e[k] = true;   // draggable/checked/disabled...: setAttribute('') là giá trị KHÔNG hợp lệ -> Chromium coi như auto (draggable=false)
    else if (v === true) e.setAttribute(k, '');
    else e.setAttribute(k, v);
  }
  for (const kid of kids.flat(9)) if (kid != null && kid !== false) e.append(kid.nodeType ? kid : document.createTextNode(kid));
  return e;
}
const $ = (s, r = document) => r.querySelector(s);
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 't' + Date.now() + Math.random().toString(36).slice(2));
const ymd = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const PRIO = ['Không', 'Thấp', 'Trung bình', 'Cao'];
const WEEK = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
/* Các "danh sách" hệ thống — MỘT nguồn duy nhất cho sidebar, tiêu đề topbar và bộ chọn ở mini
   (trước đây tên/mục nằm rải ở sidebar + topbar + mini -> sửa một chỗ là lệch chỗ khác) */
const VIEWS = [
  ['myday', '☀', 'Hôm nay của tôi'],
  ['today', '◉', 'Hôm nay'],
  ['upcoming', '▤', 'Sắp tới'],
  ['nodate', '▢', 'Chưa có hạn'],
  ['completed', '✓', 'Đã hoàn thành'],
  ['trash', '🗑', 'Đã xoá'],
];
const viewName = (v) => (VIEWS.find((x) => x[0] === v) || [])[2];
const ICON_SRC = '../icon.png';   // logo người dùng (CSP img-src có 'self' + file:)

/* khớp tổ hợp phím đã gán ('mod+w') với sự kiện bàn phím — hàm thuần, test được bằng node */
function keyMatch(ev, combo) {
  if (!combo) return false;
  const p = String(combo).toLowerCase().split('+');
  const key = p.pop();
  const want = { mod: p.includes('mod'), alt: p.includes('alt'), shift: p.includes('shift') };
  const got = { mod: !!(ev.ctrlKey || ev.metaKey), alt: !!ev.altKey, shift: !!ev.shiftKey };
  if (want.mod !== got.mod || want.alt !== got.alt || want.shift !== got.shift) return false;
  return String(ev.key || '').toLowerCase() === key;
}

const fmtDue = (iso) => {
  const d = new Date(iso), n = new Date();
  const diff = Math.round((startOfDay(d) - startOfDay(n)) / 864e5);
  const time = d.getHours() || d.getMinutes() ? d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '';
  const day = diff === 0 ? 'Hôm nay' : diff === 1 ? 'Mai' : diff === -1 ? 'Hôm qua' : diff < 0 ? `Trễ ${-diff}n` : `${d.getDate()}/${d.getMonth() + 1}`;
  return time ? `${day} ${time}` : day;
};
const toLocalInput = (iso) => { const d = new Date(iso), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);
/* chọn hạn nhanh: 1 bấm thay vì mò trong datetime-local */
const at = (now, days, h, m = 0) => { const d = addDays(startOfDay(now), days); d.setHours(h, m, 0, 0); return d.toISOString(); };
const weekendIso = (now = new Date()) => at(now, (6 - new Date(now).getDay() + 7) % 7 || 7, 9); // T7 này; đang là T7 -> T7 sau
const QUICK_DUE = [
  ['Hôm nay 18:00', (n) => at(n, 0, 18)], ['Tối nay 20:00', (n) => at(n, 0, 20)],
  ['Mai 09:00', (n) => at(n, 1, 9)], ['Cuối tuần 09:00', weekendIso], ['+7 ngày', (n) => at(n, 7, 9)],
];
const fmtStamp = (iso) => { const d = new Date(iso), p = (n) => String(n).padStart(2, '0'); const t = `${p(d.getHours())}:${p(d.getMinutes())}`; return ymd(d) === ymd(new Date()) ? t : `${p(d.getDate())}/${p(d.getMonth() + 1)} ${t}`; };
/* nhãn cho thư mục ngày trong log (đã hoàn thành / đã xoá): "Hôm qua · 11/9/2026" */
function dayLabel(key) {
  if (!key) return 'Không rõ ngày';
  const d = new Date(key);
  const diff = Math.round((startOfDay(d) - startOfDay(new Date())) / 864e5);
  const md = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
  const rel = diff === 0 ? 'Hôm nay' : diff === -1 ? 'Hôm qua' : diff === 1 ? 'Ngày mai' : null;
  const wd = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'][d.getDay()];
  return `${rel || wd} · ${md}`;
}

function hexToHsl(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
  if (!m) return null;
  const [r, g, b] = [1, 2, 3].map((i) => parseInt(m[i], 16) / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  const d = mx - mn;
  if (!d) return `0 0% ${(l * 100).toFixed(1)}%`;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const hue = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return `${(hue * 60).toFixed(0)} ${(s * 100).toFixed(0)}% ${(l * 100).toFixed(0)}%`;
}

/* ---------------- state ---------------- */
let db = null;
const F_EMPTY = { due: '', from: '', to: '', month: '', year: '', prio: '', tag: '', list: '', state: '' };
const ui = {
  view: 'myday', mode: 'list', sort: 'manual', q: '', openId: null, modal: null,
  cal: new Date(), miniCollapsed: false, miniEdge: 'right',
  miniPick: false,                 // bộ chọn danh sách ở thanh tiêu đề mini đang mở
  fold: {},                        // id việc cha -> true = đang THU GỌN việc con (mặc định mở)
  panel: false,                    // bảng lọc đang mở
  f: { ...F_EMPTY },               // bộ lọc có cấu trúc (bảng lọc, không gõ tay)
  confirm: null,                   // id việc đang chờ xác nhận xoá
  newList: false,
};
let dragId = null, dragEnd = 0, pendingDb = null, toastTimer = [], miniAddInput = null;   // dragEnd: chặn click mở chi tiết ngay sau khi kéo
const typing = () => /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
// Chỉ hoãn cập nhật khi đang gõ dở BÊN TRONG chi tiết / tuỳ biến (render lại sẽ mất chữ).
// Gõ ở ô thêm nhanh của mini vẫn nhận dữ liệu mới -> 2 cửa sổ mới đồng bộ được với nhau.
const editing = () => typing() && !!(document.activeElement.closest('.detail') || document.activeElement.closest('.modal'));

/* ---------------- theme ---------------- */
function applyTheme() {
  const s = db.settings, r = document.documentElement;
  r.dataset.theme = s.theme;
  r.style.setProperty('--radius', (s.radius || 10) + 'px');
  r.style.setProperty('--bg-alpha', s.opacity ?? 0.92);
  r.style.setProperty('--bg-blur', (s.blur || 14) + 'px');
  r.style.setProperty('--font', s.font || 'Segoe UI');
  r.style.fontSize = (s.fontSize || 14) + 'px';
  const hsl = hexToHsl(s.accent);
  if (hsl) {
    r.style.setProperty('--ring', hsl); r.style.setProperty('--primary', hsl);
    // chữ trên nền màu chủ đạo: nền sáng thì chữ đen, nền đậm thì chữ TRẮNG (nút trên nền tối phải đọc được)
    r.style.setProperty('--primary-foreground', +hsl.split(' ')[2].replace('%', '') > 68 ? '240 6% 10%' : '0 0% 100%');
  }
  // ảnh nền cửa sổ chính: độ hiện (opacity) + độ mờ (blur) chỉnh được
  r.style.setProperty('--bg-img', s.bg ? `url("${String(s.bg).replace(/\\/g, '/').replace(/"/g, '')}")` : 'none');
  r.style.setProperty('--bg-alpha2', s.bgOpacity ?? 0.55);
  r.style.setProperty('--bg-blur2', (s.bgBlur || 0) + 'px');
}

/* ---------------- toast ---------------- */
function toast(title, body, actions = [], ms = 8000) {
  const box = $('#toasts');
  const t = h('div', { class: 'card toast' },
    h('div', { style: { fontWeight: '600' } }, title),
    body ? h('div', { class: 'muted', style: { marginTop: '.2rem' } }, body) : null,
    actions.length ? h('div', { class: 'acts' }, ...actions.map((a) => h('button', { class: 'btn sm ' + (a.kind || 'outline'), onclick: () => { a.fn(); t.remove(); } }, a.label))) : null);
  box.append(t);
  const id = setTimeout(() => t.remove(), ms);
  toastTimer.push(id);
}

/* ---------------- persistence ---------------- */
function commit() { API.save(db); }
function applyDb(next) {
  db = next;
  if (db.settings.edge) ui.miniEdge = db.settings.edge;
  applyTheme();
  render();
}
// Đồng bộ 2 cửa sổ: LUÔN nhận dữ liệu mới nhất (không được để cửa sổ nào cũ).
// Việc "đang gõ dở thì đừng mất chữ" do render() lo: nó giữ lại giá trị + con trỏ của ô đang focus.
function onDb(next) { applyDb(next); }

/* ---------------- filters (bảng lọc) ---------------- */
const F_KEYS = Object.keys(F_EMPTY);
const clearF = () => { ui.f = { ...F_EMPTY }; };
const fActive = () => F_KEYS.filter((k) => ui.f[k] !== '' && ui.f[k] != null);

// lọc theo mốc thời gian rời (từ ngày / đến ngày / tháng / năm)
function inRange(t) {
  const f = ui.f;
  if (!f.from && !f.to && !f.month && !f.year) return true;
  if (!t.due) return false;
  const day = ymd(t.due);
  if (f.from && day < f.from) return false;
  if (f.to && day > f.to) return false;
  if (f.month && day.slice(0, 7) !== f.month) return false;
  if (f.year && day.slice(0, 4) !== f.year) return false;
  return true;
}
function dueMatch(t) {
  const today = ymd(new Date());
  switch (ui.f.due) {
    case 'overdue': return !!t.due && !t.done && new Date(t.due) < startOfDay(new Date());
    case 'today': return !!t.due && ymd(t.due) === today;
    case 'tomorrow': return !!t.due && ymd(t.due) === ymd(addDays(new Date(), 1));
    case 'week': { const d = t.due && new Date(t.due); return !!d && d >= startOfDay(new Date()) && d < addDays(startOfDay(new Date()), 8); }
    case 'month': return !!t.due && ymd(t.due).slice(0, 7) === today.slice(0, 7);
    case 'year': return !!t.due && ymd(t.due).slice(0, 4) === today.slice(0, 4);
    case 'weekend': return !!t.due && [0, 6].includes(new Date(t.due).getDay());
    case 'nodate': return !t.due;
    case 'myday': return T.inMyDay(t);   // cùng luật với view "Hôm nay của tôi" (hạn hôm nay + trễ + tự chọn)
    case 'late': return !!t.due && !t.done && new Date(t.due) < new Date();
    default: return true;
  }
}
function matches(t) {
  const f = ui.f;
  if (!dueMatch(t) || !inRange(t)) return false;
  if (f.prio !== '' && (t.priority || 0) !== +f.prio) return false;
  if (f.tag && !(t.tags || []).includes(f.tag)) return false;
  if (f.list && t.listId !== f.list) return false;
  if (f.state === 'done' && !t.done) return false;
  if (f.state === 'todo' && t.done) return false;
  return true;
}
function searchMatch(t) {
  const q = ui.q.trim().toLowerCase();
  if (!q) return true;
  return `${t.title || ''} ${t.notes || ''} ${(t.tags || []).join(' ')}`.toLowerCase().includes(q);
}
const DUE_LABEL = {
  overdue: 'Quá hạn', today: 'Hạn hôm nay', tomorrow: 'Hạn ngày mai', week: '7 ngày tới',
  month: 'Tháng này', year: 'Năm nay', weekend: 'Cuối tuần', nodate: 'Chưa có hạn',
  myday: 'Trong My Day', late: 'Trễ giờ',
};
// nhãn các mục lọc đang bật -> hiện thành chip để biết đang lọc gì
function fChips() {
  const out = [];
  if (ui.f.due) out.push([fChips.n('due'), DUE_LABEL[ui.f.due] || ui.f.due]);
  if (ui.f.from) out.push([fChips.n('from'), 'Từ ' + ui.f.from]);
  if (ui.f.to) out.push([fChips.n('to'), 'Đến ' + ui.f.to]);
  if (ui.f.month) out.push([fChips.n('month'), 'Tháng ' + ui.f.month]);
  if (ui.f.year) out.push([fChips.n('year'), 'Năm ' + ui.f.year]);
  if (ui.f.prio !== '') out.push([fChips.n('prio'), 'Ưu tiên: ' + PRIO[+ui.f.prio]]);
  if (ui.f.tag) out.push([fChips.n('tag'), '#' + ui.f.tag]);
  if (ui.f.list) out.push([fChips.n('list'), db.lists.find((l) => l.id === ui.f.list)?.name || 'Danh sách']);
  if (ui.f.state) out.push([fChips.n('state'), ui.f.state === 'done' ? 'Đã xong' : 'Chưa xong']);
  return out;
}
fChips.n = (k) => k;   // giữ khoá để chip xoá đúng mục

function currentTasks() {
  let list = viewTasks(ui.view);
  if (fActive().length) list = list.filter(matches);
  if (ui.q.trim()) list = list.filter(searchMatch);
  if (ui.sort === 'priority') list = [...list].sort((a, b) => (b.priority || 0) - (a.priority || 0));
  else if (ui.sort === 'due') list = [...list].sort((a, b) => new Date(a.due || 8.64e15) - new Date(b.due || 8.64e15));
  else if (ui.sort === 'title') list = [...list].sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  return list;
}
const kidsOf = (id) => db.tasks.filter((t) => t.parentId === id);
/* T.view() gọi qua contextBridge nên trả về BẢN SAO của từng việc — sửa vào bản sao thì db không đổi
   (nút ☀ My Day bấm không ăn, tick trong danh sách không lưu...). Mọi chỗ hiển thị việc phải đi qua
   hàm này để dòng nhận đúng object THẬT trong db. */
function viewTasks(name) {
  const byId = new Map(db.tasks.map((t) => [t.id, t]));
  return T.view(db.tasks, name).map((t) => byId.get(t.id) || t);
}

/* self-check: chỉ chạy khi mở file bằng node (không phải renderer) */
if (typeof module !== 'undefined' && require.main === module) {
  const assert = require('node:assert');
  assert.strictEqual(ymd(new Date(2026, 0, 5)), '2026-01-05');
  assert.strictEqual(hexToHsl('#5b8cff'), hexToHsl('#5b8cff'));
  assert.match(hexToHsl('#5b8cff'), /^\d+ \d+% \d+%$/);
  assert.strictEqual(fmtDue(toLocalInput(new Date().toISOString())), 'Hôm nay ' + new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }));
  const d0 = new Date(2026, 8, 11);
  assert.strictEqual((new Date(weekendIso(d0)).getDay() + 6) % 7, 5);   // luôn rơi vào thứ Bảy
  assert.ok(new Date(weekendIso(d0)) > d0);
  assert.strictEqual(ymd(new Date(at(d0, 1, 9))), '2026-09-12');
  assert.match(fmtStamp(new Date().toISOString()), /^\d{2}:\d{2}$/);
  assert.strictEqual(fmtStamp(new Date(2026, 0, 2, 7, 5).toISOString()), '02/01 07:05');
  const kev = (o) => ({ ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, key: '', ...o });
  assert.strictEqual(keyMatch(kev({ ctrlKey: true, key: 'w' }), 'mod+w'), true);
  assert.strictEqual(keyMatch(kev({ ctrlKey: true, altKey: true, key: 'w' }), 'mod+w'), false);
  assert.strictEqual(keyMatch(kev({ key: 'w' }), 'mod+w'), false);
  assert.strictEqual(keyMatch(kev({ ctrlKey: true, key: 't' }), 'mod+w'), false);
  assert.strictEqual(keyMatch(kev({ altKey: true, key: 'r' }), 'alt+r'), true);
  if (typeof document !== 'undefined') {
    assert.strictEqual(h('div', { draggable: true }).draggable, true);    // setAttribute('') -> auto -> kéo thả chết
    assert.strictEqual(h('div', { draggable: false }).draggable, false);
  }
  console.log('app.js self-check OK');
}
