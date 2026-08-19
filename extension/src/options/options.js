import * as db from '../lib/db.js';
import {
  fmtHM, fmtDate, fmtClock, startOfDay, startOfWeek, startOfMonth, localDateRange, activeRange, rangeControlState, currentWeekDateRange, dailySeries,
  dailyReviewData, calendarEntryTooltip, calendarReviewData, timelineData, toLocalInput, fromLocalInput,
} from '../lib/time.js';
import { timelineSVG, stackedAreaSVG, heatmapSVG } from '../lib/charts.js';
import { initCollapse } from '../lib/collapse.js';
import { childrenOf, flattenTree, rollup, pathOf, indentLabel } from '../lib/tree.js';
import { buildSummary, copyToClipboard } from '../lib/summary.js';
import { autoGrow } from '../lib/autogrow.js';
import { taskMetrics, entriesForTask, todoHealth, dueLabel, leadLabel, stampLabel } from '../lib/tasks.js';
import { markdownToHTML, shouldShowMarkdownToggle } from '../lib/markdown.js';
import {
  TODO_PRIORITIES, filterTasks, normalizePriority, priorityLabel, taskCountLabel,
} from '../lib/todo-filter.js';
import { projectIdForTask, tasksForProject } from '../lib/entry-relations.js';
import { trendDateBounds } from '../lib/report-range.js';
import { buildProjectTrendData, buildProjectDetailData } from '../lib/project-trend.js';
import { buildTodoTrackerData } from '../lib/todo-tracker.js';

const growNotes = autoGrow(document.getElementById('enNotes'), { min: 96, max: 360 });
autoGrow(document.getElementById('tdNotes'), { min: 80, max: 320 });
autoGrow(document.getElementById('pjNoteDraft'), { min: 72, max: 320 });
autoGrow(document.getElementById('scNotes'), { min: 72, max: 280 });
const growTimerNotes = autoGrow(document.getElementById('mgTimerNotes'), { min: 180, max: 360 });

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

let S = { projects: [], tags: [], tasks: [], entries: [], schedules: [], timer: null, settings: db.DEFAULT_SETTINGS };
function renderEntryTasks(selectedTaskId = '') {
  const projectId = $('enProject').value;
  const tasks = tasksForProject(S.tasks, projectId);
  $('enTask').innerHTML = '<option value="">— 無 —</option>' +
    tasks.map((t) => `<option value="${t.id}">${esc(t.title)}</option>`).join('');
  $('enTask').value = tasks.some((task) => task.id === selectedTaskId) ? selectedTaskId : '';
}
$('enProject').addEventListener('change', () => renderEntryTasks());
$('enTask').addEventListener('change', (event) => {
  $('enProject').value = projectIdForTask(event.target.value, S.tasks, $('enProject').value);
});
let range = 'week';
const customRange = { from: '', to: '' };
let customRangeOpen = false;
const customReturnRange = { report: 'week', entries: 'all' };
let reviewMode = 'list';
let reviewGroups = [];
let timerTicker = null;
let timerNotesSaveTimer = null;
let timerCompleteChoice = false;
let timerDraft = { description: '', projectId: '', taskId: '', tagIds: [], notes: '' };
let timerNotesPreviewOpen = false;

async function load() {
  const [projects, tags, tasks, entries, schedules, timer, settings] = await Promise.all([
    db.listProjects({ includeArchived: true }), db.listTags(),
    db.listTasks(), db.listEntries(), db.listSchedules(), db.getTimer(), db.getSettings(),
  ]);
  S = { projects, tags, tasks, entries, schedules, timer, settings };
  renderAll();
}

function rangeStart() {
  if (range === 'today') return startOfDay();
  if (range === 'week') return startOfWeek(new Date(), S.settings.weekStartsOn);
  if (range === 'month') return startOfMonth();
  if (range === 'custom') return localDateRange(customRange.from, customRange.to)?.from || new Date(0);
  return new Date(0);
}
function rangeEnd() {
  if (range === 'custom') return localDateRange(customRange.from, customRange.to)?.to || null;
  return null;
}
const inRange = () => {
  const from = rangeStart();
  const to = rangeEnd();
  return S.entries
    .filter((e) => e.endedAt && new Date(e.startedAt) >= from)
    .filter((e) => !to || new Date(e.startedAt) < to);
};

function syncRangeControls() {
  const controls = rangeControlState(customRangeOpen);
  $('reportCustomRange').hidden = !controls.custom;
  $('entriesCustomRange').hidden = !controls.custom;
  $('reportRangeFrom').value = customRange.from;
  $('reportRangeTo').value = customRange.to;
  $('entriesRangeFrom').value = customRange.from;
  $('entriesRangeTo').value = customRange.to;
  const reportActiveRange = activeRange(range, customRangeOpen);
  const entriesActiveRange = activeRange(enUI.range, customRangeOpen);
  document.querySelectorAll('#range .range-quick, #range .range-custom').forEach((button) => {
    button.hidden = !controls.quick;
  });
  document.querySelectorAll('#enRange .range-quick, #enRange .range-custom').forEach((button) => {
    button.hidden = !controls.quick;
  });
  document.querySelector('#range .range-back').hidden = !controls.back;
  document.querySelector('#enRange .range-back').hidden = !controls.back;
  document.querySelector('#range').classList.toggle('is-custom', controls.custom);
  document.querySelector('#enRange').classList.toggle('is-custom', controls.custom);
  document.querySelectorAll('#range .seg-btn').forEach((button) =>
    button.classList.toggle('active', button.dataset.range === reportActiveRange));
  document.querySelectorAll('#enRange .seg-btn').forEach((button) =>
    button.classList.toggle('active', button.dataset.erange === entriesActiveRange));
}

function openCustomRange() {
  if (!customRangeOpen) {
    customReturnRange.report = range === 'custom' ? 'week' : range;
    customReturnRange.entries = enUI.range === 'custom' ? 'all' : enUI.range;
  }
  if (!customRange.from || !customRange.to) Object.assign(customRange, currentWeekDateRange());
  customRangeOpen = true;
  syncRangeControls();
}

function closeCustomRange() {
  if (range === 'custom') range = customReturnRange.report;
  if (enUI.range === 'custom') enUI.range = customReturnRange.entries;
  customRangeOpen = false;
  syncRangeControls();
  renderReport();
  renderEntries();
}

function applyCustomRange(source) {
  const prefix = source === 'report' ? 'report' : 'entries';
  const from = $(`${prefix}RangeFrom`).value;
  const to = $(`${prefix}RangeTo`).value;
  if (!localDateRange(from, to)) {
    alert('請選擇有效的日期區間');
    return;
  }
  customRange.from = from;
  customRange.to = to;
  range = 'custom';
  enUI.range = 'custom';
  enUI.limit = 50;
  customRangeOpen = true;
  syncRangeControls();
  renderReport();
  renderEntries();
}

function renderAll() {
  renderTimer(); renderReport(); renderProjects(); renderTodos(); renderSchedules();
  renderTags(); renderEntries(); renderSettings();
}

