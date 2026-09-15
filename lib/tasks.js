'use strict';
/* Pure task logic: no Electron, no DOM. Shared by main process, renderer, and tests. */

const crypto = require('node:crypto');
const uid = () => crypto.randomUUID();

const PRIORITY = { 0: 'Không', 1: 'Thấp', 2: 'Trung bình', 3: 'Cao' };
const PRIORITY_WORDS = {
  khong: 0, 'không': 0, none: 0, thap: 1, 'thấp': 1, low: 1,
  'trung binh': 2, 'trung bình': 2, tb: 2, medium: 2, cao: 3, high: 3, 'cao nhất': 3,
};

const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const ymd = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

/* ---------- smart parse: "Họp team #công-việc !cao 15h ngày mai ~45p" ---------- */
function parseSmart(input, now = new Date()) {
  let s = ' ' + String(input) + ' ';
  const out = { title: '', tags: [], priority: 0, due: null, duration: 0 };

  s = s.replace(/#([\p{L}\p{N}_-]+)/gu, (_, t) => { out.tags.push(t); return ' '; });

  s = s.replace(/!(\p{L}+(?:\s\p{L}+)?)/u, (m, w) => {
    const key = w.trim().toLowerCase();
    if (!(key in PRIORITY_WORDS)) return m;
    out.priority = PRIORITY_WORDS[key];
    return ' ';
  });

  s = s.replace(/~(?:(\d+)\s*(?:p|m|phút|phut)|(\d+(?:[.,]\d+)?)\s*(?:h|giờ|gio|tiếng))/iu, (_, m, h) => {
    out.duration = m ? +m : Math.round(parseFloat(String(h).replace(',', '.')) * 60);
    return ' ';
  });

  let hour = null, min = 0;
  s = s.replace(/(\d{1,2})\s*(?:h|:|giờ|gio)\s*(\d{2})?/iu, (_, H, M) => {
    hour = +H; min = M ? +M : 0; return ' ';
  });
  if (hour === null) {
    s = s.replace(/(\d{1,2})\s*(?:h|giờ|gio)\b/iu, (_, H) => { hour = +H; return ' '; });
  }

  const base = startOfDay(now);
  let day = null;
  const dayRules = [
    [/hôm\s*nay|hom\s*nay|today/iu, () => base],
    [/ngày\s*mai|ngay\s*mai|\bmai\b|tomorrow/iu, () => addDays(base, 1)],
    [/\bmốt\b|\bmot\b/iu, () => addDays(base, 2)],
    [/hôm\s*kia|hom\s*kia/iu, () => addDays(base, -1)],
    [/tuần\s*sau|tuan\s*sau/iu, () => addDays(base, 7)],
    [/(\d{1,3})\s*ngày\s*nữa|(\d{1,3})\s*ngay\s*nua/iu, (_, n) => addDays(base, +n)],
    [/thứ\s*([2-7]|hai|ba|tư|bốn|năm|sáu|bảy)|chu\s*nhật|chủ\s*nhật/iu, (m, w) => {
      const map = { hai: 1, ba: 2, 'tư': 3, bốn: 3, 'năm': 4, 'sáu': 5, 'bảy': 6 };
      const target = w ? (map[w.toLowerCase()] ?? +w - 1) : 0;
      let d = addDays(base, 1);
      while (d.getDay() !== target) d = addDays(d, 1);
      return d;
    }],
    [/(\d{4})-(\d{1,2})-(\d{1,2})/, (_, y, m, d) => new Date(+y, +m - 1, +d)],
    [/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/, (_, d, m, y) => new Date(y ? (+y < 100 ? 2000 + +y : +y) : now.getFullYear(), +m - 1, +d)],
  ];
  for (const [re, fn] of dayRules) {
    if (re.test(s)) { day = fn(...s.match(re)); s = s.replace(re, ' '); break; }
  }

  if (day || hour !== null) {
    const d = day ? new Date(day) : new Date(base);
    if (hour !== null) d.setHours(hour, min, 0, 0);
    else d.setHours(23, 59, 0, 0);
    if (!day && hour !== null && d < now) d.setDate(d.getDate() + 1); // "3h" đã qua -> mai
    out.due = d.toISOString();
  }

  out.title = s.replace(/\s+/g, ' ').trim();
  return out;
}

/* ---------- recurrence ---------- */
const UNITS = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' };
const lastDayOfMonth = (y, m) => new Date(y, m + 1, 0).getDate();      // m: 0-11 -> 28/29/30/31
const weekStart = (d) => addDays(startOfDay(d), -((new Date(d).getDay() + 6) % 7));   // Thứ Hai đầu tuần

/* Giờ của lần lặp kế tiếp: có repeat.time ("07:00") thì dùng giờ đó, không thì giữ giờ của lần trước
   (việc "hằng ngày 9h" phải vẫn 9h). */
function withTime(d, r, base) {
  const out = new Date(d);
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(r.time || ''));
  if (m) out.setHours(+m[1], +m[2], 0, 0);
  else out.setHours(new Date(base).getHours(), new Date(base).getMinutes(), 0, 0);
  return out;
}

