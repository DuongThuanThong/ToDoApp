'use strict';
/* Cửa sổ mini neo mép: danh sách gọn, mở chi tiết được và LUÔN có nút quay lại. */
/* ---------------- mini window ---------------- */
function miniView() {
  const edge = ui.miniEdge;
  const arrow = { right: '‹', left: '›', top: '⌄', bottom: '⌃' }[edge] || '‹';
  if (ui.miniCollapsed) {
    const tab = h('button', {
      class: 'edge-tab', title: 'Mở danh sách (hoặc dùng phím tắt)', dataset: { edge },
      style: { fontSize: Math.max(6, (db.settings.tabSize || 10) - 1) + 'px' },
      onclick: () => API.mini.expand(),
    }, arrow);
    if (db.settings.peek !== false) tab.addEventListener('mouseenter', () => API.mini.peek(true));
    return tab;
  }
  const open = ui.openId && db.tasks.find((x) => x.id === ui.openId);
  // Mở chi tiết trong mini: CHỈ MỘT thanh trên duy nhất. Thanh .detail-head của bảng chi tiết bị ẩn trong mini
  // (CSS) vì nó lặp nút và ăn mất 40px chiều cao của cửa sổ nhỏ -> nút bị cắt.
  if (open) return h('div', { class: 'mini mini-det' },
    h('div', { class: 'mini-head drag' },
      h('button', { class: 'btn ghost sm', title: 'Quay lại (Esc)', onclick: detailBack }, open.parentId ? '← Việc cha' : '← Danh sách'),
      h('span', { class: 'grow', title: open.title || '' }, open.title || 'Chi tiết'),
      h('button', { class: 'btn ghost icon sm', title: 'Mở trong app chính', onclick: () => API.openMain() }, '⧉'),
      h('button', { class: 'btn ghost icon sm', title: 'Thu vào mép', onclick: () => API.mini.collapse() }, arrow),
      h('button', { class: 'btn ghost icon sm', title: 'Ẩn', onclick: () => API.mini.hide() }, '✕')),
    detailView());

  const tasks = T.view(db.tasks, 'myday').filter((t) => !t.parentId);
  const i = h('input', {
    class: 'input', placeholder: 'Thêm nhanh… (Enter)',
    onkeydown: (e) => { if (e.key === 'Enter') { addTask(e.target.value); e.target.value = ''; } },
  });
  miniAddInput = i;
  const box = h('div', { class: 'mini' },
    h('div', { class: 'mini-head drag' },
      h('img', { class: 'brand-ic', src: ICON_SRC, alt: '' }),
      h('span', { class: 'grow', title: 'Danh sách việc bạn tự chọn cho hôm nay' }, 'Hôm nay của tôi'),
      h('button', { class: 'btn ghost icon sm', title: 'Mở app chính', onclick: () => API.openMain() }, '⧉'),
      h('button', { class: 'btn ghost icon sm', title: 'Thu vào mép', onclick: () => API.mini.collapse() }, arrow),
      h('button', { class: 'btn ghost icon sm', title: 'Ẩn', onclick: () => API.mini.hide() }, '✕')),
    h('div', { class: 'mini-add' }, i),
    h('div', { class: 'mini-list' }, tasks.length ? tasks.flatMap((t) => {
      const kids = kidsOf(t.id);
      return [row(t), ...kids.map((k, i) => row(k, { sub: true, last: i === kids.length - 1 }))];
    }) : h('div', { class: 'empty', style: { padding: '1.5rem .5rem' } }, 'Hết việc 🎉')),
    h('div', { class: 'mini-foot muted' }, h('span', null, tasks.filter((t) => !t.done).length + ' việc'), h('span', { class: 'grow', style: { flex: 1 } }), h('span', null, new Date().toLocaleDateString('vi-VN'))));
  if (db.settings.peek !== false) box.addEventListener('mouseleave', () => API.mini.peek(false));
  return box;
}
