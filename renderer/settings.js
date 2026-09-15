'use strict';
/* Hộp thoại Tuỳ biến + Thống kê (theme, mini, ảnh nền, phím tắt trong app). */
/* ---------------- modal: settings / stats ---------------- */
const KEY_ACTIONS = [
  ['newTask', 'Tạo việc mới (nhảy vào ô thêm việc)'],
  ['closeDetail', 'Đóng bảng chi tiết'],
  ['filter', 'Mở / đóng bảng lọc'],
  ['search', 'Nhảy vào ô tìm kiếm'],
  ['mini', 'Mở / ẩn cửa sổ mini'],
  ['myDay', 'Mở "Hôm nay của tôi"'],
];
// phím tắt trong app: không chiếm phím của Windows, chỉ cần app đang focus
function comboOf(ev) {
  const m = [];
  if (ev.ctrlKey || ev.metaKey) m.push('mod');
  if (ev.altKey) m.push('alt');
  if (ev.shiftKey) m.push('shift');
  const k = String(ev.key || '').toLowerCase();
  if (['control', 'alt', 'shift', 'meta', 'altgraph'].includes(k) || !k) return null;
  m.push(k === ' ' ? 'space' : k);
  return m.join('+');
}
function captureBind(action) {
  const pick = (ev) => {
    ev.preventDefault(); ev.stopPropagation();
    if (ev.key === 'Escape') { document.removeEventListener('keydown', pick, true); return; }
    const c = comboOf(ev);
    if (!c || !(ev.ctrlKey || ev.metaKey || ev.altKey)) { toast('Thiếu phím bổ trợ', 'Cần Ctrl (hoặc Alt) cho phím tắt trong app — ví dụ Ctrl+W.'); return; }
    document.removeEventListener('keydown', pick, true);
    db.settings.keys[action] = c;
    commit(); renderSettings();
    toast('Đã gán phím', c);
  };
  document.addEventListener('keydown', pick, true);
  toast('Bấm tổ hợp phím', 'Ví dụ Ctrl+W. Esc để huỷ.');
}
// hiển thị tổ hợp kiểu Windows cho dễ đọc: CommandOrControl+Shift+T -> Ctrl+Shift+T
function prettyAccel(a) { return String(a || '').replace('CommandOrControl', 'Ctrl').replace('Super', 'Win'); }
function captureHotkey() {
  const KEY = { ' ': 'Space', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Escape: 'Esc', '+': 'Plus' };
  const name = (k) => (k.length === 1 ? k.toUpperCase() : KEY[k] || k);
  const pick = async (ev) => {
    ev.preventDefault(); ev.stopPropagation();
    if (ev.key === 'Escape') { document.removeEventListener('keydown', pick, true); return; }
    if (['Control', 'Alt', 'Shift', 'Meta', 'AltGraph'].includes(ev.key)) return;
    const mods = [];
    if (ev.ctrlKey) mods.push('CommandOrControl');
    if (ev.altKey) mods.push('Alt');
    if (ev.shiftKey) mods.push('Shift');
    if (ev.metaKey && !ev.ctrlKey) mods.push('Super');
    if (!mods.length) { toast('Thiếu phím bổ trợ', 'Cần ít nhất Ctrl / Alt / Shift — ví dụ Ctrl+Alt+T.'); return; }
    document.removeEventListener('keydown', pick, true);
    const r = await API.hotkey([...mods, name(ev.key)].join('+'));
    if (r.ok) { db.settings.hotkey = r.wanted; db.settings.hotkeyLive = r.live; }
    commit();
    render();
    toast(r.ok ? (r.fellBack ? 'Phím bị app khác giữ' : 'Đã đặt phím tắt') : 'Không đặt được phím tắt',
      r.ok ? (r.fellBack ? `Tạm dùng: ${prettyAccel(r.live)} — tổ hợp bạn chọn đang bị app khác chiếm` : `Đang dùng: ${prettyAccel(r.live)}`) : 'Mọi tổ hợp đều bị chiếm, giữ phím cũ.');
  };
  document.addEventListener('keydown', pick, true);
  toast('Bấm tổ hợp phím', 'Ví dụ Ctrl+Alt+T. Esc để huỷ.');
}
function settingsModal() {
  const s = db.settings;
  const set = (k, v) => { s[k] = v; applyTheme(); commit(); render(); };
  // slider: cập nhật nhãn tại chỗ, KHÔNG render lại (render lại sẽ giật và mất focus khi đang kéo)
  const num = (k, min, max, step, label, suffix = '') => {
    const lbl = h('label', { class: 'lbl' }, `${label}: ${s[k]}${suffix}`);
    return h('div', { class: 'field' }, lbl,
      h('input', {
        type: 'range', min, max, step, value: s[k], style: { width: '100%' },
        oninput: (e) => { s[k] = +e.target.value; lbl.textContent = `${label}: ${s[k]}${suffix}`; applyTheme(); },
        onchange: () => commit(),
      }));
  };
  const numFont = (() => {
    const lbl = h('label', { class: 'lbl' }, 'Cỡ chữ: ' + s.fontSize + 'px');
    return h('div', { class: 'field' }, lbl,
      h('input', { type: 'range', min: 12, max: 20, value: s.fontSize, style: { width: '100%' }, oninput: (e) => { s.fontSize = +e.target.value; lbl.textContent = 'Cỡ chữ: ' + s.fontSize + 'px'; applyTheme(); }, onchange: () => commit() }));
  })();
  return h('div', { class: 'overlay' },   // KHÔNG đóng khi bấm ra ngoài: chỉ nút Đóng / ✕ / Esc
    h('div', { class: 'card modal', id: 'settingsModal' },
      h('div', { class: 'modal-head' },
        h('h3', null, 'Tuỳ biến'),
        h('span', { class: 'grow' }),
        h('button', { class: 'btn ghost icon sm', id: 'settingsClose', title: 'Đóng (Esc)', onclick: () => { ui.modal = null; render(); } }, '✕')),
      h('div', { class: 'row2' },
        h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Chế độ'),
          h('div', { class: 'tabs', style: { width: '100%' } },
            ...['dark', 'light'].map((v) => h('button', { class: (s.theme === v ? 'on' : ''), style: { flex: 1 }, onclick: () => set('theme', v) }, v === 'dark' ? 'Tối' : 'Sáng')))),
        h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Màu chủ đạo'),
          h('input', { type: 'color', class: 'input', value: s.accent, style: { padding: '2px' }, oninput: (e) => { s.accent = e.target.value; applyTheme(); }, onchange: () => commit() }))),
      num('radius', 0, 24, 1, 'Bo góc', 'px'),
      h('div', { class: 'row2' },
        h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Font'),
          h('select', { class: 'input', onchange: (e) => set('font', e.target.value) },
            ...['Segoe UI', 'Inter', 'Arial', 'Times New Roman', 'Consolas', 'JetBrains Mono'].map((f) => h('option', { value: f, selected: s.font === f }, f)))),
        numFont),
      h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Ảnh nền cửa sổ chính'),
        h('div', { class: 'row2' },
          h('input', { class: 'input', value: s.bg || '', placeholder: 'Chưa chọn ảnh', onchange: (e) => set('bg', e.target.value) }),
          h('button', { class: 'btn outline', onclick: async () => { const p = await API.pickImage(); if (p) set('bg', p); } }, 'Chọn…'))),
      s.bg ? h('div', null,
        num('bgOpacity', 0.05, 1, 0.05, 'Độ hiện của ảnh nền (cửa sổ chính)', ''),
        num('bgBlur', 0, 30, 1, 'Làm mờ ảnh nền (blur)', 'px')) : null,
      h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Tiếng báo khi xong việc'),
        h('label', { style: { display: 'flex', gap: '.5rem', alignItems: 'center', fontSize: '.85rem' } },
          h('input', { type: 'checkbox', checked: s.soundDone !== false, onchange: (e) => { set('soundDone', e.target.checked); playDone(); } }),
          'Phát tiếng khi tick xong một việc')),
      s.soundDone !== false ? h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'File âm thanh (bỏ trống = tiếng mặc định)'),
        h('div', { class: 'row2' },
          h('input', { class: 'input', value: s.soundDoneFile || '', placeholder: 'Tiếng mặc định của app', onchange: (e) => set('soundDoneFile', e.target.value || null) }),
          h('button', { class: 'btn outline', onclick: async () => { const p = await API.pickSound(); if (p) { set('soundDoneFile', p); playDone(); } } }, 'Chọn…'),
          h('button', { class: 'btn outline', onclick: () => playDone() }, 'Nghe thử'))) : null,
      h('div', { class: 'sep' }),
      h('div', { class: 'row2' },
        h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Neo cửa sổ mini'),
          h('select', { class: 'input', onchange: (e) => { s.edge = e.target.value; commit(); API.mini.reset(); } },
            ...[['left', 'Trái'], ['right', 'Phải'], ['top', 'Trên'], ['bottom', 'Dưới']].map(([v, n]) => h('option', { value: v, selected: s.edge === v }, n)))),
        h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Tự thu vào mép'),
          h('label', { style: { display: 'flex', gap: '.5rem', alignItems: 'center', fontSize: '.85rem' } },
            h('input', { type: 'checkbox', checked: s.autoHide, onchange: (e) => set('autoHide', e.target.checked) }), 'Bật (bấm ra ngoài là tự thu về mép)'))),
      num('opacity', 0.4, 1, 0.02, 'Độ trong suốt (mini)', ''),
      num('blur', 0, 30, 1, 'Blur kính (mini)', 'px'),
      num('tabSize', 4, 24, 1, 'Độ dày thanh mép', 'px'),
      h('div', { class: 'row2' },
        h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Khi thu vào'),
          h('div', { class: 'tabs', style: { width: '100%' } },
            ...[['tab', 'Thanh mũi tên'], ['hidden', 'Ẩn hẳn']].map(([v, n]) =>
              h('button', { class: (s.collapse === v ? 'on' : ''), style: { flex: 1 }, onclick: () => set('collapse', v) }, n)))),
        h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Rê chuột vào thanh mép'),
          h('label', { style: { display: 'flex', gap: '.5rem', alignItems: 'center', fontSize: '.85rem' } },
            h('input', { type: 'checkbox', checked: s.peek !== false, onchange: (e) => set('peek', e.target.checked) }), 'Mở tạm khi hover'))),
      h('div', { class: 'muted', style: { fontSize: '.72rem', margin: '-.5rem 0 .7rem' } },
        s.collapse === 'hidden'
          ? 'Ẩn hẳn: bấm ra ngoài hoặc dùng phím tắt là cửa sổ biến mất — chỉ mở lại bằng phím tắt hoặc menu tray.'
          : 'Thanh mũi tên vẫn nằm ở cạnh màn hình khi bấm ra ngoài / dùng phím tắt. Bấm ✕ hoặc chuyển sang "Ẩn hẳn" mới mất hẳn.'),
      h('div', { class: 'sep' }),
      h('div', { class: 'row2' },
        h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Nhắc trước mặc định (phút)'),
          h('input', { class: 'input', type: 'number', value: s.reminderOffset, onchange: (e) => set('reminderOffset', +e.target.value) }),
          h('button', { class: 'btn outline sm', style: { marginTop: '.35rem' }, onclick: async () => { await API.testAlert(); toast('Đã bắn thông báo thử', 'Kiểm tra góc phải màn hình + nghe tiếng chuông', [], 5000); } }, '🔔 Thử thông báo')),
        h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Khởi động cùng máy'),
          h('label', { style: { display: 'flex', gap: '.5rem', alignItems: 'center', fontSize: '.85rem' } },
            h('input', { type: 'checkbox', checked: s.autostart, onchange: async (e) => { s.autostart = e.target.checked; commit(); await API.autostart(e.target.checked); } }), 'Bật'))),
      h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Phím tắt mở/ẩn mini (TOÀN CỤC — dùng được cả khi không focus app)'),
        h('div', { style: { display: 'flex', gap: '.4rem' } },
          h('input', { class: 'input', value: s.hotkey || '', readonly: true }),
          h('button', { class: 'btn outline', onclick: captureHotkey }, 'Đặt phím…')),
        // nói thẳng phím NÀO đang chạy: người dùng chọn 1 đằng, app chạy 1 nẻo là lỗi cũ
        s.hotkeyLive ? h('div', { class: 'muted', style: { fontSize: '.72rem', marginTop: '.3rem' } },
          s.hotkeyLive === s.hotkey ? 'Đang chạy: ' + prettyAccel(s.hotkeyLive) : '⚠ Tổ hợp này bị app khác giữ — tạm dùng: ' + prettyAccel(s.hotkeyLive)) : null),
      h('div', { class: 'muted', style: { fontSize: '.72rem', margin: '-.5rem 0 .7rem' } }, 'Nếu tổ hợp bị app khác (IME, PowerToys…) chiếm, app dùng tạm tổ hợp dự phòng và ghi rõ ở trên. Đóng hết app khác đang giữ phím rồi đặt lại để dùng đúng ý bạn.'),
      h('div', { class: 'sep' }),
      h('div', { class: 'field' }, h('label', { class: 'lbl' }, 'Phím tắt TRONG app (chỉ khi app đang focus)'),
        h('div', { class: 'keylist' }, ...KEY_ACTIONS.map(([act, label]) => h('div', { class: 'keyrow' },
          h('span', { class: 'grow' }, label),
          h('code', { class: 'keycap' }, (s.keys?.[act] || '').replace('mod', 'Ctrl').replace('alt', 'Alt').replace('shift', 'Shift')),
          h('button', { class: 'btn outline sm', onclick: () => captureBind(act) }, 'Đổi'),
          h('button', { class: 'btn ghost sm', title: 'Bỏ phím này', onclick: () => { delete s.keys[act]; commit(); renderSettings(); } }, '✕'))))),
      h('div', { class: 'field' },
        h('label', { style: { display: 'flex', gap: '.5rem', alignItems: 'center', fontSize: '.85rem' } },
          h('input', { type: 'checkbox', checked: s.openOnAdd !== false, onchange: (e) => set('openOnAdd', e.target.checked) }),
          'Thêm việc xong là mở luôn bảng chi tiết (để tuỳ biến ngay)')),
      h('div', { class: 'sep' }),
      h('div', { class: 'row2' },
        h('button', { class: 'btn outline', onclick: () => { ui.modal = 'stats'; render(); } }, 'Thống kê'),
        h('button', { class: 'btn', id: 'settingsDone', onclick: () => { ui.modal = null; render(); } }, 'Đóng'))));
}
function renderSettings() {
  const host = $('#settingsModal');
  if (!host) return;
  const fresh = settingsModal();
  host.replaceWith(fresh);
}
/* ---------------- hộp thoại Hướng dẫn (phím tắt + cách dùng + tác giả) ---------------- */
const AUTHOR = { name: 'Dương Thuận Thông', model: 'DeepSeek V4 Flash', agent: 'Hermes Agent' };
// hiển thị tổ hợp trong app ('mod+n') kiểu bàn phím Windows
const prettyKey = (c) => String(c || '').split('+').map((p) => ({ mod: 'Ctrl', alt: 'Alt', shift: 'Shift', meta: 'Win' }[p] || p.toUpperCase())).join(' + ');

