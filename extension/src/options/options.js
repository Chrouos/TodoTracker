import * as db from '../lib/db.js';
import {
  fmtHM, fmtDate, fmtClock, startOfDay, startOfWeek, startOfMonth, dailySeries,
  timelineData, toLocalInput, fromLocalInput,
} from '../lib/time.js';
import { donutSVG, lineSVG, timelineSVG } from '../lib/charts.js';
import { initCollapse } from '../lib/collapse.js';
import { childrenOf, flattenTree, rollup, pathOf, indentLabel } from '../lib/tree.js';
import { buildSummary, copyToClipboard } from '../lib/summary.js';
import { autoGrow } from '../lib/autogrow.js';
import { taskMetrics, dueLabel, leadLabel, stampLabel } from '../lib/tasks.js';
import { markdownToHTML, shouldShowMarkdownToggle } from '../lib/markdown.js';

const growNotes = autoGrow(document.getElementById('enNotes'), { min: 96, max: 360 });
autoGrow(document.getElementById('tdNotes'), { min: 80, max: 320 });
autoGrow(document.getElementById('pjNoteDraft'), { min: 72, max: 320 });
autoGrow(document.getElementById('scNotes'), { min: 72, max: 280 });

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function renderMarkdownPreview(markdown, className = '') {
  return `<div class="${className} markdown-preview" data-markdown-preview>
    <div data-markdown-content>${markdownToHTML(markdown)}</div>
  </div>`;
}

function setMarkdownPreviewExpanded(preview, expanded) {
  preview.classList.toggle('is-expanded', expanded);
  preview.querySelectorAll('[data-markdown-toggle]').forEach((button) => {
    button.textContent = expanded ? '[-] 收闔全文' : '[+] 展開全文';
    button.setAttribute('aria-expanded', String(expanded));
  });
}

function measureMarkdownPreview(preview, preserveExpanded = false) {
  const content = preview.querySelector('[data-markdown-content]');
  const wasExpanded = preview.classList.contains('is-expanded');
  const collapsedHeight = Number.parseFloat(
    getComputedStyle(preview).getPropertyValue('--markdown-preview-collapsed-height'),
  );
  const isLong = shouldShowMarkdownToggle(content.textContent, content.scrollHeight, collapsedHeight);
  preview.classList.toggle('is-collapsible', isLong);
  let button = preview.querySelector('[data-markdown-toggle]');
  if (isLong && !button) {
    preview.insertAdjacentHTML('afterbegin', '<button type="button" class="btn-sm markdown-toggle markdown-toggle-top" data-markdown-toggle aria-expanded="false">[+] 展開全文</button>');
    button = preview.querySelector('[data-markdown-toggle]');
  } else if (!isLong && button) {
    button.remove();
  }
  setMarkdownPreviewExpanded(preview, preserveExpanded && wasExpanded && isLong);
}

function initializeMarkdownPreviews(container, preserveExpanded = false) {
  container.querySelectorAll('[data-markdown-preview]').forEach((preview) => measureMarkdownPreview(preview, preserveExpanded));
}

let markdownPreviewResizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(markdownPreviewResizeTimer);
  markdownPreviewResizeTimer = setTimeout(() => {
    document.querySelectorAll('[data-markdown-preview]').forEach((preview) => {
      if (preview.offsetParent !== null) measureMarkdownPreview(preview, true);
    });
  }, 100);
});

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-markdown-toggle]');
  if (!button) return;
  const preview = button.closest('[data-markdown-preview]');
  if (!preview?.classList.contains('is-collapsible')) return;
  setMarkdownPreviewExpanded(preview, !preview.classList.contains('is-expanded'));
});

let S = { projects: [], tags: [], tasks: [], entries: [], schedules: [], settings: db.DEFAULT_SETTINGS };
let range = 'week';

async function load() {
  const [projects, tags, tasks, entries, schedules, settings] = await Promise.all([
    db.listProjects({ includeArchived: true }), db.listTags(),
    db.listTasks(), db.listEntries(), db.listSchedules(), db.getSettings(),
  ]);
  S = { projects, tags, tasks, entries, schedules, settings };
  renderAll();
}

function rangeStart() {
  if (range === 'today') return startOfDay();
  if (range === 'week') return startOfWeek(new Date(), S.settings.weekStartsOn);
  if (range === 'month') return startOfMonth();
  return new Date(0);
}
const inRange = () => {
  const from = rangeStart().toISOString();
  return S.entries.filter((e) => e.endedAt && e.startedAt >= from);
};

function renderAll() {
  renderReport(); renderProjects(); renderTodos(); renderSchedules();
  renderTags(); renderEntries(); renderSettings();
}

/* ---------------- 報表 ---------------- */
function renderReport() {
  const rows = inRange();
  const sec = rows.reduce((s, e) => s + db.durationSec(e), 0);
  const dayKeys = new Set(rows.map((e) => fmtDate(e.startedAt)));

  $('kTime').textContent = fmtHM(sec);
  $('kCount').textContent = rows.length;
  $('kAvg').textContent = rows.length ? fmtHM(sec / rows.length) : '—';
  $('kDays').textContent = dayKeys.size;

  // 專案分配：甜甜圈 + 圖例，時數向上累加，可以往下鑽
  renderDonut(rows);

  // 每日趨勢：區間太短就往前補，才看得出趨勢
  const today = startOfDay();
  const lineFrom =
    range === 'today' ? new Date(today.getTime() - 6 * 864e5)
      : range === 'week' ? startOfWeek(new Date(), S.settings.weekStartsOn)
        : range === 'month' ? startOfMonth()
          : new Date(today.getTime() - 29 * 864e5);
  $('lineLabel').textContent =
    '· ' + (range === 'today' ? '最近 7 天'
      : range === 'week' ? '本週'
        : range === 'month' ? '本月' : '最近 30 天');

  const series = dailySeries(
    S.entries.filter((e) => e.endedAt && new Date(e.startedAt) >= lineFrom),
    lineFrom, new Date(), db.durationSec,
  );
  $('byDay').innerHTML = lineSVG(series);

  // 時間軸：太多天會擠爆，最多顯示最近 14 天
  const tlDates = series.map((d) => d.date).slice(-14);
  $('timeLabel').textContent = tlDates.length
    ? `· ${tlDates[0]} ～ ${tlDates[tlDates.length - 1]}`
    : '';
  const tl = timelineData(
    S.entries.filter((e) => e.endedAt && !e.deletedAt),
    tlDates,
  );
  $('timeline').innerHTML = timelineSVG(tl, (e) => {
    const p = S.projects.find((x) => x.id === e.projectId);
    return {
      color: p ? p.color : '#9a9898',
      label: e.description || (p ? p.name : '未分類'),
    };
  });
}

