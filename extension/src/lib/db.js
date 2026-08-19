/**
 * db.js — 唯一的資料存取層。
 * 目前打 chrome.storage.local；之後要接 Supabase 只要換掉這個檔的實作，
 * 上層 popup / options 不用改。欄位命名刻意跟 supabase/schema.sql 對齊。
 */

export const DEFAULT_SETTINGS = {
  idleThresholdMin: 15,  // 閒置多久後提醒
  weekStartsOn: 1,       // 1 = 星期一
  roundToMin: 0,         // 0 = 不進位；設 15 就是每筆進位到 15 分
};

const K = {
  projects: 'projects',
  tags: 'tags',
  tasks: 'tasks',
  entries: 'entries',
  timer: 'timer',
  settings: 'settings',
  schedules: 'schedules',
};

import { wouldCycle } from './tree.js';
import { removeProjectData } from './relations.js';
import { normalizePriority } from './todo-filter.js';

export const uid = () => crypto.randomUUID();
export const nowISO = () => new Date().toISOString();

async function read(key, fallback) {
  const r = await chrome.storage.local.get(key);
  return r[key] === undefined ? fallback : r[key];
}
async function write(key, value) {
  await chrome.storage.local.set({ [key]: value });
}

/* ---------------- settings ---------------- */

export async function getSettings() {
  return { ...DEFAULT_SETTINGS, ...(await read(K.settings, {})) };
}
export async function saveSettings(patch) {
  const next = { ...(await getSettings()), ...patch };
  await write(K.settings, next);
  return next;
}

/* ---------------- projects ---------------- */

