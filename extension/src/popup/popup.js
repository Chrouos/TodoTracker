import * as db from '../lib/db.js';
import { initCollapse } from '../lib/collapse.js';
import { flattenTree, indentLabel } from '../lib/tree.js';
import { autoGrow } from '../lib/autogrow.js';

// popup 空間有限，上限拉到 260px，超過才捲
const growLive = autoGrow(document.getElementById('liveText'), { min: 88, max: 260 });
const growLog = autoGrow(document.getElementById('logText'), { min: 72, max: 220 });
import { fmtHMS, fmtHM, fmtClock, fmtDate, startOfDay, startOfWeek } from '../lib/time.js';
import { buildSummary, copyToClipboard } from '../lib/summary.js';
import { filterTasks, normalizePriority, priorityLabel } from '../lib/todo-filter.js';

const $ = (id) => document.getElementById(id);

let state = {
  projects: [], tags: [], tasks: [], timer: null, settings: db.DEFAULT_SETTINGS,
  entries: [], draft: { projectId: null, taskId: null, description: '', tagIds: [] },
};
let ticker = null;
/** 剛停止、還沒補工作紀錄的那筆 entry id */
let pendingLogId = null;
let todoAdvancedOpen = false;

/* ---------------- draft（計時前暫存的選擇，關掉 popup 也留著） ---------------- */
const getDraft = async () =>
  (await chrome.storage.local.get('draft')).draft || { projectId: null, taskId: null, description: '', tagIds: [] };
const setDraft = (d) => chrome.storage.local.set({ draft: d });

/* ---------------- 載入 ---------------- */
async function load() {
  const [projects, tags, tasks, timer, settings, entries, draft] = await Promise.all([
    db.listProjects(), db.listTags(), db.listTasks({ includeDone: true }),
    db.getTimer(), db.getSettings(),
    // 用週日當起點多抓一天，避免 weekStartsOn=0 時本週資料被切掉
    db.listEntries({ from: startOfWeek(new Date(), 0).toISOString() }),
    getDraft(),
  ]);
  state = { projects, tags, tasks, timer, settings, entries, draft };
  render();
}

/* ---------------- 目前正在編輯的那組欄位 ---------------- */
const current = () => (state.timer ? state.timer : state.draft);

async function patchCurrent(patch) {
  if (state.timer) {
    state.timer = await db.patchTimer(patch);
  } else {
    state.draft = { ...state.draft, ...patch };
    await setDraft(state.draft);
  }
  render();
}

/* ---------------- 渲染 ---------------- */
function render() {
  renderPanel();
  renderLog();
  renderIdle();
  renderFields();
  renderStats();
  renderRecent();
  renderTodo();
}

function renderPanel() {
  const btn = $('toggle');
  const c = current();
  const p = state.projects.find((x) => x.id === c.projectId);

  if (state.timer) {
    btn.dataset.state = 'running';
    btn.textContent = '[x] 停止';
    $('ctx').textContent = [p ? p.name : '未分類', c.description || '（無描述）'].join(' · ');
    startTicking();
  } else {
    btn.dataset.state = 'idle';
    btn.textContent = '[>] 開始計時';
    $('ctx').textContent = '未計時';
    stopTicking();
    $('clock').textContent = '00:00:00';
  }
}

function startTicking() {
  if (ticker) return;
  const tick = () => {
    if (!state.timer) return;
    const sec = (Date.now() - new Date(state.timer.startedAt).getTime()) / 1000;
    $('clock').textContent = fmtHMS(sec);
  };
  tick();
  ticker = setInterval(tick, 1000);
}
function stopTicking() { clearInterval(ticker); ticker = null; }

function renderLog() {
  const box = $('logBox');
  const e = state.entries.find((x) => x.id === pendingLogId);
  if (!e) { box.hidden = true; return; }
  box.hidden = false;
  const p = state.projects.find((x) => x.id === e.projectId);
  $('logMeta').textContent =
    `${p ? p.name : '未分類'} · ${fmtClock(e.startedAt)}–${fmtClock(e.endedAt)} · ${fmtHM(db.durationSec(e))}`;
  if ($('logText') !== document.activeElement) {
    $('logText').value = e.notes || '';
    growLog();
  }
}

function renderIdle() {
  const bar = $('idleBar');
  const t = state.timer;
  if (!t || !t.idleSince) { bar.hidden = true; return; }
  const sec = (Date.now() - new Date(t.idleSince).getTime()) / 1000;
  if (sec < 60) { bar.hidden = true; return; }
  bar.hidden = false;
  $('idleText').textContent = `偵測到閒置 ${fmtHM(sec)}`;
}