/* Lặp theo THỨ trong tuần: "hằng tuần vào T2, T4 lúc 7h", mỗi N tuần (repeat.days = [1, 3]).
   Nhảy thẳng tới tuần chứa `from` rồi mới dò từng ngày, nên việc bỏ quên nhiều kỳ vẫn ra đúng kỳ kế tiếp
   (dò từ hạn cũ sẽ trả về một ngày đã ở quá khứ). */
function nextOnWeekdays(r, base, from) {
  const n = Math.max(1, r.n || 1);
  const wBase = weekStart(base);
  const later = new Date(Math.max(from.getTime(), base.getTime()));
  const weeks = Math.round((weekStart(later).getTime() - wBase.getTime()) / (7 * 864e5));
  let k = Math.ceil(weeks / n) * n;                    // tuần đúng nhịp "mỗi N tuần"
  for (let guard = 0; guard < 8; guard++, k += n) {
    const w = addDays(wBase, k * 7);
    for (const wd of [...r.days].sort((a, b) => a - b)) {
      const c = addDays(w, (wd + 6) % 7);              // trong tuần: T2=0 … CN=6
      if (c > from && c > base) return withTime(c, r, base);
    }
  }
  return withTime(addDays(base, n * 7), r, base);
}

/* Lặp theo NGÀY trong tháng: "ngày 15 và cuối tháng" (repeat.days = [15, -1]).
   -1 = ngày CUỐI tháng, tự biết tháng đó 28/29/30/31. Ngày 31 rơi vào tháng ít ngày hơn thì lấy ngày
   cuối tháng đó (người dùng gõ "30 hoặc 31" là ý này). */
function nextOnMonthDays(r, base, from) {
  const n = Math.max(1, r.n || 1);
  const y0 = base.getFullYear(), m0 = base.getMonth();
  let k = Math.ceil(Math.max(0, (from.getFullYear() - y0) * 12 + (from.getMonth() - m0)) / n) * n;
  for (let guard = 0; guard < 24; guard++, k += n) {
    const y = y0 + Math.floor((m0 + k) / 12), mo = (m0 + k) % 12;
    const last = lastDayOfMonth(y, mo);
    const days = [...new Set(r.days.map((d) => (d === -1 ? last : Math.min(d, last))))].sort((a, b) => a - b);
    for (const day of days) {
      const c = new Date(y, mo, day, base.getHours(), base.getMinutes(), 0, 0);
      if (c > from && c > base) return withTime(c, r, base);
    }
  }
  return withTime(addDays(base, 30), r, base);
}

function nextDue(task, from = new Date()) {
  const r = task.repeat;
  if (!r || !r.type) return null;
  if (r.type === 'after') return addDays(from, r.n || 1).toISOString();
  const base = new Date(task.due || from);
  if (r.type === 'weekly' && (r.days || []).length) return nextOnWeekdays(r, base, from).toISOString();
  if (r.type === 'monthly' && (r.days || []).length) return nextOnMonthDays(r, base, from).toISOString();
  const KEY = { daily: ['Date', 864e5], weekly: ['Date', 7 * 864e5], monthly: ['Month', 0], yearly: ['FullYear', 0] };
  const [k, ms] = KEY[r.type];
  const d = new Date(base);
  const n = r.n || 1;
  if (ms) d.setTime(d.getTime() + n * ms); else d[`set${k}`](d[`get${k}`]() + n);
  while (d <= from) { if (ms) d.setTime(d.getTime() + ms); else d[`set${k}`](d[`get${k}`]() + 1); }
  return withTime(d, r, base).toISOString();
}