/* ---------------- 甜甜圈（可鑽取） ---------------- */

let focusId = null; // null = 看最頂層

function renderDonut(rows) {
  const own = db.secondsByProject(rows);
  const roll = rollup(S.projects, own);

  // 這一層要顯示的切片 = 目前焦點的直接子專案（時數含各自的後代）
  const slices = childrenOf(S.projects, focusId)
    .map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      seconds: roll.get(p.id)?.total || 0,
      canDrill: childrenOf(S.projects, p.id).length > 0,
    }))
    .filter((s) => s.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds);

  // 直接記在這一層、沒有掛到子專案的時間
  const here = own.get(focusId) || 0;
  if (here > 0) {
    slices.push({
      id: null,
      name: focusId ? '（直接記在本層）' : '（未分類）',
      color: '#9a9898',
      seconds: here,
      canDrill: false,
    });
  }

  const total = slices.reduce((s, x) => s + x.seconds, 0);
  const crumbs = focusId ? pathOf(S.projects, focusId) : [];
  const ancestors = [];
  {
    let cur = S.projects.find((p) => p.id === focusId);
    while (cur) {
      ancestors.unshift(cur.id);
      cur = cur.parentId ? S.projects.find((p) => p.id === cur.parentId) : null;
    }
  }

  const crumbHtml = `<div class="crumbs">
    <span class="crumb" data-focus="">全部</span>
    ${crumbs.map((n, i) => `<span class="mute">/</span>
      <span class="crumb" data-focus="${ancestors[i]}">${esc(n)}</span>`).join('')}
  </div>`;

  if (!slices.length) {
    $('byProject').innerHTML = crumbHtml + '<div class="empty">這個區間沒有紀錄</div>';
    return;
  }

  $('byProject').innerHTML = crumbHtml + `<div class="chart-split">
    ${donutSVG(slices)}
    <div class="legend">
      ${slices.map((s) => `
        <div class="legend-row${s.canDrill ? ' drillable' : ''}"
             ${s.canDrill ? `data-focus="${s.id}" title="點開看子專案"` : ''}>
          <span class="swatch" style="background:${s.color}"></span>
          <span class="grow ellipsis">${esc(s.name)}${s.canDrill ? ' <span class="mark">[+]</span>' : ''}</span>
          <span class="num">${fmtHM(s.seconds)}</span>
          <span class="num mute" style="width:48px;text-align:right">
            ${total ? Math.round((s.seconds / total) * 100) + '%' : '—'}</span>
        </div>`).join('')}
    </div>
  </div>`;
}

$('byProject').addEventListener('click', (e) => {
  const el = e.target.closest('[data-focus]');
  if (!el) return;
  focusId = el.dataset.focus || null;
  renderReport();
});

/* ---------------- 專案 ---------------- */
function renderProjects() {
  const own = db.secondsByProject(S.entries.filter((e) => e.endedAt));
  const roll = rollup(S.projects, own);
  const tree = flattenTree(S.projects);

  // 上層專案下拉：編輯中的專案與它的後代要排除，否則會形成迴圈
  const editing = $('pjId').value;
  const excluded = editing
    ? new Set([editing, ...descendantSet(editing)])
    : new Set();
  const keepParent = $('pjParent').value;
  $('pjParent').innerHTML = '<option value="">— 最上層 —</option>' +
    tree.filter((p) => !excluded.has(p.id))
      .map((p) => `<option value="${p.id}">${esc(indentLabel(p.name, p.depth))}</option>`).join('');
  $('pjParent').value = keepParent;

  $('projList').innerHTML = tree.length
    ? tree.map((p) => {
        const open = S.tasks.filter((x) => x.projectId === p.id && x.status !== 'done' && x.status !== 'archived').length;
        const r = roll.get(p.id) || { own: 0, total: 0 };
        const kids = childrenOf(S.projects, p.id).length;
        return `<div class="row-item" data-workspace-p="${p.id}" style="padding-left:${p.depth * 20}px">
          ${p.depth ? '<span class="mark tree-branch">└</span>' : ''}
          <span class="swatch" style="background:${p.color}"></span>
          <div class="main">
            <div>${esc(p.name)} ${p.archivedAt ? '<span class="badge">已封存</span>' : ''}</div>
            <div class="sub">
              ${kids ? `${kids} 個子專案 · ` : ''}${open > 0 ? `${open} 個待辦` : '沒有待辦'}
            </div>
          </div>
          <span class="num" title="含子專案">${fmtHM(r.total)}</span>
          <span class="num ash" style="width:80px;text-align:right"
                title="只算直接記在這一層的">${kids ? fmtHM(r.own) : ''}</span>
          <div class="act">
            <button class="btn-sm workspace-open" data-open-workspace="${p.id}">查看工作區</button>
            <button class="btn-sm" data-edit-p="${p.id}">[編輯]</button>
            <button class="btn-sm" data-arch-p="${p.id}">${p.archivedAt ? '[復原]' : '[封存]'}</button>
            <button class="btn-sm btn-danger" data-del-p="${p.id}">[x]</button>
          </div>
        </div>`;
      }).join('')
    : '<div class="empty">還沒有專案，用上面的表單新增一個</div>';
}

