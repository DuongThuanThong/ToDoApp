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

// view + overdue
assert.strictEqual(T.view(tasks, 'l1').length, 1);
assert.ok(T.overdue({ due: new Date(2026, 8, 1).toISOString(), done: false }, NOW));
assert.ok(!T.overdue({ due: new Date(2026, 8, 1).toISOString(), done: true }, NOW));

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
