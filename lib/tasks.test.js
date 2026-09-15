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

// xem lại (bỏ tick) -> doneAt xoá + THU HỒI kỳ lặp đã sinh lúc tick (nếu không, tick lại sẽ đẻ thêm
// một kỳ nữa và việc hằng ngày tích thành nhiều bản ở các ngày tương lai)
T.toggleDone(rec2, 'r2', false, NOW);
assert.strictEqual(rec2[0].done, false);
assert.strictEqual(rec2[0].doneAt, null);
assert.strictEqual(rec2.length, 1, 'bỏ tick phải thu hồi kỳ đã sinh, không để lại bản thừa');
T.toggleDone(rec2, 'r2', true, NOW);
assert.strictEqual(rec2.length, 2, 'bỏ tick rồi tick lại vẫn đúng 1 kỳ kế tiếp');

/* ---------- lặp theo THỨ trong tuần / NGÀY trong tháng (repeat.days) ----------
   NOW = Thứ Sáu 11/9/2026 10:00. Ngày trong tuần: 0=CN, 1=T2 … 6=T7 (khớp Date.getDay()). */
const ymdh = (t2, from) => {
  const d = new Date(T.nextDue(t2, from));
  return [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()];
};

// "hằng tuần vào T2, T4 lúc 7h": xong hôm T2 -> kỳ kế tiếp là T4 cùng tuần, đúng 7h
const wk = { due: new Date(2026, 8, 14, 7, 0).toISOString(), repeat: { type: 'weekly', n: 1, days: [1, 3], time: '07:00' } };   // T2 14/9
assert.deepStrictEqual(ymdh(wk, new Date(2026, 8, 14, 8, 0)), [2026, 9, 16, 7, 0], 'T2 xong phải nhảy sang T4 16/9 7h');
assert.deepStrictEqual(ymdh({ ...wk, due: new Date(2026, 8, 16, 7, 0).toISOString() }, new Date(2026, 8, 16, 8, 0)), [2026, 9, 21, 7, 0], 'T4 xong phải về T2 tuần sau');
// "mỗi 2 tuần vào T2" -> cách đúng 2 tuần
assert.deepStrictEqual(ymdh({ ...wk, repeat: { type: 'weekly', n: 2, days: [1], time: '07:00' } }, new Date(2026, 8, 14, 8, 0)), [2026, 9, 28, 7, 0]);
// việc bỏ quên nhiều kỳ: hạn cũ từ tháng 6 -> kỳ kế tiếp phải ở TƯƠNG LAI, không trả về ngày đã qua
const stale = T.nextDue({ ...wk, due: new Date(2026, 5, 1, 7, 0).toISOString() }, NOW);
assert.ok(new Date(stale) > NOW, 'việc trễ nhiều kỳ vẫn phải ra kỳ kế tiếp ở tương lai');
assert.deepStrictEqual(ymdh({ ...wk, due: new Date(2026, 5, 1, 7, 0).toISOString() }, NOW), [2026, 9, 14, 7, 0]);
// không chọn thứ nào -> giữ nguyên thứ + giờ của hạn cũ (luật cũ, không được đổi)
assert.deepStrictEqual(ymdh({ due: new Date(2026, 8, 7, 9, 0).toISOString(), repeat: { type: 'weekly', n: 1 } }, NOW), [2026, 9, 14, 9, 0]);

// "hằng tháng ngày 15 và cuối tháng": 15/9 xong -> 30/9 (tháng 9 có 30 ngày)
const mo = { due: new Date(2026, 8, 15, 9, 0).toISOString(), repeat: { type: 'monthly', n: 1, days: [15, -1] } };
assert.deepStrictEqual(ymdh(mo, new Date(2026, 8, 15, 10, 0)), [2026, 9, 30, 9, 0], 'cuối tháng 9 phải là 30');
assert.deepStrictEqual(ymdh({ ...mo, due: new Date(2026, 8, 30, 9, 0).toISOString() }, new Date(2026, 8, 30, 10, 0)), [2026, 10, 15, 9, 0]);
// "cuối tháng" tự biết tháng 2/2027 chỉ có 28 ngày
assert.deepStrictEqual(ymdh({ due: new Date(2027, 0, 31, 9, 0).toISOString(), repeat: { type: 'monthly', n: 1, days: [-1] } }, new Date(2027, 0, 31, 10, 0)), [2027, 2, 28, 9, 0]);
// ngày 31 rơi vào tháng ít ngày hơn -> lấy ngày cuối tháng đó (tháng 4 có 30 ngày)
assert.deepStrictEqual(ymdh({ due: new Date(2027, 2, 31, 9, 0).toISOString(), repeat: { type: 'monthly', n: 1, days: [31] } }, new Date(2027, 2, 31, 10, 0)), [2027, 4, 30, 9, 0]);
// hằng ngày mà đặt giờ riêng -> kỳ kế tiếp vẫn đúng giờ đó
assert.deepStrictEqual(ymdh({ due: new Date(2026, 8, 11, 7, 0).toISOString(), repeat: { type: 'daily', n: 1, time: '07:00' } }, NOW), [2026, 9, 12, 7, 0]);

