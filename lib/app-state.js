'use strict';
/* Cờ trạng thái sống của tiến trình, tách ra để tránh require vòng giữa windows ↔ ipc ↔ main */
module.exports = { quitting: false };