/* ---------------- 專案目標／筆記 ---------------- */

let noteEditingId = null;   // 正在編輯的那則

function renderProjectNotes() {
  const pid = $('pjId').value;
  const box = $('pjNotesBox');
  if (!pid) { box.hidden = true; return; }

  const p = S.projects.find((x) => x.id === pid);
  if (!p) { box.hidden = true; return; }

  box.hidden = false;
  const notes = [...(p.notes || [])].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  $('pjNotesTitle').textContent = `「${p.name}」的目標與筆記${notes.length ? `（${notes.length}）` : ''}`;

  $('pjNoteList').innerHTML = notes.length
    ? notes.map((n) => {
        const editing = noteEditingId === n.id;
        return `<div class="note-entry">
          <div class="row cap" style="margin-bottom:4px">
            <span class="num">${fmtDate(n.createdAt)} ${fmtClock(n.createdAt)}</span>
            ${n.updatedAt ? `<span class="ash" title="最後修改 ${fmtDate(n.updatedAt)} ${fmtClock(n.updatedAt)}">· 已編輯</span>` : ''}
            <span class="grow"></span>
            ${editing
              ? `<button class="btn-sm" data-note-cancel="1">取消</button>
                 <button class="btn-sm btn-primary" style="height:26px" data-note-save="${n.id}">儲存</button>`
              : `<span class="act">
                   <button class="btn-sm" data-note-edit="${n.id}">[編輯]</button>
                   <button class="btn-sm btn-danger" data-note-del="${n.id}">[x]</button>
                 </span>`}
          </div>
          ${editing
            ? `<textarea data-note-input="${n.id}">${esc(n.text)}</textarea>`
            : `<div class="note-body">${esc(n.text)}</div>`}
        </div>`;
      }).join('')
    : '<div class="empty">還沒有目標或筆記</div>';

  if (noteEditingId) {
    const ta = $('pjNoteList').querySelector(`[data-note-input="${noteEditingId}"]`);
    if (ta) { autoGrow(ta, { min: 72, max: 400 }); ta.focus(); }
  }
}

$('pjNoteAdd').addEventListener('click', async () => {
  const pid = $('pjId').value;
  const text = $('pjNoteDraft').value;
  if (!pid || !text.trim()) return;
  await db.addProjectNote(pid, text);
  $('pjNoteDraft').value = '';
  $('pjNoteDraft').dispatchEvent(new Event('input'));
  await load();
  renderProjectNotes();
});

$('pjNoteDraft').addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') $('pjNoteAdd').click();
});

$('pjNoteList').addEventListener('click', async (e) => {
  const pid = $('pjId').value;
  const ed = e.target.closest('[data-note-edit]')?.dataset.noteEdit;
  const save = e.target.closest('[data-note-save]')?.dataset.noteSave;
  const del = e.target.closest('[data-note-del]')?.dataset.noteDel;

  if (ed) { noteEditingId = ed; renderProjectNotes(); return; }
  if (e.target.closest('[data-note-cancel]')) { noteEditingId = null; renderProjectNotes(); return; }

  if (save) {
    const ta = $('pjNoteList').querySelector(`[data-note-input="${save}"]`);
    await db.updateProjectNote(pid, save, ta.value);
    noteEditingId = null;
  } else if (del) {
    if (!confirm('刪除這則筆記？')) return;
    await db.deleteProjectNote(pid, del);
  } else return;

  await load();
  renderProjectNotes();
});

$('pjNoteList').addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && e.target.dataset.noteInput) {
    $('pjNoteList').querySelector(`[data-note-save="${e.target.dataset.noteInput}"]`)?.click();
  }
});