// view + overdue
assert.strictEqual(T.view(tasks, 'l1').length, 1);
assert.ok(T.overdue({ due: new Date(2026, 8, 1).toISOString(), done: false }, NOW));
assert.ok(!T.overdue({ due: new Date(2026, 8, 1).toISOString(), done: true }, NOW));

// "Hôm nay của tôi" = việc trong KẾ HOẠCH HÔM NAY (đến hạn hôm nay / lặp rơi vào hôm nay) ∪ việc TRỄ
// ∪ việc TỰ CHỌN (☀). LUẬT: mọi việc ở khung "Hôm nay" đều nằm trong đây -> việc ĐẾN HẠN hôm nay
// KHÔNG bỏ ra được; myDaySkip chỉ còn tác dụng với việc TRỄ (bỏ ra thì mai lại hiện).
const mv = [
  { id: 'm1', listId: 'inbox', title: 'tự chọn', done: false, due: null, myDay: '2026-09-11' },
  { id: 'm2', listId: 'inbox', title: 'hạn hôm nay, KHÔNG tự chọn', done: false, due: new Date(2026, 8, 11, 15, 0).toISOString(), myDay: null },
  { id: 'm3', listId: 'inbox', title: 'trễ hạn, KHÔNG tự chọn', done: false, due: new Date(2026, 8, 9, 9, 0).toISOString(), myDay: null },
];
assert.deepStrictEqual(T.view(mv, 'myday', NOW).map((t) => t.id), ['m1', 'm2', 'm3'], 'việc đặt hôm nay phải nằm trong "Hôm nay của tôi"');
// việc tự chọn: bấm bỏ là BIẾN MẤT hẳn (nó không có hạn để tự quay lại)
mv[0].myDay = null;
assert.deepStrictEqual(T.view(mv, 'myday', NOW).map((t) => t.id), ['m2', 'm3'], 'bỏ My Day mà việc vẫn nằm lại');
// việc ĐẾN HẠN HÔM NAY: có cờ bỏ cũng KHÔNG bỏ ra được — nó thuộc khung "Hôm nay" (luật người dùng)
mv[1].myDaySkip = '2026-09-11';
assert.deepStrictEqual(T.view(mv, 'myday', NOW).map((t) => t.id), ['m2', 'm3'], 'việc đến hạn hôm nay bị bỏ ra khỏi "Hôm nay của tôi"');
// việc TRỄ thì bỏ ra được trong hôm nay, mai tự hiện lại (chưa xong thì vẫn trễ)
mv[2].myDaySkip = '2026-09-11';
assert.deepStrictEqual(T.view(mv, 'myday', NOW).map((t) => t.id), ['m2'], 'việc trễ đã bỏ ra mà vẫn nằm lại');
assert.deepStrictEqual(T.view(mv, 'myday', new Date(2026, 8, 12, 8, 0)).map((t) => t.id), ['m2', 'm3'], 'cờ bỏ chỉ có tác dụng trong đúng ngày hôm đó');
mv[2].myDaySkip = null;
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

/* "Hôm nay" phải gom cả việc LẶP rơi vào hôm nay — việc lặp thường KHÔNG có `due`, nên nếu chỉ soi
   `due` thì nó nằm trong "Hôm nay của tôi" mà không bao giờ hiện ở "Hôm nay" (lỗi user báo). */