function toggleDone(tasks, id, done = null, now = new Date()) {
  const t = tasks.find((x) => x.id === id);
  if (!t) return;
  t.done = done === null ? !t.done : done;
  t.doneAt = t.done ? now.toISOString() : null;
  t.stage = t.done ? 'done' : (t.stage === 'done' ? 'todo' : t.stage);
  if (t.done) {
    for (const c of tasks.filter((x) => x.parentId === id)) toggleDone(tasks, c.id, true, now);
    const nd = nextDue(t, now);
    // Lần kế tiếp KHÔNG được thừa hưởng trạng thái của lần này: myDay/start/notifiedFor là
    // chuyện của lần đang xong. Nếu copy nguyên, việc daily/weekly vừa tick xong sẽ hiện lại
    // ngay trong "Hôm nay của tôi" (dù hạn mới là mai/tuần sau) — trông như chưa hề hoàn thành.
    if (nd) {
      const clone = { ...t, id: uid(), done: false, doneAt: null, stage: 'todo', due: nd, parentId: t.parentId, myDay: null, start: null, notifiedFor: null };
      tasks.push(clone);
    }
  }
}
/* ---------- hạn của việc cha–con ----------
   Hạn chỉ chảy TỪ CHA XUỐNG CON, không bao giờ ngược lên.
   Việc con mới sinh: theo hạn cha (dueOwn = false).
   Con tự đặt hạn tay -> dueOwn = true, cha đổi hạn cũng không ghi đè.
   Con xoá hạn -> quay về theo hạn cha. */
function applyDueToChildren(tasks, parentId, iso) {
  for (const c of tasks.filter((x) => x.parentId === parentId && !x.dueOwn)) {
    c.due = iso || null;
    if (iso && !c.remind) c.remind = { offsetMin: 10, repeat: false };
  }
}

function setDue(tasks, id, iso) {
  const t = tasks.find((x) => x.id === id);
  if (!t) return null;
  if (t.parentId) {
    // việc con: xoá hạn = "theo hạn của cha", không đụng tới cha
    const parent = tasks.find((x) => x.id === t.parentId);
    t.dueOwn = !!iso;
    t.due = iso || (parent && parent.due) || null;
    return t;
  }
  t.dueOwn = false;
  t.due = iso || null;
  applyDueToChildren(tasks, t.id, t.due);
  return t;
}

function inheritDue(tasks, task) {
  if (!task.parentId) return task;
  const parent = tasks.find((x) => x.id === task.parentId);
  if (parent && parent.due && !task.dueOwn) {
    task.due = parent.due;
    if (!task.remind) task.remind = { offsetMin: 10, repeat: false };
  }
  return task;
}

const subtaskProgress = (tasks, id) => {
  const kids = tasks.filter((t) => t.parentId === id);
  if (!kids.length) return null;
  return { total: kids.length, done: kids.filter((k) => k.done).length };
};

/* ---------- views ---------- */
const isToday = (d, now = new Date()) => d && ymd(d) === ymd(now);
const overdue = (t, now = new Date()) => t.due && !t.done && new Date(t.due) < startOfDay(now);

/* ----- "Hôm nay của tôi" (My Day) -----
   = việc ĐẾN HẠN hôm nay + việc đã TRỄ (làm sớm/muộn hôm nay) — như Microsoft To Do — cộng với
   việc bạn TỰ CHỌN bằng nút ☀ (việc không có hạn vẫn nằm đây được).
   Bấm bỏ một việc đang đến hạn/trễ ra khỏi My Day thì ghi myDaySkip = hôm nay -> ẩn hết hôm nay
   thôi, mai lại tự hiện (không xoá hạn của việc). Trước đây view này CHỈ có việc tự chọn nên việc
   đặt hôm nay không thấy đâu cả. */
/* "Hôm nay của tôi" cũng phải thấy việc LẶP có lịch rơi vào hôm nay (plannedToday) — nhóm
   "Chưa có hạn (làm thường xuyên)" sinh ra chính là cho loại việc này. Cả 2 khung dùng CHUNG
   plannedToday nên không còn cảnh "hiện ở khung này mà biến mất ở khung kia". */
const inMyDay = (t, now = new Date()) =>
  !t.done && (t.myDay === ymd(now)
    || ((isToday(t.due, now) || overdue(t, now) || plannedToday(t, now)) && t.myDaySkip !== ymd(now)));

/* Việc này có nằm trong KẾ HOẠCH HÔM NAY không:
   - đến hạn hôm nay, hoặc
   - việc LẶP mà lịch lặp rơi vào hôm nay.
   Vì sao cần: việc lặp ("hằng ngày", "hằng tuần vào T2 T4") thường KHÔNG có `due` — chúng được
   sinh ra theo lịch. Nếu "Hôm nay" chỉ soi `due` thì việc lặp nằm trong "Hôm nay của tôi" mà
   KHÔNG BAO GIỜ xuất hiện ở "Hôm nay" (đúng lỗi người dùng báo). */
