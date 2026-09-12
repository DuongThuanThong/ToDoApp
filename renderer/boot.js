'use strict';
/* Khởi động renderer: nối IPC, phím tắt trong app (đọc từ db.settings.keys nên đổi được ở Tuỳ biến), vẽ lần đầu. */
/* ---------------- boot ---------------- */
if (API) {
  if (typeof ui.focusDetail === 'undefined') ui.focusDetail = false;
  if (typeof ui.focusSubAdd === 'undefined') ui.focusSubAdd = false;
  API.onDb(onDb);
  API.onAlert((t) => toast('🔔 ' + t.title, t.due ? fmtDue(t.due) : '', [
    { label: 'Xong', kind: '', fn: () => API.toggleTask(t.id, true).then((x) => { db.tasks = x; render(); }) },
    { label: 'Hoãn 10p', fn: () => API.snooze(t.id, 10) },
    { label: 'Hoãn 1h', fn: () => API.snooze(t.id, 60) },
  ]));
  API.mini.onState((s) => { ui.miniCollapsed = !!s.collapsed; if (s.edge) ui.miniEdge = s.edge; render(); });
  API.mini.onFocusAdd(() => { if (miniAddInput) miniAddInput.focus(); else { ui.view = 'myday'; if (!API.isMini) { ui.modal = null; render(); } } });

  const ACTIONS = {
    newTask: () => { ui.mode = 'list'; ui.panel = false; render(); $('#addInput')?.focus(); },
    closeDetail: () => { ui.openId = null; render(); },
    filter: () => { ui.panel = !ui.panel; render(); },
    search: () => { $('.search')?.focus(); },
    mini: () => API.mini.toggle(),
    myDay: () => { ui.view = 'myday'; render(); },
  };
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!ui.modal && !ui.openId) return;
      // trong chi tiết: Esc = quay lại (việc con -> chi tiết cha để thêm tiếp việc con)
      if (ui.modal) ui.modal = null; else detailBack();
      return;
    }
    // phím tắt trong app: tất cả lấy từ db.settings.keys -> người dùng gán lại ở Tuỳ biến
    for (const [act, combo] of Object.entries((db && db.settings.keys) || {})) {
      if (!ACTIONS[act] || !keyMatch(e, combo) || e.repeat) continue;
      e.preventDefault();
      ACTIONS[act]();
      return;
    }
  });

  API.load().then((d) => { db = d; ui.miniEdge = d.settings.edge || 'right'; applyTheme(); render(); });
}
