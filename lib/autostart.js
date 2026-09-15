'use strict';
/* Tự chạy cùng Windows (registry Run qua Electron loginItemSettings) */
const { app } = require('electron');

// Registry là tài nguyên CỦA HỆ THỐNG, không phải của app: smoke chạy với userData tạm nhưng vẫn dùng
// chung 1 registry -> phải ghi vào TÊN VALUE RIÊNG, nếu không mỗi lượt smoke tắt xong là xoá mất
// auto-start thật của người dùng (đã xảy ra: mở máy lên app không tự chạy nữa).
const SMOKE = process.argv.includes('--smoke');
const NAME = SMOKE ? 'com.thong.todoapp.smoke' : 'com.thong.todoapp';

// Windows bắt buộc kèm path + args, thiếu args thì auto-start chỉ mở electron.exe rỗng
const args = () => (app.isPackaged ? [] : [app.getAppPath()]);
function set(on) {
  app.setLoginItemSettings({ openAtLogin: !!on, path: process.execPath, args: args(), name: NAME });
  return app.getLoginItemSettings({ path: process.execPath, args: args() }).openAtLogin;
}
module.exports = { set, NAME };
