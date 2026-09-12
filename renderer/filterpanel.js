'use strict';
/* Bảng lọc: chọn bằng nút/ô chọn (thời gian, mốc ngày, tháng, năm, ưu tiên, nhãn, danh sách) thay vì gõ cú pháp. */
/* ---------------- filter panel ---------------- */
const DUE_OPTS = [
  ['', 'Mọi thời gian'], ['overdue', 'Quá hạn'], ['today', 'Hạn hôm nay'], ['tomorrow', 'Hạn ngày mai'],
  ['week', '7 ngày tới'], ['month', 'Tháng này'], ['year', 'Năm nay'], ['weekend', 'Cuối tuần'],
  ['myday', 'Trong My Day'], ['late', 'Trễ giờ'], ['nodate', 'Chưa có hạn'],
];
const QUICK_FILTERS = [['Quá hạn', 'overdue'], ['Hôm nay', 'today'], ['Ngày mai', 'tomorrow'], ['7 ngày tới', 'week'], ['Tháng này', 'month'], ['Năm nay', 'year'], ['Chưa có hạn', 'nodate']];

function filterPanel() {
  const f = ui.f;
  const set = (k, v) => { f[k] = v; render(); };
  const sel = (k, opts) => h('select', { class: 'input', onchange: (e) => set(k, e.target.value) },
    ...opts.map(([v, n]) => h('option', { value: v, selected: String(f[k]) === String(v) }, n)));
  const dateIn = (k, type = 'date') => h('input', { class: 'input', type, value: f[k], onchange: (e) => set(k, e.target.value) });
  const rowF = (label, node) => h('div', { class: 'fp-row' }, h('span', { class: 'fp-lbl' }, label), node);
  const tags = [...new Set(db.tasks.flatMap((t) => t.tags || []))].sort();
  const n = currentTasks().length;

  return h('div', { class: 'fpanel card' },
    h('div', { class: 'fp-head' },
      h('strong', null, 'Bảng lọc'),
      h('span', { class: 'grow' }),
      h('button', { class: 'btn ghost sm', title: 'Bỏ mọi điều kiện lọc', onclick: () => { clearF(); render(); } }, 'Xoá hết'),
      h('button', { class: 'btn ghost icon sm', title: 'Đóng bảng lọc', onclick: () => { ui.panel = false; render(); } }, '✕')),
    rowF('Chọn nhanh', h('div', { class: 'chips' }, ...QUICK_FILTERS.map(([label, v]) =>
      h('button', { class: 'chip' + (f.due === v ? ' on' : ''), onclick: () => set('due', f.due === v ? '' : v) }, label)))),
    rowF('Thời gian', sel('due', DUE_OPTS)),
    rowF('Mốc thời gian', h('div', { class: 'fp-two' },
      h('div', null, h('span', { class: 'fp-mini' }, 'Từ ngày'), dateIn('from')),
      h('div', null, h('span', { class: 'fp-mini' }, 'Đến ngày'), dateIn('to')))),
    rowF('Tháng / Năm', h('div', { class: 'fp-two' },
      h('input', { class: 'input', type: 'month', value: f.month, title: 'Lọc theo tháng', onchange: (e) => set('month', e.target.value) }),
      h('input', { class: 'input', type: 'number', min: 2000, max: 2100, placeholder: 'Năm, vd 2026', value: f.year, onchange: (e) => set('year', e.target.value) }))),
    rowF('Ưu tiên', sel('prio', [['', 'Mọi mức'], ...PRIO.map((n2, i) => [String(i), `${i} · ${n2}`])])),
    rowF('Nhãn', sel('tag', [['', 'Mọi nhãn'], ...tags.map((t) => [t, '#' + t])])),
    rowF('Danh sách', sel('list', [['', 'Mọi danh sách'], ...db.lists.map((l) => [l.id, l.name])])),
    rowF('Trạng thái', sel('state', [['', 'Tất cả'], ['todo', 'Chưa xong'], ['done', 'Đã xong']])),
    h('div', { class: 'fp-foot' },
      h('span', { class: 'muted' }, `${n} việc khớp bộ lọc`),
      fActive().length ? h('button', { class: 'btn ghost sm', onclick: () => { clearF(); render(); } }, 'Bỏ ' + fActive().length + ' điều kiện') : null));
}