function renderProjectWorkspace(id) {
  const project = S.projects.find((item) => item.id === id);
  if (!project) return;
  const ids = new Set([id, ...descendantSet(id)]);
  const tasks = S.tasks.filter((task) => task.projectId && ids.has(task.projectId));
  const taskIds = new Set(tasks.map((task) => task.id));
  const entries = S.entries
    .filter((entry) => !entry.deletedAt && ((entry.projectId && ids.has(entry.projectId)) || (entry.taskId && taskIds.has(entry.taskId))))
    .filter((entry) => entry.endedAt)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const seconds = entries.reduce((sum, entry) => sum + db.durationSec(entry), 0);
  const done = tasks.filter((task) => task.status === 'done').length;
  const taskGroups = {
    doing: tasks.filter((task) => task.status === 'doing'),
    todo: tasks.filter((task) => task.status === 'todo'),
    done: tasks.filter((task) => task.status === 'done'),
  };
  const daily = new Map();
  for (const entry of entries) {
    const date = fmtDate(entry.startedAt);
    daily.set(date, (daily.get(date) || 0) + db.durationSec(entry));
  }
  const dailyRows = [...daily.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  const maxDaily = Math.max(1, ...dailyRows.map(([, value]) => value));
  const taskGroup = (label, items) => `<div class="workspace-task-group"><div class="workspace-subhead"><span>${label}</span><span class="badge">${items.length}</span></div>${items.length ? items.map((task) => `<div class="workspace-task"><div><strong>${esc(task.title)}</strong>${task.notes ? renderMarkdownPreview(task.notes) : ''}</div><span class="num">${task.dueDate || '無期限'}</span></div>`).join('') : '<div class="empty">目前沒有項目</div>'}</div>`;
  $('projectWorkspace').hidden = false;
  $('projectWorkspace').innerHTML = `<div class="row"><h2 class="grow">${esc(project.name)} 工作區</h2><button class="btn-sm" data-close-workspace>關閉</button></div>
    <div class="workspace-section"><div class="workspace-section-head"><h3>專案摘要</h3><span class="cap">只顯示此專案與子專案</span></div><div class="workspace-kpis"><span class="badge">${fmtHM(seconds)} 總工時</span><span class="badge">${done}/${tasks.length} Todo 完成</span><span class="badge">${entries.length} 筆工作日誌</span></div></div>
    <div class="workspace-section"><div class="workspace-section-head"><h3>Todo</h3><span class="cap">${tasks.length} 個項目</span></div>${taskGroup('進行中', taskGroups.doing)}${taskGroup('待辦', taskGroups.todo)}${taskGroup('已完成', taskGroups.done)}</div>
    <div class="workspace-section"><div class="workspace-section-head"><h3>工作日誌</h3><span class="cap">${entries.length} 筆</span></div>${entries.length ? entries.map((entry) => { const task = tasks.find((item) => item.id === entry.taskId); return `<div class="workspace-log"><div class="num mute">${fmtDate(entry.startedAt)}<br />${fmtClock(entry.startedAt)}–${fmtClock(entry.endedAt)}</div><div class="grow"><strong>${esc(task?.title || entry.description || '未命名工作')}</strong>${entry.notes ? renderMarkdownPreview(entry.notes) : ''}</div><span class="num">${fmtHM(db.durationSec(entry))}</span></div>`; }).join('') : '<div class="empty">這個專案沒有工作日誌</div>'}</div>
    <div class="workspace-section"><div class="workspace-section-head"><h3>工時過程</h3><span class="cap">依日期整理</span></div>${dailyRows.length ? dailyRows.map(([date, value]) => `<div class="workspace-day"><span class="num">${date}</span><div class="workspace-day-bar"><i style="width:${Math.round((value / maxDaily) * 100)}%"></i></div><span class="num">${fmtHM(value)}</span></div>`).join('') : '<div class="empty">目前沒有可用的工時資料</div>'}</div>`;
  initializeMarkdownPreviews($('projectWorkspace'));
}

document.getElementById('projList').addEventListener('click', (event) => {
  const row = event.target.closest('[data-workspace-p]');
  const open = event.target.closest('[data-open-workspace]')?.dataset.openWorkspace;
  if (open) renderProjectWorkspace(open);
  else if (row && !event.target.closest('button')) renderProjectWorkspace(row.dataset.workspaceP);
});
document.getElementById('projectWorkspace').addEventListener('click', (event) => {
  if (event.target.closest('[data-close-workspace]')) document.getElementById('projectWorkspace').hidden = true;
});

function descendantSet(id) {
  const out = new Set();
  const walk = (pid) => {
    for (const c of S.projects) {
      if ((c.parentId || null) === pid && !out.has(c.id)) { out.add(c.id); walk(c.id); }
    }
  };
  walk(id);
  return out;
}

$('projForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await db.upsertProject({
      id: $('pjId').value || undefined,
      parentId: $('pjParent').value || null,
      name: $('pjName').value,
      color: $('pjColor').value,
    });
  } catch (err) {
    alert(err.message);
    return;
  }
  resetProjForm();
  await load();
});

function resetProjForm() {
  $('pjId').value = ''; $('pjName').value = ''; $('pjColor').value = '#201d1d';
  $('pjParent').value = ''; $('pjCancel').hidden = true;
  noteEditingId = null;
  renderProjects();
  renderProjectNotes();
}
$('pjCancel').addEventListener('click', resetProjForm);

$('projList').addEventListener('click', async (e) => {
  const ed = e.target.dataset.editP, ar = e.target.dataset.archP, dl = e.target.dataset.delP;
  if (ed) {
    const p = S.projects.find((x) => x.id === ed);
    $('pjId').value = p.id; $('pjName').value = p.name; $('pjColor').value = p.color;
    $('pjCancel').hidden = false;
    renderProjects();                      // 重建下拉，排除自己與後代
    $('pjParent').value = p.parentId || '';
    noteEditingId = null;
    renderProjectNotes();
    $('pjName').focus();
  } else if (ar) {
    const p = S.projects.find((x) => x.id === ar);
    await db.upsertProject({ ...p, archivedAt: p.archivedAt ? null : new Date().toISOString() });
    await load();
  } else if (dl) {
    if (!confirm('刪除專案？既有紀錄會保留但變成「未分類」，該專案的 todo 會一併刪除。')) return;
    await db.deleteProject(dl);
    await load();
  }
});

/* ---------------- Todo ---------------- */

let showDone = false;

