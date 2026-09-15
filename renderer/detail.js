'use strict';
/* Bảng chi tiết việc (sửa mọi thuộc tính, việc con, hạn, nhắc, lặp). */
/* ---------------- detail panel ---------------- */
// ESC / nút quay lại: việc CON -> về chi tiết CHA (để thêm tiếp việc con), việc cha -> đóng bảng.
function detailBack() {
  const t = db.tasks.find((x) => x.id === ui.openId);
  if (t && t.parentId) { ui.openId = t.parentId; ui.focusSubAdd = true; }
  else ui.openId = null;
  render();
}
function detailView() {
  const t = db.tasks.find((x) => x.id === ui.openId);
  if (!t) return null;
  const p = T.subtaskProgress(db.tasks, t.id);
  const f = (label, node) => h('div', { class: 'field' }, h('label', { class: 'lbl' }, label), node);

  const aside = h('aside', { class: 'detail' },
    h('div', { class: 'detail-head' },
      // mini tự có thanh trên riêng -> chỉ cửa sổ chính mới vẽ nút này
      API.isMini ? null : h('button', { class: 'btn ghost sm', title: 'Quay lại danh sách (Esc)', onclick: detailBack }, '← Quay lại'),
      h('strong', { style: { flex: 1, fontSize: '.85rem' } }, t.parentId ? 'Chi tiết việc con' : 'Chi tiết'),
      t.parentId ? h('button', { class: 'btn ghost sm', onclick: () => { ui.openId = t.parentId; render(); } }, '↑ cha') : null,
      h('button', { class: 'btn ghost icon sm', onclick: () => API.openMain() }, '⧉'),
      h('button', { class: 'btn ghost icon sm', onclick: () => { ui.openId = null; render(); } }, '✕')),
    h('div', { class: 'detail-body' },
      h('textarea', { id: 'detailTitle', class: 'input', style: { minHeight: '3rem', fontWeight: '600' }, onchange: (e) => patch(t, { title: e.target.value }) }, t.title),
      t.createdAt ? h('div', { class: 'muted', style: { fontSize: '.7rem', margin: '.3rem 0 0' } }, 'Tạo ' + new Date(t.createdAt).toLocaleString('vi-VN')) : null,
      /* việc con ngay dưới tiêu đề: không phải cuộn xuống đáy mới thêm được */
      t.parentId ? null : h('div', { class: 'sub-block' },
        h('div', { class: 'sub-head' },
          h('span', { class: 'lbl', style: { margin: 0 } }, 'Việc con' + (p ? ` ${p.done}/${p.total}` : '')),
          h('span', { class: 'muted', style: { fontSize: '.68rem' } }, 'Enter để thêm')),
        ...kidsOf(t.id).map((k, i, arr) => h('div', { class: 'sub-row' + (k.done ? ' done' : '') + (i === arr.length - 1 ? ' sub-last' : '') },
          h('button', { class: 'cb' + (k.done ? ' on' : ''), onclick: () => { toggleTask(k); askParent(k); } }, '✓'),
          h('span', { style: { flex: 1, cursor: 'pointer' }, onclick: () => { ui.openId = k.id; render(); } }, k.title),
          k.createdAt ? h('span', { class: 'row-time', title: 'Tạo lúc ' + new Date(k.createdAt).toLocaleString('vi-VN') }, fmtStamp(k.createdAt)) : null,
          h('button', { class: 'btn ghost icon sm', title: 'Xoá việc con', onclick: () => delTask(k) }, '✕'))),
        h('input', { class: 'input sub-add', placeholder: 'Thêm việc con… (Enter)', onkeydown: (e) => { if (e.key === 'Enter' && e.target.value.trim()) { addTask(e.target.value, { parentId: t.id }); e.target.value = ''; } } }),
        p ? h('div', { class: 'progress', style: { marginTop: '.45rem' } }, h('i', { style: { width: (p.done / p.total * 100) + '%' } })) : null),

      h('div', { style: { marginTop: '.9rem' } }),
      h('div', { class: 'row2' },
        f('Ưu tiên', h('select', { class: 'input', onchange: (e) => patch(t, { priority: +e.target.value }) },
          ...PRIO.map((n, i) => h('option', { value: i, selected: (t.priority || 0) === i }, n)))),
        (() => {
          const sel = h('select', { class: 'input', onchange: (e) => patch(t, { listId: e.target.value }) },
            ...db.lists.map((l) => h('option', { value: l.id, selected: t.listId === l.id }, l.name)));
          return f('Danh sách', sel);
        })()),
      f('Hạn (ngày giờ)', h('div', null,
        h('input', { class: 'input', type: 'datetime-local', value: t.due ? toLocalInput(t.due) : '', onchange: (e) => setDue(t, fromLocalInput(e.target.value)) }),
        h('div', { class: 'chips' },
          ...QUICK_DUE.map(([label, fn]) => h('button', { class: 'chip', onclick: () => setDue(t, fn(new Date())) }, label)),
          h('button', { class: 'chip', onclick: () => setDue(t, null) }, 'Xoá hạn')))),
      t.parentId ? h('div', { class: 'muted hint' }, t.dueOwn
        ? 'Hạn riêng của việc con — cha đổi hạn cũng không ghi đè. Bấm "Xoá hạn" để quay về theo hạn cha.'
        : 'Đang theo hạn của việc cha (việc con không bao giờ tự đặt hạn cho cha).') : null,
      f('Nhắc nhở', h('select', {
        class: 'input', onchange: (e) => {
          const v = +e.target.value;
          patch(t, { remind: v < 0 ? null : { offsetMin: v, repeat: t.remind?.repeat || false } });
        },
      },
        h('option', { value: -1, selected: !t.remind }, 'Không nhắc'),
        ...[0, 5, 10, 30, 60, 1440].map((m) => h('option', { value: m, selected: t.remind?.offsetMin === m }, m === 0 ? 'Đúng giờ' : m >= 1440 ? `${m / 1440} ngày trước` : `${m} phút trước`)))),
      f('Lặp lại', h('select', {
        class: 'input', onchange: (e) => {
          const v = e.target.value;
          // đổi kiểu lặp thì bỏ `days` (thứ trong tuần ≠ ngày trong tháng), giữ nhịp n và giờ
          patch(t, { repeat: v === 'none' ? null : { ...(t.repeat || {}), type: v, n: t.repeat?.n || 1, days: t.repeat?.type === v ? t.repeat.days : null } });
        },
      },
        h('option', { value: 'none', selected: !t.repeat }, 'Không lặp'),
        ...Object.entries(REPEAT_FULL).map(([v, n]) => h('option', { value: v, selected: t.repeat?.type === v }, n)))),
      // nhịp: mỗi N ngày/tuần/tháng/năm (chỉ "sau khi xong" là N ngày chờ)
      t.repeat ? f(t.repeat.type === 'after' ? 'Số ngày sau khi xong' : 'Mỗi (' + (REPEAT_WHAT[t.repeat.type] || 'lần') + ')',
        h('input', { class: 'input', type: 'number', min: 1, value: t.repeat.n || 1, onchange: (e) => patch(t, { repeat: { ...t.repeat, n: Math.max(1, +e.target.value || 1) } }) }))
        : null,
      // Lặp theo thứ trong tuần: "hằng tuần vào T2, T4". Không chọn thứ nào = lặp đúng thứ của hạn hiện tại.
      t.repeat?.type === 'weekly' ? f('Vào các thứ', h('div', { class: 'chips' },
        ...[1, 2, 3, 4, 5, 6, 0].map((wd) => h('button', {
          class: 'chip rechip' + ((t.repeat.days || []).includes(wd) ? ' on' : ''),
          onclick: () => patch(t, { repeat: { ...t.repeat, days: (t.repeat.days || []).includes(wd) ? t.repeat.days.filter((x) => x !== wd) : [...(t.repeat.days || []), wd].sort((a, b) => a - b) } }),
        }, WD_SHORT[wd])))
        ) : null,
      // Lặp theo ngày trong tháng: gõ "15, cuối" — cuối = ngày cuối tháng, tự biết 28/29/30/31
      t.repeat?.type === 'monthly' ? f('Vào các ngày', h('input', {
        class: 'input', value: monthDaysText(t.repeat.days), placeholder: 'VD: 15, cuối',
        onchange: (e) => patch(t, { repeat: { ...t.repeat, days: parseMonthDays(e.target.value) } }),
      })) : null,
      // giờ của lần lặp: "hằng tuần T2 T4 lúc 7h" — bỏ trống thì giữ giờ của hạn hiện tại
      t.repeat && t.repeat.type !== 'after' ? f('Giờ của lần lặp', h('input', {
        class: 'input', type: 'time', value: t.repeat.time || '',
        onchange: (e) => patch(t, { repeat: { ...t.repeat, time: e.target.value || null } }),
      })) : null,
      f('Ước tính (phút)', h('input', { class: 'input', type: 'number', min: 0, value: t.duration || 0, onchange: (e) => patch(t, { duration: +e.target.value || 0 }) })),
      f('Nhãn (cách nhau dấu phẩy)', h('input', {
        class: 'input', value: (t.tags || []).join(', '),
        onchange: (e) => patch(t, { tags: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) }),
      })),
      f('Ghi chú', h('textarea', { class: 'input', onchange: (e) => patch(t, { notes: e.target.value }) }, t.notes || '')),


      h('div', { class: 'sep' }),
      h('div', { class: 'row2' },
        h('button', { class: 'btn outline sm', onclick: () => toggleMyDay(t) }, t.myDay ? '☀ Trong My Day' : '☁ Thêm My Day'),
        h('button', { class: 'btn danger sm', onclick: () => delTask(t) }, 'Xoá việc'))));

  // Vừa tạo việc -> con trỏ vào ô ĐẦU TIÊN (tiêu đề) để tuỳ biến ngay.
  // Quay về từ việc con -> con trỏ vào ô thêm việc con để thêm tiếp.
  if (ui.focusDetail || ui.focusSubAdd) {
    const sel = ui.focusSubAdd ? '.sub-add' : '#detailTitle';
    ui.focusDetail = false; ui.focusSubAdd = false;
    setTimeout(() => { const e = $(sel); if (e) { e.focus(); if (e.select) e.select(); } }, 0);
  }
  return aside;
}
