'use strict';
/* Lưu trữ: đọc/ghi todoapp.json + dữ liệu mặc định. Không biết gì về window/IPC. */
const path = require('node:path');
const fs = require('node:fs');
const { app } = require('electron');

const DB_PATH = path.join(app.getPath('userData'), 'todoapp.json');

const DEFAULT = () => ({
  folders: [],
  lists: [{ id: 'inbox', name: 'Inbox', folderId: null }],
  tasks: [],
  trash: [],                     // việc đã xoá: giữ lại để khôi phục, không mất ngay
  settings: {
    theme: 'dark', accent: '#5b8cff', radius: 12, blur: 14, opacity: 0.92,
    font: 'Segoe UI', fontSize: 14, bg: '', bgOpacity: 0.55, bgBlur: 0,
    edge: 'right', autoHide: true, reminderOffset: 10, autostart: false,
    hotkey: 'CommandOrControl+Shift+Space', tabSize: 10, collapse: 'tab', peek: true,
    miniSize: null, openOnAdd: true, miniOn: false,   // miniOn: cửa sổ mini đang bật -> mở máy lên tự bật lại
    // phím tắt TRONG app (không chiếm phím của hệ điều hành)
    keys: { newTask: 'mod+n', closeDetail: 'mod+w', filter: 'mod+l', search: 'mod+f', mini: 'mod+m', myDay: 'mod+d' },
  },
});

const KEY_LABELS = {
  newTask: 'Tạo việc mới', closeDetail: 'Đóng bảng chi tiết', filter: 'Mở bảng lọc',
  search: 'Tìm kiếm', mini: 'Mở/ẩn cửa sổ mini', myDay: 'Mở "Hôm nay của tôi"',
};

let db = null;
let saveTimer = null;

const TRASH_DAYS = 30;   // việc nằm trong thùng rác quá lâu thì dọn hẳn, khỏi phình file dữ liệu

/* Dọn thùng rác: bỏ những việc đã xoá quá TRASH_DAYS ngày. Trả về số việc đã dọn. */
function purgeTrash(db, days = TRASH_DAYS) {
  const list = db.trash || [];
  const cut = Date.now() - days * 864e5;
  const keep = list.filter((t) => !t.deletedAt || new Date(t.deletedAt).getTime() > cut);
  db.trash = keep;
  return list.length - keep.length;
}

function load() {
  const read = (p) => {
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    const d = DEFAULT();
    return {
      ...d, ...raw,
      settings: { ...d.settings, ...(raw.settings || {}), keys: { ...d.settings.keys, ...((raw.settings || {}).keys || {}) } },
    };
  };
  try { const d = read(DB_PATH); purgeTrash(d); return d; } catch { /* file chính hỏng/thiếu -> thử bản dự phòng */ }
  try {
    const bak = read(DB_PATH + '.bak');
    console.warn('[store] todoapp.json hỏng/thiếu — đã phục hồi từ todoapp.json.bak');
    purgeTrash(bak);
    return bak;
  } catch { return DEFAULT(); }
}

function get() { if (!db) db = load(); return db; }
function set(next) { db = next; return db; }

/* Ghi thật sự, KHÔNG qua debounce. Ghi ra file tạm rồi rename — rename là nguyên tử nên
   không bao giờ còn lại file .json cụt (mất điện / kill app giữa lúc ghi = mất sạch dữ liệu). */
const BAK_PATH = DB_PATH + '.bak';
function writeNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  const json = JSON.stringify(get(), null, 1);
  fs.writeFileSync(DB_PATH + '.tmp', json);
  try { if (fs.existsSync(DB_PATH)) fs.copyFileSync(DB_PATH, BAK_PATH); } catch { /* thiếu bản dự phòng không chặn việc lưu */ }
  fs.renameSync(DB_PATH + '.tmp', DB_PATH);
  return true;
}

function save(broadcast = true, except = null) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    writeNow();
    if (broadcast) for (const w of require('electron').BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed() && w.webContents !== except) w.webContents.send('db', get());
    }
  }, 250);
}

/* Gọi lúc thoát app: debounce 250ms mà chưa kịp chạy thì thay đổi cuối cùng sẽ MẤT. */
function flush() { if (saveTimer) writeNow(); }

/* dữ liệu mẫu cho --smoke: chạy trên userData tạm nên không đụng dữ liệu thật */
function seedSmoke() {
  fs.rmSync(DB_PATH, { force: true });   // luôn dựng lại: dữ liệu smoke phải tất định
  fs.rmSync(DB_PATH + '.bak', { force: true });
  fs.rmSync(DB_PATH + '.tmp', { force: true });
  const uid = () => require('node:crypto').randomUUID();
  const iso = (h, m = 0, d = 0) => { const x = new Date(); x.setDate(x.getDate() + d); x.setHours(h, m, 0, 0); return x.toISOString(); };
  const T = (o) => ({ id: uid(), done: false, doneAt: null, stage: 'todo', duration: 0, priority: 0, tags: [], listId: 'inbox', parentId: null, notes: '', repeat: null, remind: null, myDay: null, notifiedFor: null, start: null, createdAt: new Date().toISOString(), ...o });
  const p = T({ title: 'Nộp báo cáo PPNC nhóm 5', priority: 3, tags: ['ppnc'], due: iso(15), duration: 45, myDay: new Date().toISOString().slice(0, 10), remind: { offsetMin: 10, repeat: false } });
  const c1 = T({ title: 'Viết phần Introduction', parentId: p.id, due: iso(11), dueOwn: true });
  const c2 = T({ title: 'Vẽ biểu đồ Results', parentId: p.id, done: true, doneAt: new Date().toISOString(), stage: 'done' });
  const d = T({ title: 'Học tiếng Anh 1h', priority: 2, tags: ['english'], due: iso(20), duration: 60, repeat: { type: 'daily', n: 1 }, myDay: new Date().toISOString().slice(0, 10) });
  const e = T({ title: 'Genshin daily', priority: 1, tags: ['game'], listId: 'inbox', duration: 30, start: iso(22) });
  fs.writeFileSync(DB_PATH, JSON.stringify({ folders: [], lists: [{ id: 'inbox', name: 'Inbox', folderId: null }, { id: uid(), name: 'Học tập', folderId: null }], tasks: [p, c1, c2, d, e], settings: { miniOn: true } }, null, 1));   // miniOn: để probe MINI-BOOT kiểm đúng đường "mở máy lên tự bật lại"
}

module.exports = { DB_PATH, DEFAULT, KEY_LABELS, load, get, set, save, flush, writeNow, purgeTrash, seedSmoke };
