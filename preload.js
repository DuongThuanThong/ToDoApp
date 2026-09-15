'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const { parseSmart, view, inMyDay, myDaySection, MYDAY_SECTIONS, autoSchedule, stats, toggleDone, subtaskProgress, overdue, setDue, inheritDue } = require('./lib/tasks');

contextBridge.exposeInMainWorld('api', {
  load: () => ipcRenderer.invoke('db:load'),
  save: (db) => ipcRenderer.invoke('db:save', db),
  onDb: (fn) => ipcRenderer.on('db', (_e, db) => fn(db)),
  onAlert: (fn) => ipcRenderer.on('alert', (_e, t) => fn(t)),
  win: (a) => ipcRenderer.invoke('win:action', a),
  mini: {
    toggle: () => ipcRenderer.invoke('mini:toggle'),
    expand: () => ipcRenderer.invoke('mini:expand'),
    collapse: () => ipcRenderer.invoke('mini:collapse'),
    hide: () => ipcRenderer.invoke('mini:hide'),
    reset: () => ipcRenderer.invoke('mini:reset'),
    peek: (on) => ipcRenderer.invoke('mini:peek', on),
    onState: (fn) => ipcRenderer.on('mini:state', (_e, s) => fn(s)),
    onFocusAdd: (fn) => ipcRenderer.on('mini:focus-add', () => fn()),
  },
  openMain: () => ipcRenderer.invoke('open:main'),
  pickImage: () => ipcRenderer.invoke('dialog:pickImage'),
  pickSound: () => ipcRenderer.invoke('dialog:pickSound'),
  notify: (title, body) => ipcRenderer.invoke('notify', { title, body }),
  autostart: (v) => ipcRenderer.invoke('app:autostart', v),
  hotkey: (accel) => ipcRenderer.invoke('app:hotkey', accel),
  quit: () => ipcRenderer.invoke('app:quit'),
  snooze: (id, minutes) => ipcRenderer.invoke('task:snooze', { id, minutes }),
  toggleTask: (id, done) => ipcRenderer.invoke('task:toggle', { id, done }),
  setDue: (id, due) => ipcRenderer.invoke('task:setDue', { id, due }),
  addTask: (task) => ipcRenderer.invoke('task:add', task),
  testAlert: () => ipcRenderer.invoke('app:testAlert'),
  isMini: new URLSearchParams(location.search).get('mini') === '1',
  T: { parseSmart, view, inMyDay, myDaySection, MYDAY_SECTIONS, autoSchedule, stats, toggleDone, subtaskProgress, overdue, setDue, inheritDue },
});