const TIPS = [
  ['Gõ nhanh', 'Họp team #cv !cao 15h mai ~45p'],
  ['#nhãn', '#cv → gắn nhãn cv'],
  ['!ưu tiên', '!cao · !thấp · !tb (trung bình)'],
  ['Giờ', '15h · 9h30 · 20:00'],
  ['Ngày', 'mai · mốt · thứ 6 · 20/9 · 2026-09-20'],
  ['Thời lượng', '~45p · ~1h30'],
];
const GUIDE = [
  ['Bấm vào một dòng việc', 'mở bảng chi tiết để sửa tiêu đề, hạn, ưu tiên, nhãn, ghi chú, nhắc, lặp'],
  ['Kéo thả dòng việc', 'đổi thứ tự trong danh sách; kéo vào cột Kanban → trạng thái, ô Ma trận → ưu tiên + hạn, ô Lịch → ngày đến hạn'],
  ['Nút ☀ ở mỗi dòng', 'cho việc vào "Hôm nay của tôi"; bấm lần nữa để bỏ ra (việc có hạn hôm nay / đã trễ tự nằm sẵn trong đó, bỏ ra thì mai lại hiện)'],
  ['Mũi tên ▾ cạnh việc cha', 'thu gọn / mở rộng việc con'],
  ['Việc cha – con', 'việc con thừa hưởng hạn của cha; tự đặt hạn riêng thì sau đó cha đổi hạn cũng không ghi đè'],
  ['Việc lặp lại', 'mở chi tiết → "Lặp lại" (mỗi ngày / tuần / tháng / năm). Hằng tuần thì bấm các THỨ (T2 T4…), hằng tháng thì gõ NGÀY ("15, cuối" — cuối tự biết 28/29/30/31), kèm GIỜ riêng cho mỗi kỳ. Tick xong thì lần kế tiếp tự sinh vào đúng ngày, không hiện lại ngay'],
  ['Xoá việc', 'chuyển vào "Đã xoá" chứ không mất — khôi phục được bất cứ lúc nào; việc nằm trong đó quá 30 ngày sẽ bị dọn hẳn'],
  ['Đổi tên danh sách', 'rê chuột vào dòng danh sách ở sidebar → bấm ✎ để sửa tên ngay tại chỗ (Enter = lưu, Esc = bỏ); ✕ là xoá danh sách'],
  ['"Sắp tới" & "Đã hoàn thành"', 'gom thành thư mục theo từng ngày, bấm vào tên ngày để gập/mở'],
  ['Cửa sổ mini', 'bấm tên cạnh logo để đổi danh sách đang xem; kéo mép cửa sổ để thu thành thanh mũi tên ở cạnh màn hình; rê chuột vào thanh đó để mở tạm'],
];
const PRIVACY = 'Dữ liệu nằm hoàn toàn trên máy bạn (todoapp.json trong thư mục dữ liệu của app), không gửi đi đâu cả. App tự lưu dự phòng .bak và tự phục hồi nếu file chính hỏng.';

