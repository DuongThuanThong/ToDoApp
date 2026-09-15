'use strict';
/* Minimal assert-based self-check: node lib/tasks.test.js */
const assert = require('node:assert');
const T = require('./tasks');

const NOW = new Date(2026, 8, 11, 10, 0, 0); // Fri 11 Sep 2026 10:00

let r = T.parseSmart('Họp team #công-việc !cao 15h ngày mai ~45p', NOW);
assert.strictEqual(r.title, 'Họp team');
assert.deepStrictEqual(r.tags, ['công-việc']);
assert.strictEqual(r.priority, 3);
assert.strictEqual(r.duration, 45);
assert.strictEqual(T.ymd(r.due), '2026-09-12');
assert.strictEqual(new Date(r.due).getHours(), 15);

r = T.parseSmart('Uống nước 18h', NOW);
assert.strictEqual(r.title, 'Uống nước');
assert.strictEqual(T.ymd(r.due), '2026-09-11');

r = T.parseSmart('Gọi mẹ 8h', NOW); // 8h đã qua -> mai
assert.strictEqual(T.ymd(r.due), '2026-09-12');

r = T.parseSmart('Deadline 20/9 !thấp', NOW);
assert.strictEqual(T.ymd(r.due), '2026-09-20');
assert.strictEqual(r.priority, 1);
assert.strictEqual(r.title, 'Deadline');

r = T.parseSmart('Báo cáo thứ 2 14h30', NOW); // next Monday
assert.strictEqual(new Date(r.due).getDay(), 1);
assert.strictEqual(new Date(r.due).getHours(), 14);
assert.strictEqual(new Date(r.due).getMinutes(), 30);

r = T.parseSmart('Đọc sách', NOW);
assert.strictEqual(r.due, null);
assert.strictEqual(r.title, 'Đọc sách');

// recurrence: daily from past due -> advances past now
const t = { id: 'a', due: new Date(2026, 8, 1, 9, 0).toISOString(), repeat: { type: 'daily', n: 1 } };
assert.ok(new Date(T.nextDue(t, NOW)) > NOW);

const tasks = [
  { id: 'p', listId: 'l1', title: 'cha', priority: 0, done: false, due: null, tags: [] },
  { id: 'c1', listId: 'l1', parentId: 'p', title: 'con 1', done: false },
  { id: 'c2', listId: 'l1', parentId: 'p', title: 'con 2', done: false },
];
T.toggleDone(tasks, 'c1');
assert.deepStrictEqual(T.subtaskProgress(tasks, 'p'), { total: 2, done: 1 });
T.toggleDone(tasks, 'c2', true);
assert.deepStrictEqual(T.subtaskProgress(tasks, 'p'), { total: 2, done: 2 });

// recurrence on complete -> clone created
const rec = [{ id: 'r', listId: 'l1', title: 'hàng ngày', done: false, due: new Date(2026, 8, 10, 9, 0).toISOString(), repeat: { type: 'daily', n: 1 } }];
T.toggleDone(rec, 'r', true, NOW);
assert.strictEqual(rec.length, 2);

// lần kế tiếp KHÔNG thừa hưởng trạng thái của lần vừa xong: nếu copy myDay thì việc hàng tuần
// vừa tick xong sẽ hiện lại ngay trong "Hôm nay của tôi" (lỗi UX: tưởng chưa hoàn thành)
const rec2 = [{
  id: 'r2', listId: 'l1', title: 'hàng tuần', done: false, repeat: { type: 'weekly', n: 1 },
  due: new Date(2026, 8, 10, 9, 0).toISOString(), myDay: '2026-09-10', start: new Date(2026, 8, 10, 9, 0).toISOString(), notifiedFor: 'r2|x',
}];
T.toggleDone(rec2, 'r2', true, NOW);
const next = rec2[1];
assert.strictEqual(rec2.length, 2);
assert.strictEqual(next.myDay, null, 'lần kế tiếp không được giữ myDay');
assert.strictEqual(next.start, null, 'lần kế tiếp không được giữ giờ bắt đầu cũ');
assert.strictEqual(next.notifiedFor, null, 'lần kế tiếp phải được nhắc lại');
assert.strictEqual(next.done, false);
assert.ok(new Date(next.due) > NOW, 'hạn lần kế tiếp phải ở tương lai');
// sau khi xong, việc đó biến khỏi "Hôm nay của tôi" (không còn dòng nào myDay = hôm nay)
assert.strictEqual(T.view(rec2, 'myday', NOW).filter((t) => t.myDay === '2026-09-10').length, 0);