function renderFields() {
  const c = current();
  if ($('desc') !== document.activeElement) $('desc').value = c.description || '';

  // 即時工作紀錄只在計時中出現
  $('liveLog').hidden = !state.timer;
  if (state.timer && $('liveText') !== document.activeElement) {
    $('liveText').value = state.timer.notes || '';
    growLive();
  }

  // 專案下拉：樹狀縮排，已封存的整棵子樹不列
  const ps = $('project');
  ps.innerHTML = '<option value="">— 未分類 —</option>' +
    flattenTree(state.projects, { includeArchived: false })
      .map((p) => `<option value="${p.id}">${esc(indentLabel(p.name, p.depth))}</option>`).join('');
  ps.value = c.projectId || '';

  // Todo 下拉：只列出該專案未完成的
  const ts = $('task');
  const avail = state.tasks.filter(
    (t) => t.status !== 'done' && (!c.projectId || t.projectId === c.projectId)
  );
  ts.innerHTML = '<option value="">— 不綁 todo —</option>' +
    avail.map((t) => `<option value="${t.id}">${esc(t.title)}</option>`).join('');
  ts.value = c.taskId || '';

  // 標籤
  const tagIds = c.tagIds || [];
  $('tagRow').innerHTML = state.tags.length
    ? state.tags.map((t) =>
        `<button class="tagchip ${tagIds.includes(t.id) ? 'on' : ''}" data-tag="${t.id}">${esc(t.name)}</button>`
      ).join('')
    : '<span class="cap">還沒有標籤，可在 [管理] 新增</span>';
}

function renderStats() {
  const d0 = startOfDay().toISOString();
  const w0 = startOfWeek(new Date(), state.settings.weekStartsOn).toISOString();
  const today = state.entries.filter((e) => e.startedAt >= d0);
  const week = state.entries.filter((e) => e.startedAt >= w0);

  const sum = (arr) => arr.reduce((s, e) => s + db.durationSec(e), 0);

  $('stToday').textContent = fmtHM(sum(today));
  $('stWeek').textContent = fmtHM(sum(week));
  $('stCount').textContent = String(today.length);
}

function renderRecent() {
  const list = state.entries.slice(0, 6);
  $('recent').innerHTML = list.length
    ? list.map((e) => {
        const p = state.projects.find((x) => x.id === e.projectId);
        return `<div class="item" data-entry="${e.id}">
          <span class="swatch" style="background:${p ? p.color : '#9a9898'}"></span>
          <div class="main">
            <div class="t1">${esc(e.description || '（無描述）')}</div>
            <div class="t2">${p ? esc(p.name) : '未分類'} · ${fmtClock(e.startedAt)}–${fmtClock(e.endedAt)}${e.notes ? ' · 有紀錄' : ''}</div>
          </div>
          <span class="dur">${fmtHM(db.durationSec(e))}</span>
          <button class="btn-ghost btn-sm act" data-log="${e.id}" title="${e.notes ? '編輯' : '補寫'}工作紀錄">[${e.notes ? 'x' : ' '}]</button>
          <button class="btn-ghost btn-sm act" data-resume="${e.id}" title="用同樣設定再開始">[&gt;]</button>
        </div>`;
      }).join('')
    : '<div class="empty">本週還沒有紀錄</div>';
}

