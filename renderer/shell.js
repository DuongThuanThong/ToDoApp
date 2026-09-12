'use strict';
/* Khung app: sidebar, topbar, thanh thêm việc, bảng lọc, bảng xác nhận xoá, hàm render tổng. */
/* ---------------- sidebar ---------------- */
const NAV_HELP = {
  myday: 'Danh sách việc BẠN TỰ CHỌN cho hôm nay (bấm nút ☁ My Day ở mỗi việc để thêm vào, ☀ để bỏ ra)',
  today: 'Việc có HẠN hôm nay, kể cả việc đã trễ hạn (tự động theo ngày đến hạn)',
  upcoming: 'Việc có hạn trong những ngày tới, gom theo từng ngày',
  nodate: 'Việc chưa đặt ngày đến hạn',
  completed: 'Log việc đã xong, gom theo từng ngày',
  trash: 'Việc đã xoá — vẫn khôi phục được, chỉ mất khi bạn dọn sạch',
};
function sidebar() {
  const count = (id) => (id === 'trash' ? (db.trash || []).length : T.view(db.tasks, id).length);
  const nav = (id, icon, name) => h('button', { class: 'nav' + (ui.view === id ? ' on' : ''), title: NAV_HELP[id] || name, onclick: () => { ui.view = id; render(); } },
    h('span', { class: 'ic' }, icon), h('span', null, name), h('span', { class: 'ct' }, count(id) || ''));

  const side = h('aside', { class: 'sidebar' },
    h('div', { class: 'brand drag' }, h('img', { class: 'brand-ic', src: ICON_SRC, alt: '' }), h('span', null, 'ToDoApp')),
    h('div', { class: 'side-scroll' },
      ...VIEWS.map((v) => nav(...v)),
      h('div', { class: 'side-hint' }, '☀ = việc bạn tự chọn · ◉ = việc đến hạn hôm nay (kể cả trễ)'),
      h('div', { class: 'side-lbl' }, 'Danh sách'),
      ...db.lists.map((l) => h('button', { class: 'nav' + (ui.view === l.id ? ' on' : ''), onclick: () => { ui.view = l.id; render(); } },
        h('span', { class: 'ic' }, '#'), h('span', null, l.name), h('span', { class: 'ct' }, count(l.id) || ''),
        h('span', { class: 'ic', style: { marginLeft: '.2rem' }, onclick: (e) => { e.stopPropagation(); db.lists = db.lists.filter((x) => x.id !== l.id); commit(); render(); } }, '✕'))),
      ui.newList ? (() => {
        const i = h('input', { class: 'input', placeholder: 'Tên danh sách…', style: { marginTop: '.3rem', height: '1.9rem' }, onkeydown: (e) => { if (e.key === 'Enter' && e.target.value.trim()) { db.lists.push({ id: uid(), name: e.target.value.trim(), folderId: null }); ui.newList = false; commit(); render(); } if (e.key === 'Escape') { ui.newList = false; render(); } } });
        setTimeout(() => i.focus(), 0);
        return i;
      })() : h('button', { class: 'nav', onclick: () => { ui.newList = true; render(); } }, h('span', { class: 'ic' }, '+'), h('span', null, 'Danh sách mới'))),
    h('div', { style: { padding: '.5rem .55rem', borderTop: '1px solid hsl(var(--border))', display: 'flex', gap: '.3rem' } },
      h('button', { class: 'btn ghost sm', style: { flex: 1 }, onclick: () => { ui.modal = 'stats'; render(); } }, '📊 Thống kê'),
      h('button', { class: 'btn ghost sm', style: { flex: 1 }, onclick: () => { ui.modal = 'settings'; render(); } }, '⚙ Tuỳ biến')));
  return side;
}

/* ---------------- topbar ---------------- */
const MODES = [['list', 'Danh sách'], ['kanban', 'Kanban'], ['calendar', 'Lịch'], ['timeline', 'Timeline'], ['matrix', 'Ma trận']];

function topbar() {
  const names = viewName;
  const title = names(ui.view) || db.lists.find((l) => l.id === ui.view)?.name || 'Việc';
  const canSchedule = ['myday', 'today', 'upcoming'].includes(ui.view);
  const nf = fActive().length + (ui.q.trim() ? 1 : 0);
  const nTasks = ui.view === 'trash' ? (db.trash || []).length : currentTasks().length;
  return h('div', { class: 'topbar' },
    h('div', { class: 'title' }, title, h('small', { title: NAV_HELP[ui.view] || '' }, nTasks + ' việc')),
    h('div', { class: 'tabs' }, ...MODES.map(([v, n]) => h('button', { class: ui.mode === v ? 'on' : '', onclick: () => { ui.mode = v; render(); } }, n))),
    h('input', { class: 'input search', placeholder: '⌕ Tìm theo tên / #nhãn', title: 'Tìm nhanh trong danh sách đang xem', value: ui.q, oninput: (e) => { ui.q = e.target.value; renderBody(); } }),
    h('button', {
      class: 'btn outline sm btn-filter' + (nf ? ' on' : ''),
      title: 'Bảng lọc — lọc theo thời gian, mốc ngày/tháng/năm, ưu tiên, nhãn, danh sách, trạng thái',
      onclick: () => { ui.panel = !ui.panel; render(); },
    }, '⛃ Bộ lọc' + (nf ? ` (${nf})` : '')),
    h('select', { class: 'input sort', title: 'Thứ tự hiển thị danh sách việc', onchange: (e) => { ui.sort = e.target.value; render(); } },
      ...[['manual', 'Sắp xếp: Tự do (kéo thả)'], ['priority', 'Sắp xếp: Ưu tiên cao trước'], ['due', 'Sắp xếp: Hạn gần trước'], ['title', 'Sắp xếp: Tên A→Z']].map(([v, n]) => h('option', { value: v, selected: ui.sort === v }, n))),
    canSchedule ? h('button', { class: 'btn outline sm', title: 'Xếp việc có thời lượng vào khung giờ trống', onclick: schedule }, '🗓 Xếp lịch') : null,
    h('button', { class: 'btn ghost icon', title: 'Cửa sổ mini', onclick: () => API.mini.show() }, '⧉'));
}