const TODAY = new Date(2026, 8, 11, 10, 0, 0);   // Thứ Sáu 11/9/2026
const T3 = new Date(2026, 8, 15, 10, 0, 0);      // Thứ Ba 15/9/2026
const rp = (o) => ({ id: 'x', title: 'x', done: false, due: null, repeat: o });
assert.ok(T.plannedToday(rp({ type: 'weekly', days: [5] }), TODAY), 'lặp T6 -> hôm nay là T6');
assert.ok(!T.plannedToday(rp({ type: 'weekly', days: [1, 3] }), TODAY), 'lặp T2 T4 -> không phải hôm nay');
assert.ok(T.plannedToday(rp({ type: 'daily' }), TODAY), 'hằng ngày -> ngày nào cũng đúng');
assert.ok(T.plannedToday({ id: 'a', done: false, due: new Date(2026, 8, 11, 20), repeat: null }, TODAY), 'đến hạn hôm nay');
assert.ok(!T.plannedToday({ id: 'a', done: false, due: new Date(2026, 8, 15, 20), repeat: null }, TODAY), 'hạn 15/9 -> không phải hôm nay');
assert.ok(!T.plannedToday(rp({ type: 'after' }), TODAY), 'lặp "sau khi xong" -> không đoán trước được');
assert.ok(!T.plannedToday(rp({ type: 'weekly' }), TODAY), 'hằng tuần không chọn thứ, không có hạn -> không đoán được');
assert.ok(!T.plannedToday({ ...rp({ type: 'daily' }), done: true }, TODAY), 'việc đã xong thì không tính');
// theo tháng: "cuối" tự nhận 30/31/28
assert.ok(T.plannedToday(rp({ type: 'monthly', days: [15] }), T3), 'ngày 15');
assert.ok(!T.plannedToday(rp({ type: 'monthly', days: [-1] }), T3), '15/9 chưa phải ngày cuối tháng');
assert.ok(T.plannedToday(rp({ type: 'monthly', days: [-1] }), new Date(2026, 8, 30, 9)), 'cuối = 30/9');
assert.ok(T.plannedToday(rp({ type: 'monthly', days: [-1] }), new Date(2027, 1, 28, 9)), 'cuối tháng 2/2027 = 28');
assert.ok(T.plannedToday(rp({ type: 'monthly', days: [31] }), new Date(2026, 3, 30, 9)), 'gõ 31 -> tháng 4 lấy ngày 30');
assert.ok(!T.plannedToday(rp({ type: 'yearly', due: undefined }), TODAY), 'hằng năm mà không có mốc -> không đoán được');

// view('today') phải dùng đúng luật đó
const row = (id, repeat, due = null) => ({ id, title: id, done: false, parentId: null, listId: 'inbox', due, repeat });
const vt = T.view([row('a', { type: 'weekly', days: [5] }), row('b', { type: 'weekly', days: [1] }), row('c', null, new Date(2026, 8, 11, 20)), row('d', null, new Date(2026, 8, 20, 20))], 'today', TODAY);
assert.deepStrictEqual(vt.map((x) => x.id), ['a', 'c'], 'view "today" = hạn hôm nay + lặp rơi vào hôm nay');

/* LUẬT người dùng chốt: MỌI việc nằm ở khung "Hôm nay" đều phải nằm trong "Hôm nay của tôi". */
const mk2 = (id, repeat, due = null) => ({ id, title: id, done: false, parentId: null, listId: 'inbox', due, repeat, myDay: null, myDaySkip: null, tags: [] });
const all2 = [
  mk2('due-hom-nay', null, new Date(2026, 8, 11, 20, 0)),
  mk2('lap-hom-nay', { type: 'weekly', n: 1, days: [5] }),
  mk2('qua-han', null, new Date(2026, 8, 8, 9, 0)),
  mk2('chua-co-han', null, null),
  mk2('han-tuong-lai', null, new Date(2026, 8, 20, 9, 0)),
  mk2('duoc-gan-co', null, new Date(2026, 8, 20, 9, 0)),
  mk2('da-xong', null, new Date(2026, 8, 11, 20, 0)),
];
all2[5].myDay = '2026-09-11';   // gắn cờ ☀
all2[6].done = true;
for (const t of T.view(all2, 'today', TODAY)) {
  assert.ok(T.inMyDay(t, TODAY), 'việc ở "Hôm nay" phải nằm trong "Hôm nay của tôi": ' + t.id);
}
const md2 = T.view(all2, 'myday', TODAY).map((x) => x.id);
assert.ok(!md2.includes('chua-co-han'), 'việc chưa có hạn KHÔNG được tự nằm trong "Hôm nay của tôi" (phải bấm ☀)');
assert.ok(md2.includes('duoc-gan-co'), 'việc được gắn cờ ☀ phải nằm trong "Hôm nay của tôi"');
assert.ok(md2.includes('qua-han'), 'việc quá hạn vẫn nằm trong "Hôm nay của tôi"');
assert.ok(!md2.includes('da-xong'), 'việc đã xong không nằm trong "Hôm nay của tôi"');