function renderTodos() {
  const tree = flattenTree(S.projects);
  const opts = (blank) => `<option value="">${blank}</option>` +
    tree.map((p) => `<option value="${p.id}">${esc(indentLabel(p.name, p.depth))}</option>`).join('');

  const keepP = $('tdProject').value;
  $('tdProject').innerHTML = opts('— 未分類 —');
  $('tdProject').value = keepP;

  const keepF = $('tdFilter').value;
  $('tdFilter').innerHTML = opts('— 全部專案 —');
  $('tdFilter').value = keepF;

  $('tdToggleDone').textContent = showDone ? '[x] 顯示已完成' : '[ ] 顯示已完成';

  // 選了父專案時，子專案的 todo 也一起列出來
  const scope = keepF ? new Set([keepF, ...descendantSet(keepF)]) : null;

  const list = S.tasks
    .filter((t) => t.status !== 'archived')
    .filter((t) => (showDone ? true : t.status !== 'done'))
    .filter((t) => (scope ? scope.has(t.projectId) : true))
    .sort((a, b) =>
      Number(a.status === 'done') - Number(b.status === 'done')
      || (a.dueDate || '9999').localeCompare(b.dueDate || '9999')
      || (a.sortOrder - b.sortOrder));

  const open = list.filter((t) => t.status !== 'done').length;
  $('tdCount').textContent = `${open} 個未完成 / 共 ${list.length}`;

  $('todoList').innerHTML = list.length
    ? list.map((t) => {
        const p = S.projects.find((x) => x.id === t.projectId);
        const done = t.status === 'done';
        const m = taskMetrics(t, S.entries);
        const dl = dueLabel(m, done);

        // 三個時間排成一行，缺的用 — 佔位
        const dates = [
          `開單 ${stampLabel(t.openedAt)}`,
          `截止 ${t.dueDate ? t.dueDate + (t.dueTime ? ` ${t.dueTime}` : '') : '—'}`,
          `結案 ${stampLabel(t.completedAt)}`,
        ].join(' · ');

        return `<div class="row-item${done ? ' done' : ''}">
          <button class="btn-sm btn-ghost" data-check="${t.id}"
            title="${done ? '重新打開' : '標記完成'}" style="width:34px">${done ? '[x]' : '[ ]'}</button>
          <span class="swatch" style="background:${p ? p.color : '#9a9898'}"></span>
          <div class="main">
            <div class="ellipsis">${esc(t.title)}
              ${t.scheduleId ? '<span class="badge" title="由排程自動產生">排程</span>' : ''}
              ${t.status === 'doing' ? '<span class="badge">進行中</span>' : ''}
              ${dl ? `<span class="badge${m.isLate ? ' overdue' : ''}">${dl}</span>` : ''}
              ${m.leadMs !== null ? `<span class="badge">歷時 ${leadLabel(m.leadMs)}</span>` : ''}
              ${t.reopenCount ? `<span class="badge">重開 ${t.reopenCount} 次</span>` : ''}
            </div>
            <div class="sub">${p ? esc(pathOf(S.projects, p.id).join(' / ')) : '未分類'}</div>
            <div class="sub num">${dates}</div>
            ${t.notes ? renderMarkdownPreview(t.notes, 'notes') : ''}
          </div>
          <span class="num" title="累積工時">${m.worked ? fmtHM(m.worked) : '—'}</span>
          <div class="act">
            ${done ? '' : `<button class="btn-sm" data-run="${t.id}" title="對這個 todo 開始計時">[&gt;]</button>`}
            <button class="btn-sm" data-edit-t="${t.id}">[編輯]</button>
            <button class="btn-sm btn-danger" data-del-t="${t.id}">[x]</button>
          </div>
        </div>`;
      }).join('')
    : '<div class="empty">沒有符合的 todo</div>';
}

function resetTodoForm() {
  $('tdId').value = ''; $('tdTitle').value = ''; $('tdNotes').value = '';
  $('tdStatus').value = 'todo'; $('tdDue').value = '';
  $('tdOpened').value = '建立後自動記錄';
  $('tdDone').value = '—';
  $('tdWorked').value = '—';
  $('tdCancel').hidden = true;
}

$('todoForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!$('tdTitle').value.trim()) return;
  const old = S.tasks.find((t) => t.id === $('tdId').value);
  await db.upsertTask({
    ...(old || {}),
    id: $('tdId').value || undefined,
    title: $('tdTitle').value,
    projectId: $('tdProject').value || null,
    status: $('tdStatus').value,
    dueDate: $('tdDue').value || null,   // 開單／結案時間由 db.js 自己維護
    notes: $('tdNotes').value,
  });
  resetTodoForm();
  await load();
});

$('tdCancel').addEventListener('click', resetTodoForm);
$('tdProject').addEventListener('change', renderTodos);
$('tdFilter').addEventListener('change', renderTodos);
$('tdToggleDone').addEventListener('click', () => { showDone = !showDone; renderTodos(); });

$('todoList').addEventListener('click', async (e) => {
  const check = e.target.closest('[data-check]')?.dataset.check;
  const run = e.target.closest('[data-run]')?.dataset.run;
  const ed = e.target.closest('[data-edit-t]')?.dataset.editT;
  const del = e.target.closest('[data-del-t]')?.dataset.delT;

  if (check) {
    const t = S.tasks.find((x) => x.id === check);
    await db.upsertTask({ ...t, status: t.status === 'done' ? 'todo' : 'done' });
  } else if (run) {
    const t = S.tasks.find((x) => x.id === run);
    await db.startTimer({ projectId: t.projectId, taskId: t.id, description: t.title });
  } else if (ed) {
    const t = S.tasks.find((x) => x.id === ed);
    $('tdId').value = t.id; $('tdTitle').value = t.title;
    $('tdProject').value = t.projectId || '';
    $('tdStatus').value = t.status; $('tdNotes').value = t.notes || '';
    $('tdDue').value = t.dueDate || '';
    $('tdOpened').value = stampLabel(t.openedAt);
    $('tdDone').value = stampLabel(t.completedAt);
    const m = taskMetrics(t, S.entries);
    $('tdWorked').value = m.worked ? fmtHM(m.worked) : '—';
    $('tdCancel').hidden = false; $('tdTitle').focus();
    $('tdNotes').dispatchEvent(new Event('input')); // 讓備註重算高度
    return;
  } else if (del) {
    if (!confirm('刪除這個 todo？綁在它上面的時間紀錄會保留，只是解除關聯。')) return;
    await db.deleteTask(del);
  } else return;

  await load();
});

/* ---------------- 排程 ---------------- */

const DOW_NAME = ['日', '一', '二', '三', '四', '五', '六'];
let scDays = new Set([1, 2, 3, 4, 5]);   // 預設平日

function paintDow() {
  $('scDow').querySelectorAll('[data-dow]').forEach((b) => {
    b.classList.toggle('on', scDays.has(Number(b.dataset.dow)));
  });
}

function dowLabel(days) {
  const s = [...days].sort();
  if (s.length === 7) return '每天';
  if (s.join() === '1,2,3,4,5') return '每個平日';
  if (s.join() === '0,6') return '每個週末';
  return s.map((d) => DOW_NAME[d]).join('、');
}