function helpModal() {
  const s = db.settings;
  const globalKeys = [
    [prettyAccel(s.hotkeyLive), 'Mở / thu cửa sổ mini (dùng được cả khi không mở app)'],
    [prettyAccel(s.quickAdd), 'Thêm việc nhanh'],
  ].filter(([k]) => k);
  const localKeys = [
    ...KEY_ACTIONS.filter(([a]) => s.keys?.[a]).map(([a, label]) => [prettyKey(s.keys[a]), label]),
    ['Esc', 'Đóng bảng đang mở · đang ở việc con thì quay về chi tiết việc cha'],
    ['Enter', 'Lưu ô đang sửa · ở ô thêm việc là tạo việc mới'],
  ];
  const row = ([k, label]) => h('div', { class: 'keyrow' }, h('code', { class: 'keycap' }, k), h('span', { class: 'grow' }, label));
  return h('div', { class: 'overlay' },   // chỉ đóng bằng nút Đóng / ✕ / Esc
    h('div', { class: 'card modal', id: 'helpModal' },
      h('div', { class: 'modal-head' }, h('h3', null, 'Hướng dẫn & phím tắt'), h('span', { class: 'grow' }),
        h('button', { class: 'btn ghost icon sm', id: 'helpClose', title: 'Đóng (Esc)', onclick: () => { ui.modal = null; render(); } }, '✕')),
      // Khung tác giả: tác giả · model · AI agent — 3 ô đều nhau, có viền bao quanh
      h('div', { class: 'author' },
        h('div', { class: 'a-item' }, h('span', { class: 'k' }, 'Tác giả'), h('b', null, AUTHOR.name)),
        h('div', { class: 'a-item' }, h('span', { class: 'k' }, 'Model'), h('b', null, AUTHOR.model)),
        h('div', { class: 'a-item agent' }, h('span', { class: 'k' }, 'AI agent'), h('b', null, AUTHOR.agent))),
      h('div', { class: 'sep' }),

      h('div', { class: 'lbl' }, 'Phím tắt TRONG app (khi app đang mở)'),
      h('div', { class: 'keylist' }, ...localKeys.map(row)),
      h('div', { class: 'muted', style: { fontSize: '.72rem', margin: '.35rem 0 .2rem' } }, 'Đổi được ở ⚙ Tuỳ biến → "Phím tắt TRONG app".'),

      h('div', { class: 'sep' }),
      h('div', { class: 'lbl' }, 'Phím tắt TOÀN CỤC (dùng được cả khi đang làm việc khác)'),
      h('div', { class: 'keylist' }, globalKeys.length ? globalKeys.map(row) : h('div', { class: 'muted', style: { fontSize: '.8rem' } }, 'Chưa đặt được phím nào — máy bạn đang bị app khác giữ hết tổ hợp.')),

      h('div', { class: 'sep' }),
      h('div', { class: 'lbl' }, 'Gõ nhanh khi thêm việc'),
      h('div', { class: 'keylist' }, ...TIPS.map(row)),

      h('div', { class: 'sep' }),
      h('div', { class: 'lbl' }, 'Dùng trong 1 phút'),
      h('div', { class: 'helplist' }, ...GUIDE.map(([t, d]) => h('div', { class: 'helpitem' },
        h('b', null, t), h('span', { class: 'muted' }, ' — ' + d)))),

      h('div', { class: 'sep' }),
      h('div', { class: 'lbl' }, 'Việc lặp lại'),
      h('div', { class: 'helplist' },
        h('div', { class: 'helpitem' }, h('b', null, 'Lặp theo thứ (hằng tuần)'), h('span', { class: 'muted' }, ' — chọn "Hằng tuần" rồi bấm các thứ, ví dụ T2 T4; đặt thêm giờ (VD 07:00) để lần lặp rơi đúng giờ đó')),
        h('div', { class: 'helpitem' }, h('b', null, 'Lặp theo ngày (hằng tháng)'), h('span', { class: 'muted' }, ' — chọn "Hằng tháng" rồi gõ ngày, ví dụ "15, cuối"; chữ "cuối" tự hiểu ngày cuối tháng (28/29/30/31), "đầu" là ngày 1')),
        h('div', { class: 'helpitem' }, h('b', null, 'Mỗi N …'), h('span', { class: 'muted' }, ' — "Mỗi (tuần)" = 2 nghĩa là cách 2 tuần một lần'))),

      h('div', { class: 'sep' }),
      h('div', { class: 'lbl' }, 'Âm thanh'),
      h('div', { class: 'helplist' },
        h('div', { class: 'helpitem' }, h('b', null, 'Tiếng báo khi xong việc'), h('span', { class: 'muted' }, ' — mặc định có tiếng "ting"; tắt được ở ⚙ Tuỳ biến, và chọn được file âm thanh riêng của bạn (mp3/wav/ogg…)'))),

      h('div', { class: 'sep' }),
      h('div', { class: 'lbl' }, 'Dữ liệu của bạn'),
      h('div', { class: 'muted', style: { fontSize: '.78rem' } }, PRIVACY),

      h('div', { class: 'row2' },
        h('button', { class: 'btn outline', onclick: () => { ui.modal = 'settings'; render(); } }, 'Tuỳ biến'),
        h('button', { class: 'btn', onclick: () => { ui.modal = null; render(); } }, 'Đóng'))));
}

