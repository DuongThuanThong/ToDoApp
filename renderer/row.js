'use strict';
/* Một dòng việc (cha/con) + nút phụ + kéo thả bằng chuột (danh sách, kanban, lịch, ma trận). */
/* ---------------- task row ---------------- */
function chip(cls, txt) { return h('span', { class: 'badge ' + cls }, txt); }

// Đích thả dưới con trỏ: dòng khác, cột kanban, ô lịch, ô ma trận. Một chỗ cho mọi chế độ xem.
function dropTarget(ev, self) {
  const el = document.elementFromPoint(ev.clientX, ev.clientY);
  if (!el) return null;
  const q = el.closest('.row');
  if (q && q !== self && !q.classList.contains('sub')) return { kind: 'row', el: q };
  const col = el.closest('.kcol');
  if (col) return { kind: 'stage', el: col, stage: col.dataset.stage };
  const cell = el.closest('.cday');
  if (cell && cell.dataset.day) return { kind: 'day', el: cell, day: cell.dataset.day };
  const quad = el.closest('.q');
  if (quad) return { kind: 'prio', el: quad, prio: +quad.dataset.prio };
  return null;
}
function clearDrop() { document.querySelectorAll('.row.over, .kcol.over, .cday.over, .q.over').forEach((x) => x.classList.remove('over')); }
// Ma trận Eisenhower: mỗi ô = 2 trục (KHẨN CẤP theo hạn, QUAN TRỌNG theo ưu tiên).
// Đặt mỗi ưu tiên là thiếu: thả vào "Làm ngay" mà việc chưa khẩn cấp thì nó nhảy sang "Lên lịch".
// -> thả vào ô nào thì đặt CẢ HAI trục.
function applyQuad(t, prio) {
  const urgent = prio === 3 || prio === 1;
  const now = new Date(), due = t.due && new Date(t.due);
  const isUrgent = !!due && (due < now || ymd(due) === ymd(now) || ymd(due) === ymd(addDays(now, 1)));
  const h = due ? due.getHours() : 9, m = due ? due.getMinutes() : 0;
  t.priority = prio;
  if (urgent && !isUrgent) setDue(t, at(now, 0, h, m));        // khẩn cấp -> hạn hôm nay
  else if (!urgent && isUrgent) setDue(t, at(now, 3, h, m));   // không khẩn cấp -> đẩy hạn ra 3 ngày (giữ nguyên giờ)
  else commit();
  render();
}
function applyDrop(d, src) {
  const t = db.tasks.find((x) => x.id === dragId);
  if (!t) return;
  if (d.kind === 'row') reorder(dragId, d.el.dataset.id, !!(d.el.compareDocumentPosition(src) & Node.DOCUMENT_POSITION_PRECEDING));
  else if (d.kind === 'stage') setStage(t, d.stage);
  else if (d.kind === 'day') setDue(t, at(new Date(d.day), 0, 9));   // at(ngày, số ngày cộng thêm, giờ)
  else if (d.kind === 'prio') applyQuad(t, d.prio);
}

// Kéo thả bằng chuột (mousedown -> mousemove -> mouseup). Không dùng HTML5 drag&drop vì
// Chromium ưu tiên bôi đen chữ và hành vi native khác nhau giữa các nền tảng -> hay "không kéo được".
// Dùng chung cho MỌI thứ kéo được: dòng việc, ô việc trong lịch.
function makeDraggable(el, id) {
  el.classList.add('gdrag');
  el.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || e.target.closest('button')) return;   // bấm nút (tick, My Day, xoá) thì không phải kéo
    const x0 = e.clientX, y0 = e.clientY;
    const move = (ev) => {
      if (!dragId && Math.abs(ev.clientY - y0) < 5 && Math.abs(ev.clientX - x0) < 5) return;
      if (!dragId) { dragId = id; el.classList.add('dragging'); }
      clearDrop();
      const d = dropTarget(ev, el);
      if (d) d.el.classList.add('over');
    };
    const up = (ev) => {
      document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up);
      const d = dropTarget(ev, el);
      clearDrop();
      if (dragId && d) { applyDrop(d, el); dragEnd = Date.now(); }
      el.classList.remove('dragging');
      dragId = null;
    };
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
  });
}

