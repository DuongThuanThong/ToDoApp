'use strict';
/* Cầu nối renderer ↔ main. Một chỗ khai báo toàn bộ kênh IPC. */
const { ipcMain, dialog, Notification } = require('electron');
const S = require('./store');
const W = require('./windows');
const H = require('./hotkeys');
const A = require('./autostart');
const ST = require('./app-state');
const { toggleDone, setDue, inheritDue } = require('./tasks');
const R = require('./reminders');

function register() {
  ipcMain.handle('db:load', () => S.get());
  ipcMain.handle('db:save', (e, next) => { S.set(next); S.save(true, e.sender); return true; });

  ipcMain.handle('dialog:pickImage', async () => {
    const r = await dialog.showOpenDialog(W.main(), {
      properties: ['openFile'],
      filters: [{ name: 'Ảnh', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }],
    });
    return r.canceled ? null : r.filePaths[0];
  });

  ipcMain.handle('dialog:pickSound', async () => {
    const r = await dialog.showOpenDialog(W.main(), {
      properties: ['openFile'],
      filters: [{ name: 'Âm thanh', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'webm'] }],
    });
    return r.canceled ? null : r.filePaths[0];
  });

  ipcMain.handle('win:action', (_e, a) => {
    const m = W.main();
    if (!m) return;
    if (a === 'min') m.minimize();
    if (a === 'max') m.isMaximized() ? m.unmaximize() : m.maximize();
    if (a === 'close') m.hide();
  });

  const edge = () => W.edgeNow();
  ipcMain.handle('mini:toggle', () => { W.toggleMini(); return W.state.collapsed.v; });
  ipcMain.handle('mini:expand', () => { W.expandMini(); return true; });
  ipcMain.handle('mini:collapse', () => { W.collapseMini(edge()); return true; });
  ipcMain.handle('mini:show', () => { W.showMini(); return true; });
  ipcMain.handle('mini:hide', () => { W.hideMini(); return true; });
  ipcMain.handle('mini:reset', () => { W.showMini(); return true; });
  ipcMain.handle('mini:peek', (_e, on) => {
    const miniWin = W.mini();
    if (!miniWin || miniWin.isDestroyed()) return false;
    if (!on) {
      if (!W.state.peek.v) return false;
      W.state.peek.v = false;
      W.collapseMini(edge());
      return true;
    }
    if (S.get().settings.peek === false) return false;
    if (!W.state.collapsed.v && !W.state.peek.v) return false; // người dùng đang mở sẵn -> hover không đụng
    W.expandMini();
    W.state.peek.v = true;  // expandMini() tự xoá cờ này -> bật lại sau khi đã mở
    return true;
  });

  ipcMain.handle('app:hotkey', (_e, accel) => H.setHotkey(accel));
  ipcMain.handle('open:main', () => { W.showMain(); return true; });
  ipcMain.handle('notify', (_e, { title, body }) => { if (Notification.isSupported()) new Notification({ title, body, icon: W.ICON }).show(); return true; });
  ipcMain.handle('app:autostart', (_e, v) => A.set(v));
  ipcMain.handle('app:quit', () => { ST.quitting = true; require('electron').app.quit(); });

  ipcMain.handle('task:snooze', (_e, { id, minutes }) => {
    const t = S.get().tasks.find((x) => x.id === id);
    if (!t) return false;
    t.due = new Date(Date.now() + minutes * 60000).toISOString();
    t.notifiedFor = null;
    S.save();
    return true;
  });

  ipcMain.handle('task:toggle', (_e, { id, done }) => {
    toggleDone(S.get().tasks, id, done);
    S.save();
    return S.get().tasks;
  });

  ipcMain.handle('app:testAlert', () => R.testAlert());

  // đặt hạn phải đi qua đây: luật cha→con nằm trong lib/tasks.js, không lặp lại ở renderer
  ipcMain.handle('task:setDue', (e, { id, due }) => { setDue(S.get().tasks, id, due); S.save(true, e.sender); return S.get().tasks; });

  // tạo việc cũng phải đi qua MAIN: renderer nhận bản sao của mảng tasks (contextBridge) nên
  // mọi hàm sửa dữ liệu gọi từ renderer chỉ sửa vào bản sao -> "ấn mà không thấy gì đổi".
  ipcMain.handle('task:add', (e, task) => {
    const tasks = S.get().tasks;
    tasks.push(task);
    inheritDue(tasks, task);          // việc con mới: theo hạn cha (hạn chỉ chảy cha -> con)
    S.save(true, e.sender);
    return { tasks, task };
  });
}

module.exports = { register };
