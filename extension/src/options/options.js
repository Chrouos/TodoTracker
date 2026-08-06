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
import { markdownToHTML } from '../lib/markdown.js';

const growNotes = autoGrow(document.getElementById('enNotes'), { min: 96, max: 360 });
autoGrow(document.getElementById('tdNotes'), { min: 80, max: 320 });

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let S = { projects: [], tags: [], tasks: [], entries: [], settings: db.DEFAULT_SETTINGS };
let range = 'week';

async function load() {
  const [projects, tags, tasks, entries, settings] = await Promise.all([
    db.listProjects({ includeArchived: true }), db.listTags(),
    db.listTasks(), db.listEntries(), db.getSettings(),
  ]);
  S = { projects, tags, tasks, entries, settings };
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
  renderReport(); renderProjects(); renderTodos(); renderTags(); renderEntries(); renderSettings();
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
        return `<div class="row-item" style="padding-left:${p.depth * 20}px">
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
            <button class="btn-sm" data-edit-p="${p.id}">[編輯]</button>
            <button class="btn-sm" data-arch-p="${p.id}">${p.archivedAt ? '[復原]' : '[封存]'}</button>
            <button class="btn-sm btn-danger" data-del-p="${p.id}">[x]</button>
          </div>
        </div>`;
      }).join('')
    : '<div class="empty">還沒有專案，用上面的表單新增一個</div>';
}

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
  renderProjects();
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
          `截止 ${t.dueDate || '—'}`,
          `結案 ${stampLabel(t.completedAt)}`,
        ].join(' · ');

        return `<div class="row-item${done ? ' done' : ''}">
          <button class="btn-sm btn-ghost" data-check="${t.id}"
            title="${done ? '重新打開' : '標記完成'}" style="width:34px">${done ? '[x]' : '[ ]'}</button>
          <span class="swatch" style="background:${p ? p.color : '#9a9898'}"></span>
          <div class="main">
            <div class="ellipsis">${esc(t.title)}
              ${t.status === 'doing' ? '<span class="badge">進行中</span>' : ''}
              ${dl ? `<span class="badge${m.isLate ? ' overdue' : ''}">${dl}</span>` : ''}
              ${m.leadMs !== null ? `<span class="badge">歷時 ${leadLabel(m.leadMs)}</span>` : ''}
              ${t.reopenCount ? `<span class="badge">重開 ${t.reopenCount} 次</span>` : ''}
            </div>
            <div class="sub">${p ? esc(pathOf(S.projects, p.id).join(' / ')) : '未分類'}</div>
            <div class="sub num">${dates}</div>
            ${t.notes ? `<div class="notes markdown-preview">${markdownToHTML(t.notes)}</div>` : ''}
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
function renderEntries() {
  const rows = S.entries.filter((e) => e.endedAt).slice(0, 200);
  $('entryCount').textContent = `${S.entries.length} 筆（顯示最新 200）`;
  $('entryList').innerHTML = rows.length
    ? rows.map((e) => {
        const p = S.projects.find((x) => x.id === e.projectId);
        const tags = (e.tagIds || []).map((id) => S.tags.find((t) => t.id === id)?.name).filter(Boolean);
        return `<div class="row-item">
          <span class="swatch" style="background:${p ? p.color : '#9a9898'}"></span>
          <div class="main">
            <div class="ellipsis">${esc(e.description || '（無描述）')}
              ${tags.map((t) => `<span class="badge">${esc(t)}</span>`).join(' ')}</div>
            <div class="sub">${p ? esc(p.name) : '未分類'} · ${fmtDate(e.startedAt)} ${fmtClock(e.startedAt)}–${fmtClock(e.endedAt)}</div>
            ${e.notes ? `<div class="notes markdown-preview">${markdownToHTML(e.notes)}</div>` : ''}
          </div>
          <span class="num">${fmtHM(db.durationSec(e))}</span>
          <div class="act">
            <button class="btn-sm" data-edit-e="${e.id}">[編輯]</button>
            <button class="btn-sm btn-danger" data-del-e="${e.id}">[x]</button>
          </div>
        </div>`;
      }).join('')
    : '<div class="empty">還沒有紀錄</div>';
}

$('entryList').addEventListener('click', async (e) => {
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

$('exportCsv').addEventListener('click', () => {
  const rows = inRange();
  const head = ['date', 'start', 'end', 'seconds', 'hours', 'project', 'task', 'description', 'tags'];
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = rows.map((e) => {
    const p = S.projects.find((x) => x.id === e.projectId);
    const t = S.tasks.find((x) => x.id === e.taskId);
    const sec = db.durationSec(e);
    return [
      fmtDate(e.startedAt), fmtClock(e.startedAt), fmtClock(e.endedAt),
      sec, (sec / 3600).toFixed(2),
      p?.name || '', t?.title || '', e.description || '',
      (e.tagIds || []).map((id) => S.tags.find((x) => x.id === id)?.name).filter(Boolean).join('|'),
    ].map(q).join(',');
  });
  // BOM 讓 Excel 正確辨識 UTF-8
  download(`todotracker-${range}-${fmtDate(new Date().toISOString())}.csv`,
    '﻿' + [head.join(','), ...lines].join('\n'), 'text/csv;charset=utf-8');
});

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
  ['report', 'projects', 'todos', 'tags', 'entries', 'settings']
    .forEach((n) => { $('p-' + n).hidden = n !== name; });
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
load();