function timerClock(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function stopTimerTicker() {
  clearInterval(timerTicker);
  timerTicker = null;
}

function startTimerTicker(timer) {
  stopTimerTicker();
  const tick = () => {
    $('mgTimerClock').textContent = timerClock(
      (Date.now() - new Date(timer.startedAt).getTime()) / 1000,
    );
  };
  tick();
  timerTicker = setInterval(tick, 1000);
}

function renderTimerNotesPreview() {
  const container = $('mgTimerNotesPreview');
  container.innerHTML = renderMarkdownPreview($('mgTimerNotes').value, 'timer-notes-markdown');
  initializeMarkdownPreviews(container);
}

function setTimerNotesPreviewOpen(open) {
  timerNotesPreviewOpen = open;
  $('mgTimerNotes').hidden = open;
  $('mgTimerNotesPreview').hidden = !open;
  const toggle = $('mgTimerNotesPreviewToggle');
  toggle.textContent = open ? '編輯 Markdown' : '預覽 Markdown';
  toggle.setAttribute('aria-pressed', String(open));
  if (open) renderTimerNotesPreview();
  else growTimerNotes();
}

function renderTimer() {
  const timer = S.timer;
  const current = timer || timerDraft;
  const panel = $('managementTimer');
  const project = $('mgTimerProject');
  const task = $('mgTimerTask');
  const projectId = current.projectId || '';
  const taskId = current.taskId || '';

  panel.classList.toggle('is-running', Boolean(timer));
  $('mgTimerStatus').textContent = timer ? '計時中' : '尚未開始';
  $('mgTimerToggle').textContent = timer ? '停止並儲存' : '開始計時';
  $('mgTimerDescription').value = current.description || '';
  if ($('mgTimerNotes') !== document.activeElement) $('mgTimerNotes').value = current.notes || '';

  project.innerHTML = '<option value="">— 未分類 —</option>' +
    flattenTree(S.projects, { includeArchived: false })
      .map((p) => `<option value="${p.id}">${esc(p.depth ? `${'› '.repeat(p.depth)}${p.name}` : p.name)}</option>`).join('');
  project.value = projectId;

  const tasks = S.tasks
    .filter((item) => item.status !== 'done' && item.status !== 'archived')
    .filter((item) => !projectId || item.projectId === projectId);
  const selectedTask = taskId && S.tasks.find((item) => item.id === taskId);
  if (selectedTask && !tasks.some((item) => item.id === taskId)) tasks.unshift(selectedTask);
  task.innerHTML = '<option value="">— 不掛 Todo —</option>' +
    tasks.map((item) => `<option value="${item.id}">${esc(item.title)}</option>`).join('');
  task.value = taskId;

  const selectedTags = current.tagIds || [];
  $('mgTimerTags').innerHTML = S.tags.length
    ? S.tags.map((tag) => `<button type="button" class="timer-tag${selectedTags.includes(tag.id) ? ' on' : ''}"
        data-mg-timer-tag="${tag.id}">${esc(tag.name)}</button>`).join('')
    : '<span class="cap">尚未建立標籤</span>';

  $('mgTimerCompleteRow').hidden = !timer?.taskId;
  $('mgTimerComplete').checked = Boolean(timer && timerCompleteChoice);
  if (!timer) {
    $('mgTimerClock').textContent = '00:00:00';
    stopTimerTicker();
  } else {
    startTimerTicker(timer);
  }
  if (timerNotesPreviewOpen) renderTimerNotesPreview();
  else growTimerNotes();
}

async function patchManagementTimer(patch) {
  if (S.timer) {
    S.timer = await db.patchTimer(patch);
  } else {
    timerDraft = { ...timerDraft, ...patch };
  }
}

async function flushManagementTimerNotes() {
  clearTimeout(timerNotesSaveTimer);
  const notes = $('mgTimerNotes').value;
  if (!S.timer) {
    timerDraft.notes = notes;
    return;
  }
  S.timer = await db.patchTimer({ notes });
  $('mgTimerSaved').textContent = '已保存';
  setTimeout(() => { $('mgTimerSaved').textContent = ''; }, 1200);
}

async function reloadTimerViewPreservingScroll() {
  const scrollY = window.scrollY;
  await load();
  window.scrollTo(0, scrollY);
}

$('mgTimerDescription').addEventListener('input', (event) => {
  patchManagementTimer({ description: event.target.value });
});
$('mgTimerProject').addEventListener('change', async (event) => {
  await patchManagementTimer({ projectId: event.target.value || null, taskId: null });
  renderTimer();
});
$('mgTimerTask').addEventListener('change', async (event) => {
  await patchManagementTimer({ taskId: event.target.value || null });
  renderTimer();
});
$('mgTimerTags').addEventListener('click', async (event) => {
  const id = event.target.closest('[data-mg-timer-tag]')?.dataset.mgTimerTag;
  if (!id) return;
  const current = S.timer || timerDraft;
  const tagIds = current.tagIds || [];
  await patchManagementTimer({ tagIds: tagIds.includes(id)
    ? tagIds.filter((tagId) => tagId !== id) : [...tagIds, id] });
  renderTimer();
});
$('mgTimerNotes').addEventListener('input', () => {
  if (!S.timer) {
    timerDraft.notes = $('mgTimerNotes').value;
    return;
  }
  $('mgTimerSaved').textContent = '儲存中…';
  clearTimeout(timerNotesSaveTimer);
  timerNotesSaveTimer = setTimeout(() => flushManagementTimerNotes(), 500);
});
$('mgTimerNotesPreviewToggle').addEventListener('click', () => {
  setTimerNotesPreviewOpen(!timerNotesPreviewOpen);
});
$('mgTimerComplete').addEventListener('change', (event) => {
  timerCompleteChoice = event.target.checked;
});
$('mgTimerToggle').addEventListener('click', async () => {
  if (S.timer) {
    await flushManagementTimerNotes();
    await db.stopTimer(null, 0, { completeTask: timerCompleteChoice });
    timerCompleteChoice = false;
    timerDraft = { description: '', projectId: '', taskId: '', tagIds: [], notes: '' };
  } else {
    const started = await db.startTimer({
      description: $('mgTimerDescription').value,
      projectId: $('mgTimerProject').value || null,
      taskId: $('mgTimerTask').value || null,
      tagIds: [...(timerDraft.tagIds || [])],
      notes: $('mgTimerNotes').value,
    });
    timerDraft = { ...timerDraft, ...started };
  }
  await reloadTimerViewPreservingScroll();
});

function groupReportPanels() {
  const report = $('p-report');
  if (report.querySelector('.report-panel')) return;
  [
    ['rep-health', 'todoHealth', 'report-panel-health'],
    ['rep-donut', 'byProject', 'report-panel-donut'],
    ['rep-review', 'dailyReview', 'report-panel-review'],
  ].forEach(([collapseId, bodyId, className]) => {
    const heading = report.querySelector(`[data-collapse="${collapseId}"]`);
    const body = $(bodyId);
    if (!heading || !body) return;
    const panel = document.createElement('div');
    panel.className = `report-panel ${className}`;
    heading.parentNode.insertBefore(panel, heading);
    panel.append(heading, body);
  });
}

/* ---------------- 報表 ---------------- */
function createReportChartSection(id, title) {
  const details = document.createElement('details');
  details.className = 'report-chart-collapse';
  details.dataset.reportChart = id;
  const summary = document.createElement('summary');
  summary.className = 'report-chart-title';
  summary.innerHTML = `<span class="mark">[-]</span><span>${esc(title)}</span>`;
  const body = document.createElement('div');
  body.className = 'report-chart-body';
  details.append(summary, body);
  return { details, body };
}

function wrapReportChartContent() {
  const wrap = document.querySelector('#byProject .project-trend-wrap');
  if (!wrap || wrap.querySelector('.report-chart-collapse')) return;

  const trend = createReportChartSection('trend', '全部專案');
  [
    wrap.querySelector('.project-trend-toolbar'),
    wrap.querySelector('#projectTrend'),
    wrap.querySelector('#projectTrendTooltip'),
    wrap.querySelector('.trend-legend'),
    wrap.querySelector('#projectTrendDetail'),
  ].filter(Boolean).forEach((node) => trend.body.append(node));

  const heatmap = createReportChartSection('heatmap', '專案 × 日期');
  wrap.querySelector('.project-heatmap-title')?.remove();
  const heatmapNode = wrap.querySelector('#projectHeatmap');
  if (heatmapNode) heatmap.body.append(heatmapNode);

  const tracker = createReportChartSection('tracker', 'Todo Tracker');
  [wrap.querySelector('#todoTracker'), wrap.querySelector('#todoTrackerDetail')]
    .filter(Boolean).forEach((node) => tracker.body.append(node));

  wrap.replaceChildren(trend.details, heatmap.details, tracker.details);
  bindReportChartCollapses();
}

function bindReportChartCollapses() {
  document.querySelectorAll('#byProject [data-report-chart]').forEach((details) => {
    const id = details.dataset.reportChart;
    details.open = !reportChartCollapsed.has(id);
    details.addEventListener('toggle', () => {
      if (details.open) reportChartCollapsed.delete(id);
      else reportChartCollapsed.add(id);
    });
  });
}

function renderReport() {
  const rows = inRange();
  const sec = rows.reduce((s, e) => s + db.durationSec(e), 0);
  const dayKeys = new Set(rows.map((e) => fmtDate(e.startedAt)));

  $('kTime').textContent = fmtHM(sec);
  $('kCount').textContent = rows.length;
  $('kAvg').textContent = rows.length ? fmtHM(sec / rows.length) : '—';
  $('kDays').textContent = dayKeys.size;
  renderTodoHealth();

  // 融合專案分配與每日趨勢：區間太短就往前補，才看得出趨勢
  const today = startOfDay();
  const customBounds = range === 'custom' ? localDateRange(customRange.from, customRange.to) : null;
  const quickBounds = range === 'today' || range === 'week'
    ? trendDateBounds(range, new Date(), S.settings.weekStartsOn)
    : null;
  const lineFrom = customBounds
    ? customBounds.from
    : quickBounds?.from
      ?? (range === 'month' ? startOfMonth() : new Date(today.getTime() - 29 * 864e5));
  const lineTo = customBounds
    ? new Date(customBounds.to.getTime() - 864e5)
    : quickBounds?.to ?? new Date();
  const trendEndExclusive = new Date(lineTo.getTime() + 864e5);
  const trendEntries = S.entries.filter((e) => e.endedAt && !e.deletedAt
    && new Date(e.startedAt) >= lineFrom
    && new Date(e.startedAt) < trendEndExclusive);
  const trackerEntries = S.entries.filter((e) => e.endedAt && !e.deletedAt);
  const series = dailySeries(
    trendEntries,
    lineFrom, lineTo, db.durationSec,
  );
  const trendDates = series.map((day) => day.date);
  renderProjectTrend(trendEntries, trendDates, trackerEntries);

  // 時間軸：太多天會擠爆，最多顯示最近 14 天
  const tlDates = series.map((d) => d.date).slice(customBounds ? 0 : -14);
  const reviewDates = range === 'week' && !customBounds
    ? dailySeries([], lineFrom, new Date(lineFrom.getTime() + 6 * 864e5), () => 0).map((d) => d.date)
    : tlDates;
  $('reviewLabel').textContent = tlDates.length
    ? `· ${tlDates[0]} ～ ${tlDates[tlDates.length - 1]}`
    : '';
  $('reviewLabel').textContent = reviewDates.length
    ? `· ${reviewDates[0]} ～ ${reviewDates[reviewDates.length - 1]}`
    : '';
  if ($('timeline')) { const tl = timelineData(
    customBounds ? rows : S.entries.filter((e) => e.endedAt && !e.deletedAt),
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
  $('dailyReview').innerHTML = renderDailyReview(dailyReviewData(rows, reviewDates));
  initializeMarkdownPreviews($('dailyReview'));
}

function renderDailyReview(groups) {
  reviewGroups = groups;
  const canCalendar = groups.length > 0 && groups.length <= 7;
  if (!canCalendar && reviewMode === 'calendar') reviewMode = 'list';
  document.querySelectorAll('#reviewMode [data-review-mode]').forEach((button) => {
    button.classList.toggle('active', button.dataset.reviewMode === reviewMode);
    if (button.dataset.reviewMode === 'calendar') button.disabled = !canCalendar;
  });
  return reviewMode === 'calendar' ? renderReviewCalendar(groups) : renderReviewList(groups);
}

function renderReviewCalendar(groups) {
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  const safeColor = (color) => /^#[0-9a-f]{6}$/i.test(color || '') ? color : '#9a9898';
  const dates = groups.map((group) => group.date);
  const calendar = calendarReviewData(groups.flatMap((group) => group.entries), dates);
  const span = calendar.axis.to - calendar.axis.from;
  const labels = [];
  for (let minute = calendar.axis.from; minute <= calendar.axis.to; minute += 60) {
    const top = ((minute - calendar.axis.from) / span) * 100;
    labels.push(`<span class="review-calendar-axis-label num" style="top:${top}%">${String(Math.floor(minute / 60)).padStart(2, '0')}:00</span>`);
  }
  const dayHeaders = calendar.days.map((day) => {
    const date = new Date(`${day.date}T00:00:00`);
    return `<div class="review-calendar-day-head"><strong>${esc(day.date.slice(5))}</strong><span>週${weekdays[date.getDay()]}</span></div>`;
  }).join('');
  const dayBodies = calendar.days.map((day) => {
    const entries = day.entries.map((item) => {
      const entry = item.entry;
      const project = S.projects.find((projectItem) => projectItem.id === entry.projectId);
      const task = S.tasks.find((taskItem) => taskItem.id === entry.taskId);
      const title = entry.description || task?.title || '未命名工作';
      const projectName = project?.name || '一般工作';
      const tooltip = calendarEntryTooltip(title, entry, projectName);
      const notePreview = entry.notes
        ? renderMarkdownPreview(entry.notes, 'review-calendar-tooltip-notes')
        : '';
      const top = ((item.start - calendar.axis.from) / span) * 100;
      const height = Math.max(4, ((item.end - item.start) / span) * 100);
      return `<div class="review-calendar-entry" tabindex="0" title="${esc(tooltip)}" aria-label="${esc(tooltip)}" style="--entry-top:${top};--entry-height:${height};--entry-lane:${item.lane};--entry-lanes:${item.lanes};--project-color:${safeColor(project?.color)}">
        <span class="review-calendar-title">${esc(projectName)}</span>
        <div class="review-calendar-tooltip" role="tooltip">
          <strong>${esc(title)}</strong>
          <span>${fmtClock(entry.startedAt)}–${fmtClock(entry.endedAt)}</span>
          <span>${esc(projectName)}</span>
          ${notePreview}
        </div>
      </div>`;
    }).join('');
    return `<div class="review-calendar-day-body">${entries}</div>`;
  }).join('');
  return `<div class="review-calendar" style="--review-days:${calendar.days.length};--calendar-from:${calendar.axis.from};--calendar-span:${span};--calendar-hours:${span / 60};--calendar-height:${Math.max(480, span * .9)}px">
    <div class="review-calendar-corner"></div>${dayHeaders}
    <div class="review-calendar-axis">${labels.join('')}</div>${dayBodies}
  </div>`;
}

function renderReviewCalendarLegacy(groups) {
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  const safeColor = (color) => /^#[0-9a-f]{6}$/i.test(color || '') ? color : '#9a9898';
  return `<div class="review-calendar" style="--review-days:${groups.length}">${groups.map((group) => {
    const day = new Date(`${group.date}T00:00:00`);
    const total = group.entries.reduce((sum, entry) => sum + db.durationSec(entry), 0);
    const items = group.entries.length
      ? group.entries.map((entry) => {
        const project = S.projects.find((item) => item.id === entry.projectId);
        const task = S.tasks.find((item) => item.id === entry.taskId);
        const title = entry.description || task?.title || '未命名工作';
        return `<div class="review-calendar-entry" style="--project-color:${safeColor(project?.color)}">
          <div class="review-calendar-time num">${fmtClock(entry.startedAt)}–${fmtClock(entry.endedAt)}</div>
          <div class="review-calendar-title">${esc(project?.name || '一般工作')}</div>
          <div class="review-calendar-duration num">${fmtHM(db.durationSec(entry))}</div>
        </div>`;
      }).join('')
      : '<div class="review-calendar-empty">—</div>';
    return `<article class="review-calendar-day">
      <header><strong>${esc(group.date.slice(5))}</strong><span>週${weekdays[day.getDay()]}</span></header>
      <div class="review-calendar-total num">${fmtHM(total)}</div>
      <div class="review-calendar-list">${items}</div>
    </article>`;
  }).join('')}</div>`;
}

function renderReviewList(groups) {
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  const safeColor = (color) => /^#[0-9a-f]{6}$/i.test(color || '') ? color : '#9a9898';
  return groups.map((group) => {
    const day = new Date(`${group.date}T00:00:00`);
    const total = group.entries.reduce((sum, entry) => sum + db.durationSec(entry), 0);
    const entries = group.entries.length
      ? group.entries.map((entry) => {
        const project = S.projects.find((item) => item.id === entry.projectId);
        const task = S.tasks.find((item) => item.id === entry.taskId);
        const title = entry.description || task?.title || '未命名工作';
        const projectName = project?.name || '一般工作';
        const color = safeColor(project?.color);
        return `<div class="daily-review-entry">
          <div class="daily-review-time num">${fmtClock(entry.startedAt)}–${fmtClock(entry.endedAt)}</div>
          <span class="daily-review-swatch" style="background:${color}" aria-hidden="true"></span>
          <div class="daily-review-main">
            <div class="daily-review-title">${esc(title)} <span class="cap">${esc(projectName)}</span></div>
            ${entry.notes ? `<div class="daily-review-notes">${renderMarkdownPreview(entry.notes)}</div>` : ''}
          </div>
          <div class="daily-review-duration num">${fmtHM(db.durationSec(entry))}</div>
        </div>`;
      }).join('')
      : '<div class="daily-review-empty">這天沒有工作紀錄</div>';
    return `<section class="daily-review-day">
      <div class="daily-review-day-head">
        <strong>${esc(group.date)}（${weekdays[day.getDay()]}）</strong>
        <span class="cap">${fmtHM(total)} · ${group.entries.length} 筆</span>
      </div>
      <div class="daily-review-list">${entries}</div>
    </section>`;
  }).join('');
}

function renderTodoHealth() {
  const health = todoHealth(S.tasks);
  const completionRate = health.total ? `${Math.round(health.completionRate * 100)}%` : '—';

  $('todoHealth').innerHTML = `<div class="todo-health">
    <div class="todo-health-item">
      <span class="cap">Todo 總數</span>
      <span class="num">${health.total}</span>
    </div>
    <div class="todo-health-item todo-health-complete">
      <span class="cap">已完成</span>
      <span class="num">${health.done}<small>${completionRate}</small></span>
    </div>
    <div class="todo-health-item">
      <span class="cap">進行中</span>
      <span class="num">${health.active}</span>
    </div>
    <div class="todo-health-item todo-health-overdue">
      <span class="cap">逾期未完成</span>
      <span class="num">${health.overdue}</span>
    </div>
  </div>`;
}

/* ---------------- 專案趨勢（完整資料 + highlight） ---------------- */

let highlightProjectId = null;

let projectTrendState = null;
let projectTrendSource = null;
let reportChartCollapsed = new Set();
let todoTrackerState = null;
let todoTrackerSource = null;
let todoTrackerSelectedId = null;
let todoTrackerFilter = 'active';
let todoTrackerViewStart = null;
let todoTrackerRefreshTimer = null;
let todoTrackerHoveredTarget = null;
let todoTrackerCollapsedIds = new Set();

function sameTrendProject(left, right) {
  return (left || null) === (right || null);
}

function trendOverview() {
  if (!projectTrendState) return '';
  const total = projectTrendState.dailyTotals.reduce((sum, value) => sum + value, 0);
  const rows = projectTrendState.series
    .filter((series) => series.total > 0)
    .map((series) => {
      const pct = total ? Math.round((series.total / total) * 100) : 0;
      return `${esc(series.name)} ${fmtHM(series.total)} (${pct}%)`;
    }).join(' · ');
  return total
    ? `<strong>區間總計 ${fmtHM(total)}</strong><br><span>${rows}</span>`
    : '這個區間沒有專案工時';
}

function trendSummary(date, projectId = null) {
  if (!projectTrendState) return '';
  const index = projectTrendState.dates.indexOf(date);
  if (index < 0) return '';
  const total = projectTrendState.dailyTotals[index] || 0;
  const details = projectTrendState.detailsByDate[index] || [];
  const selected = projectId === null
    ? null
    : details.find((item) => sameTrendProject(item.id, projectId));
  const rows = details.length
    ? details.map((item) => {
        const pct = total ? Math.round((item.seconds / total) * 100) : 0;
        return `${esc(item.name)} ${fmtHM(item.seconds)} (${pct}%)`;
      }).join(' · ')
    : '沒有專案工時';
  const selectedText = selected
    ? `<strong>${esc(selected.name)} ${fmtHM(selected.seconds)} (${total ? Math.round((selected.seconds / total) * 100) : 0}%)</strong><br>`
    : '';
  return `${selectedText}<strong>${esc(date)}</strong> · 當日總計 ${fmtHM(total)}<br><span>${rows}</span>`;
}

function setTrendHover(date, projectId = null) {
  document.querySelectorAll('#byProject [data-trend-date]').forEach((element) => {
    element.classList.toggle('is-hovered', Boolean(date) && element.dataset.trendDate === date);
    element.classList.toggle('is-project-hovered', Boolean(projectId)
      && sameTrendProject(element.dataset.projectId, projectId));
  });
  document.querySelectorAll('#byProject [data-project-id]').forEach((element) => {
    element.classList.toggle('is-project-hovered', Boolean(projectId)
      && sameTrendProject(element.dataset.projectId, projectId));
  });
  const tooltip = $('projectTrendTooltip');
  if (tooltip) tooltip.innerHTML = date ? trendSummary(date, projectId) : trendOverview();
}

function applyTrendHighlight() {
  const projectId = highlightProjectId || null;
  document.querySelectorAll('#byProject [data-project-id]').forEach((element) => {
    const active = Boolean(projectId) && sameTrendProject(element.dataset.projectId, projectId);
    element.classList.toggle('is-highlighted', active);
    element.classList.toggle('is-dimmed', Boolean(projectId) && !active);
  });
  document.querySelectorAll('#byProject [data-trend-project]').forEach((button) => {
    const active = sameTrendProject(button.dataset.trendProject, projectId);
    button.classList.toggle('is-active', active);
    button.classList.toggle('is-dimmed', Boolean(projectId) && !active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function renderTrendDetails(projectId) {
  const box = $('projectTrendDetail');
  if (!box || !projectTrendSource) return;
  if (!projectId) {
    box.hidden = true;
    box.innerHTML = '';
    return;
  }

  const detail = buildProjectDetailData({
    ...projectTrendSource,
    projects: S.projects,
    tasks: S.tasks,
    projectId,
    durationSec: db.durationSec,
  });
  const project = S.projects.find((item) => item.id === projectId);
  if (!project) return;
  const projectPath = pathOf(S.projects, project.id).join(' / ');
  const grouped = new Map();
  for (const entry of detail.entries) {
    const date = fmtDate(entry.startedAt);
    if (!grouped.has(date)) grouped.set(date, []);
    grouped.get(date).push(entry);
  }
  const dailyTotals = new Map(projectTrendSource.dates.map((date, index) => [date, detail.dailyTotals[index] || 0]));
  const taskById = new Map(S.tasks.map((task) => [task.id, task]));
  const dayMarkup = [...grouped.entries()].map(([date, entries]) => `
    <section class="trend-detail-day">
      <div class="trend-detail-day-head"><strong>${esc(date)}</strong><span class="num">${fmtHM(dailyTotals.get(date) || 0)} · ${entries.length} 筆</span></div>
      ${entries.map((entry) => {
        const task = taskById.get(entry.taskId);
        const title = entry.description || task?.title || '未命名工作';
        const projectItem = S.projects.find((item) => item.id === entry.projectId);
        const location = projectItem ? pathOf(S.projects, projectItem.id).join(' / ') : '透過 Todo 記錄';
        return `<div class="trend-detail-entry">
          <span class="num mute">${fmtClock(entry.startedAt)}–${fmtClock(entry.endedAt)}</span>
          <div class="grow"><strong>${esc(title)}</strong>${task && entry.description ? ` <span class="badge">${esc(task.title)}</span>` : ''}<div class="sub">${esc(location)}</div></div>
          <span class="num">${fmtHM(entry.seconds)}</span>
        </div>`;
      }).join('')}
    </section>`).join('');

  const truncated = detail.totalEntries - detail.entries.length;
  box.hidden = false;
  box.innerHTML = `<div class="trend-detail-head">
    <div><strong>${esc(project.name)} 細項</strong><div class="sub">${esc(projectPath)} · 含子專案</div></div>
    <button type="button" class="btn-sm" data-trend-detail-close>收合</button>
  </div>
  <div class="trend-detail-kpis">
    <span class="badge">${fmtHM(detail.totalSeconds)} 總工時</span>
    <span class="badge">${detail.tasksDone}/${detail.tasksTotal} Todo 完成</span>
    <span class="badge">${detail.totalEntries} 筆工作紀錄</span>
  </div>
  <div class="trend-detail-list">${dayMarkup || '<div class="empty">這個區間沒有工作紀錄</div>'}</div>
  ${truncated > 0 ? `<div class="cap trend-detail-more">另有 ${truncated} 筆紀錄未展開</div>` : ''}`;
}

function todoStatusLabel(status) {
  return status === 'done' ? '已完成' : status === 'doing' ? '進行中' : '待辦';
}

function todoTrackerColor(project) {
  return /^#[0-9a-f]{6}$/i.test(project?.color || '') ? project.color : '#6faed0';
}

function todoTrackerDateTime(value) {
  return value ? `${fmtDate(value)} ${fmtClock(value)}` : '進行中（更新中）';
}

function todoTrackerDateRange(item) {
  const start = fmtDate(item.openedAt).slice(5);
  const end = fmtDate(item.endedAt || new Date()).slice(5);
  return `${start} ～ ${end}`;
}

function renderTodoTrackerDetail() {
  const box = $('todoTrackerDetail');
  if (!box || !todoTrackerState) return;
  const item = todoTrackerState.items.find((candidate) => candidate.id === todoTrackerSelectedId);
  if (!item) {
    box.hidden = true;
    box.innerHTML = '';
    return;
  }

  const task = S.tasks.find((candidate) => candidate.id === item.id);
  const project = item.projectId && S.projects.find((candidate) => candidate.id === item.projectId);
  const projectPath = project ? pathOf(S.projects, project.id).join(' / ') : '未分類專案';
  const entries = item.entries.length
    ? item.entries.map((entry) => `<div class="todo-tracker-entry">
        <span class="num mute">${fmtDate(entry.startedAt)}<br>${fmtClock(entry.startedAt)}–${fmtClock(entry.endedAt)}</span>
        <div class="grow"><strong>${esc(entry.description || '工作紀錄')}</strong><div class="sub">${fmtDate(entry.startedAt)} → ${fmtDate(entry.endedAt)}</div>${entry.notes ? renderMarkdownPreview(entry.notes) : ''}</div>
        <span class="num">${fmtHM(entry.seconds)}</span>
      </div>`).join('')
    : '<div class="empty">沒有可顯示的實際工作紀錄</div>';

  box.hidden = false;
  box.innerHTML = `<div class="todo-tracker-detail-head">
    <div><strong>${esc(item.title)}</strong><div class="sub">${esc(projectPath)}</div></div>
    <button type="button" class="btn-sm" data-todo-tracker-close>關閉</button>
  </div>
  <div class="todo-tracker-detail-kpis">
    <span class="badge">${esc(todoStatusLabel(item.status))}</span>
    <span class="badge">開單 ${esc(todoTrackerDateTime(item.openedAt))}</span>
    <span class="badge">結單 ${esc(todoTrackerDateTime(item.endedAt))}</span>
    <span class="badge">跨日 ${item.lifecycleDays} 天</span>
    <span class="badge">實際工作 ${item.workedDays} 天</span>
    <span class="badge">累積工時 ${fmtHM(item.trackedSeconds)}</span>
  </div>
  ${task?.notes ? `<div class="todo-tracker-detail-notes">${renderMarkdownPreview(task.notes)}</div>` : ''}
  <div class="todo-tracker-detail-section"><strong>實際工作紀錄（${item.entries.length} 筆）</strong></div>
  <div class="todo-tracker-entry-list">${entries}</div>`;
  initializeMarkdownPreviews(box);
}

function stopTodoTrackerRefresh() {
  clearInterval(todoTrackerRefreshTimer);
  todoTrackerRefreshTimer = null;
}

function startTodoTrackerRefresh() {
  stopTodoTrackerRefresh();
  todoTrackerRefreshTimer = setInterval(() => {
    if (!todoTrackerSource) return;
    renderTodoTracker(todoTrackerSource.entries, undefined, { restartTimer: false });
  }, 60000);
}

function todoTrackerFilterItems(items) {
  if (todoTrackerFilter === 'done') return items.filter((item) => item.status === 'done');
  if (todoTrackerFilter === 'all') return items;
  return items.filter((item) => item.status !== 'done');
}

function todoTrackerDatesThroughToday(dates) {
  if (!dates.length) return dates;
  const result = [...dates];
  const today = fmtDate(new Date());
  const cursor = new Date(`${result[result.length - 1]}T00:00:00`);
  const end = new Date(`${today}T00:00:00`);
  while (cursor < end) {
    cursor.setDate(cursor.getDate() + 1);
    result.push(fmtDate(cursor));
  }
  return result;
}

function todoTrackerVisibleDays(mount, totalDays) {
  const labelWidth = window.innerWidth <= 700 ? 160 : 220;
  const availableWidth = Math.max(1, (mount?.clientWidth || 760) - labelWidth);
  return Math.min(totalDays, Math.max(5, Math.floor(availableWidth / 72)));
}

function todoTrackerDefaultStart(dates, visibleDays) {
  const todayIndex = dates.indexOf(fmtDate(new Date()));
  const endIndex = todayIndex >= 0 ? todayIndex : dates.length - 1;
  return Math.max(0, Math.min(Math.max(0, dates.length - visibleDays), endIndex - visibleDays + 1));
}

function todoTrackerRangeLabel(start, end) {
  return `${start.replaceAll('-', '/')} ～ ${end.replaceAll('-', '/')}`;
}

function hideTodoTrackerTooltip() {
  todoTrackerHoveredTarget?.classList.remove('is-hovered');
  todoTrackerHoveredTarget = null;
  const tooltip = $('todoTrackerHoverTooltip');
  if (!tooltip) return;
  tooltip.hidden = true;
  tooltip.classList.remove('is-visible');
}

function showTodoTrackerTooltip(target) {
  const tooltip = $('todoTrackerHoverTooltip');
  if (!tooltip || !target) return;
  if (todoTrackerHoveredTarget && todoTrackerHoveredTarget !== target) {
    todoTrackerHoveredTarget.classList.remove('is-hovered');
  }
  todoTrackerHoveredTarget = target;
  target.classList.add('is-hovered');
  tooltip.innerHTML = `<strong>${esc(target.dataset.todoTrackerTitle || '')}</strong><br>${esc(target.dataset.todoTrackerDate || '')} · 有工作紀錄`;
  tooltip.hidden = false;
  tooltip.classList.add('is-visible');

  const rect = target.getBoundingClientRect();
  const gap = 8;
  const padding = 8;
  const tooltipRect = tooltip.getBoundingClientRect();
  const left = Math.max(padding, Math.min(rect.left, window.innerWidth - tooltipRect.width - padding));
  const fitsBelow = rect.bottom + gap + tooltipRect.height <= window.innerHeight - padding;
  const top = fitsBelow
    ? rect.bottom + gap
    : Math.max(padding, rect.top - gap - tooltipRect.height);
  tooltip.style.left = `${Math.round(left)}px`;
  tooltip.style.top = `${Math.round(top)}px`;
}

function repositionTodoTrackerTooltip() {
  if (todoTrackerHoveredTarget?.isConnected) showTodoTrackerTooltip(todoTrackerHoveredTarget);
}

function renderTodoTracker(entries, dates, { restartTimer = true } = {}) {
  const mount = $('todoTracker');
  if (!mount) return;
  hideTodoTrackerTooltip();
  const initialData = buildTodoTrackerData({
    tasks: S.tasks,
    entries,
    dates,
    now: new Date(),
    durationSec: db.durationSec,
  });
  const trackerDates = todoTrackerDatesThroughToday(initialData.dates);
  const data = trackerDates.length === initialData.dates.length
    ? initialData
    : buildTodoTrackerData({
      tasks: S.tasks,
      entries,
      dates: trackerDates,
      now: new Date(),
      durationSec: db.durationSec,
    });
  todoTrackerState = data;
  todoTrackerSource = { entries };
  const visibleDays = todoTrackerVisibleDays(mount, data.dates.length);
  if (todoTrackerViewStart === null) todoTrackerViewStart = todoTrackerDefaultStart(data.dates, visibleDays);
  todoTrackerViewStart = Math.max(0, Math.min(data.dates.length - visibleDays, todoTrackerViewStart));
  const visibleDates = data.dates.slice(todoTrackerViewStart, todoTrackerViewStart + visibleDays);
  const viewEnd = new Date(`${visibleDates[visibleDates.length - 1]}T00:00:00`);
  viewEnd.setDate(viewEnd.getDate() + 1);
  const visibleDateIndex = new Map(visibleDates.map((date, index) => [date, index]));
  const visibleItems = todoTrackerFilterItems(data.items);
  if (todoTrackerSelectedId && !visibleItems.some((item) => item.id === todoTrackerSelectedId)) {
    todoTrackerSelectedId = null;
  }

  if (!data.items.length) {
    mount.innerHTML = `<div class="todo-tracker-empty"><strong>Todo Tracker</strong><span class="todo-tracker-summary">今日結案 ${data.completedTodayCount} 個</span><div>目前沒有實際工時的 Todo</div></div>`;
    renderTodoTrackerDetail();
    if (restartTimer) startTodoTrackerRefresh();
    return;
  }

  const dateHeaders = visibleDates.map((date) => `<span>${esc(date.slice(5))}</span>`).join('');
  const filterControl = `<label class="todo-tracker-filter"><span>顯示</span><select data-todo-tracker-filter aria-label="Todo Tracker 篩選"><option value="active"${todoTrackerFilter === 'active' ? ' selected' : ''}>未完成</option><option value="all"${todoTrackerFilter === 'all' ? ' selected' : ''}>全部</option><option value="done"${todoTrackerFilter === 'done' ? ' selected' : ''}>已完成</option></select></label>`;
  const rows = visibleItems.map((item) => {
    const project = item.projectId && S.projects.find((candidate) => candidate.id === item.projectId);
    const color = todoTrackerColor(project);
    const lifecycleStart = new Date(item.openedAt);
    const lifecycleEnd = item.endedAt ? new Date(item.endedAt) : new Date();
    const lifecycleDates = visibleDates.map((date, day) => {
      const dayStart = new Date(`${date}T00:00:00`);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      return lifecycleStart < dayEnd && lifecycleEnd > dayStart ? { date, day } : null;
    }).filter(Boolean);
    const lifecycleCells = lifecycleDates.map(({ date, day }) => `<span class="todo-tracker-lifecycle" style="--todo-day:${day};--todo-color:${color}" title="開單 ${todoTrackerDateTime(item.openedAt)} · 結單 ${todoTrackerDateTime(item.endedAt)}"></span>`).join('');
    const dateRange = todoTrackerDateRange(item);
    const title = `${item.title} · ${todoStatusLabel(item.status)} · ${dateRange} · 實際工作 ${item.workedDays} 天 / 共 ${item.lifecycleDays} 天`;
    const collapsed = todoTrackerCollapsedIds.has(item.id);
    const workDates = item.workedDates
      .map((date) => ({ date, day: visibleDateIndex.get(date) }))
      .filter(({ day }) => day >= 0);
    const workSegments = workDates.map(({ date, day }) => {
      const dateTitle = `${item.title} · ${date} · 有工作紀錄`;
      return `<button type="button" class="todo-tracker-work${item.id === todoTrackerSelectedId ? ' is-selected' : ''}"
        data-todo-tracker-id="${esc(item.id)}" data-todo-tracker-title="${esc(item.title)}" data-todo-tracker-date="${esc(date)}" aria-label="${esc(dateTitle)}"
        style="--todo-day:${day};--todo-color:${color}">
      </button>`;
    }).join('');
    return `<div class="todo-tracker-row">
      <div class="todo-tracker-label" title="${esc(title)}">
        <details class="todo-tracker-label-details" data-todo-tracker-collapse="${esc(item.id)}"${collapsed ? '' : ' open'}>
          <summary><strong>${esc(item.title)}</strong></summary>
          <span class="todo-tracker-label-meta"><i style="background:${color}"></i>${esc(todoStatusLabel(item.status))} · ${esc(dateRange)}</span>
          <span class="todo-tracker-label-days">${item.workedDays} 天 / 共 ${item.lifecycleDays} 天</span>
        </details>
      </div>
      <div class="todo-tracker-track" style="--todo-tracker-lanes:${item.laneCount}">
        ${lifecycleCells}
        ${workSegments}
      </div>
    </div>`;
  }).join('');
  const rowMarkup = rows || '<div class="todo-tracker-filter-empty">這個篩選沒有符合的 Todo</div>';

  mount.innerHTML = `<div class="todo-tracker" style="--todo-tracker-days:${visibleDates.length}">
    <div class="todo-tracker-toolbar"><strong>Todo Tracker</strong><span class="todo-tracker-summary">今日結案 ${data.completedTodayCount} 個</span><span class="todo-tracker-range" data-todo-tracker-range>${esc(todoTrackerRangeLabel(visibleDates[0], visibleDates[visibleDates.length - 1]))}</span>${filterControl}<span class="todo-tracker-nav"><button type="button" class="btn-sm" data-todo-tracker-shift="-1" title="前一天" aria-label="前一天">←1天</button><button type="button" class="btn-sm" data-todo-tracker-shift="-7" title="前一週" aria-label="前一週">←1週</button><button type="button" class="btn-sm" data-todo-tracker-today>今天</button><button type="button" class="btn-sm" data-todo-tracker-shift="7" title="後一週" aria-label="後一週">1週→</button><button type="button" class="btn-sm" data-todo-tracker-shift="1" title="後一天" aria-label="後一天">1天→</button></span></div>
    <div class="todo-tracker-axis"><span></span><div>${dateHeaders}</div></div>
    <div class="todo-tracker-rows">${rowMarkup}</div>
  </div><div id="todoTrackerHoverTooltip" class="todo-tracker-tooltip" role="tooltip" hidden></div>
  `;
  mount.querySelectorAll('[data-todo-tracker-collapse]').forEach((details) => {
    details.addEventListener('toggle', () => {
      const id = details.dataset.todoTrackerCollapse;
      if (details.open) todoTrackerCollapsedIds.delete(id);
      else todoTrackerCollapsedIds.add(id);
    });
  });
  renderTodoTrackerDetail();
  if (restartTimer) startTodoTrackerRefresh();
}

function renderProjectTrend(entries, dates, trackerEntries = entries) {
  const data = buildProjectTrendData({
    entries,
    projects: S.projects,
    dates,
    durationSec: db.durationSec,
  });
  projectTrendState = data;
  projectTrendSource = { entries, dates };

  const projectLinks = data.series
    .filter((series) => series.id && series.id !== 'other' && !String(series.id).startsWith('direct:'))
    .map((series) => `<button class="trend-project-link" type="button" data-trend-project="${esc(series.id)}" aria-pressed="false">
      <span class="swatch" style="background:${esc(series.color)}"></span>${esc(series.name)}</button>`)
    .join('');

  $('byProject').innerHTML = `<div class="project-trend-wrap">
    <div class="project-trend-toolbar"><span class="mute">全部專案</span><span class="cap">${dates.length ? `${esc(dates[0])} ～ ${esc(dates[dates.length - 1])}` : ''}</span></div>
    <div id="projectTrend">${stackedAreaSVG(data)}</div>
    <div id="projectTrendTooltip" class="project-trend-tooltip"></div>
    <div class="trend-legend">${projectLinks || '<span class="mute">沒有可聚焦的專案</span>'}</div>
    <div class="project-heatmap-title">專案 × 日期</div>
    <div id="projectHeatmap" class="project-heatmap-scroll">${heatmapSVG(data)}</div>
    <div id="todoTracker"></div>
    <div id="projectTrendDetail" class="project-trend-detail" hidden></div>
    <div id="todoTrackerDetail" hidden></div>
  </div>`;
  wrapReportChartContent();
  applyTrendHighlight();
  setTrendHover(null);
  renderTrendDetails(highlightProjectId);
  todoTrackerViewStart = null;
  renderTodoTracker(trackerEntries);
}

$('byProject').addEventListener('change', (e) => {
  const filter = e.target.closest('[data-todo-tracker-filter]');
  if (!filter) return;
  todoTrackerFilter = filter.value;
  todoTrackerSelectedId = null;
  renderTodoTracker(todoTrackerSource.entries, undefined, { restartTimer: false });
});

$('byProject').addEventListener('click', (e) => {
  const trackerShift = e.target.closest('[data-todo-tracker-shift]');
  if (trackerShift) {
    todoTrackerViewStart = Math.max(0, (todoTrackerViewStart || 0) + Number(trackerShift.dataset.todoTrackerShift || 0));
    renderTodoTracker(todoTrackerSource.entries, undefined, { restartTimer: false });
    return;
  }
  if (e.target.closest('[data-todo-tracker-today]')) {
    todoTrackerViewStart = null;
    renderTodoTracker(todoTrackerSource.entries, undefined, { restartTimer: false });
    return;
  }
  const todoBar = e.target.closest('[data-todo-tracker-id]');
  if (todoBar) {
    const id = todoBar.dataset.todoTrackerId || null;
    todoTrackerSelectedId = todoTrackerSelectedId === id ? null : id;
    renderTodoTracker(todoTrackerSource.entries, undefined, { restartTimer: false });
    return;
  }
  if (e.target.closest('[data-todo-tracker-close]')) {
    todoTrackerSelectedId = null;
    renderTodoTrackerDetail();
    return;
  }
  const project = e.target.closest('[data-trend-project]');
  if (project) {
    const projectId = project.dataset.trendProject || null;
    highlightProjectId = highlightProjectId === projectId ? null : projectId;
    applyTrendHighlight();
    renderTrendDetails(highlightProjectId);
    return;
  }
  if (e.target.closest('[data-trend-detail-close]')) {
    highlightProjectId = null;
    applyTrendHighlight();
    renderTrendDetails(null);
  }
});

$('byProject').addEventListener('pointerover', (e) => {
  const target = e.target.closest('[data-trend-date]');
  if (target) setTrendHover(target.dataset.trendDate, target.dataset.projectId || null);
});

$('byProject').addEventListener('pointerout', (e) => {
  if (e.relatedTarget?.closest?.('[data-trend-date]')) return;
  setTrendHover(null);
});

$('byProject').addEventListener('focusin', (e) => {
  const target = e.target.closest('[data-trend-date]');
  if (target) setTrendHover(target.dataset.trendDate, target.dataset.projectId || null);
});

$('byProject').addEventListener('focusout', (e) => {
  if (e.relatedTarget?.closest?.('[data-trend-date]')) return;
  setTrendHover(null);
});

$('byProject').addEventListener('pointerover', (e) => {
  const target = e.target.closest('[data-todo-tracker-id]');
  if (!target || e.relatedTarget?.closest?.('[data-todo-tracker-id]') === target) return;
  showTodoTrackerTooltip(target);
});

$('byProject').addEventListener('pointerout', (e) => {
  const target = e.target.closest('[data-todo-tracker-id]');
  if (!target) return;
  const next = e.relatedTarget?.closest?.('[data-todo-tracker-id]');
  if (next) {
    showTodoTrackerTooltip(next);
    return;
  }
  hideTodoTrackerTooltip();
});

$('byProject').addEventListener('focusin', (e) => {
  const target = e.target.closest('[data-todo-tracker-id]');
  if (target) showTodoTrackerTooltip(target);
});

$('byProject').addEventListener('focusout', (e) => {
  const target = e.target.closest('[data-todo-tracker-id]');
  if (!target) return;
  const next = e.relatedTarget?.closest?.('[data-todo-tracker-id]');
  if (next) {
    showTodoTrackerTooltip(next);
    return;
  }
  hideTodoTrackerTooltip();
});

window.addEventListener('resize', repositionTodoTrackerTooltip);
window.addEventListener('scroll', repositionTodoTrackerTooltip, true);

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

let workspaceProjectId = null;

function renderProjectNotes() {
  const pid = workspaceProjectId || $('pjId').value;
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
            : `<div class="note-body">${renderMarkdownPreview(n.text)}</div>`}
        </div>`;
      }).join('')
    : '<div class="empty">還沒有目標或筆記</div>';

  if (noteEditingId) {
    const ta = $('pjNoteList').querySelector(`[data-note-input="${noteEditingId}"]`);
    if (ta) { autoGrow(ta, { min: 72, max: 400 }); ta.focus(); }
  }
}

$('pjNoteAdd').addEventListener('click', async () => {
  const pid = workspaceProjectId || $('pjId').value;
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
  const pid = workspaceProjectId || $('pjId').value;
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
  const notesBox = $('pjNotesBox');
  workspaceProjectId = id;
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
  if (notesBox) {
    $('projectWorkspace').appendChild(notesBox);
    notesBox.hidden = false;
    notesBox.removeAttribute('hidden');
    renderProjectNotes();
  }
  initializeMarkdownPreviews($('projectWorkspace'));
  const workspaceSections = $('projectWorkspace').querySelectorAll('.workspace-section');
  workspaceSections[0]?.classList.add('workspace-section-first');
  workspaceSections.forEach((section) => {
    const head = section.querySelector('.workspace-section-head');
    if (!head) return;
    head.insertAdjacentHTML('beforeend', '<button type="button" class="btn-sm workspace-toggle" data-workspace-toggle>[−]</button>');
  });
  const noteHead = notesBox?.querySelector('.row');
  if (noteHead && !noteHead.querySelector('[data-workspace-toggle]')) {
    noteHead.insertAdjacentHTML('beforeend', '<button type="button" class="btn-sm workspace-toggle" data-workspace-toggle>[−]</button>');
  }
}

document.getElementById('projList').addEventListener('click', (event) => {
  const row = event.target.closest('[data-workspace-p]');
  const open = event.target.closest('[data-open-workspace]')?.dataset.openWorkspace;
  if (open) renderProjectWorkspace(open);
  else if (row && !event.target.closest('button')) renderProjectWorkspace(row.dataset.workspaceP);
});
document.getElementById('projectWorkspace').addEventListener('click', (event) => {
  const toggle = event.target.closest('[data-workspace-toggle]');
  if (toggle) {
    const section = toggle.closest('.workspace-section, #pjNotesBox');
    section.classList.toggle('is-collapsed');
    toggle.textContent = section.classList.contains('is-collapsed') ? '[+]' : '[−]';
    return;
  }
  if (event.target.closest('[data-close-workspace]')) {
    document.getElementById('projectWorkspace').hidden = true;
    $('pjNotesBox').hidden = true;
    workspaceProjectId = null;
  }
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
  workspaceProjectId = null;
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
    workspaceProjectId = null;
    $('pjNotesBox').hidden = true;
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

function flattenTodoTree(tasks) {
  const children = new Map();
  tasks.forEach((task) => {
    const parentId = task.parentId || null;
    if (!children.has(parentId)) children.set(parentId, []);
    children.get(parentId).push(task);
  });
  const compare = (a, b) =>
    Number(a.status === 'done') - Number(b.status === 'done')
    || ({ urgent: 0, high: 1, normal: 2, low: 3 }[a.priority || 'normal'] - { urgent: 0, high: 1, normal: 2, low: 3 }[b.priority || 'normal'])
    || (a.dueDate || '9999').localeCompare(b.dueDate || '9999')
    || (a.sortOrder - b.sortOrder);
  const out = [];
  const visit = (parentId, depth, seen = new Set()) => {
    for (const task of (children.get(parentId) || []).sort(compare)) {
      if (seen.has(task.id)) continue;
      out.push({ ...task, depth });
      visit(task.id, depth + 1, new Set(seen).add(task.id));
    }
  };
  visit(null, 0);
  return out.concat(tasks.filter((task) => !out.some((item) => item.id === task.id))
    .map((task) => ({ ...task, depth: 0 })));
}

function renderTodos() {
  const tree = flattenTree(S.projects);
  const opts = (blank) => `<option value="">${blank}</option>` +
    tree.map((p) => `<option value="${p.id}">${esc(indentLabel(p.name, p.depth))}</option>`).join('');
  const priorityOpts = (blank = null) => (blank === null ? '' : `<option value="">${blank}</option>`) +
    TODO_PRIORITIES.map((p) => `<option value="${p.value}">${p.label}</option>`).join('');

  const keepP = $('tdProject').value;
  $('tdProject').innerHTML = opts('— 未分類 —');
  $('tdProject').value = keepP;

  const keepParent = $('tdParent').value;
  const editingId = $('tdId').value;
  const descendants = new Set();
  const collectDescendants = (id) => S.tasks.forEach((task) => {
    if (task.parentId === id && !descendants.has(task.id)) {
      descendants.add(task.id);
      collectDescendants(task.id);
    }
  });
  if (editingId) collectDescendants(editingId);
  $('tdParent').innerHTML = '<option value="">— 最上層任務 —</option>' + S.tasks
    .filter((task) => task.status !== 'archived' && task.id !== editingId && !descendants.has(task.id))
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((task) => `<option value="${task.id}">${esc(task.title)}</option>`).join('');
  $('tdParent').value = keepParent;

  const keepF = $('tdFilter').value;
  $('tdFilter').innerHTML = opts('— 全部專案 —');
  $('tdFilter').value = keepF;

  const keepPriority = normalizePriority($('tdPriority').value);
  $('tdPriority').innerHTML = priorityOpts();
  $('tdPriority').value = keepPriority;

  const keepPriorityFilter = $('tdPriorityFilter').value;
  $('tdPriorityFilter').innerHTML = priorityOpts('— 全部優先級 —');
  $('tdPriorityFilter').value = keepPriorityFilter;

  $('tdToggleDone').textContent = showDone ? '[x] 顯示已完成' : '[ ] 顯示已完成';

  // 選了父專案時，子專案的 todo 也一起列出來
  const scope = keepF ? new Set([keepF, ...descendantSet(keepF)]) : null;

  const list = filterTasks(S.tasks, {
    projectScope: scope,
    priority: keepPriorityFilter,
    showDone,
  })
    .sort((a, b) =>
      Number(a.status === 'done') - Number(b.status === 'done')
      || ({ urgent: 0, high: 1, normal: 2, low: 3 }[a.priority || 'normal'] - { urgent: 0, high: 1, normal: 2, low: 3 }[b.priority || 'normal'])
      || (a.dueDate || '9999').localeCompare(b.dueDate || '9999')
      || (a.sortOrder - b.sortOrder));

  const orderedTasks = tree.flatMap((project) =>
    flattenTodoTree(list.filter((task) => task.projectId === project.id))
  ).concat(flattenTodoTree(list.filter((task) => !task.projectId)));

  $('tdCount').textContent = taskCountLabel(list, showDone);

  $('todoList').innerHTML = list.length
    ? orderedTasks.map((t, index) => {
        const p = S.projects.find((x) => x.id === t.projectId);
        const previous = orderedTasks[index - 1];
        const showProject = (t.projectId || null) !== (previous?.projectId || null);
        const done = t.status === 'done';
        const m = taskMetrics(t, S.entries);
        const workEntries = entriesForTask(t, S.entries);
        const dl = dueLabel(m, done);
        let taskDepth = 0;
        let parent = t.parentId ? S.tasks.find((item) => item.id === t.parentId) : null;
        const seenParents = new Set();
        while (parent && !seenParents.has(parent.id)) {
          seenParents.add(parent.id);
          taskDepth += 1;
          parent = parent.parentId ? S.tasks.find((item) => item.id === parent.parentId) : null;
        }

        // 三個時間排成一行，缺的用 — 佔位
        const dates = [
          `開單 ${stampLabel(t.openedAt)}`,
          `截止 ${t.dueDate ? t.dueDate + (t.dueTime ? ` ${t.dueTime}` : '') : '—'}`,
          `結案 ${stampLabel(t.completedAt)}`,
        ].join(' · ');

        return `${showProject ? `<div class="task-project-heading"><span class="swatch" style="background:${p ? p.color : '#9a9898'}"></span>${p ? esc(pathOf(S.projects, p.id).join(' / ')) : '未分類'}</div>` : ''}
        <div class="row-item todo-card task-item activity-row priority-${t.priority || 'normal'}${done ? ' done' : ''}" style="--task-depth:${t.depth}">
          ${t.depth ? '<span class="task-branch" aria-hidden="true">↳</span>' : ''}
          <button class="btn-sm btn-ghost activity-status" data-check="${t.id}"
            title="${done ? '重新打開' : '標記完成'}" style="width:34px">${done ? '[x]' : '[ ]'}</button>
          <span class="swatch activity-swatch" style="background:${p ? p.color : '#9a9898'}"></span>
          <div class="main">
            <div class="ellipsis">${esc(t.title)}
              <span class="badge priority-${normalizePriority(t.priority)}">${priorityLabel(t.priority)}</span>
              ${t.scheduleId ? '<span class="badge" title="由排程自動產生">排程</span>' : ''}
              ${t.status === 'doing' ? '<span class="badge">進行中</span>' : ''}
              ${dl ? `<span class="badge${m.isLate ? ' overdue' : ''}">${dl}</span>` : ''}
              ${m.leadMs !== null ? `<span class="badge">歷時 ${leadLabel(m.leadMs)}</span>` : ''}
              ${t.reopenCount ? `<span class="badge">重開 ${t.reopenCount} 次</span>` : ''}
            </div>
            <div class="sub">${p ? esc(pathOf(S.projects, p.id).join(' / ')) : '未分類'}</div>
            <div class="sub num">${dates}</div>
            ${t.notes ? renderMarkdownPreview(t.notes, 'notes') : ''}
            ${workEntries.length ? `<details class="todo-worklog"><summary>工作紀錄 ${workEntries.length} 筆 · ${fmtHM(m.worked)}</summary>
              <div class="todo-worklog-list">${workEntries.map((entry) => `<div class="todo-worklog-row">
                <span class="num mute">${fmtDate(entry.startedAt)}<br />${fmtClock(entry.startedAt)}–${fmtClock(entry.endedAt)}</span>
                <span class="grow">${esc(entry.description || '（無描述）')}${entry.notes ? renderMarkdownPreview(entry.notes) : ''}</span>
                <span class="num">${fmtHM(db.durationSec(entry))}</span>
              </div>`).join('')}</div></details>` : ''}
          </div>
          <span class="num activity-duration" title="累積工時">${m.worked ? fmtHM(m.worked) : '—'}</span>
          <div class="act">
            ${done ? '' : `<button class="btn-sm" data-run="${t.id}" title="對這個 todo 開始計時">[&gt;]</button>`}
            <button class="btn-sm" data-add-subtask="${t.id}" title="新增子任務">＋子任務</button>
            <button class="btn-sm" data-edit-t="${t.id}">[編輯]</button>
            <button class="btn-sm btn-danger" data-del-t="${t.id}">[x]</button>
          </div>
        </div>`;
      }).join('')
    : '<div class="empty">沒有符合的 todo</div>';
  initializeMarkdownPreviews($('todoList'));
}

function resetTodoForm() {
  $('tdId').value = ''; $('tdTitle').value = ''; $('tdNotes').value = '';
  $('tdParent').value = '';
  $('tdStatus').value = 'todo'; $('tdPriority').value = 'normal'; $('tdDue').value = ''; $('tdDueTime').value = '';
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
    parentId: $('tdParent').value || null,
    status: $('tdStatus').value,
    priority: $('tdPriority').value,
    dueDate: $('tdDue').value || null,   // 開單／結案時間由 db.js 自己維護
    dueTime: $('tdDueTime').value || null,
    notes: $('tdNotes').value,
  });
  resetTodoForm();
  await load();
});

$('tdCancel').addEventListener('click', resetTodoForm);
$('tdProject').addEventListener('change', renderTodos);
$('tdFilter').addEventListener('change', renderTodos);
$('tdPriorityFilter').addEventListener('change', renderTodos);
$('tdToggleDone').addEventListener('click', () => { showDone = !showDone; renderTodos(); });

$('todoList').addEventListener('click', async (e) => {
  const check = e.target.closest('[data-check]')?.dataset.check;
  const run = e.target.closest('[data-run]')?.dataset.run;
  const addSubtask = e.target.closest('[data-add-subtask]')?.dataset.addSubtask;
  const ed = e.target.closest('[data-edit-t]')?.dataset.editT;
  const del = e.target.closest('[data-del-t]')?.dataset.delT;

  if (check) {
    const t = S.tasks.find((x) => x.id === check);
    await db.upsertTask({ ...t, status: t.status === 'done' ? 'todo' : 'done' });
  } else if (run) {
    const t = S.tasks.find((x) => x.id === run);
    await db.startTimer({ projectId: t.projectId, taskId: t.id, description: t.title });
  } else if (addSubtask) {
    const parent = S.tasks.find((x) => x.id === addSubtask);
    if (!parent) return;
    resetTodoForm();
    $('tdProject').value = parent.projectId || '';
    $('tdParent').value = parent.id;
    $('tdPriority').value = parent.priority || 'normal';
    $('tdCancel').hidden = false;
    $('tdTitle').focus();
    return;
  } else if (ed) {
    const t = S.tasks.find((x) => x.id === ed);
    $('tdId').value = t.id; $('tdTitle').value = t.title;
    $('tdProject').value = t.projectId || '';
    $('tdParent').value = t.parentId || '';
    $('tdStatus').value = t.status; $('tdNotes').value = t.notes || '';
    $('tdPriority').value = normalizePriority(t.priority);
    $('tdDue').value = t.dueDate || '';
    $('tdDueTime').value = t.dueTime || '';
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
        const priority = normalizePriority(s.priority);
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
              <span class="badge priority-${priority}">${priorityLabel(priority)}</span>
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
  $('scPriority').value = 'normal';
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
    priority: normalizePriority($('scPriority').value),
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
    $('scPriority').value = normalizePriority(s.priority);
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
  const customBounds = enUI.range === 'custom' ? localDateRange(customRange.from, customRange.to) : null;
  const from = customBounds?.from || (enUI.range === 'today' ? startOfDay()
    : enUI.range === 'week' ? startOfWeek(new Date(), S.settings.weekStartsOn)
      : enUI.range === 'month' ? startOfMonth()
        : null);
  const to = customBounds?.to || null;

  // 選了父專案時，子專案的紀錄也一起算進來
  const scope = enUI.projectId
    ? new Set([enUI.projectId, ...descendantSet(enUI.projectId)])
    : null;

  const kw = enUI.q.trim().toLowerCase();

  return S.entries
    .filter((e) => e.endedAt && !e.deletedAt)
    .filter((e) => !from || new Date(e.startedAt) >= from)
    .filter((e) => !to || new Date(e.startedAt) < to)
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
            
            return `<div class="row-item activity-row entry-row">
              <span class="activity-time num mute">
                ${fmtClock(e.startedAt)}–${fmtClock(e.endedAt)}</span>
              <span class="swatch activity-swatch" style="background:${p ? p.color : '#9a9898'}"></span>
              <div class="main">
                <div class="ellipsis">${esc(e.description || '（無描述）')}
                  ${task ? `<span class="badge">${esc(task.title)}</span>` : ''}
                  ${tags.map((t) => `<span class="badge">${esc(t)}</span>`).join(' ')}</div>
                <div class="sub">${p ? esc(pathOf(S.projects, p.id).join(' / ')) : '未分類'}</div>
                ${notes ? renderMarkdownPreview(notes, 'notes') : ''}
              </div>
              <span class="num activity-duration">${fmtHM(db.durationSec(e))}</span>
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
  if (r === 'back') { closeCustomRange(); return; }
  if (r === 'custom') { openCustomRange(); return; }
  enUI.range = r; enUI.limit = 50;
  customRangeOpen = false;
  syncRangeControls();
  renderEntries();
});
$('entriesApplyRange').addEventListener('click', () => applyCustomRange('entries'));
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
  renderEntryTasks(e.taskId || '');
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
  ['report', 'timer', 'projects', 'todos', 'entries', 'schedules', 'tags', 'settings']
    .forEach((n) => { $('p-' + n).hidden = n !== name; });
  initializeMarkdownPreviews($('p-' + name));
  if (name === 'timer') requestAnimationFrame(() => growTimerNotes());
});

$('range').addEventListener('click', (e) => {
  const r = e.target.dataset.range;
  if (!r) return;
  if (r === 'back') { closeCustomRange(); return; }
  if (r === 'custom') { openCustomRange(); return; }
  range = r;
  customRangeOpen = false;
  syncRangeControls();
  renderReport();
});
$('reportApplyRange').addEventListener('click', () => applyCustomRange('report'));

// 進頁預設本週
range = 'week';
document.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.range === 'week'));
document.getElementById('reviewMode').addEventListener('click', (event) => {
  event.stopPropagation();
  const mode = event.target.dataset.reviewMode;
  if (!mode || event.target.disabled) return;
  reviewMode = mode;
  $('dailyReview').innerHTML = renderDailyReview(reviewGroups);
  initializeMarkdownPreviews($('dailyReview'));
});
document.getElementById('reviewMode').addEventListener('keydown', (event) => event.stopPropagation());
groupReportPanels();
initCollapse();
syncRangeControls();
resetTodoForm();
resetSchForm();
load();