function renderSchedules() {
  const keep = $('scProject').value;
  $('scProject').innerHTML = '<option value="">— 未分類 —</option>' +
    flattenTree(S.projects).map((p) =>
      `<option value="${p.id}">${esc(indentLabel(p.name, p.depth))}</option>`).join('');
  $('scProject').value = keep;

  const list = S.schedules || [];
  $('schList').innerHTML = list.length
    ? list.map((s) => {
        const p = S.projects.find((x) => x.id === s.projectId);
        const bits = [
          dowLabel(s.weekdays),
          `${s.createTime} 開單`,
          s.dueTime ? `${s.dueTime} 截止` : null,
          s.remindMinutes ? `提前 ${s.remindMinutes} 分提醒` : null,
        ].filter(Boolean).join(' · ');
        return `<div class="row-item${s.enabled ? '' : ' done'}">
          <button class="btn-sm btn-ghost" data-sc-toggle="${s.id}" style="width:34px"
            title="${s.enabled ? '停用' : '啟用'}">${s.enabled ? '[x]' : '[ ]'}</button>
          <span class="swatch" style="background:${p ? p.color : '#9a9898'}"></span>
          <div class="main">
            <div class="ellipsis">${esc(s.title)}
              ${s.enabled ? '' : '<span class="badge">已停用</span>'}</div>
            <div class="sub num">${bits}</div>
            <div class="sub">${p ? esc(pathOf(S.projects, p.id).join(' / ')) : '未分類'}${
              s.lastRunDate ? ` · 上次開單 ${s.lastRunDate}` : ' · 尚未執行過'}</div>
            ${s.notes ? `<div class="notes">${esc(s.notes)}</div>` : ''}
          </div>
          <div class="act">
            <button class="btn-sm" data-sc-edit="${s.id}">[編輯]</button>
            <button class="btn-sm btn-danger" data-sc-del="${s.id}">[x]</button>
          </div>
        </div>`;
      }).join('')
    : '<div class="empty">還沒有排程</div>';
}

function resetSchForm() {
  $('scId').value = ''; $('scTitle').value = ''; $('scNotes').value = '';
  $('scCreate').value = '09:00'; $('scDue').value = ''; $('scRemind').value = '';
  $('scEnabled').value = '1'; $('scCancel').hidden = true;
  scDays = new Set([1, 2, 3, 4, 5]);
  paintDow();
  $('scNotes').dispatchEvent(new Event('input'));
}

$('scDow').addEventListener('click', (e) => {
  const d = e.target.dataset.dow;
  if (d === undefined) return;
  const n = Number(d);
  if (scDays.has(n)) scDays.delete(n); else scDays.add(n);
  paintDow();
});
$('scWeekdays').addEventListener('click', () => { scDays = new Set([1, 2, 3, 4, 5]); paintDow(); });
$('scEveryday').addEventListener('click', () => { scDays = new Set([0, 1, 2, 3, 4, 5, 6]); paintDow(); });

$('schForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!$('scTitle').value.trim()) return;
  if (!scDays.size) { alert('至少要選一天'); return; }
  const remind = $('scRemind').value;
  await db.upsertSchedule({
    id: $('scId').value || undefined,
    title: $('scTitle').value,
    projectId: $('scProject').value || null,
    notes: $('scNotes').value,
    weekdays: [...scDays],
    createTime: $('scCreate').value || '09:00',
    dueTime: $('scDue').value || null,
    remindMinutes: remind === '' ? null : Number(remind),
    enabled: $('scEnabled').value === '1',
  });
  resetSchForm();
  await load();
});

$('scCancel').addEventListener('click', resetSchForm);

$('scRunNow').addEventListener('click', async (e) => {
  const created = await db.runDueSchedules();
  const btn = e.currentTarget;
  btn.textContent = created.length ? `已新增 ${created.length} 張` : '目前沒有到點的';
  setTimeout(() => { btn.textContent = '立刻檢查一次'; }, 1800);
  await load();
});

$('schList').addEventListener('click', async (e) => {
  const tg = e.target.closest('[data-sc-toggle]')?.dataset.scToggle;
  const ed = e.target.closest('[data-sc-edit]')?.dataset.scEdit;
  const del = e.target.closest('[data-sc-del]')?.dataset.scDel;

  if (tg) {
    const s = S.schedules.find((x) => x.id === tg);
    await db.upsertSchedule({ ...s, enabled: !s.enabled });
  } else if (ed) {
    const s = S.schedules.find((x) => x.id === ed);
    $('scId').value = s.id; $('scTitle').value = s.title;
    $('scProject').value = s.projectId || '';
    $('scNotes').value = s.notes || '';
    $('scCreate').value = s.createTime; $('scDue').value = s.dueTime || '';
    $('scRemind').value = s.remindMinutes ?? '';
    $('scEnabled').value = s.enabled ? '1' : '0';
    scDays = new Set(s.weekdays);
    paintDow();
    $('scCancel').hidden = false;
    $('scNotes').dispatchEvent(new Event('input'));
    $('scTitle').focus();
    return;
  } else if (del) {
    if (!confirm('刪除這條排程？已經產生的 Todo 會保留。')) return;
    await db.deleteSchedule(del);
  } else return;

  await load();
});

/* ---------------- 標籤 ---------------- */
function renderTags() {
  $('tagList').innerHTML = S.tags.length
    ? S.tags.map((t) => `<div class="row-item">
        <span class="swatch" style="background:${t.color}"></span>
        <div class="main">${esc(t.name)}</div>
        <div class="act"><button class="btn-sm btn-danger" data-del-t="${t.id}">[x]</button></div>
      </div>`).join('')
    : '<div class="empty">還沒有標籤</div>';
}
$('tagForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  await db.upsertTag({ name: $('tgName').value, color: $('tgColor').value });
  $('tgName').value = '';
  await load();
});
$('tagList').addEventListener('click', async (e) => {
  const id = e.target.dataset.delT;
  if (id) { await db.deleteTag(id); await load(); }
});

/* ---------------- 紀錄 ---------------- */
/* 紀錄分頁的篩選狀態 */
const enUI = { q: '', projectId: '', range: 'all', limit: 50, expanded: new Set(), allOpen: false };

