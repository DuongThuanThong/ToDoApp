'use strict';
/* Nhắc nhở: notification hệ điều hành + toast trong app (có nút Xong / Hoãn) */
const { app, Notification, BrowserWindow } = require('electron');
const S = require('./store');
const W = require('./windows');

function dueNow(now = Date.now()) {
  const out = [];
  for (const t of S.get().tasks) {
    if (t.done || !t.due || !t.remind) continue;
    const at = new Date(t.due).getTime() - (t.remind.offsetMin || 0) * 60000;
    const rep = !!t.remind.repeat;
    const key = t.id + '|' + t.due + '|' + (rep ? Math.floor(now / 6e5) : 0);
    // lặp lại: kêu mỗi 10 phút khi đã tới giờ; một lần: chỉ kêu trong 10 phút đầu
    const fresh = rep ? now >= at : (at <= now && now - at < 6e5);
    if (fresh && t.notifiedFor !== key) out.push({ t, key, at });
  }
  return out;
}

function notify(t) {
  const hhmm = t.due ? new Date(t.due).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '';
  if (Notification.isSupported()) {
    const n = new Notification({ title: 'Đến giờ rồi!', body: `${t.title}${hhmm ? ' · ' + hhmm : ''}`, icon: W.ICON });
    n.on('click', () => W.showMain());
    n.show();
  }
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('alert', t);
  W.showMini(false);
}

// người dùng bấm "Thử thông báo" trong Tuỳ biến: kêu đúng như lúc tới hạn thật (để biết nó kêu ra sao)
function testAlert() {
  notify({ id: 'test', title: 'Việc mẫu — thông báo nhắc hạn trông như thế này', due: new Date().toISOString() });
  return true;
}

function checkReminders(now = Date.now()) {
  const due = dueNow(now);
  for (const { t, key } of due) {
    t.notifiedFor = key;
    notify(t);
  }
  if (due.length) S.save();
  return due.length;
}

function start() {
  setInterval(checkReminders, 30000);
  setTimeout(checkReminders, 3000);
}

module.exports = { dueNow, checkReminders, start, notify, testAlert };
