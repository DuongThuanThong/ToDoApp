'use strict';
/* Cửa sổ: cửa sổ chính + mini neo mép + tray. Mọi thứ liên quan hình học cửa sổ nằm ở đây. */
const path = require('node:path');
const { BrowserWindow, Tray, Menu, screen, nativeImage } = require('electron');
const S = require('./store');

const ICON = path.join(__dirname, '..', 'icon.png');
const trayIcon = () => nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 });
const PRE = path.join(__dirname, '..', 'preload.js');
const UI = path.join(__dirname, '..', 'renderer', 'index.html');

let mainWin = null, miniWin = null, tray = null;
const collapsed = { v: false };
const peek = { v: false };              // đang hover-peek -> đừng tự thu vào mép
let expandedBounds = null;
const SNAP = 14;                        // bắt mép màn hình trong khoảng này (px)
const TAB_LEN = 44;                     // chiều dài thanh mép (px)
const TAB_MIN = 42;                     // bề dày tối thiểu của thanh mép (DIP) — xem collapseMini
const MINI_MIN = [220, 150];            // mini nhỏ nhất cho phép
const tabSize = () => Math.max(4, Math.min(24, +(S.get().settings.tabSize ?? 10)));

/* ---------------- cửa sổ chính ---------------- */
function createMain() {
  mainWin = new BrowserWindow({
    width: 1100, height: 720, minWidth: 720, minHeight: 480,
    frame: false, backgroundColor: '#15171c', show: false, icon: ICON,
    webPreferences: { preload: PRE, contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  mainWin.loadFile(UI);
  mainWin.once('ready-to-show', () => mainWin.show());
  // menu mặc định của Electron giữ Ctrl+W (đóng cửa sổ) -> phím tắt trong app không bao giờ chạy
  mainWin.on('close', (e) => { if (!require('./app-state').quitting) { e.preventDefault(); mainWin.hide(); } });
  return mainWin;
}
function showMain() {
  if (!mainWin || mainWin.isDestroyed()) createMain();
  mainWin.show(); mainWin.focus();
  return mainWin;
}

/* ---------------- mini ---------------- */
function miniSize() {
  const s = S.get().settings.miniSize || {};
  return { W: Math.max(MINI_MIN[0], Math.round(+s.w) || 300), H: Math.max(MINI_MIN[1], Math.round(+s.h) || 380) };
}
function miniAnchor(edge) {
  const wa = screen.getPrimaryDisplay().workArea;
  const { W, H } = miniSize();
  return {
    left: { x: wa.x, y: wa.y + 120, width: W, height: H },
    right: { x: wa.x + wa.width - W, y: wa.y + 120, width: W, height: H },
    top: { x: wa.x + wa.width - W - 40, y: wa.y, width: W, height: H },
    bottom: { x: wa.x + wa.width - W - 40, y: wa.y + wa.height - H, width: W, height: H },
  }[edge] || { x: wa.x + wa.width - W, y: wa.y + 120, width: W, height: H };
}

function createMini() {
  const b = miniAnchor(S.get().settings.edge);
  miniWin = new BrowserWindow({
    ...b, minWidth: MINI_MIN[0], minHeight: MINI_MIN[1],
    frame: false, transparent: true, alwaysOnTop: true, skipTaskbar: true, icon: ICON,
    resizable: true, show: false,
    webPreferences: { preload: PRE, contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  miniWin.setAlwaysOnTop(true, 'floating');
  miniWin.loadFile(UI, { query: { mini: '1' } });
  miniWin.on('close', (e) => { if (!require('./app-state').quitting) { e.preventDefault(); putAway(); } });
  miniWin.on('blur', () => { if (S.get().settings.autoHide && !collapsed.v && !peek.v) putAway(); });
  for (const ev of ['moved', 'resized']) miniWin.on(ev, () => {
    clearTimeout(miniWin._t);
    miniWin._t = setTimeout(() => {
      const bb = miniWin.getBounds();
      // nhớ kích thước người dùng tự kéo (bỏ qua lúc thu gọn / hover-peek)
      if (!collapsed.v && !peek.v && bb.width > MINI_MIN[0] && bb.height > MINI_MIN[1]) {
        expandedBounds = bb;
        S.get().settings.miniSize = { w: bb.width, h: bb.height };
        S.save(false); // không cần broadcast: UI không đọc miniSize
      }
      edgeCheck();
    }, 250);
  });
  return miniWin;
}

/* Ẩn hẳn cửa sổ mini = ý người dùng -> ghi miniOn=false để lần mở máy sau KHÔNG tự bật lại. */
function hideMini() {
  if (miniWin && !miniWin.isDestroyed()) miniWin.hide();
  if (S.get().settings.miniOn) { S.get().settings.miniOn = false; S.save(false); }
}
const edgeNow = () => (S.get().settings.edge === 'manual' ? 'right' : S.get().settings.edge);
/* "Cất đi": tôn trọng lựa chọn của người dùng. Chọn "Thanh mũi tên" -> chỉ thu về thanh mép
   (thanh vẫn nằm ở cạnh màn hình); chọn "Ẩn hẳn" -> collapseMini tự ẩn cửa sổ.
   Trước đây blur / phím tắt / đóng cửa sổ đều gọi hideMini() nên thanh mũi tên biến mất. */
function putAway() { collapseMini(edgeNow()); }
function showMini(expand = true) {
  if (!miniWin || miniWin.isDestroyed()) createMini();
  if (S.get().settings.autoHide === false) collapsed.v = false;
  // Nhớ là mini đang BẬT để lần khởi động máy sau tự bật lại (trước đây phải bấm tay).
  if (!S.get().settings.miniOn) { S.get().settings.miniOn = true; S.save(false); }
  miniWin.showInactive();
  miniWin.setAlwaysOnTop(true, 'floating');
  if (expand) expandMini();
}
function toggleMini() {
  if (miniWin && !miniWin.isDestroyed() && miniWin.isVisible() && !collapsed.v) putAway();
  else showMini();
}
function quickAdd() {
  if (!miniWin || miniWin.isDestroyed()) createMini();
  showMini();
  miniWin.webContents.send('mini:focus-add');
}

function edgeOf(b) {
  const wa = screen.getPrimaryDisplay().workArea;
  if (b.x <= wa.x + SNAP) return 'left';
  if (b.x + b.width >= wa.x + wa.width - SNAP) return 'right';
  if (b.y <= wa.y + SNAP) return 'top';
  if (b.y + b.height >= wa.y + wa.height - SNAP) return 'bottom';
  return null;
}

function collapseMini(edge) {
  if (!miniWin || miniWin.isDestroyed()) return;
  const b = miniWin.getBounds();
  if (!expandedBounds) expandedBounds = b;
  const wa = screen.getPrimaryDisplay().workArea;
  collapsed.v = true;
  peek.v = false;
  if (S.get().settings.collapse === 'hidden') { miniWin.hide(); return; } // ẩn hẳn: không chiếm pixel nào
  // Cửa sổ thu gọn KHÔNG nhỏ hơn được ~41 DIP (Windows chặn). Trước đây xin tabSize=9:
  //   - cửa sổ THẬT vẫn ~41 DIP rộng (65px), nhưng vị trí canh theo 9 DIP -> cửa sổ đặt lùi vào trong,
  //     phần lòi ra ngoài mép màn hình ~50px;
  //   - vùng vẽ của renderer chỉ 11 DIP (17px) nằm ở góc trên-trái -> thanh mép chỉ còn một khe ~14px
  //     sát mép màn hình, lại tô bằng --primary (bị accent #3d3d3d ghi đè thành xám gần đen) nên coi
  //     như vô hình: người dùng chỉ còn cách bấm phím tắt.
  // (Số đo trước đây "bị lòi 40px" là do trộn toạ độ: PowerShell là tiến trình DPI-unaware nên báo màn
  //  1536x864, còn Electron dùng scaleFactor 1.5625 -> màn thật 1920x1080. Quy đổi cùng hệ thì kết luận
  //  vẫn đúng: cửa sổ rộng hơn dự tính nên thanh chỉ còn khe hẹp ở mép.)
  // Vì không thể nhỏ hơn: xin hẳn >= TAB_MIN DIP để cửa sổ, vùng vẽ và vị trí khớp nhau.
  const T = Math.max(TAB_MIN, tabSize()), L = TAB_LEN;
  const cy = Math.min(Math.max(b.y, wa.y), wa.y + wa.height - L);
  const cx = Math.min(Math.max(b.x, wa.x), wa.x + wa.width - L);
  const tab = {
    left: { x: wa.x, y: cy, width: T, height: L },
    right: { x: wa.x + wa.width - T, y: cy, width: T, height: L },
    top: { x: cx, y: wa.y, width: L, height: T },
    bottom: { x: cx, y: wa.y + wa.height - T, width: L, height: T },
  }[edge] || { x: wa.x + wa.width - T, y: cy, width: T, height: L };
  // tắt resizable + hạ min-size trước setBounds, nếu không Windows clamp -> thanh mép phình to
  miniWin.setResizable(false);
  miniWin.setMinimumSize(T, L);
  miniWin.setBounds(tab);
  // Không canh lại thanh theo getBounds() được: Electron báo 11x45 nhưng cửa sổ THẬT là 51x57 px (đo
  // bằng Win32) — Windows ép bề rộng tối thiểu ~41 DIP rồi Electron vẫn trả kích thước đã yêu cầu.
  // => thanh mép lòi ra ngoài màn hình (đo thật: ở x=1525 trên màn 1536 -> chỉ còn ~11px thấy được,
  // người dùng tưởng mini biến mất, chỉ còn cách bấm phím tắt). Vì không cửa sổ nào nhỏ hơn được, thanh
  // được vẽ ở GÓC TRÊN-TRÁI của cửa sổ (phần chắc chắn nằm trong màn hình) — xem .edge-tab trong app.css.
  miniWin.webContents.send('mini:state', { collapsed: true, edge });
}

function expandMini() {
  if (!miniWin || miniWin.isDestroyed()) return;
  const edge = S.get().settings.edge;
  const wa = screen.getPrimaryDisplay().workArea;
  let b = expandedBounds && expandedBounds.width > 60 ? expandedBounds : miniAnchor(edge);
  b = {
    x: Math.min(Math.max(b.x, wa.x), wa.x + wa.width - b.width),
    y: Math.min(Math.max(b.y, wa.y), wa.y + wa.height - b.height),
    width: b.width, height: b.height,
  };
  collapsed.v = false;
  peek.v = false;
  miniWin.setResizable(true);
  miniWin.setMinimumSize(MINI_MIN[0], MINI_MIN[1]);
  miniWin.setBounds(b);
  miniWin.showInactive();
  miniWin.setAlwaysOnTop(true, 'floating');
  miniWin.webContents.send('mini:state', { collapsed: false, edge });
}

function edgeCheck() {
  if (!miniWin || miniWin.isDestroyed() || !miniWin.isVisible()) return;
  if (peek.v) return; // đang hover-peek, đừng tự thu
  // ĐANG LÀ THANH MÉP thì không có gì để thu nữa. Thiếu chốt này thì mỗi lần collapseMini canh lại vị
  // trí lại sinh ra sự kiện resize -> edgeCheck -> thu gọn lần nữa -> hai vị trí đá nhau liên tục, và
  // thanh mép bị đẩy lòi ra ngoài màn hình. (Chốt theo bề rộng bên dưới không đủ: Windows ép bề rộng
  // thật ~41px chứ không phải tabSize, nên phép so `<= tabSize + 4` không nhận ra thanh mép.)
  if (collapsed.v) return;
  const b = miniWin.getBounds();
  if (b.width <= tabSize() + 4 || b.height <= tabSize() + 4) return; // đang ở dạng tab
  if (S.get().settings.edge !== 'manual') expandedBounds = b;
  const e = edgeOf(b);
  if (e && S.get().settings.autoHide) { expandedBounds = b; collapseMini(e); }
}

function createTray() {
  tray = new Tray(trayIcon());
  tray.setToolTip('ToDoApp');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Mở ToDoApp', click: () => showMain() },
    { label: 'Cửa sổ mini', click: () => showMini() },
    { label: 'Thêm nhanh', click: () => quickAdd() },
    { type: 'separator' },
    { label: 'Thoát', click: () => { require('./app-state').quitting = true; require('electron').app.quit(); } },
  ]));
  tray.on('double-click', () => showMain());
}

const main = () => mainWin;
const mini = () => miniWin;
const state = { collapsed, peek };
module.exports = {
  ICON, UI, PRE, MINI_MIN, TAB_MIN, tabSize, edgeNow,
  createMain, showMain, createMini, hideMini, showMini, toggleMini, quickAdd, putAway,
  collapseMini, expandMini, edgeCheck, edgeOf, miniAnchor, createTray, main, mini, state,
};