/** 套用搜尋 / 專案 / 區間之後的紀錄，新的在前 */
function filteredEntries() {
  const from = enUI.range === 'today' ? startOfDay()
    : enUI.range === 'week' ? startOfWeek(new Date(), S.settings.weekStartsOn)
      : enUI.range === 'month' ? startOfMonth()
        : null;

  // 選了父專案時，子專案的紀錄也一起算進來
  const scope = enUI.projectId
    ? new Set([enUI.projectId, ...descendantSet(enUI.projectId)])
    : null;

  const kw = enUI.q.trim().toLowerCase();

  return S.entries
    .filter((e) => e.endedAt && !e.deletedAt)
    .filter((e) => !from || new Date(e.startedAt) >= from)
    .filter((e) => !scope || (e.projectId && scope.has(e.projectId)))
    .filter((e) => !kw || `${e.description} ${e.notes || ''}`.toLowerCase().includes(kw))
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
}

function renderEntries() {
  // 專案下拉
  const keep = $('enFilter').value;
  $('enFilter').innerHTML = '<option value="">— 全部專案 —</option>' +
    flattenTree(S.projects).map((p) =>
      `<option value="${p.id}">${esc(indentLabel(p.name, p.depth))}</option>`).join('');
  $('enFilter').value = keep;

  const rows = filteredEntries();
  const shown = rows.slice(0, enUI.limit);
  const totalSec = rows.reduce((s, e) => s + db.durationSec(e), 0);
  $('entryCount').textContent = `${rows.length} 筆 · ${fmtHM(totalSec)}`;
  $('enExpandAll').textContent = enUI.allOpen ? '[-] 全部收合' : '[+] 全部展開';

  // 依日期分組
  const byDay = new Map();
  for (const e of shown) {
    const d = fmtDate(e.startedAt);
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(e);
  }

  $('entryList').innerHTML = shown.length
    ? [...byDay.entries()].map(([date, list]) => {
        const daySec = list.reduce((s, e) => s + db.durationSec(e), 0);
        return `<div class="day-group">
          <div class="day-head">
            <span class="num">${date}</span>
            <span class="grow"></span>
            <span class="num mute">${fmtHM(daySec)} · ${list.length} 筆</span>
          </div>
          ${list.map((e) => {
            const p = S.projects.find((x) => x.id === e.projectId);
            const task = S.tasks.find((x) => x.id === e.taskId);
            const tags = (e.tagIds || []).map((id) => S.tags.find((t) => t.id === id)?.name).filter(Boolean);
            const notes = e.notes || '';
            // 太長的工作紀錄預設收起來，不然一筆就吃掉整個畫面
            
            return `<div class="row-item">
              <span class="num mute" style="width:104px;flex:0 0 104px">
                ${fmtClock(e.startedAt)}–${fmtClock(e.endedAt)}</span>
              <span class="swatch" style="background:${p ? p.color : '#9a9898'}"></span>
              <div class="main">
                <div class="ellipsis">${esc(e.description || '（無描述）')}
                  ${task ? `<span class="badge">${esc(task.title)}</span>` : ''}
                  ${tags.map((t) => `<span class="badge">${esc(t)}</span>`).join(' ')}</div>
                <div class="sub">${p ? esc(pathOf(S.projects, p.id).join(' / ')) : '未分類'}</div>
                ${notes ? renderMarkdownPreview(notes, 'notes') : ''}
              </div>
              <span class="num">${fmtHM(db.durationSec(e))}</span>
              <div class="act">
                <button class="btn-sm" data-edit-e="${e.id}">[編輯]</button>
                <button class="btn-sm btn-danger" data-del-e="${e.id}">[x]</button>
              </div>
            </div>`;
          }).join('')}
        </div>`;
      }).join('')
    : `<div class="empty">${S.entries.length ? '這個條件下沒有紀錄' : '還沒有紀錄'}</div>`;

  initializeMarkdownPreviews($('entryList'));
  $('entryMore').innerHTML = rows.length > enUI.limit
    ? `<button id="enMore">載入更多（還有 ${rows.length - enUI.limit} 筆）</button>`
    : '';
}

/* 篩選事件 */
$('enSearch').addEventListener('input', (e) => {
  enUI.q = e.target.value; enUI.limit = 50; renderEntries();
});
$('enFilter').addEventListener('change', (e) => {
  enUI.projectId = e.target.value; enUI.limit = 50; renderEntries();
});
$('enRange').addEventListener('click', (e) => {
  const r = e.target.dataset.erange;
  if (!r) return;
  enUI.range = r; enUI.limit = 50;
  $('enRange').querySelectorAll('.seg-btn')
    .forEach((b) => b.classList.toggle('active', b.dataset.erange === r));
  renderEntries();
});
$('enExpandAll').addEventListener('click', () => {
  enUI.allOpen = !enUI.allOpen;
  enUI.expanded.clear();
  renderEntries();
});
$('entryMore').addEventListener('click', (e) => {
  if (e.target.id === 'enMore') { enUI.limit += 50; renderEntries(); }
});

$('entryList').addEventListener('click', async (e) => {
  const toggle = e.target.closest('[data-toggle-notes]')?.dataset.toggleNotes;
  if (toggle) {
    if (enUI.expanded.has(toggle)) enUI.expanded.delete(toggle);
    else enUI.expanded.add(toggle);
    renderEntries();
    return;
  }
  const ed = e.target.dataset.editE, dl = e.target.dataset.delE;
  if (ed) openEntryDialog(S.entries.find((x) => x.id === ed));
  else if (dl) { await db.deleteEntry(dl); await load(); }
});

/* 一鍵複製 Markdown 總結 */
async function copySummary(btn, dates) {
  const md = buildSummary({ dates, entries: S.entries, projects: S.projects, tasks: S.tasks });
  const label = btn.textContent;
  if (!md) btn.textContent = '沒有紀錄';
  else btn.textContent = (await copyToClipboard(md)) ? '已複製 ✓' : '複製失敗';
  setTimeout(() => { btn.textContent = label; }, 1500);
}