function statsModal() {
  const data = T.stats(db.tasks, 14);
  const max = Math.max(1, ...data.map((d) => d.done));
  const total = data.reduce((s, d) => s + d.done, 0);
  return h('div', { class: 'overlay' },
    h('div', { class: 'card modal' },
      h('div', { class: 'modal-head' }, h('h3', null, 'Năng suất 14 ngày'), h('span', { class: 'grow' }),
        h('button', { class: 'btn ghost icon sm', title: 'Đóng', onclick: () => { ui.modal = null; render(); } }, '✕')),
      h('div', { class: 'chart' }, ...data.map((d) => h('div', { style: { height: (d.done / max * 100) + '%' }, dataset: { n: `${d.day}: ${d.done}` }, title: d.day + ': ' + d.done }))),
      h('div', { class: 'muted', style: { display: 'flex', justifyContent: 'space-between', fontSize: '.72rem', marginTop: '.3rem' } },
        h('span', null, data[0]?.day), h('span', null, `${total} việc xong`), h('span', null, data[data.length - 1]?.day)),
      h('div', { class: 'sep' }),
      h('div', { style: { display: 'flex', gap: '1rem', fontSize: '.85rem' } },
        h('span', null, 'Đang mở: ', h('strong', null, db.tasks.filter((t) => !t.done).length)),
        h('span', null, 'Xong hôm nay: ', h('strong', null, db.tasks.filter((t) => t.done && t.doneAt && ymd(t.doneAt) === ymd(new Date())).length)),
        h('span', null, 'Trễ hạn: ', h('strong', null, db.tasks.filter((t) => T.overdue(t)).length))),
      h('div', { class: 'sep' }),
      h('div', { class: 'row2' },
        h('button', { class: 'btn outline', onclick: () => { ui.modal = 'settings'; render(); } }, 'Tuỳ biến'),
        h('button', { class: 'btn', onclick: () => { ui.modal = null; render(); } }, 'Đóng'))));
}