// xem lại (bỏ tick) -> doneAt xoá, không sinh thêm lần lặp
T.toggleDone(rec2, 'r2', false, NOW);
assert.strictEqual(rec2[0].done, false);
assert.strictEqual(rec2[0].doneAt, null);
assert.strictEqual(rec2.length, 2, 'bỏ tick không được tạo thêm lần lặp');

// view + overdue
assert.strictEqual(T.view(tasks, 'l1').length, 1);
assert.ok(T.overdue({ due: new Date(2026, 8, 1).toISOString(), done: false }, NOW));
assert.ok(!T.overdue({ due: new Date(2026, 8, 1).toISOString(), done: true }, NOW));

// "Hôm nay của tôi" = việc ĐẾN HẠN hôm nay + việc TRỄ + việc TỰ CHỌN (☀) — hợp của "Hôm nay" và My Day.
// Bỏ một việc hạn-hôm-nay/trễ ra thì ghi myDaySkip = hôm nay -> mất hết hôm nay, mai lại hiện.
const mv = [
  { id: 'm1', listId: 'inbox', title: 'tự chọn', done: false, due: null, myDay: '2026-09-11' },
  { id: 'm2', listId: 'inbox', title: 'hạn hôm nay, KHÔNG tự chọn', done: false, due: new Date(2026, 8, 11, 15, 0).toISOString(), myDay: null },
  { id: 'm3', listId: 'inbox', title: 'trễ hạn, KHÔNG tự chọn', done: false, due: new Date(2026, 8, 9, 9, 0).toISOString(), myDay: null },
];
assert.deepStrictEqual(T.view(mv, 'myday', NOW).map((t) => t.id), ['m1', 'm2', 'm3'], 'việc đặt hôm nay phải nằm trong "Hôm nay của tôi"');
// việc tự chọn: bấm bỏ là BIẾN MẤT hẳn (nó không có hạn để tự quay lại)
mv[0].myDay = null;
assert.deepStrictEqual(T.view(mv, 'myday', NOW).map((t) => t.id), ['m2', 'm3'], 'bỏ My Day mà việc vẫn nằm lại');
// việc hạn hôm nay: bỏ ra thì phải ẩn HẾT HÔM NAY, không được tự mọc lại ngay
mv[1].myDaySkip = '2026-09-11';
assert.deepStrictEqual(T.view(mv, 'myday', NOW).map((t) => t.id), ['m3'], 'bỏ khỏi My Day rồi mà dòng vẫn nằm lại');
// ...còn mai thì tự hiện lại (việc chưa xong thành trễ hạn)
assert.deepStrictEqual(T.view(mv, 'myday', new Date(2026, 8, 12, 8, 0)).map((t) => t.id), ['m2', 'm3']);
// xong rồi thì không còn trong My Day
assert.deepStrictEqual(T.view([{ ...mv[1], myDaySkip: null, done: true }], 'myday', NOW).map((t) => t.id), []);
// My Day phải CHỨA "Hôm nay" (không được mất việc nào so với view "Hôm nay")
assert.deepStrictEqual(T.view(mv, 'today', NOW).map((t) => t.id).sort(), ['m2']);
// ...còn việc quá hạn đã tách sang "Trễ hẹn" (cũ nhất lên trước), KHÔNG còn nằm trong "Hôm nay"
assert.deepStrictEqual(T.view(mv, 'late', NOW).map((t) => t.id), ['m3']);
assert.ok(T.view(mv, 'myday', NOW).some((t) => t.id === 'm3'), 'việc quá hạn phải vẫn nằm trong My Day');
// việc xong rồi thì không tính là trễ nữa
assert.deepStrictEqual(T.view([{ id: 'm4', listId: 'inbox', done: true, due: new Date(2026, 8, 1).toISOString() }], 'late', NOW), []);

