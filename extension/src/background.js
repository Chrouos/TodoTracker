/**
 * background.js — MV3 service worker。
 *
 * 重點：SW 閒置約 30 秒就會被殺掉，所以「不」在這裡跑 setInterval 累加秒數。
 * 計時狀態只有一個 startedAt 時間戳存在 chrome.storage.local，
 * 經過時間一律現算。這裡只負責三件事：badge、alarm、閒置偵測。
 */

import * as db from './lib/db.js';
import { getTimer, patchTimer, getSettings } from './lib/db.js';
import { fmtBadge } from './lib/time.js';

const ALARM_TICK = 'tt-tick';
const ALARM_SCHED = 'tt-sched';   // 每分鐘檢查排程與提醒

async function refreshBadge() {
  const t = await getTimer();
  if (!t) {
    await chrome.action.setBadgeText({ text: '' });
    await chrome.action.setTitle({ title: 'TodoTracker — 未計時' });
    return;
  }
  const sec = (Date.now() - new Date(t.startedAt).getTime()) / 1000;
  await chrome.action.setBadgeText({ text: fmtBadge(sec) });
  await chrome.action.setBadgeBackgroundColor({ color: '#201d1d' });
  await chrome.action.setTitle({ title: `TodoTracker — 計時中 ${fmtBadge(sec)}` });
}

async function ensureAlarm() {
  const t = await getTimer();
  const existing = await chrome.alarms.get(ALARM_TICK);
  if (t && !existing) {
    // 1 分鐘是 MV3 alarm 的最小週期
    chrome.alarms.create(ALARM_TICK, { periodInMinutes: 1 });
  } else if (!t && existing) {
    chrome.alarms.clear(ALARM_TICK);
  }
}

async function sync() {
  await ensureAlarm();
  await refreshBadge();
}

/** 排程檢查用的常駐 alarm，跟計時無關，所以永遠開著 */
async function ensureSchedAlarm() {
  if (!(await chrome.alarms.get(ALARM_SCHED))) {
    chrome.alarms.create(ALARM_SCHED, { periodInMinutes: 1 });
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  const s = await getSettings();
  chrome.idle.setDetectionInterval(Math.max(15, s.idleThresholdMin * 60));
  await ensureSchedAlarm();
  await sync();
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureSchedAlarm();
  await sync();
  await tickSchedules();   // 開機時補跑一次，避免錯過今天的排程
});

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === ALARM_TICK) refreshBadge();
  if (a.name === ALARM_SCHED) tickSchedules();
});

/**
 * 每分鐘做兩件事：
 * 1. 到點的排程自動開一張 Todo
 * 2. 快到截止時間的 Todo 發通知
 */
async function tickSchedules() {
  try {
    const created = await db.runDueSchedules();
    for (const t of created) {
      notify(`ts-new-${t.id}`, '新的待辦',
        t.dueTime ? `${t.title}（今天 ${t.dueTime} 截止）` : t.title);
    }

    const due = await db.pendingReminders();
    for (const t of due) {
      notify(`ts-due-${t.id}`, '待辦快到期了', `${t.title} · ${t.dueTime}`);
      await db.markReminded(t.id);
    }
  } catch (e) {
    console.error('[TodoTracker] 排程檢查失敗', e);
  }
}

function notify(id, title, message) {
  chrome.notifications.create(id, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title,
    message,
    priority: 1,
  });
}

// 點通知就打開管理頁的 Todo
chrome.notifications.onClicked.addListener((id) => {
  chrome.notifications.clear(id);
  chrome.runtime.openOptionsPage();
});

// popup / options 改了 timer 就重新同步 badge 與 alarm
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && 'timer' in changes) sync();
  if (area === 'local' && 'settings' in changes) {
    const s = changes.settings.newValue;
    if (s?.idleThresholdMin) {
      chrome.idle.setDetectionInterval(Math.max(15, s.idleThresholdMin * 60));
    }
  }
});

/**
 * 閒置偵測：使用者離開時記下時間點，回來時記下已閒置多久。
 * 不自動停止計時 —— 交給 popup 詢問使用者要不要扣掉。
 */
chrome.idle.onStateChanged.addListener(async (state) => {
  const t = await getTimer();
  if (!t) return;
  if (state === 'idle' || state === 'locked') {
    if (!t.idleSince) await patchTimer({ idleSince: new Date().toISOString() });
  }
  // 回到 active 時保留 idleSince，讓 popup 有機會問；使用者決定後才清掉
});

/* ============================================================
 * 網頁橋接：Next.js 端用 chrome.runtime.sendMessage(EXT_ID, msg) 呼叫。
 * 來源已由 manifest 的 externally_connectable 限制在 localhost，
 * 這裡再檢查一次 origin，多一層保險。
 * ============================================================ */

const ALLOWED_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

const RPC = {
  ping: async () => ({ ok: true, version: chrome.runtime.getManifest().version }),

  getAll: async () => {
    const [projects, tags, tasks, entries, schedules, settings, timer] = await Promise.all([
      db.listProjects({ includeArchived: true }),
      db.listTags(),
      db.listTasks(),
      db.listEntries(),
      db.listSchedules(),
      db.getSettings(),
      db.getTimer(),
    ]);
    return { projects, tags, tasks, entries, schedules, settings, timer };
  },

  upsertProject: (p) => db.upsertProject(p),
  deleteProject: ({ id }) => db.deleteProject(id),
  addProjectNote: ({ projectId, text }) => db.addProjectNote(projectId, text),
  updateProjectNote: ({ projectId, noteId, text }) => db.updateProjectNote(projectId, noteId, text),
  deleteProjectNote: ({ projectId, noteId }) => db.deleteProjectNote(projectId, noteId),
  upsertTag: (t) => db.upsertTag(t),
  deleteTag: ({ id }) => db.deleteTag(id),
  upsertTask: (t) => db.upsertTask(t),
  deleteTask: ({ id }) => db.deleteTask(id),
  upsertSchedule: (s) => db.upsertSchedule(s),
  deleteSchedule: ({ id }) => db.deleteSchedule(id),
  runSchedulesNow: () => db.runDueSchedules(),
  upsertEntry: (e) => db.upsertEntry(e),
  deleteEntry: ({ id }) => db.deleteEntry(id),

  startTimer: (p) => db.startTimer(p || {}),
  patchTimer: (p) => db.patchTimer(p),
  stopTimer: (p) => db.stopTimer(p?.endedAt ?? null, p?.discardSeconds ?? 0),

  saveSettings: (s) => db.saveSettings(s),
  exportAll: () => db.exportAll(),
  importAll: (d) => db.importAll(d),
};

chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  if (!sender.origin || !ALLOWED_ORIGIN.test(sender.origin)) {
    sendResponse({ ok: false, error: 'origin_not_allowed' });
    return false;
  }
  const fn = RPC[msg?.type];
  if (!fn) {
    sendResponse({ ok: false, error: `unknown_type:${msg?.type}` });
    return false;
  }
  Promise.resolve(fn(msg.payload))
    .then((data) => sendResponse({ ok: true, data }))
    .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
  return true; // 非同步回覆
});
