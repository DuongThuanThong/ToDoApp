'use strict';
/* Thao tác trên việc: thêm, sửa, xoá (có xác nhận + hoàn lại), xong (hoàn lại), kéo-thả sắp xếp. */
/* ---------------- actions ---------------- */
async function addTask(text, extra = {}) {
  const txt = String(text || '').trim();
  if (!txt) return null;
  const p = T.parseSmart(txt);
  const target = db.lists.some((l) => l.id === ui.view) ? ui.view : (extra.listId || 'inbox');
  const t = {
    id: uid(), title: p.title || txt, done: false, doneAt: null, stage: 'todo', createdAt: new Date().toISOString(),
    due: extra.due || p.due || null, start: null, duration: p.duration || 0, priority: p.priority, tags: p.tags,
    listId: target, parentId: extra.parentId || null, notes: '', repeat: null, dueOwn: false,
    remind: (extra.due || p.due) ? { offsetMin: db.settings.reminderOffset || 10, repeat: false } : null,
    myDay: ymd(new Date()), notifiedFor: null,
  };
  const r = await API.addTask(t);      // MAIN mới là nơi áp luật hạn cha–con rồi lưu
  db.tasks = r.tasks;
  if (db.settings.openOnAdd !== false) { ui.openId = r.task.id; ui.focusDetail = true; }   // vừa thêm là mở chi tiết + con trỏ vào ô đầu tiên
  render();
  return r.task;
}
function toggleTask(t) {
  if (!t) return;
  const was = t.done;
  API.toggleTask(t.id, !t.done).then((tasks) => {
    db.tasks = tasks;
    render();
    toast(was ? 'Bỏ đánh dấu xong: ' + t.title : 'Đã xong: ' + t.title, '', [
      { label: 'Hoàn lại', kind: 'outline', fn: () => toggleTask(db.tasks.find((x) => x.id === t.id)) },
    ], 7000);
  });
}
function patch(t, props) { Object.assign(t, props); commit(); render(); }
// đổi hạn: đi qua MAIN -> luật cha–con (lib/tasks.js) luôn đúng ở mọi chỗ (chi tiết, chip, kéo vào lịch)
function setDue(t, iso) {
  API.setDue(t.id, iso).then((tasks) => { db.tasks = tasks; render(); });
}
function setStage(t, stage) {
  if (stage === 'done' && !t.done) return toggleTask(t);
  if (stage !== 'done' && t.done) return toggleTask(t);
  patch(t, { stage });
}
function delTask(t) { ui.confirm = t.id; render(); }        // xoá luôn phải qua bảng xác nhận
// Xoá = chuyển vào thùng rác (db.trash), KHÔNG mất dữ liệu -> khôi phục được bất cứ lúc nào
function doDelete(t) {
  const kids = kidsOf(t.id);
  const stamp = new Date().toISOString();
  db.trash = [...[...kids, t].map((x) => ({ ...JSON.parse(JSON.stringify(x)), deletedAt: stamp })), ...(db.trash || [])];
  db.trash = db.trash.slice(0, 200);   // ponytail: giữ 200 mục gần nhất, đủ để cứu; đổi thành cài đặt nếu cần hơn
  db.tasks = db.tasks.filter((x) => x.id !== t.id && x.parentId !== t.id);
  if (ui.openId === t.id || kids.some((k) => k.id === ui.openId)) ui.openId = null;
  ui.confirm = null;
  commit();
  render();
  toast('Đã chuyển vào "Đã xoá": ' + t.title, kids.length ? `kèm ${kids.length} việc con` : '', [
    { label: 'Hoàn lại', kind: 'outline', fn: () => restoreTask(t) },
  ], 10000);
}
// khôi phục: lấy lại chính nó + các việc con bị xoá cùng lúc (giữ nguyên quan hệ cha–con)
function restoreTask(t) {
  // khôi phục việc con mà cha còn nằm trong thùng rác -> khôi phục CHA trước (tránh con mồ côi)
  if (t.parentId && !db.tasks.some((x) => x.id === t.parentId)) {
    const p = (db.trash || []).find((x) => x.id === t.parentId);
    if (p) return restoreTask(p);
  }
  const ids = new Set([t.id, ...(db.trash || []).filter((x) => x.parentId === t.id).map((x) => x.id)]);
  const back = (db.trash || []).filter((x) => ids.has(x.id)).map((x) => { const c = { ...x }; delete c.deletedAt; return c; });
  if (!back.length) return;
  db.trash = db.trash.filter((x) => !ids.has(x.id));
  db.tasks.push(...back);
  commit(); render();
  toast('Đã khôi phục: ' + t.title, back.length > 1 ? `kèm ${back.length - 1} việc con` : '');
}
function purgeTask(t) { db.trash = (db.trash || []).filter((x) => x.id !== t.id && x.parentId !== t.id); commit(); render(); }
function emptyTrash() {
  const n = (db.trash || []).length;
  db.trash = []; commit(); render();
  toast('Đã dọn thùng rác', n + ' việc bị xoá vĩnh viễn');
}
// after = kéo xuống dưới đích -> chèn SAU đích (không thì thả xuống dòng ngay dưới là no-op)
function reorder(fromId, toId, after = false) {
  const a = db.tasks.findIndex((t) => t.id === fromId), i = db.tasks.findIndex((t) => t.id === toId);
  if (a < 0 || i < 0 || a === i) return;
  if (ui.sort !== 'manual') ui.sort = 'manual';   // kéo thả mà danh sách đang sắp theo ưu tiên/hạn thì phải về thứ tự tự do mới thấy kết quả
  const [m] = db.tasks.splice(a, 1);
  db.tasks.splice(db.tasks.findIndex((t) => t.id === toId) + (after ? 1 : 0), 0, m);
  commit(); render();
}
function toggleMyDay(t) {
  const on = T.inMyDay(t);
  const today = ymd(new Date());
  // Bỏ ra khỏi việc đang ĐẾN HẠN hôm nay: ghi myDaySkip để nó không tự mọc lại ngay (mai hết skip).
  patch(t, on ? { myDay: null, myDaySkip: today } : { myDay: today, myDaySkip: null });
  toast(on ? 'Đã bỏ khỏi "Hôm nay của tôi"' : 'Đã thêm vào "Hôm nay của tôi"',
    on && t.due ? 'Việc có hạn nên mai sẽ tự hiện lại' : '', [], 3000);
}
// thu gọn / mở rộng việc con của một việc cha (kiểu mở list). Trạng thái chỉ trong phiên, không lưu DB.
function foldKids(id) { ui.fold[id] = !ui.fold[id]; render(); }
