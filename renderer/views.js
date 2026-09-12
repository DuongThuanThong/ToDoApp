'use strict';
/* Các chế độ xem: danh sách, kanban, lịch, timeline, ma trận Eisenhower. */
/* ---------------- list view ---------------- */
// Gom theo NGÀY -> mỗi ngày là 1 thư mục gập/mở được (log cho dễ nhìn, không phải 1 danh sách dài)
// openFirst: mở sẵn thư mục đầu tiên (dùng cho "Sắp tới" — việc gần nhất phải thấy ngay)
function groupByDay(list, stampKey, renderRow, openFirst = false) {
  const g = new Map();
  for (const t of list) {
    const k = t[stampKey] ? ymd(t[stampKey]) : '';
    if (!g.has(k)) g.set(k, []);
    g.get(k).push(t);
  }
  const today = ymd(new Date());
  return h('div', { class: 'groups' }, ...[...g].map(([k, items], i) => h('details', { class: 'group', open: k === today || (openFirst && i === 0) },
    h('summary', null, h('span', null, dayLabel(k)), h('span', { class: 'gct' }, items.length + ' việc')),
    h('div', { class: 'gbody' }, ...items.map(renderRow)))));
}

/* ---------------- thùng rác (đã xoá) ---------------- */
function trashRow(t) {
  return h('div', { class: 'row trash-row', dataset: { id: t.id } },
    h('div', { class: 'pdot p' + (t.priority || 0) }),
    h('div', { class: 'row-main' },
      h('div', { class: 'row-title' }, t.title || '(không tiêu đề)'),
      h('div', { class: 'row-meta' },
        t.parentId ? chip('', 'việc con') : null,
        t.due ? chip('due', '📅 ' + fmtDue(t.due)) : null,
        t.deletedAt ? chip('', 'xoá ' + fmtStamp(t.deletedAt)) : null)),
    h('div', { class: 'row-side' },
      h('button', { class: 'btn outline sm', onclick: () => restoreTask(t) }, '↩ Khôi phục'),
      h('button', { class: 'btn ghost icon sm', title: 'Xoá vĩnh viễn', onclick: () => purgeTask(t) }, '✕')));
}
function trashView() {
  const list = [...(db.trash || [])].sort((a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt)));
  if (!list.length) return h('div', { class: 'empty' }, 'Thùng rác trống. Việc bị xoá sẽ nằm ở đây để khôi phục.');
  return h('div', null,
    h('div', { class: 'trash-head' },
      h('span', { class: 'muted', style: { flex: 1 } }, 'Việc đã xoá vẫn khôi phục được — chỉ mất khi bạn dọn thùng rác.'),
      h('button', { class: 'btn outline sm', onclick: emptyTrash }, 'Dọn sạch')),
    groupByDay(list, 'deletedAt', trashRow));
}

function listView() {
  if (ui.view === 'trash') return trashView();
  const tasks = currentTasks();
  // "Đã hoàn thành" xem như log: gom theo ngày hoàn thành
  if (ui.view === 'completed') {
    if (!tasks.length) return h('div', { class: 'empty' }, 'Chưa hoàn thành việc nào.');
    return groupByDay(tasks, 'doneAt', (t) => row(t));
  }
  // "Sắp tới" cũng là log theo thời gian: gom theo ngày đến hạn, gần nhất trước, mở sẵn ngày gần nhất
  if (ui.view === 'upcoming') {
    if (!tasks.length) return h('div', { class: 'empty' }, 'Không có việc nào sắp tới. Việc mới có hạn sẽ hiện ở đây.');
    return groupByDay([...tasks].sort((a, b) => new Date(a.due || 8.64e15) - new Date(b.due || 8.64e15)), 'due', (t) => row(t), true);
  }
  if (!tasks.length) return h('div', { class: 'empty' }, 'Chưa có việc nào. Gõ vào ô thêm việc ở trên — thử: Họp team #cv !cao 15h mai ~45p');
  const box = h('div');
  for (const t of tasks) {
    const kids = kidsOf(t.id);   // việc con nằm ngay dưới cha + có đường nối, thu gọn được
    box.append(row(t, { fold: kids.length }));
    if (!ui.fold[t.id]) kids.forEach((k, i) => box.append(row(k, { sub: true, last: i === kids.length - 1 })));
  }
  return box;
}

/* ---------------- kanban ---------------- */
const COLS = [{ id: 'todo', name: 'Cần làm' }, { id: 'doing', name: 'Đang làm' }, { id: 'done', name: 'Xong' }];
function kanbanView() {
  const tasks = currentTasks().filter((t) => !t.parentId);
  // Kéo thả dùng chung cơ chế chuột ở row.js: thả vào cột nào thì đổi stage cột đó (data-stage bên dưới)
  return h('div', { class: 'kanban' }, ...COLS.map((c) => {
    const col = h('div', { class: 'kcol', dataset: { stage: c.id } },
      h('div', { class: 'khead' }, h('span', null, c.name), h('span', null, tasks.filter((t) => (t.stage || 'todo') === c.id).length)));
    for (const t of tasks.filter((x) => (x.stage || 'todo') === c.id)) col.append(row(t));
    return col;
  }));
}