$('copyToday').addEventListener('click', (e) =>
  copySummary(e.currentTarget, [fmtDate(new Date().toISOString())]));

$('copyRange').addEventListener('click', (e) => {
  // 依報表分頁選的區間，由舊到新
  const dates = [...new Set(inRange().map((x) => fmtDate(x.startedAt)))].sort();
  copySummary(e.currentTarget, dates);
});

$('addEntry').addEventListener('click', () => {
  const now = new Date();
  openEntryDialog({
    id: null, description: '', projectId: null, taskId: null,
    startedAt: new Date(now.getTime() - 3600e3).toISOString(),
    endedAt: now.toISOString(),
  });
});

function openEntryDialog(e) {
  $('dlgTitle').textContent = e.id ? '編輯紀錄' : '手動補登';
  $('enId').value = e.id || '';
  $('enDesc').value = e.description || '';
  $('enProject').innerHTML = '<option value="">— 未分類 —</option>' +
    flattenTree(S.projects).map((p) =>
      `<option value="${p.id}">${esc(indentLabel(p.name, p.depth))}</option>`).join('');
  $('enProject').value = e.projectId || '';
  $('enTask').innerHTML = '<option value="">— 無 —</option>' +
    S.tasks.map((t) => `<option value="${t.id}">${esc(t.title)}</option>`).join('');
  $('enTask').value = e.taskId || '';
  $('enStart').value = toLocalInput(e.startedAt);
  $('enEnd').value = toLocalInput(e.endedAt);
  $('enNotes').value = e.notes || '';
  $('entryDlg').showModal();
  growNotes();   // dialog 開啟後才量得到高度
}

$('entryForm').addEventListener('submit', async (ev) => {
  if (ev.submitter?.value !== 'save') return;
  const start = fromLocalInput($('enStart').value);
  const end = fromLocalInput($('enEnd').value);
  if (new Date(end) <= new Date(start)) { alert('結束時間必須晚於開始時間'); return; }
  const id = $('enId').value;
  const old = S.entries.find((x) => x.id === id);
  await db.upsertEntry({
    ...(old || {}),
    id: id || undefined,
    description: $('enDesc').value,
    projectId: $('enProject').value || null,
    taskId: $('enTask').value || null,
    notes: $('enNotes').value,
    startedAt: start, endedAt: end,
    source: id ? old.source : 'manual',
  });
  await load();
});

/* ---------------- 設定 ---------------- */
function renderSettings() {
  $('stIdle').value = S.settings.idleThresholdMin;
  $('stRound').value = String(S.settings.roundToMin);
}
$('saveSettings').addEventListener('click', async () => {
  await db.saveSettings({
    idleThresholdMin: Math.max(1, Number($('stIdle').value) || 15),
    roundToMin: Number($('stRound').value) || 0,
  });
  await load();
  alert('已儲存');
});

/* ---------------- 匯出 / 匯入 ---------------- */
function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

// 紀錄分頁的 CSV：跟著目前的搜尋與篩選走
$('exportFiltered').addEventListener('click', () => exportCsvOf(filteredEntries(), 'filtered'));

// 報表分頁的 CSV：跟著區間走
$('exportCsv').addEventListener('click', () => exportCsvOf(inRange(), range));

function exportCsvOf(rows, tag) {
  const head = ['date', 'start', 'end', 'seconds', 'hours', 'project', 'task', 'description', 'notes', 'tags'];
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = rows.map((e) => {
    const p = S.projects.find((x) => x.id === e.projectId);
    const t = S.tasks.find((x) => x.id === e.taskId);
    const sec = db.durationSec(e);
    return [
      fmtDate(e.startedAt), fmtClock(e.startedAt), fmtClock(e.endedAt),
      sec, (sec / 3600).toFixed(2),
      p ? pathOf(S.projects, p.id).join(' / ') : '', t?.title || '',
      e.description || '', e.notes || '',
      (e.tagIds || []).map((id) => S.tags.find((x) => x.id === id)?.name).filter(Boolean).join('|'),
    ].map(q).join(',');
  });
  // BOM 讓 Excel 正確辨識 UTF-8
  download(`todotracker-${tag}-${fmtDate(new Date().toISOString())}.csv`,
    '﻿' + [head.join(','), ...lines].join('\n'), 'text/csv;charset=utf-8');
}

$('backup').addEventListener('click', async () => {
  const data = await db.exportAll();
  download(`todotracker-backup-${fmtDate(new Date().toISOString())}.json`,
    JSON.stringify(data, null, 2), 'application/json');
});

$('restoreBtn').addEventListener('click', () => $('restoreFile').click());
$('restoreFile').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  if (!confirm('匯入會覆蓋目前所有資料，確定？')) return;
  try {
    await db.importAll(JSON.parse(await f.text()));
    await load();
    alert('已匯入');
  } catch (err) {
    alert('匯入失敗：' + err.message);
  }
  e.target.value = '';
});

$('wipe').addEventListener('click', async () => {
  if (!confirm('清空所有專案、標籤、todo 與時間紀錄？此動作無法復原。')) return;
  await chrome.storage.local.clear();
  await load();
});

/* ---------------- 分頁 / 區間 ---------------- */
$('tabs').addEventListener('click', (e) => {
  const name = e.target.dataset.tab;
  if (!name) return;
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  ['report', 'projects', 'todos', 'schedules', 'tags', 'entries', 'settings']
    .forEach((n) => { $('p-' + n).hidden = n !== name; });
  initializeMarkdownPreviews($('p-' + name));
});

$('range').addEventListener('click', (e) => {
  const r = e.target.dataset.range;
  if (!r) return;
  range = r;
  document.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.range === r));
  renderReport();
});

// 進頁預設本週
range = 'week';
document.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.range === 'week'));
initCollapse();
resetTodoForm();
resetSchForm();
load();