function plannedToday(t, now = new Date()) {
  if (t.done) return false;
  if (isToday(t.due, now)) return true;
  const r = t.repeat;
  if (!r || !r.type) return false;
  const d = new Date(now), days = r.days || [];
  switch (r.type) {
    case 'daily': return true;
    case 'weekly': return days.length ? days.includes(d.getDay())
      : !!t.due && new Date(t.due).getDay() === d.getDay();
    case 'monthly': {
      const last = lastDayOfMonth(d.getFullYear(), d.getMonth());
      return days.length ? days.some((x) => Math.min(x === -1 ? last : x, last) === d.getDate())
        : !!t.due && new Date(t.due).getDate() === d.getDate();
    }
    case 'yearly': return !!t.due && new Date(t.due).getMonth() === d.getMonth() && new Date(t.due).getDate() === d.getDate();
    default: return false;   // 'after': tính từ lúc xong nên không biết trước được
  }
}

/* "Hôm nay của tôi" chia theo LÝ DO việc nằm trong đó — thứ tự mảng này cũng là thứ tự hiển thị:
   today  = đến hạn hôm nay        late   = đã quá hạn chót
   nodate = không có hạn (việc làm thường xuyên: hằng ngày/tuần/tháng/năm)
   pick   = tự chọn bằng ☀ mà hạn còn ở tương lai */
const MYDAY_SECTIONS = ['today', 'late', 'nodate', 'pick'];
function myDaySection(t, now = new Date()) {
  if (!t.due) return 'nodate';
  if (ymd(t.due) === ymd(now)) return 'today';
  return new Date(t.due) < startOfDay(now) ? 'late' : 'pick';
}

function view(tasks, name, now = new Date()) {
  const top = tasks.filter((t) => !t.parentId);
  switch (name) {
    case 'myday': return top.filter((t) => inMyDay(t, now));
    // "Hôm nay" = việc đến hạn HÔM NAY + việc lặp có lịch rơi vào hôm nay (việc quá hạn đã tách
    // sang "Trễ hẹn" riêng).
    case 'today': return top.filter((t) => plannedToday(t, now));
    // "Trễ hẹn" = gom mọi việc đã quá hạn chót (chưa xong), cũ nhất lên trước cho dễ xử lý.
    case 'late': return top.filter((t) => overdue(t, now)).sort((a, b) => new Date(a.due) - new Date(b.due));
    case 'upcoming': return top.filter((t) => !t.done && t.due && new Date(t.due) > now && !isToday(t.due, now));
    case 'nodate': return top.filter((t) => !t.done && !t.due);
    case 'completed': return tasks.filter((t) => t.done).sort((a, b) => String(b.doneAt).localeCompare(String(a.doneAt)));
    default: return top.filter((t) => t.listId === name);
  }
}

/* ---------- auto-schedule: greedy fill of free gaps in the day ---------- */
function autoSchedule(tasks, now = new Date(), { dayStart = 9, dayEnd = 18 } = {}) {
  const day = startOfDay(now);
  const busy = tasks
    .filter((t) => !t.done && t.start && ymd(t.start) === ymd(day))
    .map((t) => [new Date(t.start), new Date(new Date(t.start).getTime() + (t.duration || 30) * 60000)])
    .sort((a, b) => a[0] - b[0]);

  const plan = [];
  let cursor = Math.max(day.getTime() + dayStart * 36e5, now.getTime());
  const end = day.getTime() + dayEnd * 36e5;
  const queue = tasks
    .filter((t) => !t.done && !t.start && t.duration)
    .sort((a, b) => (new Date(a.due || 8.64e15)) - (new Date(b.due || 8.64e15)) || b.priority - a.priority);

  for (const t of queue) {
    const dur = t.duration * 60000;
    for (const [bs, be] of busy) if (cursor < be.getTime() && cursor + dur > bs.getTime()) cursor = be.getTime();
    if (cursor + dur > end) break;
    plan.push({ id: t.id, start: new Date(cursor).toISOString() });
    busy.push([new Date(cursor), new Date(cursor + dur)]);
    busy.sort((a, b) => a[0] - b[0]);
    cursor += dur;
  }
  return plan;
}

/* ---------- productivity stats ---------- */
function stats(tasks, days = 14, now = new Date()) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = ymd(addDays(now, -i));
    out.push({ day: d, done: tasks.filter((t) => t.done && t.doneAt && ymd(t.doneAt) === d).length });
  }
  return out;
}

module.exports = {
  uid, PRIORITY, parseSmart, nextDue, toggleDone, subtaskProgress,
  view, inMyDay, plannedToday, myDaySection, MYDAY_SECTIONS, autoSchedule, stats, ymd, addDays, startOfDay, isToday, overdue,
  setDue, inheritDue, applyDueToChildren,
};
