'use strict';
/* Bộ tự kiểm tra `electron . --smoke`: mở app thật, probe DOM thật, tự chụp ảnh vào smoke-*.png.
   Không nằm trong đường chạy thường. Chỉ ở đây mới có code "biết" về DOM của renderer. */
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const S = require('./store');
const W = require('./windows');

module.exports = function smoke() {
  const mainWin = W.main();
  let miniWin = W.mini();
  const errs = [];
  if (!miniWin) miniWin = W.createMini();   // mini là lazy -> smoke phải dựng trước khi chờ nó load
  let blurN = 0;                             // đếm blur: blur lúc đang hover-peek sẽ làm thu về mép
  if (miniWin) miniWin.on('blur', () => blurN++);
  const hook = (w, tag) => {
    w.webContents.on('console-message', (_e, level, msg) => { if (level >= 2) errs.push(`[${tag}] ${msg}`); });
    w.webContents.on('did-fail-load', (_e, code, desc) => errs.push(`[${tag}] fail-load ${code} ${desc}`));
  };
  const wait = (w, tag) => new Promise((r) => { hook(w, tag); w.webContents.once('did-finish-load', () => setTimeout(r, 1200)); });
  const PROBE = `(() => ({
    shell: !!document.querySelector('.shell, .mini'),
    miniBody: document.body.classList.contains('mini'),
    navs: document.querySelectorAll('.sidebar .nav').length,
    rows: document.querySelectorAll('.row').length,
    badges: document.querySelectorAll('.badge').length,
    kanban: document.querySelectorAll('.kcol').length,
    title: (document.querySelector('.title') || {}).textContent || '',
    bg: getComputedStyle(document.body).backgroundColor,
    font: getComputedStyle(document.body).fontFamily.slice(0, 24),
    logo: (() => { const i = document.querySelector('.brand img, .mini-head img'); return !!i && i.complete && i.naturalWidth > 0; })(),
    scheme: getComputedStyle(document.documentElement).colorScheme,
    selScheme: (() => { const s = document.querySelector('select'); return s ? getComputedStyle(s).colorScheme : 'none'; })(),
  }))()`;
  Promise.all([wait(mainWin, 'main'), wait(miniWin, 'mini')]).then(async () => {
    try {
      W.showMini();
      await new Promise((r) => setTimeout(r, 600));
      for (const w of [mainWin, miniWin]) await w.webContents.executeJavaScript('window.__err = window.__err || []; if (!window.__errHooked) { window.__errHooked = true; window.addEventListener("error", (e) => window.__err.push(String(e.message))); window.addEventListener("unhandledrejection", (e) => window.__err.push("rej: " + String(e.reason))); }');
      const m = await mainWin.webContents.executeJavaScript(PROBE);
      const n = await miniWin.webContents.executeJavaScript(PROBE);
      console.log('MAIN ' + JSON.stringify(m));
      console.log('MINI ' + JSON.stringify(n));
      if (!m.shell || !m.rows) errs.push('probe: main không render ra .shell/.row');
      if (!m.logo || !n.logo) errs.push('probe: thiếu logo icon.png');
      if (!n.shell || !n.rows) errs.push('probe: mini không render ra danh sách việc');
      // popup <select> là widget NATIVE (không nằm trong capturePage) -> assert đúng input quyết định màu của nó
      console.log(`SCHEME root=${m.scheme} select=${m.selScheme} mini=${n.scheme}`);
      if (m.scheme !== 'dark' || m.selScheme !== 'dark') errs.push('probe: theme tối nhưng popup native vẫn vẽ light (' + m.scheme + '/' + m.selScheme + ')');
      const lightScheme = await mainWin.webContents.executeJavaScript(
        `(() => { const r = document.documentElement; const keep = r.dataset.theme; r.dataset.theme = 'light';
           const cs = getComputedStyle(r).colorScheme; const opt = getComputedStyle(document.querySelector('select option') || document.body).backgroundColor;
           r.dataset.theme = keep; return cs + '|' + opt; })()`);
      console.log('SCHEME light=' + lightScheme);
      if (!lightScheme.startsWith('light')) errs.push('probe: theme sáng không trả color-scheme light');
      fs.writeFileSync(path.join(__dirname, '..', 'smoke-main.png'), (await mainWin.webContents.capturePage()).toPNG());
      fs.writeFileSync(path.join(__dirname, '..', 'smoke-mini.png'), (await miniWin.webContents.capturePage()).toPNG());
      // thu vào mép -> chỉ còn edge tab -> bấm mũi tên -> trượt ra lại
      const b0 = miniWin.getBounds();
      await miniWin.webContents.executeJavaScript(`[...document.querySelectorAll('.mini-head button')].find((b) => b.title.includes('Thu vào mép')).click()`);
      await new Promise((r) => setTimeout(r, 800));
      const b1 = miniWin.getBounds();
      const tab = await miniWin.webContents.executeJavaScript(`(() => { const t = document.querySelector('.edge-tab'); return t ? Math.round(t.getBoundingClientRect().height) : 0; })()`);
      fs.writeFileSync(path.join(__dirname, '..', 'smoke-edge-tab.png'), (await miniWin.webContents.capturePage()).toPNG());
      await miniWin.webContents.executeJavaScript(`document.querySelector('.edge-tab').click()`);
      await new Promise((r) => setTimeout(r, 1000));
      const b2 = miniWin.getBounds();
      const backList = await miniWin.webContents.executeJavaScript(`!!document.querySelector('.mini-list')`);
      console.log(`COLLAPSE ${JSON.stringify({ from: [b0.width, b0.height], to: [b1.width, b1.height], tab, back: [b2.width, b2.height], backList })}`);
      if (tab < 30 || b1.width > 16 || b1.height > 52) errs.push('probe: thanh mép chưa gọn (' + b1.width + 'x' + b1.height + ', tab ' + tab + 'px)');
      if (!backList || Math.abs(b2.width - b0.width) > 4) errs.push('probe: trượt ra không khôi phục kích thước');
      // hover-peek: thu gọn -> rê chuột -> tự mở -> rời chuột -> tự thu
      await mainWin.webContents.executeJavaScript(`window.api.mini.peek(false)`);
      W.collapseMini('right');
      await new Promise((r) => setTimeout(r, 500));
      // Con trỏ THẬT đang nằm đè vùng mini -> Chromium bắn mouseleave -> mini.js gọi peek(false).
      // Dời con trỏ sang góc cửa sổ chính để phép đo tất định (không phải lỗi sản phẩm).
      const dbgPeek = mainWin.webContents.debugger;
      if (!dbgPeek.isAttached()) dbgPeek.attach('1.3');
      await dbgPeek.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 4, y: 4, buttons: 0 });
      await new Promise((r) => setTimeout(r, 200));
      const peekRet = await mainWin.webContents.executeJavaScript(`window.api.mini.peek(true)`);
      await new Promise((r) => setTimeout(r, 150));
      const peekMid = { w: miniWin.getBounds().width, coll: W.state.collapsed.v, pk: W.state.peek.v };
      await new Promise((r) => setTimeout(r, 600));
      const peekW = miniWin.getBounds().width;
      await mainWin.webContents.executeJavaScript(`window.api.mini.peek(false)`);
      await new Promise((r) => setTimeout(r, 600));
      const peekBack = miniWin.getBounds().width;
      console.log(`PEEK open=${peekW} back=${peekBack} blur=${blurN} mid=${JSON.stringify(peekMid)} ret=${peekRet}`);
      if (!peekRet || peekMid.w < 200) errs.push('probe: hover-peek không mở mini (' + JSON.stringify({ peekRet, peekMid }) + ')');
      if (peekBack > 16) errs.push('probe: hover-peek không thu lại');
      // ẩn hẳn: 0 px khi thu vào
      S.get().settings.collapse = 'hidden';
      W.collapseMini('right');
      await new Promise((r) => setTimeout(r, 400));
      const gone = !miniWin.isVisible();
      W.expandMini();
      await new Promise((r) => setTimeout(r, 500));
      const alive = miniWin.isVisible() && miniWin.getBounds().width > 200;
      console.log(`HIDDEN gone=${gone} back=${alive}`);
      if (!gone || !alive) errs.push('probe: chế độ ẩn hẳn hỏng');
      S.get().settings.collapse = 'tab';
      // "Thanh mũi tên" + tự thu: bấm ra ngoài (blur) và dùng phím tắt KHÔNG được làm mất thanh mũi tên
      S.get().settings.autoHide = true;
      W.expandMini();
      await new Promise((r) => setTimeout(r, 500));
      miniWin.emit('blur');
      await new Promise((r) => setTimeout(r, 500));
      const tabBlur = { vis: miniWin.isVisible(), w: miniWin.getBounds().width, coll: W.state.collapsed.v };
      W.expandMini();
      await new Promise((r) => setTimeout(r, 400));
      W.toggleMini();
      await new Promise((r) => setTimeout(r, 500));
      const tabKey = { vis: miniWin.isVisible(), w: miniWin.getBounds().width, coll: W.state.collapsed.v };
      // chọn "Ẩn hẳn" thì phím tắt phải ẩn thật
      W.expandMini();
      await new Promise((r) => setTimeout(r, 400));
      S.get().settings.collapse = 'hidden';
      W.toggleMini();
      await new Promise((r) => setTimeout(r, 500));
      const hiddenKey = miniWin.isVisible();
      S.get().settings.collapse = 'tab';
      W.showMini();
      await new Promise((r) => setTimeout(r, 700));
      console.log(`TAB-KEEP blur=${JSON.stringify(tabBlur)} key=${JSON.stringify(tabKey)} hiddenKey=${hiddenKey}`);
      const tabW = () => W.tabSize() + 4;
      if (!tabBlur.vis || !tabBlur.coll || tabBlur.w > tabW()) errs.push('probe: bấm ra ngoài làm mất thanh mũi tên (' + JSON.stringify(tabBlur) + ')');
      if (!tabKey.vis || !tabKey.coll || tabKey.w > tabW()) errs.push('probe: phím tắt làm mất thanh mũi tên (' + JSON.stringify(tabKey) + ')');
      if (hiddenKey) errs.push('probe: chế độ "Ẩn hẳn" mà phím tắt không ẩn cửa sổ');
      // mini: mở chi tiết -> phải có nút QUAY LẠI, bấm vào là về danh sách
      const miniDet = await miniWin.webContents.executeJavaScript(`(async () => {
        const main = document.querySelector('.mini-list .row:not(.sub) .row-main');
        if (!main) return { open: false, why: 'không có việc' };
        main.click();
        await new Promise((r) => setTimeout(r, 250));
        const opened = !!document.querySelector('.mini .detail');
        const back = [...document.querySelectorAll('.mini-head .btn')].find((b) => b.textContent.includes('Danh sách'));
        if (!back) return { open: opened, back: false, why: 'KHÔNG có nút quay lại' };
        back.click();
        await new Promise((r) => setTimeout(r, 250));
        return { open: opened, back: true, listed: !!document.querySelector('.mini-list') };
      })()`);
      console.log('MINI-DETAIL ' + JSON.stringify(miniDet));
      if (!miniDet.open || !miniDet.back || !miniDet.listed) errs.push('probe: mini thiếu nút BACK về danh sách (' + JSON.stringify(miniDet) + ')');

      // ĐỒNG BỘ mini -> app chính: thêm việc ở mini, app chính phải tự hiện (và ngược lại: đổi ở app chính, mini phải theo)
      const mark = 'SYNC-' + Math.random().toString(36).slice(2, 7);
      await miniWin.webContents.executeJavaScript(`(() => {
        const i = document.querySelector('.mini-add input');
        i.value = ${JSON.stringify(mark)};
        i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      })()`);
      await new Promise((r) => setTimeout(r, 1200));
      const syncMain = await mainWin.webContents.executeJavaScript(`db.tasks.some((t) => t.title.includes(${JSON.stringify(mark)}))`);
      const syncId = await mainWin.webContents.executeJavaScript(`(db.tasks.find((t) => t.title.includes(${JSON.stringify(mark)})) || {}).id`);
      const miniRename = mark + '-B';
      await mainWin.webContents.executeJavaScript(`(() => { const t = db.tasks.find((x) => x.id === ${JSON.stringify(syncId)}); t.title = ${JSON.stringify(miniRename)}; commit(); render(); })()`);
      await new Promise((r) => setTimeout(r, 900));
      const syncMini = await mainWin.webContents.executeJavaScript(`true`) && await miniWin.webContents.executeJavaScript(`[...document.querySelectorAll('.mini-list .row')].some((x) => x.dataset.id === ${JSON.stringify(syncId)}) || [...document.querySelectorAll('.mini .detail, .mini-list .row span')].some((e) => (e.textContent || '').includes(${JSON.stringify(miniRename)}))`);
      console.log(`SYNC mini->main=${syncMain} main->mini=${syncMini}`);
      if (!syncMain) errs.push('probe: thêm việc ở mini mà app chính không cập nhật (đồng bộ 1 chiều hỏng)');
      if (!syncMini) errs.push('probe: đổi ở app chính mà mini không cập nhật (đồng bộ chiều còn lại hỏng)');

      // BẢNG LỌC: mở bằng nút -> có đủ ô chọn; chọn nhanh có tác dụng; có chip điều kiện đang bật
      const filt = await mainWin.webContents.executeJavaScript(`(async () => {
        document.querySelector('.btn-filter').click();
        await new Promise((r) => setTimeout(r, 200));
        const panel = !!document.querySelector('.fpanel');
        const rows = document.querySelectorAll('.fpanel .fp-row').length;
        const quick = [...document.querySelectorAll('.fpanel .chips .chip')].find((c) => c.textContent.includes('Quá hạn'));
        const n0 = document.querySelectorAll('.body .row:not(.sub)').length;
        const diag = { mode: ui.mode, view: ui.view, tasks: db.tasks.length, f: JSON.stringify(ui.f), open: ui.openId, err: window.__err };
        quick.click();
        await new Promise((r) => setTimeout(r, 200));
        const n1 = document.querySelectorAll('.body .row:not(.sub)').length;
        const chips = document.querySelectorAll('.fchips .chip').length;
        const sel = document.querySelectorAll('.fpanel select.input').length;
        [...document.querySelectorAll('.fpanel .btn')].find((b) => b.title && b.title.includes('Đóng')).click();
        await new Promise((r) => setTimeout(r, 150));
        return { panel, rows, n0, n1, chips, sel, closed: !document.querySelector('.fpanel'), diag };
      })()`);
      console.log('FILTER ' + JSON.stringify(filt));
      if (!filt.panel || filt.rows < 8 || filt.sel < 4) errs.push('probe: bảng lọc thiếu ô chọn (' + JSON.stringify(filt) + ')');
      if (filt.n1 >= filt.n0 || !filt.chips) errs.push('probe: lọc nhanh không thu hẹp danh sách (' + JSON.stringify(filt) + ')');
      if (!filt.closed) errs.push('probe: không đóng được bảng lọc');

      // SETTINGS chỉ đóng khi bấm nút đóng — gõ chữ bừa KHÔNG được tự đóng
      const setGuard = await mainWin.webContents.executeJavaScript(`(async () => {
        [...document.querySelectorAll('.sidebar button')].find((b) => b.textContent.includes('Tuỳ biến')).click();
        await new Promise((r) => setTimeout(r, 200));
        const opened = !!document.querySelector('#settingsModal');
        for (const k of ['a', 'n', 'w', '1']) document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }));
        await new Promise((r) => setTimeout(r, 250));
        const still = !!document.querySelector('#settingsModal');
        [...document.querySelectorAll('.modal .btn')].find((b) => b.textContent.trim() === 'Đóng').click();
        await new Promise((r) => setTimeout(r, 200));
        return { opened, still, closed: !document.querySelector('#settingsModal') };
      })()`);
      console.log('SETTINGS ' + JSON.stringify(setGuard));
      if (!setGuard.opened || !setGuard.still) errs.push('probe: settings tự đóng khi gõ phím (' + JSON.stringify(setGuard) + ')');
      if (!setGuard.closed) errs.push('probe: nút Đóng của settings không đóng được');

      // CHỮ TRẮNG trên nền tối cho nút phụ (Sắp xếp lịch / My Day / Bộ lọc)
      await mainWin.webContents.executeJavaScript(`clearF(); render();`);   // bảng lọc còn hiệu lực -> danh sách rỗng, phải xoá trước khi thử nút
      await new Promise((r) => setTimeout(r, 200));
      const white = await mainWin.webContents.executeJavaScript(`(() => {
        const lum = (c) => { const m = c.match(/\\d+/g) || [0, 0, 0]; return (+m[0] + +m[1] + +m[2]) / 3; };
        const pick = (s) => { const e = document.querySelector(s); return e ? getComputedStyle(e).color : null; };
        return { filter: pick('.btn-filter'), sort: pick('.sort'), myday: pick('.myday-btn'), nav: pick('.nav') };
      })()`);
      console.log('CONTRAST ' + JSON.stringify(white) + ' lum=' + Object.values(white).map((c) => (c ? Math.round(((c.match(/\d+/g) || [0, 0, 0]).reduce((a, b) => +a + +b, 0)) / 3) : -1)));
      const dark = Object.entries(white).filter(([, c]) => c && ((c.match(/\d+/g) || [0, 0, 0]).reduce((a, b) => +a + +b, 0) / 3) < 170);
      if (dark.length) errs.push('probe: chữ trên nền tối chưa trắng (' + JSON.stringify(dark) + ')');

      // XÁC NHẬN XOÁ + HOÀN LẠI + PHÍM TẮT trong app
      const del = await mainWin.webContents.executeJavaScript(`(async () => {
        const r = document.querySelector('.body .row:not(.sub)');
        const id = r.dataset.id;
        const n0 = db.tasks.length;
        r.querySelector('.row-side .btn.icon').click();
        await new Promise((r2) => setTimeout(r2, 250));
        const asked = !!document.querySelector('#confirmModal');
        const nMid = db.tasks.length;
        document.querySelector('#confirmDel').click();
        await new Promise((r2) => setTimeout(r2, 250));
        const n1 = db.tasks.length;
        const undo = [...document.querySelectorAll('.toast .btn')].find((b) => b.textContent.includes('Hoàn lại'));
        if (undo) undo.click();
        await new Promise((r2) => setTimeout(r2, 250));
        return { asked, keptWhileAsking: nMid === n0, deleted: n1 < n0, undone: db.tasks.length === n0 && db.tasks.some((t) => t.id === id) };
      })()`);
      console.log('DELETE ' + JSON.stringify(del));
      if (!del.asked || !del.keptWhileAsking) errs.push('probe: xoá không hỏi lại trước (' + JSON.stringify(del) + ')');
      if (!del.deleted || !del.undone) errs.push('probe: xoá/hoàn lại không đúng (' + JSON.stringify(del) + ')');
      // thùng rác: xoá -> nằm trong "Đã xoá" -> khôi phục từ đó -> về lại danh sách
      const tr = await mainWin.webContents.executeJavaScript(`(async () => {
        const wait = (ms) => new Promise((r2) => setTimeout(r2, ms));
        const parent = db.tasks.find((t) => db.tasks.some((k) => k.parentId === t.id));
        const id = parent ? parent.id : db.tasks[0].id;
        doDelete(parent || db.tasks[0]);
        await wait(250);
        const inTrash = (db.trash || []).some((x) => x.id === id);
        const kidsTrashed = (db.trash || []).filter((x) => x.parentId === id).length;
        ui.view = 'trash'; render(); await wait(250);
        const navCt = ([...document.querySelectorAll('.sidebar .nav')].find((b) => b.textContent.includes('Đã xoá')) || {}).textContent || '';
        const groups = document.querySelectorAll('.body .group').length;
        const restoreBtn = !![...document.querySelectorAll('.body .trash-row .btn')].find((b) => b.textContent.includes('Khôi phục'));
        const inTasksBefore = db.tasks.some((x) => x.id === id);
        // bấm Khôi phục trên ĐÚNG dòng của việc cha (không phải dòng việc con)
        const row = document.querySelector('.body .trash-row[data-id="' + id + '"]');
        row.querySelector('.btn').click();
        await wait(250);
        const backParent = db.tasks.some((x) => x.id === id);
        const backKids = db.tasks.filter((x) => x.parentId === id).length;
        const gone = !(db.trash || []).some((x) => x.id === id);
        ui.view = 'myday'; render();
        return { inTrash, kidsTrashed, navCt, groups, restoreBtn, inTasksBefore, backParent, backKids, gone };
      })()`);
      console.log('TRASH ' + JSON.stringify(tr));
      if (!tr.inTrash || tr.inTasksBefore) errs.push('probe: xoá không đưa vào thùng rác (' + JSON.stringify(tr) + ')');
      if (!tr.groups) errs.push('probe: "Đã xoá" không gom theo ngày (' + JSON.stringify(tr) + ')');
      if (!tr.restoreBtn) errs.push('probe: "Đã xoá" thiếu nút Khôi phục');
      if (!tr.backParent || !tr.gone) errs.push('probe: khôi phục không trả việc về danh sách (' + JSON.stringify(tr) + ')');
      if (tr.kidsTrashed && tr.backKids !== tr.kidsTrashed) errs.push('probe: khôi phục thiếu việc con (' + JSON.stringify(tr) + ')');
      // "Đã hoàn thành" gom thành thư mục theo ngày (2 ngày khác nhau -> phải ra 2 thư mục)
      const grp = await mainWin.webContents.executeJavaScript(`(async () => {
        const wait = (ms) => new Promise((r2) => setTimeout(r2, ms));
        const live = db.tasks.filter((x) => !x.done).slice(0, 2);
        live.forEach((t, i) => { t.done = true; t.stage = 'done'; t.doneAt = new Date(Date.now() - i * 864e5).toISOString(); });
        commit(); ui.view = 'completed'; render(); await wait(250);
        const groups = [...document.querySelectorAll('.body .group')];
        const labels = groups.map((g) => g.querySelector('summary span').textContent);
        if (groups[0]) { groups[0].open = false; await wait(50); }
        const collapsed = groups[0] ? !groups[0].open : false;
        const rowsInside = groups.length ? groups.reduce((s, g) => s + g.querySelectorAll('.row').length, 0) : 0;
        const todayOpen = groups.length ? groups[0].open : null;
        const expected = db.tasks.filter((x) => x.done).length;
        ui.view = 'myday'; render(); await wait(100);
        return { n: groups.length, labels, collapsed, rowsInside, todayOpen, expected };
      })()`);
      console.log('COMPLETED-GROUPS ' + JSON.stringify(grp));
      if (grp.n < 2) errs.push('probe: "Đã hoàn thành" không gom theo ngày (' + JSON.stringify(grp) + ')');
      if (grp.rowsInside !== grp.expected) errs.push('probe: thư mục ngày thiếu việc (' + JSON.stringify(grp) + ')');
      if (!grp.collapsed) errs.push('probe: thư mục ngày không gập được');
      if (!grp.labels[0].startsWith('Hôm nay')) errs.push('probe: thư mục mới nhất không phải "Hôm nay" (' + JSON.stringify(grp.labels) + ')');
      if (!grp.labels.every((l) => /·/.test(l))) errs.push('probe: nhãn thư mục ngày sai định dạng (' + JSON.stringify(grp.labels) + ')');
      // việc LẶP: tick xong phải biến khỏi "Hôm nay của tôi", và lần kế tiếp KHÔNG hiện lại ngay
      const rp = await mainWin.webContents.executeJavaScript(`(async () => {
        const wait = (ms) => new Promise((r2) => setTimeout(r2, ms));
        const t = db.tasks.find((x) => !x.done && !x.parentId);
        Object.assign(t, { repeat: { type: 'weekly', n: 1 }, myDay: ymd(new Date()), due: at(new Date(), 0, 15) });
        commit(); ui.view = 'myday'; render(); await wait(250);
        const before = document.querySelectorAll('.body .row[data-id="' + t.id + '"]').length;
        const n0 = db.tasks.length;
        document.querySelector('.body .row[data-id="' + t.id + '"] .cb').click();
        await wait(450);
        const still = document.querySelectorAll('.body .row[data-id="' + t.id + '"]').length;
        const clone = db.tasks.find((x) => x.id !== t.id && x.repeat && !x.done);
        const nextInMyDay = !!(clone && clone.myDay === ymd(new Date()));
        const nextFuture = !!(clone && new Date(clone.due) > new Date());
        const out = { before, still, created: db.tasks.length === n0 + 1, nextInMyDay, nextFuture, nextMyDay: clone ? clone.myDay : 'none' };
        // trả lại nguyên trạng cho các probe sau (bỏ tick + xoá lần lặp vừa sinh)
        if (clone) db.tasks = db.tasks.filter((x) => x.id !== clone.id);
        Object.assign(t, { done: false, doneAt: null, stage: 'todo' });
        commit(); ui.view = 'myday'; render(); await wait(150);
        return out;
      })()`);
      console.log('RECUR ' + JSON.stringify(rp));
      if (!rp.before) errs.push('probe: việc lặp không hiện trong "Hôm nay của tôi" trước khi tick');
      if (rp.still) errs.push('probe: tick xong việc lặp vẫn còn trong "Hôm nay của tôi" (' + JSON.stringify(rp) + ')');
      if (!rp.created || !rp.nextFuture) errs.push('probe: tick việc lặp không sinh lần kế tiếp (' + JSON.stringify(rp) + ')');
      if (rp.nextInMyDay) errs.push('probe: lần kế tiếp của việc lặp hiện lại ngay trong "Hôm nay của tôi" (' + JSON.stringify(rp) + ')');
      // "Sắp tới" gom theo ngày: thư mục gần nhất mở sẵn, xếp từ gần đến xa
      const up = await mainWin.webContents.executeJavaScript(`(async () => {
        const wait = (ms) => new Promise((r2) => setTimeout(r2, ms));
        const mk = (d) => ({ id: uid(), title: 'Việc tương lai ' + d, done: false, doneAt: null, stage: 'todo', createdAt: new Date().toISOString(), due: at(new Date(), d, 9), start: null, duration: 0, priority: 0, tags: [], listId: 'inbox', parentId: null, notes: '', repeat: null, remind: null, myDay: null, notifiedFor: null });
        db.tasks.push(mk(2), mk(5), mk(9)); commit();
        ui.view = 'upcoming'; ui.mode = 'list'; render(); await wait(300);
        const groups = [...document.querySelectorAll('.body .group')];
        const labels = groups.map((g) => g.querySelector('summary span').textContent);
        const firstOpen = groups.length ? groups[0].open : null;
        const rows = groups.reduce((s, g) => s + g.querySelectorAll('.row').length, 0);
        // dọn 3 việc tạm, trả lại nguyên trạng cho các probe sau
        db.tasks = db.tasks.filter((x) => !/^Việc tương lai/.test(x.title));
        commit(); ui.view = 'myday'; render(); await wait(150);
        return { n: groups.length, labels, firstOpen, rows };
      })()`);
      console.log('UPCOMING-GROUPS ' + JSON.stringify(up));
      if (up.n < 3) errs.push('probe: "Sắp tới" không gom theo ngày (' + JSON.stringify(up) + ')');
      if (!up.firstOpen) errs.push('probe: "Sắp tới" không mở sẵn thư mục gần nhất');
      if (up.rows < 3) errs.push('probe: "Sắp tới" thiếu việc (' + JSON.stringify(up) + ')');
      if (!up.labels.every((l) => /·/.test(l))) errs.push('probe: nhãn thư mục "Sắp tới" sai định dạng (' + JSON.stringify(up.labels) + ')');

      const keys = await mainWin.webContents.executeJavaScript(`(async () => {
        const r = document.querySelector('.body .row:not(.sub) .row-main');
        r.click();
        await new Promise((r2) => setTimeout(r2, 200));
        const openBefore = !!document.querySelector('.detail');
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', ctrlKey: true, bubbles: true }));
        await new Promise((r2) => setTimeout(r2, 200));
        const closedByKey = !document.querySelector('.detail');
        const i = document.querySelector('#addInput');
        i.value = 'KEY-TEST';
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true }));
        await new Promise((r2) => setTimeout(r2, 250));
        const focused = document.activeElement === document.querySelector('#addInput');
        const kf = (db.settings.keys && db.settings.keys.filter) || 'mod+l';
        const lk = kf.split('+').pop();
        const i2 = document.querySelector('#addInput'); if (i2) i2.value = '';
        document.dispatchEvent(new KeyboardEvent('keydown', { key: lk, ctrlKey: kf.includes('mod'), altKey: kf.includes('alt'), shiftKey: kf.includes('shift'), bubbles: true }));
        await new Promise((r2) => setTimeout(r2, 250));
        const p = !!document.querySelector('.fpanel');
        document.dispatchEvent(new KeyboardEvent('keydown', { key: lk, ctrlKey: kf.includes('mod'), altKey: kf.includes('alt'), shiftKey: kf.includes('shift'), bubbles: true }));
        await new Promise((r2) => setTimeout(r2, 200));
        return { openBefore, closedByKey, focused, panelByKey: p, combo: kf };
      })()`);
      console.log('KEYMAP ' + JSON.stringify(keys));
      if (!keys.openBefore || !keys.closedByKey) errs.push('probe: Ctrl+W không ẩn được chi tiết (' + JSON.stringify(keys) + ')');
      if (!keys.focused || !keys.panelByKey) errs.push('probe: phím tắt trong app không chạy (' + JSON.stringify(keys) + ')');
      // đổi phím tắt
      // đổi phím tắt toàn cục: BẤT KỂ tổ hợp có bị app khác chiếm hay không, sau khi đổi PHẢI có 1 phím chạy được
      const GS = require('electron').globalShortcut;
      const ST2 = require('./store');
      const live0 = ST2.get().settings.hotkeyLive;   // phím đang chạy trước khi đổi
      const hk = await mainWin.webContents.executeJavaScript(`window.api.hotkey('CommandOrControl+Shift+J')`);
      const hkOk = GS.isRegistered('CommandOrControl+Shift+J');
      const orphan = !live0 || !GS.isRegistered(live0);   // phím CŨ phải được nhả -> "phím cũ vẫn chạy" là lỗi
      const hkHard = await mainWin.webContents.executeJavaScript(`window.api.hotkey('CommandOrControl+Alt+T')`);   // có thể bị app khác chiếm
      const hkHardOk = hkHard.ok && GS.isRegistered(hkHard.live);
      const keepsWish = ST2.get().settings.hotkey === 'CommandOrControl+Alt+T';   // tổ hợp NGƯỜI DÙNG CHỌN phải được nhớ, không bị ghi đè bằng dự phòng
      const hkEmpty = await mainWin.webContents.executeJavaScript(`window.api.hotkey('')`);
      console.log(`HOTKEY ${JSON.stringify(hk)} registered=${hkOk} oldReleased=${orphan} taken=${JSON.stringify(hkHard)} stillWorks=${hkHardOk} keepsWish=${keepsWish} emptyBlocked=${hkEmpty.ok === false}`);
      if (!hk.ok || !hkOk) errs.push('probe: đổi phím tắt thất bại');
      if (!orphan) errs.push('probe: phím tắt CŨ vẫn còn giữ (' + live0 + ')');
      if (!hkHardOk) errs.push('probe: tổ hợp bị chiếm mà không có phím dự phòng nào chạy được (' + JSON.stringify(hkHard) + ')');
      if (!keepsWish) errs.push('probe: tổ hợp người dùng chọn bị ghi đè bằng tổ hợp dự phòng');
      if (hkEmpty.ok !== false) errs.push('probe: nhận tổ hợp rỗng');
      // auto-start: đọc thẳng registry, KHÔNG tin app.getLoginItemSettings() (nó báo true dù thiếu args)
      const runKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
      const regVal = () => {   // quét cả key cho chắc: tên value do Electron tự đặt, đừng đoán
        try {
          return require('node:child_process').execFileSync('reg', ['query', runKey], { encoding: 'utf8' })
            .split(/\r?\n/).filter((l) => l.includes('electron.exe')).map((l) => l.trim()).join(' | ');
        } catch { return ''; }
      };
      const asOn = await mainWin.webContents.executeJavaScript(`window.api.autostart(true)`);
      const asReg = regVal();
      const asOff = await mainWin.webContents.executeJavaScript(`window.api.autostart(false)`);
      const asGone = regVal() === '';
      console.log(`AUTOSTART on=${asOn} writing=${asOff} reg="${asReg}" cleaned=${asGone}`);
      if (!asOn || !asReg.includes(app.getAppPath())) errs.push('probe: auto-start đăng ký thiếu đường dẫn app -> mở electron rỗng (' + asReg + ')');
      if (!asGone) errs.push('probe: tắt auto-start không xoá registry');
      // kéo thả bằng CHUỘT THẬT qua CDP Input (DnD tổng hợp không chạm tới đường xử lý chuột)
      const mouseDrag = async (win, sel) => {
        // cuộn dòng đích vào tầm nhìn: toạ độ ngoài khung nhìn thì chuột thả trượt (elementFromPoint = null)
        const pick = '(() => { const all = [...document.querySelectorAll(' + JSON.stringify(sel) + ')]; if (all[1]) all[1].scrollIntoView({ block: "center" }); return all.map(r => { const b = r.getBoundingClientRect(); return { id: r.dataset.id, x: b.x + b.width * 0.4, y: b.y + b.height / 2, h: b.height, tag: r.tagName, cls: r.className, vh: window.innerHeight }; }); })()';
        const rects = await win.webContents.executeJavaScript(pick);
        if (rects.length < 2) return { ok: false, why: 'chỉ có ' + rects.length + ' dòng gốc', ctx: await win.webContents.executeJavaScript('({ view: ui.view, mode: ui.mode, open: ui.openId, f: JSON.stringify(ui.f) })') };
        const vh = rects[0].vh;
        if (rects[0].y < 4 || rects[1].y > vh - 4) return { ok: false, why: 'hai dòng không cùng nằm trong khung nhìn', ys: [rects[0].y, rects[1].y], vh, all: rects.map((r) => [String(r.id).slice(0, 4), Math.round(r.y), Math.round(r.h), r.tag + '.' + String(r.cls).slice(0, 30)]) };
        const dbg = win.webContents.debugger;
        if (!dbg.isAttached()) dbg.attach('1.3');
        const M = (type, x, y, buttons) => dbg.sendCommand('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount: 1 });
        await M('mousePressed', rects[0].x, rects[0].y, 1);
        for (let k = 1; k <= 8; k++) {
          await M('mouseMoved', rects[0].x + ((rects[1].x - rects[0].x) * k) / 8, rects[0].y + ((rects[1].y - rects[0].y) * k) / 8, 1);
          await new Promise((r) => setTimeout(r, 50));
        }
        await M('mouseReleased', rects[1].x, rects[1].y, 0);
        await new Promise((r) => setTimeout(r, 250));
        const after = await win.webContents.executeJavaScript('[...document.querySelectorAll(' + JSON.stringify(sel) + ')].map(r => r.dataset.id)');
        return { ok: after[0] === rects[1].id && after[1] === rects[0].id, before: rects.map((r) => r.id), after };
      };
      // Các probe phía trên đã tick xong vài việc nên "Hôm nay của tôi" có thể còn <2 dòng.
      // Dựng lại fixture tối thiểu cho phần kéo thả (không phải hành vi sản phẩm).
      await mainWin.webContents.executeJavaScript(`(() => {
        const today = new Date().toISOString().slice(0, 10);
        const roots = db.tasks.filter((x) => !x.done && !x.parentId);
        roots.forEach((x) => { x.myDay = today; });
        for (let i = roots.length; i < 3; i++) {
          const nt = { ...roots[0], id: uid(), title: 'Việc kéo thả ' + (i + 1), parentId: null };
          db.tasks.push(nt); roots.push(nt);
        }
        commit(); ui.view = 'myday'; ui.mode = 'list'; ui.openId = null; render();
      })()`);
      await new Promise((r) => setTimeout(r, 500));
      const drag = await mouseDrag(mainWin, '.body .row:not(.sub)');
      console.log('DRAG ' + JSON.stringify(drag));
      if (!drag.ok) errs.push('probe: kéo thả bằng chuột không đổi thứ tự (' + JSON.stringify(drag) + ')');
      // thêm việc ở mini sẽ mở luôn bảng chi tiết -> phải bấm QUAY LẠI về danh sách rồi mới kéo thả được
      const miniBack = await miniWin.webContents.executeJavaScript(`(() => { const b = [...document.querySelectorAll('.mini-head .btn')].find((x) => x.textContent.includes('Danh sách')); if (b) b.click(); return !!b; })()`);
      await new Promise((r) => setTimeout(r, 300));
      await miniWin.webContents.executeJavaScript(`(() => {
        window.__err = []; window.addEventListener('error', (e) => window.__err.push(String(e.message)));
        window.__d = { down: 0, move: 0, up: 0 }; window.__btn = null; window.__atUp = null;
        for (const k of ['mousedown', 'mousemove', 'mouseup']) document.addEventListener(k, () => window.__d[k === 'mousedown' ? 'down' : k === 'mousemove' ? 'move' : 'up']++, true);
        document.addEventListener('mousedown', (e) => { window.__btn = e.button + '|' + (e.target.className || e.target.tagName); }, true);
        document.addEventListener('mouseup', (e) => { let g; try { g = dragId; } catch (x) { g = 'undef'; } const hit = document.elementFromPoint(e.clientX, e.clientY); window.__atUp = { dragId: g, at: [e.clientX, e.clientY], hit: hit ? (hit.className || hit.tagName) : 'null' }; }, true);
        window.__ad = 0; window.__ro = 0;
        const _ad = applyDrop; applyDrop = (d, s) => { window.__ad++; window.__adKind = d ? d.kind + '/' + (d.el ? d.el.className : '') : 'null'; return _ad(d, s); };
        const _ro = reorder; reorder = (...a) => { window.__ro++; return _ro(...a); };
      })()`);
      const miniDrag = await mouseDrag(miniWin, '.mini-list .row:not(.sub)');
      const evc = await miniWin.webContents.executeJavaScript('JSON.stringify({ d: window.__d, btn: window.__btn, atUp: window.__atUp, ad: window.__ad, ro: window.__ro, adKind: window.__adKind, err: window.__err, sort: ui.sort, order: db.tasks.map((x) => x.id).slice(0, 3) })');
      const kids = await miniWin.webContents.executeJavaScript("document.querySelectorAll('.mini-list .row.sub').length");
      const mb = miniWin.getBounds();
      const mstate = await miniWin.webContents.executeJavaScript(`JSON.stringify({ sort: ui.sort, v: ui.view, collapsed: ui.miniCollapsed, n: document.querySelectorAll('.mini-list .row:not(.sub)').length, probe: (() => { const r = document.querySelectorAll('.mini-list .row:not(.sub)')[0]; if (!r) return 'no-row'; const b = r.getBoundingClientRect(); const hit = document.elementFromPoint(b.x + b.width * 0.4, b.y + b.height / 2); return { cls: r.className, at: [Math.round(b.x + b.width * 0.4), Math.round(b.y + b.height / 2)], hit: hit ? (hit.className || hit.tagName) : 'null', down: !!window.__down }; })() })`);
      console.log('MINI-DRAG ' + JSON.stringify({ ...miniDrag, kids, evc, backFromDetail: miniBack, bounds: [mb.width, mb.height], mstate }));
      if (!miniDrag.ok) errs.push('probe: mini không kéo thả được (' + JSON.stringify(miniDrag) + ')');
      if (!kids) errs.push('probe: mini không hiện việc con');
      // tên bắt đầu bằng 'mini' -> chụp CỬA SỔ MINI (mặc định chụp cửa sổ chính)
      const shoot = async (name) => {
        const w = name.startsWith('mini') ? miniWin : mainWin;
        fs.writeFileSync(path.join(__dirname, '..', `smoke-${name}.png`), (await w.webContents.capturePage()).toPNG());
      };
      const clickTab = (i) => mainWin.webContents.executeJavaScript(`document.querySelectorAll('.tabs button')[${i}].click()`);
      await clickTab(1); await new Promise((r) => setTimeout(r, 250)); await shoot('kanban');
      const cols = await mainWin.webContents.executeJavaScript(`document.querySelectorAll('.kcol').length`);
      console.log('KANBAN cols=' + cols);
      await clickTab(2); await new Promise((r) => setTimeout(r, 250)); await shoot('calendar');
      await clickTab(3); await new Promise((r) => setTimeout(r, 250)); await shoot('timeline');
      await clickTab(4); await new Promise((r) => setTimeout(r, 250)); await shoot('matrix');
      const quads = await mainWin.webContents.executeJavaScript(`document.querySelectorAll('.q').length`);
      console.log('MATRIX quads=' + quads);
      // KÉO THẢ Ở KANBAN (đổi cột -> đổi stage) và MA TRẬN (thả vào ô -> đổi ưu tiên)
      const dragTo = async (fromSel, toSel) => {
        const pt = (sel, from) => mainWin.webContents.executeJavaScript(`(() => {
          const e = document.querySelector(${JSON.stringify(sel)});
          if (!e) return null;
          const b0 = e.getBoundingClientRect();
          if (b0.bottom > innerHeight - 4 || b0.top < 4) e.scrollIntoView({ block: 'nearest' });
          const b = e.getBoundingClientRect();
          const y = b.y + Math.min(b.height - 12, Math.max(12, b.height / 2));
          let at = null;
          for (const f of ${from ? '[0.35, 0.5, 0.6, 0.78]' : '[0.5]'}) {
            const x = b.x + b.width * f;
            const hit = document.elementFromPoint(x, y);
            const inside = !!hit && (hit === e || e.contains(hit));
            if (!at || inside) at = { x, hit, inside };
            if (inside) break;
          }
          return { id: e.dataset.id, x: at.x, y, hit: at.hit ? (at.hit.className || at.hit.tagName) : 'null', ok: at.inside };
        })()`);
        const r1 = await pt(toSel, false);   // đích trước: pt() có thể cuộn trang -> phải đo nguồn SAU
        const r0 = await pt(fromSel, true);
        if (!r0 || !r1) return { ok: false, why: 'thiếu nguồn/đích' };
        if (!r0.ok) return { ok: false, why: 'nguồn bị che', hit: r0.hit };
        if (!r1.ok) return { ok: false, why: 'đích bị che', hit: r1.hit };
        const dbg = mainWin.webContents.debugger;
        if (!dbg.isAttached()) dbg.attach('1.3');
        const M = (type, x, y, buttons) => dbg.sendCommand('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount: 1 });
        await M('mousePressed', r0.x, r0.y, 1);
        for (let k = 1; k <= 8; k++) {
          await M('mouseMoved', r0.x + ((r1.x - r0.x) * k) / 8, r0.y + ((r1.y - r0.y) * k) / 8, 1);
          await new Promise((r) => setTimeout(r, 50));
        }
        await M('mouseReleased', r1.x, r1.y, 0);
        await new Promise((r) => setTimeout(r, 350));
        return { ok: true, id: r0.id, hitFrom: r0.hit, hitTo: r1.hit, y: [Math.round(r0.y), Math.round(r1.y)] };
      };
      await clickTab(1); await new Promise((r) => setTimeout(r, 250));
      const kd = await dragTo('.kcol[data-stage="todo"] .row:not(.sub)', '.kcol[data-stage="doing"]');
      const kstage = await mainWin.webContents.executeJavaScript(`(db.tasks.find((t) => t.id === ${JSON.stringify(kd.id)}) || {}).stage`);
      console.log('KANBAN-DRAG ' + JSON.stringify({ ...kd, stage: kstage }));
      if (!kd.ok || kstage !== 'doing') errs.push('probe: kéo thả ở Kanban không đổi cột (' + JSON.stringify({ ...kd, stage: kstage }) + ')');
      await clickTab(4); await new Promise((r) => setTimeout(r, 250));
      // Thả vào "Làm ngay" (q1): phải ĐẶT CẢ 2 TRỤC, nếu không việc nhảy sang "Lên lịch" (q2) ngay
      const md = await dragTo('.q .row:not(.sub)', '.q[data-prio="3"]');
      const mAfter = await mainWin.webContents.executeJavaScript(`(() => { const t = db.tasks.find((x) => x.id === ${JSON.stringify(md.id)}) || {}; const q = [...document.querySelectorAll('.q')].find((e) => e.querySelector('[data-id="${md.id}"]')); return { prio: t.priority, due: t.due, quad: q ? q.className.trim() : null }; })()`);
      console.log('MATRIX-DRAG ' + JSON.stringify({ ...md, ...mAfter }));
      if (!md.ok || !mAfter.quad || !mAfter.quad.includes('q1')) errs.push('probe: kéo vào "Làm ngay" không nằm lại ô đó (' + JSON.stringify({ ...md, ...mAfter }) + ')');
      // kéo ô việc trong lịch: dời 1 việc sang MAI trước (để chắc chắn có ô nguồn khác hôm nay), rồi kéo về HÔM NAY
      await clickTab(2); await new Promise((r) => setTimeout(r, 250));
      const moved = await mainWin.webContents.executeJavaScript(`(() => { const t = db.tasks.find((x) => !x.parentId && !x.done); setDue(t, new Date(Date.now() + 864e5).toISOString()); const d = new Date(t.due); d.setHours(9, 0, 0, 0); t.due = d.toISOString(); commit(); render(); return t.id; })()`);
      await new Promise((r) => setTimeout(r, 350));
      const cd = await dragTo(`.citem[data-id="${moved}"]`, '.cday.today');
      const cday = await mainWin.webContents.executeJavaScript(`(() => { const t = db.tasks.find((x) => x.id === ${JSON.stringify(moved)}); return t && t.due ? new Date(t.due).toISOString().slice(0, 10) : null; })()`);
      const wantDay = await mainWin.webContents.executeJavaScript(`(document.querySelector('.cday.today') || {}).dataset ? document.querySelector('.cday.today').dataset.day : null`);
      console.log('CAL-DRAG ' + JSON.stringify({ ...cd, due: cday, cell: wantDay }));
      if (!cd.ok || !cday || !wantDay || cday !== wantDay) errs.push('probe: kéo ô việc trong lịch sang ngày khác không đổi hạn (' + JSON.stringify({ ...cd, due: cday, cell: wantDay }) + ')');
      await clickTab(0); await new Promise((r) => setTimeout(r, 200));
      await mainWin.webContents.executeJavaScript(`document.querySelector('.body .row .row-main').click()`);
      await new Promise((r) => setTimeout(r, 250)); await shoot('detail');
      const det = await mainWin.webContents.executeJavaScript(`document.querySelectorAll('.detail .field').length`);
      console.log('DETAIL fields=' + det);
      const chip = await mainWin.webContents.executeJavaScript(`(async () => {
        const inp = document.querySelector('.detail input[type=datetime-local]');
        if (!inp) return { ok: false, why: 'không có ô hạn' };
        const before = inp.value;
        const c = [...document.querySelectorAll('.detail .chip')].find((x) => x.textContent.includes('Mai 09:00'));
        if (!c) return { ok: false, why: 'không có chip Mai 09:00' };
        c.click();
        await new Promise((r) => setTimeout(r, 400));   // chip ghi hạn qua IPC -> phải đợi, không đọc ngay
        const after = document.querySelector('.detail input[type=datetime-local]').value;
        const d = new Date(after), t = new Date(); t.setDate(t.getDate() + 1);
        return { ok: after !== before && /T09:00$/.test(after) && d.getDate() === t.getDate(), before, after, chips: document.querySelectorAll('.detail .chip').length };
      })()`);
      console.log('DUE-CHIP ' + JSON.stringify(chip));
      if (!chip.ok) errs.push('probe: chip chọn hạn nhanh không đổi được hạn (' + JSON.stringify(chip) + ')');
      // tạo việc mới -> mở chi tiết + con trỏ vào ô ĐẦU TIÊN; ESC ở việc con -> về chi tiết CHA
      const flow = await mainWin.webContents.executeJavaScript(`(async () => {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        ui.openId = null; render();
        const inp = document.querySelector('#addInput');
        inp.value = 'Việc kiểm thử luồng tạo mới';
        inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await wait(400);
        const focusedId = document.activeElement ? (document.activeElement.id || document.activeElement.className) : '';
        const openedTitle = (document.querySelector('.detail strong') || {}).textContent || '';
        const backBtn = !!document.querySelector('.detail-head .btn');
        const kid = db.tasks.find((x) => x.parentId);
        ui.openId = kid.id; render(); await wait(150);
        const childHead = (document.querySelector('.detail strong') || {}).textContent || '';
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await wait(250);
        const parentHead = (document.querySelector('.detail strong') || {}).textContent || '';
        const subFocus = (document.activeElement && document.activeElement.className) || '';
        return { focusedId, openedTitle, backBtn, childHead, parentHead, subFocus };
      })()`);
      console.log('FLOW ' + JSON.stringify(flow));
      if (flow.focusedId !== 'detailTitle') errs.push('probe: tạo việc xong con trỏ không vào ô đầu tiên của chi tiết (' + flow.focusedId + ')');
      if (flow.openedTitle !== 'Chi tiết') errs.push('probe: tạo việc xong không mở chi tiết (' + flow.openedTitle + ')');
      if (!flow.backBtn) errs.push('probe: chi tiết ở cửa sổ chính thiếu nút quay lại');
      if (!flow.childHead.includes('việc con')) errs.push('probe: mở việc con không hiện tiêu đề "chi tiết việc con"');
      if (flow.parentHead !== 'Chi tiết') errs.push('probe: Esc ở việc con không quay về chi tiết cha (' + flow.parentHead + ')');
      if (!flow.subFocus.includes('sub-add')) errs.push('probe: quay về cha nhưng con trỏ không vào ô thêm việc con (' + flow.subFocus + ')');
      await mainWin.webContents.executeJavaScript(`document.querySelector('.detail .detail-head .btn:last-child').click()`);
      await new Promise((r) => setTimeout(r, 250)); await shoot('list');
      await mainWin.webContents.executeJavaScript(`[...document.querySelectorAll('.sidebar button')].find(b => b.textContent.includes('Tuỳ biến')).click()`);
      await new Promise((r) => setTimeout(r, 250)); await shoot('settings');
      const hkRow = await mainWin.webContents.executeJavaScript(`(() => { const m = document.querySelector('#settingsModal'); m.scrollTop = m.scrollHeight; const i = [...m.querySelectorAll('label')].find((l) => l.textContent.includes('Phím tắt mở/ẩn')); return i ? i.nextElementSibling.textContent : ''; })()`);
      console.log('HOTKEY row=' + JSON.stringify(hkRow));
      if (!hkRow.includes('Đặt phím')) errs.push('probe: thiếu hàng đặt phím tắt trong settings');
      await new Promise((r) => setTimeout(r, 200)); await shoot('settings-bottom');
      const stat = await mainWin.webContents.executeJavaScript(`[...document.querySelectorAll('.modal .btn')].find(b => b.textContent.includes('Thống kê')).click(); document.querySelectorAll('.chart > div').length`);
      console.log('STATS bars=' + stat);
      await new Promise((r) => setTimeout(r, 250)); await shoot('stats');
      // ảnh minh hoạ 2 mục mới: thùng rác + log đã hoàn thành gom theo ngày
      await mainWin.webContents.executeJavaScript(`(() => { ui.modal = null; const t = db.tasks[db.tasks.length - 1]; if (t) doDelete(t); ui.view = 'trash'; ui.openId = null; render(); })()`);
      await new Promise((r) => setTimeout(r, 300)); await shoot('trash');
      // ảnh "Sắp tới" gom theo ngày (dựng vài việc tương lai chỉ để chụp)
      await mainWin.webContents.executeJavaScript(`(() => {
        const iso = (d, h) => { const x = new Date(); x.setDate(x.getDate() + d); x.setHours(h, 0, 0, 0); return x.toISOString(); };
        const base = db.tasks.find((x) => !x.done) || db.tasks[0];
        for (const d of [1, 3, 8]) db.tasks.push({ ...base, id: uid(), title: 'Việc tương lai ' + d + ' ngày', due: iso(d, 9), start: null, myDay: null, done: false, doneAt: null, stage: 'todo', parentId: null });
        commit(); ui.view = 'upcoming'; ui.mode = 'list'; render();
      })()`);
      await new Promise((r) => setTimeout(r, 350)); await shoot('upcoming');
      await mainWin.webContents.executeJavaScript(`(() => { db.tasks = db.tasks.filter((x) => !/^Việc tương lai/.test(x.title)); commit(); ui.view = 'myday'; render(); })()`);
      // mini ở chế độ chi tiết: CHỈ 1 thanh trên, và không nút nào bị tràn/cắt khỏi cửa sổ
      await miniWin.webContents.executeJavaScript(`ui.view='myday'; ui.openId=db.tasks[0].id; render()`);
      await new Promise((r) => setTimeout(r, 300));
      const mh = await miniWin.webContents.executeJavaScript(`(() => {
        const heads = [...document.querySelectorAll('.mini-head, .detail-head')].filter((h) => h.offsetParent !== null || getComputedStyle(h).display !== 'none');
        const kids = heads.flatMap((hd) => [...hd.children].map((c) => { const b = c.getBoundingClientRect(); return { cls: c.className || c.tagName, w: Math.round(b.width), x: Math.round(b.x), r: Math.round(b.right) }; }));
        const clipped = kids.filter((k) => k.r > innerWidth + 1 || k.x < -1 || k.w < 4);
        return { win: innerWidth, heads: heads.length, kids, clipped };
      })()`);
      console.log('MINI-DETAIL-HEAD ' + JSON.stringify(mh));
      if (mh.heads !== 1) errs.push('probe: mini ở chế độ chi tiết có ' + mh.heads + ' thanh trên (phải là 1 — thanh lặp làm cắt nút)');
      if (mh.clipped.length) errs.push('probe: nút trên thanh mini bị cắt/tràn (' + JSON.stringify(mh.clipped) + ')');
      await shoot('mini-detail-head');
      // thu nhỏ về kích thước NHỎ NHẤT cho phép: nút vẫn không được cắt
      const ob = miniWin.getBounds();
      miniWin.setBounds({ x: ob.x, y: ob.y, width: 220, height: 260 });
      await new Promise((r) => setTimeout(r, 400));
      const mhMin = await miniWin.webContents.executeJavaScript(`(() => {
        const hd = [...document.querySelectorAll('.mini-head')].find((h) => getComputedStyle(h).display !== 'none');
        if (!hd) return { ok: false, why: 'không có thanh trên' };
        const kids = [...hd.children].map((c) => { const b = c.getBoundingClientRect(); return { cls: c.className || c.tagName, w: Math.round(b.width), r: Math.round(b.right) }; });
        return { win: innerWidth, kids, clipped: kids.filter((k) => k.r > innerWidth + 1 || k.w < 4).length };
      })()`);
      console.log('MINI-MIN-WIDTH ' + JSON.stringify(mhMin));
      if (!mhMin.win || mhMin.clipped) errs.push('probe: ở kích thước nhỏ nhất nút bị cắt (' + JSON.stringify(mhMin) + ')');
      miniWin.setBounds(ob);
      await new Promise((r) => setTimeout(r, 300));
      await miniWin.webContents.executeJavaScript(`ui.openId=null; render()`);
      await mainWin.webContents.executeJavaScript(`ui.view = 'completed'; render();`);
      await new Promise((r) => setTimeout(r, 300)); await shoot('completed');
      await mainWin.webContents.executeJavaScript(`ui.view = 'myday'; render();`);
      // An toàn dữ liệu: ghi nguyên tử (không để lại .tmp), có .bak, và file chính hỏng thì PHỤC HỒI từ .bak
      const S2 = require('./store');
      const fs2 = require('node:fs');
      const nTasks = S2.get().tasks.length;
      S2.writeNow();
      const noTmp = !fs2.existsSync(S2.DB_PATH + '.tmp');
      const hasBak = fs2.existsSync(S2.DB_PATH + '.bak');
      const mainOk = JSON.parse(fs2.readFileSync(S2.DB_PATH, 'utf8')).tasks.length === nTasks;
      fs2.writeFileSync(S2.DB_PATH, '{ file hỏng');                       // giả lập file cụt do mất điện
      const recovered = S2.load();
      const recOk = Array.isArray(recovered.tasks) && recovered.tasks.length > 0;
      S2.writeNow();                                                       // trả lại file lành
      console.log('SAFEGUARD ' + JSON.stringify({ nTasks, noTmp, hasBak, mainOk, recOk, bakTasks: recovered.tasks.length }));
      if (!noTmp) errs.push('probe: còn sót file .tmp sau khi ghi (ghi không nguyên tử)');
      if (!hasBak) errs.push('probe: không tạo bản dự phòng .bak');
      if (!mainOk) errs.push('probe: file chính sau khi ghi không khớp dữ liệu trong bộ nhớ');
      if (!recOk) errs.push('probe: file chính hỏng thì KHÔNG phục hồi được từ .bak');
    } catch (e) { errs.push('probe: ' + e.message + (e.stack ? ' | ' + String(e.stack).split('\n')[1] : '')); }
    // lỗi KHÔNG bắt được trong renderer: trước đây chỉ in "no renderer errors" mà không kiểm tra gì
    try {
      const rerr = await mainWin.webContents.executeJavaScript('JSON.stringify(window.__err || [])');
      console.log('RENDERER-ERRORS ' + rerr);
      if (rerr !== '[]') errs.push('probe: lỗi không bắt được trong renderer: ' + rerr);
    } catch { /* cửa sổ đã đóng */ }
    console.log(errs.length ? 'SMOKE ERRORS:\n' + errs.join('\n') : 'SMOKE OK (main + mini loaded, no renderer errors)');
    require('./app-state').quitting = true;
    setTimeout(() => app.exit(errs.length ? 1 : 0), 300);
  });
}