/* ---------------- calendar ---------------- */
function calendarView() {
  const cur = ui.cal;
  const first = new Date(cur.getFullYear(), cur.getMonth(), 1);
  const start = addDays(first, -((first.getDay() + 6) % 7));
  const grid = h('div', { class: 'cgrid' });
  for (const d of WEEK) grid.append(h('div', { class: 'cday-n' }, d));
  const today = ymd(new Date());
  for (let i = 0; i < 42; i++) {
    const day = addDays(start, i), key = ymd(day);
    const items = db.tasks.filter((t) => t.due && ymd(t.due) === key);
    const cell = h('div', {
      class: 'cday' + (day.getMonth() !== cur.getMonth() ? ' off' : '') + (key === today ? ' today' : '') + (key < today && items.some((t) => !t.done) ? ' over' : ''),
      dataset: { day: key }, title: 'Kéo việc vào đây để đặt hạn ' + key,
    });
    cell.append(h('div', { class: 'n' }, day.getDate()));
    for (const t of items.slice(0, 4)) {
      const it = h('div', {
        class: 'citem' + (t.done ? ' done' : ''), title: t.title + ' — kéo sang ô khác để đổi hạn', dataset: { id: t.id },
        onclick: () => { if (Date.now() - dragEnd < 350) return; ui.openId = t.id; render(); },
      }, t.title);
      makeDraggable(it, t.id);   // kéo ô việc sang ngày khác -> đổi hạn
      cell.append(it);
    }
    if (items.length > 4) cell.append(h('div', { class: 'muted', style: { fontSize: '.65rem' } }, '+' + (items.length - 4)));
    grid.append(cell);
  }
  return h('div', null,
    h('div', { class: 'cal-head' },
      h('button', { class: 'btn outline cal-nav', title: 'Tháng trước', onclick: () => { ui.cal = new Date(cur.getFullYear(), cur.getMonth() - 1, 1); render(); } }, '‹ Tháng trước'),
      h('strong', { class: 'cal-title' }, `Tháng ${cur.getMonth() + 1}/${cur.getFullYear()}`),
      h('button', { class: 'btn outline cal-nav', title: 'Tháng sau', onclick: () => { ui.cal = new Date(cur.getFullYear(), cur.getMonth() + 1, 1); render(); } }, 'Tháng sau ›'),
      h('button', { class: 'btn ghost sm', onclick: () => { ui.cal = new Date(); render(); } }, 'Hôm nay')),
    grid);
}

/* ---------------- timeline (gantt-lite) ---------------- */
function timelineView() {
  const days = 14, base = startOfDay(new Date());
  const tasks = currentTasks().filter((t) => !t.parentId && t.due).slice(0, 40);
  if (!tasks.length) return h('div', { class: 'empty' }, 'Không có việc nào có ngày trong tầm nhìn 14 ngày.');
  const axis = h('div', { class: 'tl-axis' }, ...Array.from({ length: days }, (_, i) => h('span', { style: { flex: 1 } }, addDays(base, i).getDate())));
  const rows = tasks.map((t) => {
    const end = new Date(t.due);
    const dur = (t.duration || 60) * 60000;
    const s = t.start ? new Date(t.start) : new Date(end.getTime() - dur);
    const clamp = (x) => Math.max(0, Math.min(days, (x - base) / 864e5));
    const left = clamp(s), width = Math.max(0.2, clamp(end) - left);
    return h('div', { class: 'tl-row' },
      h('div', { class: 'tl-name', title: t.title, onclick: () => { ui.openId = t.id; render(); } }, t.title),
      h('div', { class: 'tl-track' }, h('div', { class: 'tl-bar', style: { left: left / days * 100 + '%', width: width / days * 100 + '%', background: `hsl(var(--p${t.priority || 0}))` } })));
  });
  return h('div', { class: 'tl' }, axis, ...rows);
}

/* ---------------- eisenhower ---------------- */
function matrixView() {
  const tasks = currentTasks().filter((t) => !t.parentId);
  const end = new Date();
  const urgent = (t) => t.due && (new Date(t.due) < end || ymd(t.due) === ymd(end) || ymd(t.due) === ymd(addDays(end, 1)));
  const important = (t) => (t.priority || 0) >= 2;
  const Q = [
    ['Làm ngay', 'q1', 3, (t) => urgent(t) && important(t)],
    ['Lên lịch', 'q2', 2, (t) => !urgent(t) && important(t)],
    ['Uỷ thác', 'q3', 1, (t) => urgent(t) && !important(t)],
    ['Bỏ đi', 'q4', 0, (t) => !urgent(t) && !important(t)],
  ];
  // thả việc vào ô nào -> đặt mức ưu tiên của ô đó (data-prio)
  return h('div', { class: 'matrix' }, ...Q.map(([name, cls, prio, f]) => {
    const list = tasks.filter(f);
    return h('div', { class: 'q ' + cls, dataset: { prio }, title: 'Thả việc vào đây để đặt ưu tiên "' + PRIO[prio] + '"' },
      h('h4', null, name, h('span', { class: 'hint' }, list.length + ' việc')), ...list.map((t) => row(t)));
  }));
}