// "Hôm nay của tôi" chia 4 nhóm theo LÝ DO — việc làm thường xuyên (không hạn) phải nằm riêng khỏi việc hôm nay/trễ
assert.deepStrictEqual(T.MYDAY_SECTIONS, ['today', 'late', 'nodate', 'pick']);
assert.strictEqual(T.myDaySection(mv[0], NOW), 'nodate', 'việc không có hạn phải vào nhóm "chưa có hạn"');
assert.strictEqual(T.myDaySection(mv[1], NOW), 'today');
assert.strictEqual(T.myDaySection(mv[2], NOW), 'late');
assert.strictEqual(T.myDaySection({ id: 'm5', due: new Date(2026, 8, 20, 9, 0).toISOString() }, NOW), 'pick', 'tự chọn mà hạn ở tương lai phải vào nhóm riêng');
// việc con không được tự đứng riêng trong My Day (chỉ có cha nằm ở danh sách gốc)
assert.deepStrictEqual(T.view([{ id: 'm6', listId: 'inbox', parentId: 'm2', done: false, due: null, myDay: '2026-09-11' }], 'myday', NOW), []);

// auto-schedule: 2 tasks x 30m starting 9h, no overlap
const plan = T.autoSchedule([
  { id: 'x', done: false, duration: 30, due: null, priority: 0 },
  { id: 'y', done: false, duration: 30, due: null, priority: 0 },
], NOW);
assert.strictEqual(plan.length, 2);
assert.ok(new Date(plan[0].start) < new Date(plan[1].start));

assert.strictEqual(T.stats([{ done: true, doneAt: NOW.toISOString() }], 3, NOW).at(-1).done, 1);

/* ---------- hạn cha -> con ---------- */
const D1 = new Date(2026, 8, 15, 9, 0).toISOString();
const D2 = new Date(2026, 8, 20, 8, 0).toISOString();
const D3 = new Date(2026, 8, 25, 9, 0).toISOString();
const fam = () => ([
  { id: 'P', listId: 'l1', title: 'cha', done: false, due: null, tags: [] },
  { id: 'C1', parentId: 'P', title: 'con 1', done: false },
  { id: 'C2', parentId: 'P', title: 'con 2', done: false },
]);
let fam1 = fam();
T.setDue(fam1, 'P', D1);
assert.strictEqual(fam1[1].due, D1);          // con theo hạn cha
assert.strictEqual(fam1[2].due, D1);
assert.ok(fam1[1].remind, 'con thừa hưởng cả nhắc nhở');

T.setDue(fam1, 'C1', D2);                     // con tự đặt hạn riêng
assert.strictEqual(fam1[1].due, D2);
assert.strictEqual(fam1[0].due, D1, 'con KHÔNG được đẩy hạn lên cha');
T.setDue(fam1, 'P', D3);                      // cha đổi hạn
assert.strictEqual(fam1[1].due, D2, 'con đã tự đặt thì giữ hạn riêng');
assert.strictEqual(fam1[2].due, D3, 'con chưa đặt thì theo hạn cha mới');

T.setDue(fam1, 'C2', D2);
T.setDue(fam1, 'C2', null);                   // con xoá hạn -> theo cha
assert.strictEqual(fam1[2].due, D3);

let fam2 = fam();
T.setDue(fam2, 'P', D1);
T.setDue(fam2, 'P', null);                    // cha xoá hạn -> con chưa đặt cũng trống
assert.strictEqual(fam2[1].due, null);
assert.strictEqual(fam2[2].due, null);

let fam3 = fam();
T.setDue(fam3, 'P', D1);
const kid = T.inheritDue(fam3, { id: 'C3', parentId: 'P', done: false });
assert.strictEqual(kid.due, D1, 'việc con mới tạo nhận hạn cha');
assert.strictEqual(T.inheritDue(fam3, { id: 'X', parentId: 'P', dueOwn: true }).due, undefined, 'không ghi đè hạn riêng');

console.log('OK - all task-logic checks passed');
