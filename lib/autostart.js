'use strict';
/* Tự chạy cùng Windows (registry Run qua Electron loginItemSettings) */
const { app } = require('electron');

// Windows bắt buộc kèm path + args, thiếu args thì auto-start chỉ mở electron.exe rỗng
const args = () => (app.isPackaged ? [] : [app.getAppPath()]);
function set(on) {
  app.setLoginItemSettings({ openAtLogin: !!on, path: process.execPath, args: args() });
  return app.getLoginItemSettings({ path: process.execPath, args: args() }).openAtLogin;
}
module.exports = { set };