// chip các điều kiện lọc đang bật — bấm để bỏ từng cái
function filterChips() {
  const list = fChips();
  if (!list.length) return null;
  return h('div', { class: 'fchips' },
    h('span', { class: 'muted', style: { fontSize: '.7rem' } }, 'Đang lọc:'),
    ...list.map(([k, label]) => h('button', { class: 'chip on', title: 'Bỏ điều kiện này', onclick: () => { ui.f[k] = ''; render(); } }, label + ' ✕')),
    h('button', { class: 'btn ghost sm', onclick: () => { clearF(); render(); } }, 'Bỏ hết'));
}

function schedule() {
  const plan = T.autoSchedule(db.tasks.filter((t) => !t.parentId));
  if (!plan.length) return toast('Không có gì để xếp', 'Cần task có "ước tính (phút)" và chưa có giờ bắt đầu.');
  for (const p of plan) { const t = db.tasks.find((x) => x.id === p.id); if (t) t.start = p.start; }
  commit(); render();
  toast('Đã xếp ' + plan.length + ' việc', 'Kéo-thả hoặc sửa giờ trong phần chi tiết nếu cần.');
}

/* ---------------- bảng xác nhận xoá ---------------- */
function confirmModal() {
  const t = db.tasks.find((x) => x.id === ui.confirm);
  if (!t) return null;
  const kids = kidsOf(t.id);
  return h('div', { class: 'overlay' },
    h('div', { class: 'card modal confirm', id: 'confirmModal' },
      h('h3', null, 'Xoá việc này?'),
      h('div', { class: 'confirm-name' }, t.title || '(không tiêu đề)'),
      kids.length ? h('div', { class: 'muted' }, `Xoá luôn ${kids.length} việc con của nó.`) : null,
      h('div', { class: 'muted', style: { fontSize: '.75rem' } }, 'Xoá xong vẫn có nút "Hoàn lại" ở góc phải màn hình.'),
      h('div', { class: 'row2' },
        h('button', { class: 'btn outline', onclick: () => { ui.confirm = null; render(); } }, 'Huỷ'),
        h('button', { class: 'btn danger', id: 'confirmDel', onclick: () => doDelete(t) }, 'Xoá'))));
}

/* ---------------- add bar ---------------- */
function addBar() {
  const i = h('input', {
    id: 'addInput',
    class: 'input', placeholder: 'Thêm việc… "Họp team #cv !cao 15h mai ~45p"  (Enter)',
    onkeydown: (e) => { if (e.key === 'Enter') { addTask(e.target.value); e.target.value = ''; } },
  });
  return h('div', { style: { padding: '0 1rem .6rem', display: 'flex', gap: '.5rem' } },
    i, h('button', { class: 'btn', onclick: () => { addTask(i.value); i.value = ''; } }, 'Thêm'));
}

/* ---------------- render ---------------- */
function bodyView() {
  switch (ui.mode) {
    case 'kanban': return kanbanView();
    case 'calendar': return calendarView();
    case 'timeline': return timelineView();
    case 'matrix': return matrixView();
    default: return listView();
  }
}
function renderBody() {
  const host = $('#body');
  if (!host) return render();
  const keep = host.scrollTop;
  host.innerHTML = '';
  host.append(bodyView());
  host.scrollTop = keep;
}
function render() {
  if (!db) return;
  applyTheme();
  document.body.classList.toggle('mini', !!API.isMini);
  const app = $('#app');
  // render lại không được nhảy về đầu — nhất là panel chi tiết dài
  const keepBody = $('#body')?.scrollTop || 0, keepDetail = $('.detail-body')?.scrollTop || 0;
  // và cũng không được nuốt chữ đang gõ: nhớ ô đang focus để trả lại nguyên trạng sau khi vẽ
  const a = document.activeElement;
  const keep = a && a.id && /^(INPUT|TEXTAREA)$/.test(a.tagName) && a.type !== 'range'
    ? { id: a.id, v: a.value, s: a.selectionStart, e: a.selectionEnd } : null;
  app.innerHTML = '';
  if (API.isMini) { app.append(miniView()); return; }

  const content = h('main', { class: 'content' + (db.settings.bg ? ' bgimg' : '') },
    h('div', { class: 'titlebar drag' },
      h('div', { class: 'grow' }),
      h('div', { class: 'wctl' },
        h('button', { onclick: () => API.win('min'), title: 'Thu nhỏ' }, '–'),
        h('button', { onclick: () => API.win('max'), title: 'Phóng to' }, '▢'),
        h('button', { class: 'x', onclick: () => API.win('close'), title: 'Ẩn xuống tray' }, '✕'))),
    topbar(), filterChips(), addBar(),
    h('div', { class: 'bodywrap' },
      h('div', { class: 'body', id: 'body' }, bodyView()),
      ui.panel ? filterPanel() : null));

  app.append(h('div', { class: 'shell' }, sidebar(), content, detailView() || ''));
  if (keepBody) $('#body').scrollTop = keepBody;
  if (keepDetail) { const d = $('.detail-body'); if (d) d.scrollTop = keepDetail; }
  if (ui.modal === 'settings') app.append(settingsModal());
  if (ui.modal === 'stats') app.append(statsModal());
  if (ui.confirm) app.append(confirmModal());
}