function row(t, { sub = false, last = false, fold = 0 } = {}) {
  const p = T.subtaskProgress(db.tasks, t.id);
  const late = t.due && !t.done && new Date(t.due) < new Date();
  const shut = !!ui.fold[t.id];
  const r = h('div', { class: 'row' + (t.done ? ' done' : '') + (sub ? ' sub' : '') + (last ? ' sub-last' : ''), dataset: { id: t.id } },
    // nút thu gọn/mở rộng việc con (kiểu mở list). Không có việc con thì vẫn giữ chỗ trống để các dòng thẳng hàng.
    !sub ? h('button', {
      class: 'kids-tg' + (fold ? '' : ' none'),
      title: fold ? (shut ? `Mở ${fold} việc con` : `Thu gọn ${fold} việc con`) : '',
      onclick: (e) => { e.stopPropagation(); if (fold) foldKids(t.id); },
    }, fold ? (shut ? '▸' : '▾') : '') : null,
    h('div', { class: 'pdot p' + (t.priority || 0), title: 'Ưu tiên: ' + PRIO[t.priority || 0] }),
    h('button', { class: 'cb' + (t.done ? ' on' : ''), title: 'Hoàn thành', onclick: (e) => { e.stopPropagation(); toggleTask(t); askParent(t); } }, '✓'),
    h('div', { class: 'row-main', title: 'Bấm để mở chi tiết', onclick: () => { if (Date.now() - dragEnd < 350) return; ui.openId = t.id; render(); } },
      h('div', { class: 'row-title' }, t.title || '(không tiêu đề)'),
      h('div', { class: 'row-meta' },
        t.due ? chip('due' + (late ? ' late' : ''), (late ? '⏰ ' : '📅 ') + fmtDue(t.due)) : null,
        t.parentId && !t.dueOwn && t.due ? chip('', 'theo cha') : null,
        t.start ? chip('', '▶ ' + new Date(t.start).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })) : null,
        t.duration ? chip('', t.duration + 'p') : null,
        p ? chip('', `☑ ${p.done}/${p.total}`) : null,
        t.repeat ? chip('', '↻ ' + t.repeat.type) : null,
        t.remind ? chip('', '🔔') : null,
        t.notes ? chip('', '📝') : null,
        ...(t.tags || []).map((x) => chip('tag', '#' + x)))),
    t.createdAt ? h('span', { class: 'row-time', title: 'Tạo lúc ' + new Date(t.createdAt).toLocaleString('vi-VN') }, fmtStamp(t.createdAt)) : null,
    h('div', { class: 'row-side' },
      h('button', {
        class: 'btn ghost myday-btn' + (t.myDay ? ' on' : ''),
        title: t.myDay
          ? 'Việc này đang nằm trong "Hôm nay của tôi" — bấm để bỏ ra'
          : 'Cho việc này vào "Hôm nay của tôi" (danh sách bạn TỰ CHỌN làm hôm nay, khác "Hôm nay" là việc có hạn rơi vào hôm nay)',
        onclick: (e) => { e.stopPropagation(); toggleMyDay(t); },
      }, t.myDay ? '☀' : '☁'),
      h('button', { class: 'btn ghost icon sm', title: 'Xoá việc (có hỏi lại)', onclick: (e) => { e.stopPropagation(); delTask(t); } }, '✕')));
  if (!sub) makeDraggable(r, t.id);   // việc con không kéo riêng: nó đi theo cha
  return r;
}
function askParent(t) {
  if (!t.parentId) return;
  const parent = db.tasks.find((x) => x.id === t.parentId);
  if (!parent || parent.done) return;
  const p = T.subtaskProgress(db.tasks, parent.id);
  if (p && p.done === p.total && p.total > 0) {
    toast('Xong hết việc con!', `Hoàn thành luôn "${parent.title}"?`, [
      { label: 'Hoàn thành', kind: '', fn: () => toggleTask(parent) },
      { label: 'Để sau', fn: () => {} },
    ]);
  }
}