function renderTodo() {
  const filterSelect = $('todoFilter');
  const priorityFilter = $('todoPriorityFilter');
  const createProject = $('todoCreateProject');
  const parentSelect = $('todoParent');
  const keepFilter = filterSelect.value;
  const keepPriorityFilter = priorityFilter.value;
  const keepCreateProject = createProject.value;
  const keepParent = parentSelect.value;
  const projectOptions = flattenTree(state.projects, { includeArchived: false });

  filterSelect.innerHTML = '<option value="">— 全部專案 —</option>' +
    projectOptions.map((p) => `<option value="${p.id}">${esc(indentLabel(p.name, p.depth))}</option>`).join('');
  filterSelect.value = keepFilter;
  priorityFilter.value = keepPriorityFilter;

  createProject.innerHTML = '<option value="">— 未指定專案 —</option>' +
    projectOptions.map((p) => `<option value="${p.id}">${esc(indentLabel(p.name, p.depth))}</option>`).join('');
  createProject.value = projectOptions.some((p) => p.id === keepCreateProject) ? keepCreateProject : '';

  const parentOptions = state.tasks
    .filter((t) => t.status !== 'archived' && t.status !== 'done')
    .filter((t) => !createProject.value || t.projectId === createProject.value)
    .sort((a, b) => a.title.localeCompare(b.title));
  parentSelect.innerHTML = '<option value="">— 最上層任務 —</option>' +
    parentOptions.map((t) => {
      const p = state.projects.find((item) => item.id === t.projectId);
      return `<option value="${t.id}">${esc(t.title)}${p ? ` · ${esc(p.name)}` : ''}</option>`;
    }).join('');
  parentSelect.value = parentOptions.some((t) => t.id === keepParent) ? keepParent : '';

  $('todoAdvanced').hidden = !todoAdvancedOpen;
  $('todoMore').setAttribute('aria-expanded', String(todoAdvancedOpen));
  $('todoMore').textContent = todoAdvancedOpen ? '[-] 收合設定' : '[+] 詳細設定';

  const filter = filterSelect.value;
  const priority = priorityFilter.value;
  const list = filterTasks(state.tasks, {
    projectScope: filter ? new Set([filter]) : null,
    priority,
    showDone: true,
  })
    .sort((a, b) => (a.status === 'done') - (b.status === 'done') || (a.sortOrder - b.sortOrder));

  $('todoList').innerHTML = list.length
    ? list.map((t) => {
        const p = state.projects.find((x) => x.id === t.projectId);
        const done = t.status === 'done';
        return `<div class="item ${done ? 'done' : ''}">
          <button class="check" data-check="${t.id}">${done ? '[x]' : '[ ]'}</button>
          <div class="main">
            <div class="t1">${esc(t.title)} <span class="badge priority-${normalizePriority(t.priority)}">${priorityLabel(t.priority)}</span></div>
            <div class="t2">${p ? esc(p.name) : '未分類'}${t.dueDate ? ' · ' + t.dueDate : ''}</div>
          </div>
          <button class="btn-ghost btn-sm act" data-add-subtask="${t.id}" title="新增子任務">[＋子]</button>
          ${done ? '' : `<button class="btn-ghost btn-sm act" data-start-task="${t.id}" title="對這個 todo 計時">[&gt;]</button>`}
          <button class="btn-ghost btn-sm act" data-del-task="${t.id}" title="刪除">[-]</button>
        </div>`;
      }).join('')
    : '<div class="empty">沒有 todo</div>';
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------------- 事件 ---------------- */

$('toggle').addEventListener('click', async () => {
  if (state.timer) {
    // 停止後把這筆掛起來等使用者補工作紀錄
    const entry = await db.stopTimer();
    pendingLogId = entry ? entry.id : null;
    await load();
    $('logText').focus();
    return;
  } else {
    const d = state.draft;
    await db.startTimer({
      projectId: d.projectId || null, taskId: d.taskId || null,
      description: d.description || '', tagIds: d.tagIds || [],
    });
  }
  await load();
});

$('desc').addEventListener('input', (e) => patchCurrentQuiet({ description: e.target.value }));
$('project').addEventListener('change', (e) =>
  patchCurrent({ projectId: e.target.value || null, taskId: null }));
$('task').addEventListener('change', (e) => patchCurrent({ taskId: e.target.value || null }));

// 打字時不重繪，避免游標跳掉
async function patchCurrentQuiet(patch) {
  if (state.timer) state.timer = await db.patchTimer(patch);
  else { state.draft = { ...state.draft, ...patch }; await setDraft(state.draft); }
}

$('tagRow').addEventListener('click', (e) => {
  const id = e.target.dataset?.tag;
  if (!id) return;
  const cur = current().tagIds || [];
  patchCurrent({ tagIds: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
});

$('idleKeep').addEventListener('click', async () => {
  await db.resolveIdleTimer(0);
  await load();
});
$('idleDrop').addEventListener('click', async () => {
  const t = state.timer;
  const sec = (Date.now() - new Date(t.idleSince).getTime()) / 1000;
  await db.resolveIdleTimer(sec);
  await load();
});

$('recent').addEventListener('click', async (e) => {
  const logId = e.target.closest('[data-log]')?.dataset.log;
  if (logId) {
    pendingLogId = logId;
    render();
    $('logText').focus();
    return;
  }
  const id = e.target.closest('[data-resume]')?.dataset.resume;
  if (!id) return;
  const src = state.entries.find((x) => x.id === id);
  await db.startTimer({
    projectId: src.projectId, taskId: src.taskId,
    description: src.description, tagIds: src.tagIds || [],
  });
  await load();
});

/* 計時中的即時紀錄：打字後 500ms 自動存進 timer，停止時一起落地 */
let liveSaveTimer = null;
$('liveText').addEventListener('input', (e) => {
  if (!state.timer) return;
  const value = e.target.value;
  $('liveSaved').textContent = '…';
  clearTimeout(liveSaveTimer);
  liveSaveTimer = setTimeout(async () => {
    state.timer = await db.patchTimer({ notes: value });
    $('liveSaved').textContent = '已存';
    setTimeout(() => { $('liveSaved').textContent = ''; }, 1200);
  }, 500);
});

// 插入 HH:MM 時間戳，方便一條一條記事情發生的時間
$('stampBtn').addEventListener('click', () => {
  const ta = $('liveText');
  const stamp = `${fmtClock(new Date().toISOString())} `;
  const at = ta.selectionStart;
  const before = ta.value.slice(0, at);
  const prefix = before === '' || before.endsWith('\n') ? '' : '\n';
  ta.value = before + prefix + stamp + ta.value.slice(at);
  ta.focus();
  ta.selectionStart = ta.selectionEnd = at + prefix.length + stamp.length;
  ta.dispatchEvent(new Event('input')); // 觸發自動存檔與自動長高
});

/* 停止後補寫的工作紀錄 */
$('logSave').addEventListener('click', async () => {
  const e = state.entries.find((x) => x.id === pendingLogId);
  if (e) await db.upsertEntry({ ...e, notes: $('logText').value });
  pendingLogId = null;
  await load();
});
$('logSkip').addEventListener('click', () => { pendingLogId = null; render(); });
// Ctrl/Cmd + Enter 直接存
$('logText').addEventListener('keydown', (ev) => {
  if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter') $('logSave').click();
});

/* Todo 分頁 */
$('newTodo').addEventListener('keydown', async (e) => {
  if (e.key !== 'Enter' || !e.target.value.trim()) return;
  await db.upsertTask({
    title: e.target.value,
    projectId: $('todoCreateProject').value || null,
    parentId: $('todoParent').value || null,
    priority: $('todoPriority').value,
    dueDate: $('todoDue').value || null,
    dueTime: $('todoDueTime').value || null,
  });
  e.target.value = '';
  await load();
});
$('todoMore').addEventListener('click', () => {
  todoAdvancedOpen = !todoAdvancedOpen;
  renderTodo();
});
$('todoFilter').addEventListener('change', renderTodo);
$('todoPriorityFilter').addEventListener('change', renderTodo);
$('todoCreateProject').addEventListener('change', renderTodo);

$('todoList').addEventListener('click', async (e) => {
  const check = e.target.closest('[data-check]')?.dataset.check;
  const addSubtaskId = e.target.closest('[data-add-subtask]')?.dataset.addSubtask;
  const startId = e.target.closest('[data-start-task]')?.dataset.startTask;
  const delId = e.target.closest('[data-del-task]')?.dataset.delTask;

  if (check) {
    const t = state.tasks.find((x) => x.id === check);
    await db.upsertTask({ ...t, status: t.status === 'done' ? 'todo' : 'done' });
  } else if (addSubtaskId) {
    const parent = state.tasks.find((x) => x.id === addSubtaskId);
    if (!parent) return;
    todoAdvancedOpen = true;
    $('todoCreateProject').value = parent.projectId || '';
    renderTodo();
    $('todoParent').value = parent.id;
    $('newTodo').focus();
    return;
  } else if (startId) {
    const t = state.tasks.find((x) => x.id === startId);
    await db.startTimer({ projectId: t.projectId, taskId: t.id, description: t.title });
    switchTab('track');
  } else if (delId) {
    await db.deleteTask(delId);
  } else return;

  await load();
});

/* 分頁切換 */
function switchTab(name) {
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  $('tab-track').hidden = name !== 'track';
  $('tab-todo').hidden = name !== 'todo';
}
$('tabs').addEventListener('click', (e) => {
  if (e.target.dataset.tab) switchTab(e.target.dataset.tab);
});

$('openOptions').addEventListener('click', () => chrome.runtime.openOptionsPage());

/* 一鍵複製今日總結 */
$('copyToday').addEventListener('click', async (ev) => {
  const btn = ev.currentTarget;
  const today = fmtDate(new Date().toISOString());
  // state.entries 只有本週，總結需要完整資料
  const all = await db.listEntries();
  const md = buildSummary({
    dates: [today], entries: all, projects: state.projects, tasks: state.tasks,
  });
  if (!md) { btn.textContent = '[今天沒紀錄]'; }
  else { btn.textContent = (await copyToClipboard(md)) ? '[已複製]' : '[複製失敗]'; }
  setTimeout(() => { btn.textContent = '[複製今日]'; }, 1500);
});

/* 空白鍵快捷（不在輸入框、也不在收合標題上時）→ 開始/停止 */
document.addEventListener('keydown', (e) => {
  if (e.code !== 'Space') return;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
  if (e.target.closest?.('[data-collapse]')) return; // 交給 collapse.js 處理
  e.preventDefault();
  $('toggle').click();
});

initCollapse();
load();
