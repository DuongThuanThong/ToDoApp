'use strict';
/* ToDoApp — điểm vào: vòng đời app, cửa sổ, phím tắt, nhắc nhở.
   Chi tiết theo từng việc nằm ở lib/: store (dữ liệu), windows (cửa sổ), ipc (kênh),
   hotkeys (phím toàn cục), reminders (nhắc việc), autostart, smoke (tự kiểm tra). */
const path = require('node:path');
const fs = require('node:fs');
const { app, Menu } = require('electron');

const SMOKE = process.argv.includes('--smoke');
if (SMOKE) {  // smoke chạy trên userData tạm, không đụng dữ liệu thật
  const tmp = path.join(require('node:os').tmpdir(), 'todoapp-smoke');
  fs.mkdirSync(tmp, { recursive: true });
  app.setPath('userData', tmp);
}

const S = require('./lib/store');
if (SMOKE) S.seedSmoke();
const W = require('./lib/windows');
const H = require('./lib/hotkeys');
const R = require('./lib/reminders');
const IPC = require('./lib/ipc');
const A = require('./lib/autostart');
const ST = require('./lib/app-state');

if (!app.requestSingleInstanceLock()) {
  // Đã có bản khác đang chạy: hai bản cùng giữ phím tắt + cùng ghi 1 file json
  // -> phím tắt cũ "ma" vẫn kêu, và ghi đè lẫn nhau làm mất việc.
  app.quit();
} else {
  app.on('second-instance', () => W.showMain());
  app.setAppUserModelId('com.thong.todoapp');
  app.on('window-all-closed', () => {});   // app chạy nền: đóng cửa sổ không thoát
  app.on('before-quit', () => { ST.quitting = true; S.flush(); });   // đẩy nốt thay đổi đang chờ ghi (debounce 250ms)

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);  // bỏ menu mặc định: trả Ctrl+W / Ctrl+N về cho app
    S.save(false);                  // ghi file ngay khi mở -> biết chắc dữ liệu nằm ở đâu
    W.createMain();
    // Cửa sổ mini: tự bật lại nếu lúc trước nó đang bật (trước đây khởi động máy xong phải bấm tay).
    if (S.get().settings.miniOn) W.showMini();
    W.createTray();
    IPC.register();
    const hk = H.registerAll();
    console.log(`HOTKEY chon=${hk.wanted} dangchay=${hk.hotkey} ok=${hk.hotkeyOk} quickadd=${hk.quickAdd} ok=${hk.quickAddOk} duphong=${hk.fellBack}`);
    R.start();
    // Thùng rác tự dọn: việc đã xoá quá 30 ngày thì mất hẳn (kiểm mỗi ngày một lần cho app chạy lâu ngày).
    const purge = () => { if (S.purgeTrash(S.get())) S.save(false); };
    purge();
    setInterval(purge, 864e5).unref?.();
    if (S.get().settings.autostart) A.set(true);
    if (SMOKE) require('./lib/smoke')();
  });
}