export async function listProjects({ includeArchived = false } = {}) {
  const all = await read(K.projects, []);
  return all
    .filter((p) => includeArchived || !p.archivedAt)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function upsertProject(p) {
  const all = await read(K.projects, []);
  const i = all.findIndex((x) => x.id === p.id);
  const prev = i >= 0 ? all[i] : null;
  const row = {
    id: p.id || uid(),
    parentId: p.parentId || null,   // 專案可以無限往下掛
    name: (p.name || '').trim(),
    notes: p.notes || '',
    color: p.color || '#201d1d',
    // 目標／筆記是 append 式的時間軸，只能透過下面三個函式動
    notes: prev?.notes || p.notes || [],
    archivedAt: p.archivedAt || null,
    createdAt: p.createdAt || nowISO(),
  };
  // 擋迴圈：不能把自己掛到自己的後代底下
  if (row.parentId && wouldCycle(all, row.id, row.parentId)) {
    throw new Error('不能把專案掛到自己的子專案底下');
  }
  if (i >= 0) all[i] = { ...all[i], ...row };
  else all.push(row);
  await write(K.projects, all);
  return row;
}

/**
 * 刪除專案。子專案不會一起消失，會往上接到祖父層（避免誤刪整棵樹）。
 * 既有時間紀錄保留，只是變成未分類。
 */
export async function deleteProject(id) {
  const all = await read(K.projects, []);
  const tasks = await read(K.tasks, []);
  const entries = await read(K.entries, []);
  const next = removeProjectData(id, { projects: all, tasks, entries });
  await write(K.projects, next.projects);
  await write(K.tasks, next.tasks);
  await write(K.entries, next.entries);
}

/* ---------------- 專案目標／筆記（append 式，每則帶時間戳） ---------------- */

async function withProject(id, fn) {
  const all = await read(K.projects, []);
  const i = all.findIndex((p) => p.id === id);
  if (i < 0) throw new Error('找不到專案');
  all[i] = { ...all[i], notes: fn(all[i].notes || []) };
  await write(K.projects, all);
  return all[i];
}

/** 新增一則，記下寫入當下的時間 */
export async function addProjectNote(projectId, text) {
  const t = (text || '').trim();
  if (!t) return null;
  return withProject(projectId, (notes) => [
    ...notes,
    { id: uid(), text: t, createdAt: nowISO(), updatedAt: null },
  ]);
}

/** 修改既有的一則；createdAt 保留，另外記 updatedAt */
export async function updateProjectNote(projectId, noteId, text) {
  return withProject(projectId, (notes) =>
    notes.map((n) => (n.id === noteId
      ? { ...n, text: (text || '').trim(), updatedAt: nowISO() }
      : n)));
}

export async function deleteProjectNote(projectId, noteId) {
  return withProject(projectId, (notes) => notes.filter((n) => n.id !== noteId));
}

/* ---------------- tags ---------------- */

export async function listTags() {
  return (await read(K.tags, [])).sort((a, b) => a.name.localeCompare(b.name));
}
export async function upsertTag(t) {
  const all = await read(K.tags, []);
  const i = all.findIndex((x) => x.id === t.id);
  const row = { id: t.id || uid(), name: (t.name || '').trim(), color: t.color || '#646262' };
  if (i >= 0) all[i] = row; else all.push(row);
  await write(K.tags, all);
  return row;
}
export async function deleteTag(id) {
  await write(K.tags, (await read(K.tags, [])).filter((t) => t.id !== id));
  const entries = await read(K.entries, []);
  await write(K.entries, entries.map((e) => ({ ...e, tagIds: (e.tagIds || []).filter((x) => x !== id) })));
}

/* ---------------- tasks (todo) ---------------- */

export async function listTasks({ projectId = null, includeDone = true } = {}) {
  let all = await read(K.tasks, []);
  if (projectId) all = all.filter((t) => t.projectId === projectId);
  if (!includeDone) all = all.filter((t) => t.status !== 'done');
  return all.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

export async function upsertTask(t) {
  const all = await read(K.tasks, []);
  const i = all.findIndex((x) => x.id === t.id);
  const prev = i >= 0 ? all[i] : null;
  const status = t.status || 'todo';   // todo | doing | done | archived
  const isDone = status === 'done';
  const wasDone = prev?.status === 'done';

  const row = {
    id: t.id || uid(),
    projectId: t.projectId || null,
    parentId: t.parentId || null,
    title: (t.title || '').trim(),
    notes: t.notes || '',
    status,
    priority: ['urgent', 'high', 'normal', 'low'].includes(t.priority) ? t.priority : 'normal',

    // 開單時間：建立當下決定，之後一律沿用舊值，不接受外部覆蓋
    openedAt: prev?.openedAt || nowISO(),
    // 截止日：唯一可以手改的日期，只到日期精度
    dueDate: t.dueDate || null,
    // 截止時間 HH:MM，排程產生的才會有；用來算提醒
    dueTime: t.dueTime || null,
    // 由哪一條排程產生的
    scheduleId: t.scheduleId || prev?.scheduleId || null,
    // 結案時間：按下完成的當下；重新打開就清掉
    completedAt: isDone ? (prev?.completedAt || nowISO()) : null,
    // 被重新打開過幾次 —— 一直回來的事情值得注意
    reopenCount: (prev?.reopenCount || 0) + (wasDone && !isDone ? 1 : 0),

    sortOrder: t.sortOrder ?? Date.now(),
    createdAt: t.createdAt || prev?.createdAt || nowISO(),
    updatedAt: nowISO(),
  };
  if (i >= 0) all[i] = { ...all[i], ...row }; else all.push(row);
  await write(K.tasks, all);
  return row;
}

export async function deleteTask(id) {
  await write(K.tasks, (await read(K.tasks, [])).filter((t) => t.id !== id));
  const entries = await read(K.entries, []);
  await write(K.entries, entries.map((e) => (e.taskId === id ? { ...e, taskId: null } : e)));
}

/* ---------------- schedules（週期排程） ----------------
 * 例：每個平日 09:00 自動開一張「填寫工作日誌」，截止 17:30，提前 10 分鐘提醒。
 * weekdays 用 0=週日 … 6=週六。
 */

export async function listSchedules() {
  return (await read(K.schedules, [])).sort((a, b) =>
    (a.createTime || '').localeCompare(b.createTime || '') || a.title.localeCompare(b.title));
}

export async function upsertSchedule(s) {
  const all = await read(K.schedules, []);
  const i = all.findIndex((x) => x.id === s.id);
  const prev = i >= 0 ? all[i] : null;
  const row = {
    id: s.id || uid(),
    title: (s.title || '').trim(),
    projectId: s.projectId || null,
    priority: normalizePriority(s.priority),
    notes: s.notes || '',
    weekdays: Array.isArray(s.weekdays) ? [...s.weekdays].sort() : [1, 2, 3, 4, 5],
    createTime: s.createTime || '09:00',        // 幾點自動開單
    dueTime: s.dueTime || null,                 // 當天幾點截止
    remindMinutes: s.remindMinutes === null || s.remindMinutes === undefined
      ? null : Number(s.remindMinutes),         // 截止前幾分鐘提醒
    enabled: s.enabled !== false,
    lastRunDate: prev?.lastRunDate || null,     // 防止同一天重複開單
    createdAt: prev?.createdAt || nowISO(),
    updatedAt: nowISO(),
  };
  if (i >= 0) all[i] = { ...all[i], ...row }; else all.push(row);
  await write(K.schedules, all);
  return row;
}

export async function deleteSchedule(id) {
  await write(K.schedules, (await read(K.schedules, [])).filter((s) => s.id !== id));
}

const hhmmToMin = (s) => {
  if (!s) return null;
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
};

/**
 * 檢查有哪些排程該執行了，執行的就建立對應的 Todo。
 * 由 background 的 alarm 每分鐘叫一次；用 lastRunDate 擋重複。
 * @returns {Promise<Array>} 這次新建的 task
 */
export async function runDueSchedules(now = new Date()) {
  const all = await read(K.schedules, []);
  if (!all.length) return [];

  const today = fmtDateLocal(now);
  const dow = now.getDay();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const created = [];
  let dirty = false;

  for (const s of all) {
    if (!s.enabled) continue;
    if (!s.weekdays.includes(dow)) continue;
    if (s.lastRunDate === today) continue;
    if (nowMin < hhmmToMin(s.createTime)) continue;

    const task = await upsertTask({
      // 每次排程產生的 Todo 都帶上執行日期，避免每天看起來是同一筆工作
      title: `${s.title} · ${today}`,
      projectId: s.projectId,
      priority: s.priority,
      notes: s.notes,
      status: 'todo',
      dueDate: today,
      dueTime: s.dueTime,
      scheduleId: s.id,
    });
    created.push(task);
    s.lastRunDate = today;
    dirty = true;
  }

  if (dirty) await write(K.schedules, all);
  return created;
}

/** 找出接下來需要提醒的 todo（今天、有截止時間、還沒完成、還沒提醒過） */
export async function pendingReminders(now = new Date()) {
  const [tasks, schedules] = await Promise.all([
    read(K.tasks, []), read(K.schedules, []),
  ]);
  const today = fmtDateLocal(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  return tasks.filter((t) => {
    if (t.status === 'done' || t.status === 'archived') return false;
    if (t.dueDate !== today || !t.dueTime) return false;
    if (t.remindedAt) return false;
    const s = schedules.find((x) => x.id === t.scheduleId);
    const lead = s?.remindMinutes ?? 0;
    return nowMin >= hhmmToMin(t.dueTime) - lead;
  });
}

export async function markReminded(taskId) {
  const all = await read(K.tasks, []);
  await write(K.tasks, all.map((t) => (t.id === taskId ? { ...t, remindedAt: nowISO() } : t)));
}

/** 本地時區的 YYYY-MM-DD（time.js 的 fmtDate 同義，這裡避免循環相依） */
function fmtDateLocal(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* ---------------- entries ---------------- */

export async function listEntries({ from = null, to = null, limit = null } = {}) {
  let all = (await read(K.entries, [])).filter((e) => !e.deletedAt);
  if (from) all = all.filter((e) => e.startedAt >= from);
  if (to) all = all.filter((e) => e.startedAt <= to);
  all.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
  return limit ? all.slice(0, limit) : all;
}

export async function upsertEntry(e) {
  const all = await read(K.entries, []);
  const i = all.findIndex((x) => x.id === e.id);
  const row = {
    id: e.id || uid(),
    clientEntryId: e.clientEntryId || e.id || uid(),
    projectId: e.projectId || null,
    taskId: e.taskId || null,
    description: e.description || '',   // 一句話：在做什麼
    notes: e.notes || '',               // 工作紀錄：做完之後補的內容
    tagIds: e.tagIds || [],
    startedAt: e.startedAt,
    endedAt: e.endedAt || null,
    source: e.source || 'extension',
    createdAt: e.createdAt || nowISO(),
    updatedAt: nowISO(),
    deletedAt: e.deletedAt || null,
    synced: false,          // 之後接雲端時的離線佇列旗標
  };
  if (i >= 0) all[i] = { ...all[i], ...row }; else all.push(row);
  await write(K.entries, all);
  return row;
}

export async function deleteEntry(id) {
  const all = await read(K.entries, []);
  await write(K.entries, all.map((e) => (e.id === id ? { ...e, deletedAt: nowISO() } : e)));
}

/* ---------------- timer ---------------- */

/** 回傳 { entryId, startedAt, projectId, taskId, description, tagIds } 或 null */
export async function getTimer() {
  return read(K.timer, null);
}

export async function startTimer({
  projectId = null, taskId = null, description = '', notes = '', tagIds = [],
} = {}) {
  await stopTimer(); // 一次只允許一個計時中，跟 DB 的 one_running_per_user 對齊
  const timer = {
    entryId: uid(),
    clientEntryId: uid(),
    startedAt: nowISO(),
    projectId, taskId, description, notes, tagIds,
    idleSince: null,
  };
  await write(K.timer, timer);
  return timer;
}

/** 更新計時中的欄位（切專案、改描述不必重開計時） */
export async function patchTimer(patch) {
  const t = await getTimer();
  if (!t) return null;
  const next = { ...t, ...patch };
  await write(K.timer, next);
  return next;
}

/**
 * 處理閒置提示但繼續計時。
 * 保留時只清除 idleSince；扣除時把計時起點往後移，避免結束 timer。
 */
export async function resolveIdleTimer(discardSeconds = 0) {
  const t = await getTimer();
  if (!t || !t.idleSince) return t;

  const idleSince = new Date(t.idleSince).getTime();
  const now = Date.now();
  const requested = Number(discardSeconds);
  const idleElapsed = Number.isFinite(idleSince)
    ? Math.max(0, (now - idleSince) / 1000)
    : 0;
  const seconds = Math.min(Math.max(0, Number.isFinite(requested) ? requested : 0), idleElapsed);

  let startedAt = t.startedAt;
  const start = new Date(t.startedAt).getTime();
  if (seconds > 0 && Number.isFinite(start)) {
    const adjustedStart = Math.min(now - 1000, start + seconds * 1000);
    startedAt = new Date(adjustedStart).toISOString();
  }

  return patchTimer({ startedAt, idleSince: null });
}

/**
 * 停止計時並落地成一筆 entry。
 * @param {string|null} endedAt ISO 字串；不給就用現在
 * @param {number} discardSeconds 要從尾端扣掉的秒數（閒置扣除用）
 * @param {{ completeTask?: boolean }} options 停止時是否完成掛上的 Todo
 */
export async function stopTimer(endedAt = null, discardSeconds = 0, { completeTask = false } = {}) {
  const t = await getTimer();
  if (!t) return null;
  let end = new Date(endedAt || nowISO()).getTime() - discardSeconds * 1000;
  const start = new Date(t.startedAt).getTime();
  if (end <= start) end = start + 1000; // 至少 1 秒，避免 0 長度紀錄

  const settings = await getSettings();
  let endISO = new Date(end).toISOString();
  if (settings.roundToMin > 0) {
    const unit = settings.roundToMin * 60 * 1000;
    endISO = new Date(start + Math.ceil((end - start) / unit) * unit).toISOString();
  }

  const entry = await upsertEntry({
    id: t.entryId,
    clientEntryId: t.clientEntryId,
    projectId: t.projectId,
    taskId: t.taskId,
    description: t.description,
    notes: t.notes || '',   // 計時中隨手寫的內容跟著落地
    tagIds: t.tagIds,
    startedAt: t.startedAt,
    endedAt: endISO,
  });
  if (completeTask && t.taskId) {
    const tasks = await read(K.tasks, []);
    const task = tasks.find((item) => item.id === t.taskId);
    if (task && task.status !== 'done') await upsertTask({ ...task, status: 'done' });
  }
  await chrome.storage.local.remove(K.timer);
  return entry;
}

/* ---------------- 統計 ---------------- */

export function durationSec(entry) {
  if (!entry.endedAt) return 0;
  return Math.max(0, Math.round((new Date(entry.endedAt) - new Date(entry.startedAt)) / 1000));
}

/** 直接記在各專案上的秒數；未分類放在 key = null */
export function secondsByProject(entries) {
  const m = new Map();
  for (const e of entries) {
    const k = e.projectId || null;
    m.set(k, (m.get(k) || 0) + durationSec(e));
  }
  return m;
}

/** 依專案彙總 → [{projectId, name, color, seconds}]，時數由多到少 */
export function groupByProject(entries, projects) {
  const map = new Map();
  for (const e of entries) {
    const key = e.projectId || '__none__';
    if (!map.has(key)) map.set(key, { projectId: e.projectId, seconds: 0 });
    const g = map.get(key);
    g.seconds += durationSec(e);
  }
  return [...map.values()]
    .map((g) => {
      const p = projects.find((x) => x.id === g.projectId);
      return { ...g, name: p ? p.name : '（未分類）', color: p ? p.color : '#9a9898' };
    })
    .sort((a, b) => b.seconds - a.seconds);
}

/* ---------------- 匯出 / 匯入 ---------------- */

export async function exportAll() {
  const [projects, tags, tasks, entries, schedules, settings] = await Promise.all([
    read(K.projects, []), read(K.tags, []), read(K.tasks, []),
    read(K.entries, []), read(K.schedules, []), getSettings(),
  ]);
  return { version: 1, exportedAt: nowISO(), projects, tags, tasks, entries, schedules, settings };
}

export async function importAll(data) {
  if (!data || data.version !== 1) throw new Error('備份檔格式不符');
  await chrome.storage.local.set({
    [K.projects]: data.projects || [],
    [K.tags]: data.tags || [],
    [K.tasks]: data.tasks || [],
    [K.entries]: data.entries || [],
    [K.schedules]: data.schedules || [],
    [K.settings]: { ...DEFAULT_SETTINGS, ...(data.settings || {}) },
  });
}
