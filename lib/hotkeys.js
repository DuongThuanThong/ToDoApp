'use strict';
/* Phím tắt toàn cục. Một chỗ duy nhất đăng ký/huỷ -> không còn "phím cũ vẫn chạy".
   Máy thật hay bị app khác (IME tiếng Việt, PowerToys, Snip) chiếm mất tổ hợp, nên phải có
   danh sách dự phòng + BÁO LẠI cho người dùng biết phím nào thực sự đang chạy.

   QUAN TRỌNG: settings.hotkey = tổ hợp NGƯỜI DÙNG CHỌN (giữ nguyên, không ghi đè).
   settings.hotkeyLive = tổ hợp THẬT SỰ đang đăng ký được (có thể là dự phòng).
   Trước đây ghi đè hotkey bằng dự phòng nên người dùng tưởng đã đổi phím mà không phải
   -> "tôi đặt Ctrl+Alt+R mà Ctrl+Alt+T vẫn chạy". */
const { globalShortcut } = require('electron');
const S = require('./store');
const W = require('./windows');

// Thử lần lượt, cái nào đăng ký được thì dùng. Ctrl+Alt+* hay bị app khác chiếm trên Windows.
const MINI_FALLBACK = ['CommandOrControl+Shift+Space', 'CommandOrControl+Shift+T', 'CommandOrControl+Shift+F12'];
const QUICK_FALLBACK = ['CommandOrControl+Shift+A', 'CommandOrControl+Shift+N', 'CommandOrControl+Alt+Space'];

function tryFirst(list, fn) {
  for (const accel of list) {
    if (!accel) continue;
    try { if (globalShortcut.register(accel, fn)) return accel; } catch { /* bị chiếm -> thử cái kế */ }
  }
  return '';
}

/* Đăng ký lại TỪ ĐẦU: unregisterAll() là cách duy nhất chắc chắn không còn phím mồ côi
   (đổi phím 3 lần vẫn sạch). */
function registerAll(wantHotkey) {
  const s = S.get().settings;
  const want = (wantHotkey || s.hotkey || '').trim();
  globalShortcut.unregisterAll();
  const live = tryFirst([...new Set([want, ...MINI_FALLBACK])], W.toggleMini);
  const quickAdd = tryFirst(QUICK_FALLBACK.filter((a) => a !== live), W.quickAdd);
  s.hotkey = want || live;      // giữ đúng ý người dùng
  s.hotkeyLive = live;          // phím đang chạy thật
  s.quickAdd = quickAdd;
  S.save();
  return { hotkey: live, wanted: want, quickAdd, hotkeyOk: !!live, quickAddOk: !!quickAdd, fellBack: !!want && live !== want };
}

function setHotkey(accel) {
  const s = S.get().settings;
  const old = s.hotkey;
  if (typeof accel !== 'string' || !accel.trim()) return { ok: false, wanted: old, live: s.hotkeyLive || '', reason: 'empty' };
  const r = registerAll(accel.trim());
  if (!r.hotkeyOk) { registerAll(old); return { ok: false, wanted: old, live: S.get().settings.hotkeyLive || '', reason: 'none' }; }
  return { ok: true, wanted: r.wanted, live: r.hotkey, fellBack: r.fellBack };
}

module.exports = { registerAll, setHotkey };