// LỖI NGƯỜI DÙNG BÁO: kỳ lặp TƯƠNG LAI không được hiện sớm ở "Hôm nay". Mỗi kỳ lặp kế tiếp sinh ra
// đã có hạn riêng -> HẠN quyết định ngày, không phải lịch lặp.
assert.ok(T.plannedToday(rp({ type: 'daily' }), TODAY), 'daily KHÔNG hạn (việc làm hằng ngày) vẫn hiện mỗi ngày');
assert.ok(!T.plannedToday({ id: 'x', done: false, due: new Date(2026, 8, 16, 18, 12), repeat: { type: 'daily', n: 1 } }, TODAY), 'kỳ lặp daily hạn MAI không được hiện hôm nay');
assert.ok(!T.plannedToday({ id: 'x', done: false, due: new Date(2026, 8, 17, 18, 12), repeat: { type: 'daily', n: 1 } }, TODAY), 'kỳ lặp daily hạn 17/9 không được hiện hôm nay');
assert.ok(T.plannedToday({ id: 'x', done: false, due: new Date(2026, 8, 16, 18, 12), repeat: { type: 'daily', n: 1 } }, new Date(2026, 8, 16, 9, 0)), 'đến ngày 16/9 thì kỳ đó mới hiện');
assert.ok(T.plannedToday({ id: 'x', done: false, due: new Date(2026, 8, 11, 18, 12), repeat: { type: 'weekly', n: 1, days: [1] } }, TODAY), 'kỳ lặp weekly có hạn ĐÚNG hôm nay thì hiện (hạn thắng lịch)');
assert.ok(!T.plannedToday({ id: 'x', done: false, due: new Date(2026, 8, 18, 18, 12), repeat: { type: 'weekly', n: 1, days: [5] } }, TODAY), 'kỳ lặp weekly hạn tuần sau không hiện hôm nay');
assert.ok(!T.plannedToday({ id: 'x', done: false, due: null, repeat: { type: 'yearly', n: 1 } }, TODAY), 'yearly không có mốc -> không đoán được');

/* Tick xong việc lặp: sinh ĐÚNG 1 kỳ kế tiếp; bỏ tick thì thu hồi kỳ đó (không nhân bản). */
const KEP = (l) => l.filter((x) => x.spawnedFrom === 'r1');      // các kỳ được sinh ra
const mkRec = (now) => { const t = { id: 'r1', title: 'Vocabolary', done: false, doneAt: null, stage: 'todo', due: null, start: null, myDay: null, repeat: { type: 'daily', n: 1 }, parentId: null, createdAt: 'x' }; return [t, [t], now]; };
let [rt, rl, rnow] = mkRec(new Date(2026, 8, 15, 18, 12));
T.toggleDone(rl, 'r1', true, rnow);
assert.strictEqual(KEP(rl).length, 1, 'tick xong phải có đúng 1 kỳ kế tiếp');
assert.strictEqual(T.ymd(rl[1].due), '2026-09-16', 'kỳ kế tiếp là MAI, không phải hôm nay');
T.toggleDone(rl, 'r1', true, rnow);   // tick lại vào việc đã xong (màn hình cũ bấm lại)
assert.strictEqual(KEP(rl).length, 1, 'tick lại việc đã xong không được sinh thêm kỳ');
T.toggleDone(rl, 'r1', false, rnow);  // bỏ tick
assert.strictEqual(rl[0].done, false, 'bỏ tick thì việc trở lại chưa xong');
assert.strictEqual(KEP(rl).length, 0, 'bỏ tick phải thu hồi kỳ đã sinh');
T.toggleDone(rl, 'r1', true, rnow);   // tick lại
assert.strictEqual(KEP(rl).length, 1, 'bỏ tick rồi tick lại vẫn chỉ 1 kỳ (không nhân bản)');
assert.strictEqual(rl.length, 2, 'cả vòng chỉ còn 1 việc gốc + 1 kỳ kế tiếp');

console.log('OK - all task-logic checks passed');
