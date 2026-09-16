import * as db from '../lib/db.js';
import {
  applyTranslations,
  formatDisplayDate,
  formatDisplayTime,
  formatDuration,
  getBrowserLocale,
  normalizeLanguagePreference,
  resolveLocale,
  translate,
} from '../lib/i18n.js';
import {
  fmtDate, fmtClock, startOfDay, startOfMonth, localDateRange, activeRange, rangeControlState, currentWeekDateRange, dailySeries,
  dailyReviewData, calendarReviewData, timelineData, toLocalInput, fromLocalInput,
  clipEntryToRange, durationInRange, entryOverlapsRange, splitEntryByDay,
} from '../lib/time.js';
import { timelineSVG, stackedAreaSVG, heatmapSVG, lineSVG, donutSVG } from '../lib/charts.js';
import { initCollapse } from '../lib/collapse.js';
import { childrenOf, flattenTree, rollup, pathOf, indentLabel } from '../lib/tree.js';
import { buildSummary, copyToClipboard } from '../lib/summary.js';
import { autoGrow } from '../lib/autogrow.js';
import { createToast } from '../lib/toast.js';
import { compareTodoTasks, dueTodoAlerts, flattenTodoTree, taskMetrics, entriesForTask, dueLabel, leadLabel, stampLabel } from '../lib/tasks.js';
import { renderMarkdown, shouldShowMarkdownToggle } from '../lib/markdown.js';
import {
  TODO_PRIORITIES, TODO_STATUSES, filterTasks, normalizePriority, normalizeStatus,
  priorityLabel, statusLabel, taskCountLabel,
} from '../lib/todo-filter.js';
import { projectIdForTask, tasksForProject, sortTasksForManualEntry } from '../lib/entry-relations.js';
import { reportRangeBounds, trendDateBounds } from '../lib/report-range.js';
import { buildProjectTrendData, buildProjectDetailData } from '../lib/project-trend.js';
import { buildTodoTrackerData, syncTodoTrackerCollapseState } from '../lib/todo-tracker.js';
import {
  clearReportFocus,
  hasReportFocus,
  reportActionTarget,
  setReportFocus,
} from '../lib/report-navigation.js';
import {
  buildProjectTaskMetrics,
  buildProjectHealthRows,
  buildReportActionItems,
  buildReportQuality,
  buildWorkspaceTodoProgress,
} from '../lib/report-metrics.js';
import {
  mountMarkdownEditor,
  normalizeMarkdownEditorMode,
  serializeTaskCheckboxToggle,
} from '../lib/markdown-editor.js';

const growNotes = autoGrow(document.getElementById('enNotes'), { min: 96, max: 360 });
autoGrow(document.getElementById('tdNotes'), { min: 80, max: 320 });
autoGrow(document.getElementById('pjNoteDraft'), { min: 72, max: 320 });
autoGrow(document.getElementById('scNotes'), { min: 72, max: 280 });

const $ = (id) => document.getElementById(id);
const showToast = createToast($('appToast'));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const translateText = (key, variables) => translate(currentLocale, key, variables);
const fmtHM = (seconds) => formatDuration(seconds, currentLocale);
const displayDate = (value) => formatDisplayDate(value, currentLocale);
const displayClock = (value) => formatDisplayTime(value, currentLocale);

function renderMarkdownPreview(markdown, className = '', { interactiveTasks = false, inputId = '' } = {}) {
  return `<div class="${className} markdown-preview" data-markdown-preview${inputId ? ` data-markdown-preview-input="${inputId}"` : ''}>
    <div data-markdown-content>${renderMarkdown(markdown, { interactiveTasks })}</div>
  </div>`;
}

const markdownEditors = new Map();

function markdownEditorMode(mode) {
  return mode === 'source' ? 'source' : 'simple';
}

function initializeMarkdownEditors(mode = db.DEFAULT_SETTINGS.notesEditor) {
  const editorMode = markdownEditorMode(mode);
  markdownEditors.forEach((editor, textarea) => {
    if (!document.contains(textarea)) { editor.destroy(); markdownEditors.delete(textarea); }
  });
  document.querySelectorAll('[data-markdown-editor-input]').forEach((textarea) => {
    markdownEditors.get(textarea)?.destroy();
    markdownEditors.set(textarea, mountMarkdownEditor(textarea, {
      mode: editorMode,
      onEmptyParagraphEnter: textarea.id === 'enNotes'
        ? () => $('entryForm').requestSubmit($('entrySave'))
        : undefined,
    }));
  });
}

function syncMarkdownEditor(textarea) {
  markdownEditors.get(textarea)?.sync();
}

function isMarkdownEditorFocused(textarea) {
  return textarea.closest('.markdown-editor')?.contains(document.activeElement) || document.activeElement === textarea;
}

function setMarkdownPreviewExpanded(preview, expanded) {
  preview.classList.toggle('is-expanded', expanded);
  preview.querySelectorAll('[data-markdown-toggle]').forEach((button) => {
    button.textContent = expanded ? translateText('entry.collapseAll') : translateText('entry.expandAll');
    button.setAttribute('aria-expanded', String(expanded));
  });
}

function measureMarkdownPreview(preview, preserveExpanded = false, alwaysExpanded = false) {
  const content = preview.querySelector('[data-markdown-content]');
  const wasExpanded = preview.classList.contains('is-expanded');
  const collapsedHeight = Number.parseFloat(
    getComputedStyle(preview).getPropertyValue('--markdown-preview-collapsed-height'),
  );
  const isLong = !alwaysExpanded
    && shouldShowMarkdownToggle(content.textContent, content.scrollHeight, collapsedHeight);
  preview.classList.toggle('is-collapsible', isLong);
  let button = preview.querySelector('[data-markdown-toggle]');
  if (isLong && !button) {
    preview.insertAdjacentHTML('afterbegin', `<button type="button" class="btn-sm markdown-toggle markdown-toggle-top" data-markdown-toggle aria-expanded="false">${esc(translateText('entry.expandAll'))}</button>`);
    button = preview.querySelector('[data-markdown-toggle]');
  } else if (!isLong && button) {
    button.remove();
  }
  setMarkdownPreviewExpanded(preview, preserveExpanded && wasExpanded && isLong);
}

function initializeMarkdownPreviews(container, preserveExpanded = false, alwaysExpanded = false) {
  container.querySelectorAll('[data-markdown-preview]').forEach((preview) =>
    measureMarkdownPreview(preview, preserveExpanded, alwaysExpanded));
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

let currentLocale = 'zh-TW';
let S = { projects: [], tags: [], tasks: [], entries: [], schedules: [], timer: null, settings: db.DEFAULT_SETTINGS };
function renderEntryTasks(selectedTaskId = '') {
  const projectId = $('enProject').value;
  const tasks = sortTasksForManualEntry(tasksForProject(S.tasks, projectId), S.entries);
  const includeCompleted = $('enTaskIncludeDone')?.checked;
  const activeTasks = tasks.filter((task) => task.status !== 'done');
  const completedTasks = tasks.filter((task) => task.status === 'done');
  const visibleCompleted = includeCompleted
    ? completedTasks
    : completedTasks.filter((task) => task.id === selectedTaskId);
  const option = (task) => `<option value="${task.id}">${esc(task.title)}</option>`;
  $('enTask').innerHTML = `<option value="">${esc(translateText('common.noTodoOption'))}</option>` +
    activeTasks.map(option).join('') +
    (visibleCompleted.length
      ? `<optgroup label="${esc(translateText('todo.status.done'))}">${visibleCompleted.map(option).join('')}</optgroup>`
      : '');
  $('enTask').value = [...activeTasks, ...visibleCompleted].some((task) => task.id === selectedTaskId) ? selectedTaskId : '';
}
$('enProject').addEventListener('change', () => renderEntryTasks());
$('enTaskIncludeDone').addEventListener('change', () => renderEntryTasks($('enTask').value));
$('enTask').addEventListener('change', (event) => {
  $('enProject').value = projectIdForTask(event.target.value, S.tasks, $('enProject').value);
});

document.addEventListener('change', (event) => {
  const checkbox = event.target.closest?.('input[data-markdown-task-path]');
  const preview = checkbox?.closest('[data-markdown-preview-input]');
  const textarea = preview && document.getElementById(preview.dataset.markdownPreviewInput);
  if (!checkbox || !preview || !textarea) return;
  textarea.value = serializeTaskCheckboxToggle(textarea.value, checkbox.dataset.markdownTaskPath);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  const host = preview.parentElement;
  const className = [...preview.classList].filter((name) => name !== 'markdown-preview').join(' ');
  preview.outerHTML = renderMarkdownPreview(textarea.value, className, { interactiveTasks: true, inputId: textarea.id });
  if (host) initializeMarkdownPreviews(host);
});
let range = 'week';
const customRange = { from: '', to: '' };
let customRangeOpen = false;
const customReturnRange = { report: 'week', entries: 'all' };
let reviewMode = 'calendar';
let reviewGroups = [];
let timerTicker = null;
let timerNotesSaveTimer = null;
let timerCompleteChoice = false;
let timerDraft = { description: '', projectId: '', taskId: '', tagIds: [], notes: '' };
let timerNotesPreviewOpen = false;
let reviewCalendarSelectedTarget = null;

async function load() {
  const [projects, tags, tasks, entries, schedules, timer, settings] = await Promise.all([
    db.listProjects({ includeArchived: true }), db.listTags(),
    db.listTasks(), db.listEntries(), db.listSchedules(), db.getTimer(), db.getSettings(),
  ]);
  S = { projects, tags, tasks, entries, schedules, timer, settings };
  currentLocale = resolveLocale(settings.language, getBrowserLocale());
  document.documentElement.lang = currentLocale === 'zh-TW' ? 'zh-Hant' : currentLocale;
  applyTranslations(document, currentLocale);
  renderAll();
  $('initialLoading').hidden = true;
}

function rangeStart() {
  if (range === 'custom') return localDateRange(customRange.from, customRange.to)?.from || new Date(0);
  return reportRangeBounds(range, new Date(), S.settings.weekStartsOn).from;
}
function rangeEnd() {
  if (range === 'custom') return localDateRange(customRange.from, customRange.to)?.to || null;
  return reportRangeBounds(range, new Date(), S.settings.weekStartsOn).to;
}
const inRange = () => {
  const from = rangeStart();
  const to = rangeEnd();
  return S.entries
    .filter((e) => entryOverlapsRange(e, from, to));
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
    alert(translateText('common.invalidDateRange'));
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
  container.innerHTML = renderMarkdownPreview($('mgTimerNotes').value, 'timer-notes-markdown', {
    interactiveTasks: true,
    inputId: 'mgTimerNotes',
  });
  initializeMarkdownPreviews(container, false, true);
}

function syncTimerNotesMode() {
  const editing = !timerNotesPreviewOpen;
  const edit = $('mgTimerNotesEditToggle');
  const preview = $('mgTimerNotesPreviewToggle');
  edit.classList.toggle('active', editing);
  preview.classList.toggle('active', !editing);
  edit.setAttribute('aria-pressed', String(editing));
  preview.setAttribute('aria-pressed', String(!editing));
}

function setTimerNotesPreviewOpen(open) {
  timerNotesPreviewOpen = open;
  const editor = $('mgTimerNotes').closest('.markdown-editor');
  if (editor) editor.hidden = open;
  $('mgTimerNotes').hidden = open;
  $('mgTimerNotesPreview').hidden = !open;
  syncTimerNotesMode();
  if (open) renderTimerNotesPreview();
}

function renderTimer() {
  const timer = S.timer;
  const current = timer || timerDraft;
  const panel = $('managementTimer');
  const project = $('mgTimerProject');
  const task = $('mgTimerTask');
  const projectId = current.projectId || '';
  const taskId = current.taskId || '';

  syncTimerNotesMode();
  panel.classList.toggle('is-running', Boolean(timer));
  $('mgTimerStatus').textContent = timer ? translateText('timer.running') : translateText('timer.notStarted');
  $('mgTimerToggle').textContent = timer ? translateText('timer.stopAndSave') : translateText('timer.startAndSave');
  $('mgTimerIdleNotice').hidden = Boolean(timer);
  $('mgTimerDescription').value = current.description || '';
  if (!isMarkdownEditorFocused($('mgTimerNotes'))) $('mgTimerNotes').value = current.notes || '';
  syncMarkdownEditor($('mgTimerNotes'));

  project.innerHTML = `<option value="">${esc(translateText('common.uncategorizedOption'))}</option>` +
    flattenTree(S.projects, { includeArchived: false })
      .map((p) => `<option value="${p.id}">${esc(p.depth ? `${'› '.repeat(p.depth)}${p.name}` : p.name)}</option>`).join('');
  project.value = projectId;

  const tasks = S.tasks
    .filter((item) => item.status !== 'done' && item.status !== 'archived')
    .filter((item) => !projectId || item.projectId === projectId);
  const selectedTask = taskId && S.tasks.find((item) => item.id === taskId);
  if (selectedTask && !tasks.some((item) => item.id === taskId)) tasks.unshift(selectedTask);
  task.innerHTML = `<option value="">${esc(translateText('timer.noTodoOption'))}</option>` +
    tasks.map((item) => `<option value="${item.id}">${esc(item.title)}</option>`).join('');
  task.value = taskId;

  const selectedTags = current.tagIds || [];
  $('mgTimerTags').innerHTML = S.tags.length
    ? S.tags.map((tag) => `<button type="button" class="timer-tag${selectedTags.includes(tag.id) ? ' on' : ''}"
        data-mg-timer-tag="${tag.id}">${esc(tag.name)}</button>`).join('')
    : `<span class="cap">${esc(translateText('tag.noTags'))}</span>`;

  $('mgTimerCompleteRow').hidden = !timer?.taskId;
  $('mgTimerComplete').checked = Boolean(timer && timerCompleteChoice);
  if (!timer) {
    $('mgTimerClock').textContent = '00:00:00';
    stopTimerTicker();
  } else {
    startTimerTicker(timer);
  }
  if (timerNotesPreviewOpen) renderTimerNotesPreview();
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
  $('mgTimerSaved').textContent = translateText('timer.saved');
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
  $('mgTimerSaved').textContent = translateText('timer.saving');
  clearTimeout(timerNotesSaveTimer);
  timerNotesSaveTimer = setTimeout(() => flushManagementTimerNotes(), 500);
});
$('mgTimerNotesEditToggle').addEventListener('click', () => setTimerNotesPreviewOpen(false));
$('mgTimerNotesPreviewToggle').addEventListener('click', () => setTimerNotesPreviewOpen(true));
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

  const trend = createReportChartSection('trend', translateText('report.projectAll'));
  [
    wrap.querySelector('.project-trend-toolbar'),
    wrap.querySelector('#projectTrend'),
    wrap.querySelector('#projectTrendTooltip'),
    wrap.querySelector('.trend-legend'),
    wrap.querySelector('#projectTrendDetail'),
  ].filter(Boolean).forEach((node) => trend.body.append(node));

  const heatmap = createReportChartSection('heatmap', translateText('chart.heatmap'));
  wrap.querySelector('.project-heatmap-title')?.remove();
  const heatmapNode = wrap.querySelector('#projectHeatmap');
  if (heatmapNode) heatmap.body.append(heatmapNode);

  const tracker = createReportChartSection('tracker', translateText('report.todoTracker'));
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
  const from = rangeStart();
  const to = rangeEnd();
  const sec = rows.reduce((s, e) => s + durationInRange(e, from, to), 0);
  const fromKey = fmtDate(from);
  const toKey = to ? fmtDate(new Date(to.getTime() - 1)) : null;
  const dayKeys = new Set(rows.flatMap((e) => splitEntryByDay(e)
    .map((part) => fmtDate(part.startedAt))
    .filter((date) => date >= fromKey && (!toKey || date <= toKey))));

  $('kTime').textContent = fmtHM(sec);
  $('kCount').textContent = rows.length;
  $('kAvg').textContent = rows.length ? fmtHM(sec / rows.length) : '—';
  $('kDays').textContent = dayKeys.size;
  renderDueAlerts();
  renderReportInsights(rows, from, to);

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
  const trendEntries = S.entries.filter((e) => entryOverlapsRange(e, lineFrom, trendEndExclusive));
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
    ? dailySeries([], lineFrom, lineTo, () => 0).map((d) => d.date)
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
      label: e.description || (p ? p.name : translateText('todo.unclassified')),
    };
  });
  }
  $('dailyReview').innerHTML = renderDailyReview(dailyReviewData(rows, reviewDates));
  initializeMarkdownPreviews($('dailyReview'));
}

function renderDailyReview(groups) {
  hideReviewCalendarTooltip();
  reviewGroups = groups;
  const canCalendar = groups.length > 0;
  if (!canCalendar && reviewMode === 'calendar') reviewMode = 'list';
  document.querySelectorAll('#reviewMode [data-review-mode]').forEach((button) => {
    button.classList.toggle('active', button.dataset.reviewMode === reviewMode);
    if (button.dataset.reviewMode === 'calendar') button.disabled = !canCalendar;
  });
  return reviewMode === 'calendar' ? renderReviewCalendar(groups) : renderReviewList(groups);
}

function hideReviewCalendarTooltip() {
  reviewCalendarSelectedTarget = null;
  const tooltip = $('reviewCalendarHoverTooltip');
  if (!tooltip) return;
  tooltip.hidden = true;
  tooltip.classList.remove('is-visible');
}

function showReviewCalendarTooltip(target) {
  const tooltip = $('reviewCalendarHoverTooltip');
  if (!tooltip || !target) return;
  reviewCalendarSelectedTarget = target;
  const notePreview = target.dataset.reviewNotes
    ? renderMarkdownPreview(target.dataset.reviewNotes, 'review-calendar-tooltip-notes')
    : '';
  tooltip.innerHTML = `<strong>${esc(target.dataset.reviewTitle || '')}</strong>
    <span>${esc(target.dataset.reviewStart || '')}–${esc(target.dataset.reviewEnd || '')}</span>
    <span>${esc(target.dataset.reviewProject || '')}</span>
    ${notePreview}`;
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

function repositionReviewCalendarTooltip() {
  if (reviewCalendarSelectedTarget?.isConnected) showReviewCalendarTooltip(reviewCalendarSelectedTarget);
}

function renderReviewCalendar(groups) {
  const weekdays = [
    translateText('schedule.days.sun'), translateText('schedule.days.mon'), translateText('schedule.days.tue'),
    translateText('schedule.days.wed'), translateText('schedule.days.thu'), translateText('schedule.days.fri'),
    translateText('schedule.days.sat'),
  ];
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
    return `<div class="review-calendar-day-head"><strong>${esc(displayDate(day.date))}</strong><span>${esc(weekdays[date.getDay()])}</span></div>`;
  }).join('');
  const dayBodies = calendar.days.map((day) => {
    const entries = day.entries.map((item) => {
      const entry = item.entry;
      const project = S.projects.find((projectItem) => projectItem.id === entry.projectId);
      const task = S.tasks.find((taskItem) => taskItem.id === entry.taskId);
      const title = entry.description || task?.title || translateText('common.unnamedWork');
      const projectName = project?.name || translateText('common.generalWork');
      const top = ((item.start - calendar.axis.from) / span) * 100;
      const height = Math.max(4, ((item.end - item.start) / span) * 100);
      const entryLabel = `${projectName} ${title} ${fmtClock(entry.startedAt)}–${fmtClock(entry.endedAt)}`;
      return `<div class="review-calendar-entry" tabindex="0" aria-label="${esc(entryLabel)}" data-review-title="${esc(title)}" data-review-start="${esc(fmtClock(entry.startedAt))}" data-review-end="${esc(fmtClock(entry.endedAt))}" data-review-project="${esc(projectName)}" data-review-notes="${esc(entry.notes || '')}" style="--entry-top:${top};--entry-height:${height};--entry-lane:${item.lane};--entry-lanes:${item.lanes};--project-color:${safeColor(project?.color)}">
        <span class="review-calendar-title">${esc(projectName)}</span>
      </div>`;
    }).join('');
    return `<div class="review-calendar-day-body">${entries}</div>`;
  }).join('');
  return `<div class="review-calendar" style="--review-days:${calendar.days.length};--calendar-from:${calendar.axis.from};--calendar-span:${span};--calendar-hours:${span / 60};--calendar-height:${Math.max(480, span * .9)}px">
    <div class="review-calendar-corner"></div>${dayHeaders}
    <div class="review-calendar-axis">${labels.join('')}</div>${dayBodies}
  </div>`;
}

function renderReviewList(groups) {
  const weekdays = [
    translateText('schedule.days.sun'), translateText('schedule.days.mon'), translateText('schedule.days.tue'),
    translateText('schedule.days.wed'), translateText('schedule.days.thu'), translateText('schedule.days.fri'),
    translateText('schedule.days.sat'),
  ];
  const safeColor = (color) => /^#[0-9a-f]{6}$/i.test(color || '') ? color : '#9a9898';
  return groups.map((group) => {
    const day = new Date(`${group.date}T00:00:00`);
    const total = group.entries.reduce((sum, entry) => sum + db.durationSec(entry), 0);
    const entries = group.entries.length
      ? group.entries.map((entry) => {
        const project = S.projects.find((item) => item.id === entry.projectId);
        const task = S.tasks.find((item) => item.id === entry.taskId);
        const title = entry.description || task?.title || translateText('common.unnamedWork');
        const projectName = project?.name || translateText('common.generalWork');
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
      : `<div class="daily-review-empty">${translateText('report.noWorkThatDay')}</div>`;
    return `<section class="daily-review-day">
      <div class="daily-review-day-head">
        <strong>${esc(displayDate(group.date))}</strong>
        <span class="cap">${fmtHM(total)} · ${translateText('report.entryCount', { count: group.entries.length })}</span>
      </div>
      <div class="daily-review-list">${entries}</div>
    </section>`;
  }).join('');
}

function renderDueAlerts() {
  const mount = $('reportDueAlerts');
  if (!mount) return;
  const today = fmtDate(new Date().toISOString());
  const all = dueTodoAlerts(S.tasks, today, Number.MAX_SAFE_INTEGER, 3);
  const visible = all.slice(0, 3);
  const overdueCount = all.filter((task) => task.alertKind === 'overdue').length;
  const todayCount = all.filter((task) => task.alertKind === 'today').length;
  if (!visible.length) {
    mount.innerHTML = '';
    return;
  }
  const counts = [
    overdueCount ? translateText('report.dueAlertsOverdue', { count: overdueCount }) : '',
    todayCount ? translateText('report.dueAlertsToday', { count: todayCount }) : '',
  ].filter(Boolean).join(' · ');
  const rows = visible.map((task) => {
    const project = task.projectId && S.projects.find((item) => item.id === task.projectId);
    const projectLabel = project ? pathOf(S.projects, project.id).join(' / ') : '';
    const title = task.title?.trim() || translateText('report.dueAlertsNoTitle');
    const due = `${task.dueDate}${task.dueTime ? ` ${task.dueTime}` : ''}`;
    return `<button type="button" class="report-due-alert report-due-alert-${task.alertKind}" data-report-task-id="${esc(task.id)}">
      <span class="report-due-alert-main"><strong>${esc(title)}</strong>${projectLabel ? `<span class="sub">${esc(projectLabel)}</span>` : ''}</span>
      <span class="report-due-alert-meta"><span>${esc(due)}</span><span class="badge">${esc(dueLabel(task, false, currentLocale))}</span></span>
    </button>`;
  }).join('');
  const more = all.length > visible.length
    ? `<span class="cap">${translateText('report.dueAlertsMore', { count: all.length - visible.length })}</span>`
    : '';
  mount.innerHTML = `<section class="report-due-alerts">
    <div class="report-due-alerts-head"><div><strong>${translateText('report.dueAlerts')}</strong><span class="cap">${translateText('report.dueAlertsHint')}</span></div>
      <span class="cap">${counts}</span></div>
    <div class="report-due-alert-list">${rows}</div>
    ${more}
  </section>`;
}

/* ---------------- 專案趨勢（完整資料 + highlight） ---------------- */

let highlightProjectId = null;

let projectTrendState = null;
let projectTrendSource = null;
let reportChartCollapsed = new Set(['trend', 'heatmap']);
let todoTrackerState = null;
let todoTrackerSource = null;
let todoTrackerSelectedId = null;
let todoTrackerFilter = 'active';
let todoTrackerViewStart = null;
let todoTrackerRefreshTimer = null;
let todoTrackerHoveredTarget = null;
let todoTrackerCollapsedIds = new Set();
let todoTrackerKnownIds = new Set();
let todoFocusId = null;

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
    ? `<strong>${esc(translateText('report.rangeTotal', { duration: fmtHM(total) }))}</strong><br><span>${rows}</span>`
    : translateText('report.noProjectTime');
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
    : translateText('report.noProjectTime');
  const selectedText = selected
    ? `<strong>${esc(selected.name)} ${fmtHM(selected.seconds)} (${total ? Math.round((selected.seconds / total) * 100) : 0}%)</strong><br>`
    : '';
  return `${selectedText}<strong>${esc(date)}</strong> · ${esc(translateText('report.dailyTotal', { duration: fmtHM(total) }))}<br><span>${rows}</span>`;
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
      <div class="trend-detail-day-head"><strong>${esc(date)}</strong><span class="num">${fmtHM(dailyTotals.get(date) || 0)} · ${translateText('report.entryCount', { count: entries.length })}</span></div>
      ${entries.map((entry) => {
        const task = taskById.get(entry.taskId);
        const title = entry.description || task?.title || translateText('common.unnamedWork');
        const projectItem = S.projects.find((item) => item.id === entry.projectId);
        const location = projectItem ? pathOf(S.projects, projectItem.id).join(' / ') : translateText('report.locationViaTodo');
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
    <div><strong>${esc(project.name)} ${translateText('report.detail')}</strong><div class="sub">${esc(projectPath)} · ${translateText('project.includesChildren')}</div></div>
    <button type="button" class="btn-sm" data-trend-detail-close>${translateText('common.collapse')}</button>
  </div>
  <div class="trend-detail-kpis">
    <span class="badge">${fmtHM(detail.totalSeconds)} ${translateText('report.totalWork')}</span>
    <span class="badge">${detail.tasksDone}/${detail.tasksTotal} ${translateText('report.todoCompleted')}</span>
    <span class="badge">${detail.totalEntries} ${translateText('report.workEntries')}</span>
  </div>
  <div class="trend-detail-list">${dayMarkup || `<div class="empty">${translateText('report.noEntriesInRange')}</div>`}</div>
  ${truncated > 0 ? `<div class="cap trend-detail-more">${translateText('report.moreEntries', { count: truncated })}</div>` : ''}`;
}

function todoStatusLabel(status) {
  return statusLabel(status, currentLocale);
}

function renderReportInsights(rows, from = rangeStart(), to = rangeEnd()) {
  const mount = $('reportInsights');
  if (!mount) return;
  const clippedRows = rows.map((entry) => clipEntryToRange(entry, from, to)).filter(Boolean);
  const quality = buildReportQuality(clippedRows, S.tasks, fmtDate(new Date().toISOString()));
  const metrics = buildProjectTaskMetrics(S.tasks, clippedRows, fmtDate(new Date().toISOString()));
  const actionItems = buildReportActionItems(quality);
  const healthRows = buildProjectHealthRows(metrics);
  const todoProgress = buildWorkspaceTodoProgress(metrics);
  const actionLabels = {
    overdue: 'report.action.overdue',
    unlinked: 'report.action.unlinked',
    unclassified: 'report.action.unclassified',
    'missing-notes': 'report.action.missingNotes',
    clear: 'report.action.clear',
  };
  const statusLabels = {
    '進行中': 'report.projectStatus.inProgress',
    '逾期': 'report.projectStatus.overdue',
    '進度偏低': 'report.projectStatus.lowProgress',
    '週期偏長': 'report.projectStatus.longCycle',
    '已完成': 'report.projectStatus.done',
  };
  const projectLabel = (projectId) => {
    const project = projectId && S.projects.find((item) => item.id === projectId);
    return project ? pathOf(S.projects, project.id).join(' / ') : translateText('todo.unclassified');
  };
  const actionValue = (item) => {
    if (item.kind === 'overdue') return translateText('report.actionCount.todos', { count: item.value });
    if (item.kind === 'missing-notes') return translateText('report.actionCount.entries', { count: item.value });
    if (item.kind === 'clear') return '✓';
    return fmtHM(item.value);
  };
  const issueEntryIds = {
    unlinked: quality.unlinkedTaskEntryIds,
    unclassified: quality.unclassifiedEntryIds,
    'missing-notes': quality.missingNotesEntryIds,
  };
  const actionDetails = (item) => {
    const target = reportActionTarget(item.kind);
    const ids = target?.type === 'entry'
      ? issueEntryIds[item.kind]
      : target?.type === 'todo' ? quality.overdueTaskIds : null;
    if (!ids?.length) return '';
    const details = target.type === 'entry'
      ? rows.filter((entry) => ids.includes(entry.id)).slice(0, 2).map((entry) =>
        `<button type="button" class="report-action-detail" data-report-entry-id="${esc(entry.id)}">${esc(entry.description || translateText('common.unnamedWork'))} · ${esc(fmtDate(entry.startedAt))} · ${esc(fmtHM(durationInRange(entry, from, to)))}</button>`
      ).join('')
      : ids.map((id) => S.tasks.find((task) => task.id === id)).filter(Boolean).slice(0, 2).map((task) =>
        `<button type="button" class="report-action-detail" data-report-task-id="${esc(task.id)}">${esc(task.title)} · ${translateText('todo.dueDate')} ${esc(task.dueDate || translateText('common.notSet'))}</button>`
      ).join('');
  const matchingCount = target.type === 'entry'
      ? rows.filter((entry) => ids.includes(entry.id)).length
      : ids.filter((id) => S.tasks.some((task) => task.id === id)).length;
    const rest = matchingCount - Math.min(2, matchingCount);
    return details + (rest > 0 ? `<div>${translateText('report.moreCount', { count: rest })}</div>` : '');
  };
  const todoStatusCounts = S.tasks.reduce((summary, task) => {
    if (task.status === 'archived') return summary;
    if (task.status === 'done') summary.done += 1;
    else if (task.status === 'doing') summary.doing += 1;
    else summary.todo += 1;
    return summary;
  }, { done: 0, doing: 0, todo: 0 });
  const statusItem = actionItems[0];
  const allTodosDone = statusItem.kind === 'clear'
    && todoProgress.total > 0
    && todoProgress.done === todoProgress.total;
  const statusLabel = allTodosDone
    ? translateText('report.projectStatus.done')
    : statusItem.kind === 'clear'
      ? translateText('report.statusGood')
    : statusItem.tone === 'danger' ? translateText('report.needsWork') : translateText('report.needsOrganizing');
  const statusDetail = statusItem.kind === 'clear'
    ? translateText('report.noIssues')
    : translateText('report.topPriority', { label: translateText(actionLabels[statusItem.kind]) });
  const todoSegments = [
    { label: translate(currentLocale, 'report.completed'), value: todoProgress.done, color: '#22c55e' },
    { label: translateText('report.inProgress'), value: todoStatusCounts.doing, color: '#60a5fa' },
    { label: translateText('todo.status.todo'), value: todoStatusCounts.todo, color: '#d6d3d1' },
  ];
  const completionRate = todoProgress.total
    ? `${Math.round((todoProgress.done / todoProgress.total) * 100)}%`
    : '—';
  const todoDonut = donutSVG(todoSegments, currentLocale, {
    centerValue: completionRate,
    centerLabel: translateText('report.completionRate'),
  });
  const statusMetrics = [
    { label: translate(currentLocale, 'report.completed'), value: `${todoProgress.done} / ${todoProgress.total}`, tone: 'success' },
    { label: translateText('report.inProgress'), value: todoStatusCounts.doing, tone: 'info' },
    { label: translateText('todo.status.todo'), value: todoStatusCounts.todo, tone: 'muted' },
    { label: translateText('report.overdue'), value: quality.overdueTodoCount, tone: quality.overdueTodoCount ? 'danger' : 'muted' },
  ].map((item) => `<div class="report-status-metric report-status-metric-${item.tone}"><span>${esc(item.label)}</span><strong class="num">${esc(item.value)}</strong></div>`).join('');
  const actionMarkup = actionItems.map((item) => `
    <div class="report-action report-action-${item.tone}">
      <span class="report-action-label">${esc(translateText(actionLabels[item.kind]))}</span>
      <strong>${esc(actionValue(item))}</strong>
      <span class="report-action-hint">${item.kind === 'clear' ? translateText('report.canContinue') : translateText('report.organize')}</span>
      ${actionDetails(item) ? `<div class="report-action-details">${actionDetails(item)}</div>` : ''}
    </div>`).join('');
  const attentionMarkup = statusItem.kind === 'clear' ? '' : `
  <section class="report-attention" aria-label="${esc(translateText('report.attention'))}">
    <div class="report-section-heading"><strong>${translateText('report.attention')}</strong><span class="cap">${translateText('report.attentionHint')}</span></div>
    <div class="report-action-grid">${actionMarkup}</div>
  </section>`;
  const projectMarkup = healthRows.length
    ? healthRows.map((row) => {
      const label = projectLabel(row.projectId);
      const project = row.projectId && S.projects.find((item) => item.id === row.projectId);
      const projectColor = /^#[0-9a-f]{6}$/i.test(project?.color || '') ? project.color : '#9a9898';
      const percentage = Math.round(Math.max(0, Math.min(1, row.completionRate)) * 100);
      const progressTooltip = `Todo ${row.done} / ${row.total} · ${translateText('report.completionRate')} ${percentage}% · ${translateText('report.overdue')} ${row.overdue}`;
      return `<div class="report-project-row">
        <div class="report-project-name">
          <span class="report-project-color" style="--project-color:${projectColor}" aria-hidden="true"></span>
          <span class="report-project-name-text" title="${esc(label)}">${esc(label)}</span>
        </div>
        <span class="report-project-status report-project-status-${row.tone}">${esc(translateText(statusLabels[row.status] || 'report.projectStatus.inProgress'))}</span>
        <div class="report-project-progress" tabindex="0" role="img" aria-label="${esc(progressTooltip)}" data-report-project-tooltip="${esc(progressTooltip)}">
          <span class="report-project-track"><span style="--bar-width:${percentage}%"></span></span>
          <span class="report-project-count num">${row.done} / ${row.total}</span>
        </div>
        <span class="report-project-work num">${fmtHM(row.workedSeconds)}</span>
      </div>`;
    }).join('')
    : `<div class="report-empty">${translateText('report.noTodoPerformance')}</div>`;
  mount.innerHTML = `<div class="report-status">
    <div class="report-status-overview">
      <div class="report-status-donut">${todoDonut}</div>
      <div class="report-status-copy">
        <span class="cap">${translateText('report.workspaceStatus')}</span>
        <strong class="report-status-label report-status-${statusItem.tone}">${statusLabel}</strong>
      </div>
    </div>
    <div class="report-status-side">
      <span class="report-status-detail">${statusDetail}</span>
      <div class="report-status-metrics" aria-label="${esc(translateText('report.todoHealth'))}">${statusMetrics}</div>
    </div>
  </div>
  ${attentionMarkup}
  <section class="report-projects" aria-label="${esc(translateText('report.projectStatus'))}">
    <div class="report-section-heading"><strong>${translateText('report.projectStatus')}</strong><span class="cap">${translateText('report.projectStatusHint')}</span></div>
    <div class="report-project-list">${projectMarkup}</div>
  </section>
  `;
}

function todoTrackerColor(project) {
  return /^#[0-9a-f]{6}$/i.test(project?.color || '') ? project.color : '#6faed0';
}

function todoTrackerDateTime(value) {
  return value ? `${fmtDate(value)} ${fmtClock(value)}` : translateText('todo.inProgressUpdating');
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
  const projectPath = project ? pathOf(S.projects, project.id).join(' / ') : translateText('project.uncategorized');
  const entries = item.entries.length
    ? item.entries.map((entry) => `<div class="todo-tracker-entry">
        <span class="num mute">${fmtDate(entry.startedAt)}<br>${fmtClock(entry.startedAt)}–${fmtClock(entry.endedAt)}</span>
        <div class="grow"><strong>${esc(entry.description || translateText('entry.entry'))}</strong><div class="sub">${fmtDate(entry.startedAt)} → ${fmtDate(entry.endedAt)}</div>${entry.notes ? renderMarkdownPreview(entry.notes) : ''}</div>
        <span class="num">${fmtHM(entry.seconds)}</span>
      </div>`).join('')
    : `<div class="empty">${translateText('report.noActualEntries')}</div>`;

  box.hidden = false;
  box.innerHTML = `<div class="todo-tracker-detail-head">
    <div><strong>${esc(item.title)}</strong><div class="sub">${esc(projectPath)}</div></div>
    <button type="button" class="btn-sm" data-todo-tracker-close>${translateText('common.close')}</button>
  </div>
  <div class="todo-tracker-detail-kpis">
    <span class="badge">${esc(todoStatusLabel(item.status))}</span>
    <span class="badge">${translateText('report.opened')} ${esc(todoTrackerDateTime(item.openedAt))}</span>
    <span class="badge">${translateText('report.closed')} ${esc(todoTrackerDateTime(item.endedAt))}</span>
    <span class="badge">${translateText('report.crossDays', { count: item.lifecycleDays })}</span>
    <span class="badge">${translateText('report.workedDays', { count: item.workedDays })}</span>
    <span class="badge">${fmtHM(item.trackedSeconds)} ${translateText('report.totalWork')}</span>
  </div>
  ${task?.notes ? `<div class="todo-tracker-detail-notes">${renderMarkdownPreview(task.notes)}</div>` : ''}
  <div class="todo-tracker-detail-section"><strong>${translateText('report.actualWork')} (${translateText('report.entryCount', { count: item.entries.length })})</strong></div>
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
  tooltip.innerHTML = `<strong>${esc(target.dataset.todoTrackerTitle || '')}</strong><br>${esc(target.dataset.todoTrackerDate || '')} · ${translateText('report.hasWorkEntries')}`;
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
  }, currentLocale);
  todoTrackerState = data;
  todoTrackerSource = { entries };
  const collapseState = syncTodoTrackerCollapseState(todoTrackerCollapsedIds, todoTrackerKnownIds, data.items);
  todoTrackerCollapsedIds = collapseState.collapsedIds;
  todoTrackerKnownIds = collapseState.knownIds;
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
    mount.innerHTML = `<div class="todo-tracker-empty"><strong>${translateText('report.todoTracker')}</strong><span class="todo-tracker-summary">${translateText('report.todayCompleted', { count: data.completedTodayCount })}</span><div>${translateText('report.noActualTodoTime')}</div></div>`;
    renderTodoTrackerDetail();
    if (restartTimer) startTodoTrackerRefresh();
    return;
  }

  const dateHeaders = visibleDates.map((date) => `<span>${esc(date.slice(5))}</span>`).join('');
  const filterControl = `<label class="todo-tracker-filter"><span>${translateText('report.show')}</span><select data-todo-tracker-filter aria-label="${esc(translateText('report.filter'))}"><option value="active"${todoTrackerFilter === 'active' ? ' selected' : ''}>${translateText('todo.status.active')}</option><option value="all"${todoTrackerFilter === 'all' ? ' selected' : ''}>${translateText('common.all')}</option><option value="done"${todoTrackerFilter === 'done' ? ' selected' : ''}>${translateText('todo.status.done')}</option></select></label>`;
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
    const lifecycleCells = lifecycleDates.map(({ date, day }) => `<span class="todo-tracker-lifecycle" style="--todo-day:${day};--todo-color:${color}" title="${translateText('report.opened')} ${todoTrackerDateTime(item.openedAt)} · ${translateText('report.closed')} ${todoTrackerDateTime(item.endedAt)}"></span>`).join('');
    const dateRange = todoTrackerDateRange(item);
    const title = `${item.title} · ${todoStatusLabel(item.status)} · ${dateRange} · ${translateText('report.workedDays', { count: item.workedDays })} / ${translateText('report.totalDays', { count: item.lifecycleDays })}`;
    const collapsed = todoTrackerCollapsedIds.has(item.id);
    const workDates = item.workedDates
      .map((date) => ({ date, day: visibleDateIndex.get(date) }))
      .filter(({ day }) => day >= 0);
    const workSegments = workDates.map(({ date, day }) => {
      const dateTitle = `${item.title} · ${date} · ${translateText('report.hasWorkEntries')}`;
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
          <span class="todo-tracker-label-days">${translateText('report.workedDays', { count: item.workedDays })} / ${translateText('report.totalDays', { count: item.lifecycleDays })}</span>
        </details>
      </div>
      <div class="todo-tracker-track" style="--todo-tracker-lanes:${item.laneCount}">
        ${lifecycleCells}
        ${workSegments}
      </div>
    </div>`;
  }).join('');
  const rowMarkup = rows || `<div class="todo-tracker-filter-empty">${translateText('report.noMatchingTodo')}</div>`;

  mount.innerHTML = `<div class="todo-tracker" style="--todo-tracker-days:${visibleDates.length}">
    <div class="todo-tracker-toolbar"><strong>${translateText('report.todoTracker')}</strong><span class="todo-tracker-summary">${translateText('report.todayCompleted', { count: data.completedTodayCount })}</span><span class="todo-tracker-range" data-todo-tracker-range>${esc(todoTrackerRangeLabel(visibleDates[0], visibleDates[visibleDates.length - 1]))}</span>${filterControl}<span class="todo-tracker-nav"><button type="button" class="btn-sm" data-todo-tracker-shift="-1" title="${translateText('report.previousDay')}" aria-label="${translateText('report.previousDay')}">←1d</button><button type="button" class="btn-sm" data-todo-tracker-shift="-7" title="${translateText('report.previousWeek')}" aria-label="${translateText('report.previousWeek')}">←1w</button><button type="button" class="btn-sm" data-todo-tracker-today>${translateText('report.today')}</button><button type="button" class="btn-sm" data-todo-tracker-shift="7" title="${translateText('report.nextWeek')}" aria-label="${translateText('report.nextWeek')}">1w→</button><button type="button" class="btn-sm" data-todo-tracker-shift="1" title="${translateText('report.nextDay')}" aria-label="${translateText('report.nextDay')}">1d→</button></span></div>
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
  const report = $('byProject');
  const todoTrackerMount = report.querySelector('#todoTracker');
  const todoTrackerDetail = report.querySelector('#todoTrackerDetail');
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
    <div class="project-trend-toolbar"><span class="mute">${translateText('report.projectAll')}</span><span class="cap">${dates.length ? `${esc(dates[0])} ～ ${esc(dates[dates.length - 1])}` : ''}</span></div>
    <div id="projectTrend">${stackedAreaSVG(data, currentLocale)}</div>
    <div id="projectTrendTooltip" class="project-trend-tooltip"></div>
    <div class="trend-legend">${projectLinks || `<span class="mute">${translateText('report.noFocusableProject')}</span>`}</div>
    <div class="project-heatmap-title">${translateText('chart.heatmap')}</div>
    <div id="projectHeatmap" class="project-heatmap-scroll">${heatmapSVG(data)}</div>
    <div id="projectTrendDetail" class="project-trend-detail" hidden></div>
  </div>`;
  const trendDetail = report.querySelector('#projectTrendDetail');
  if (todoTrackerMount && todoTrackerDetail && trendDetail) {
    trendDetail.before(todoTrackerMount, todoTrackerDetail);
  }
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

$('dailyReview').addEventListener('click', (e) => {
  const target = e.target.closest('[data-review-title]');
  if (!target) {
    hideReviewCalendarTooltip();
    return;
  }
  if (target === reviewCalendarSelectedTarget) hideReviewCalendarTooltip();
  else showReviewCalendarTooltip(target);
});

$('dailyReview').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const target = e.target.closest('[data-review-title]');
  if (!target) return;
  e.preventDefault();
  if (target === reviewCalendarSelectedTarget) hideReviewCalendarTooltip();
  else showReviewCalendarTooltip(target);
});

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-review-title]') || e.target.closest('#reviewCalendarHoverTooltip')) return;
  hideReviewCalendarTooltip();
});

window.addEventListener('resize', repositionReviewCalendarTooltip);
window.addEventListener('scroll', repositionReviewCalendarTooltip, true);

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
  $('pjParent').innerHTML = `<option value="">${esc(translateText('project.topLevel'))}</option>` +
    tree.filter((p) => !excluded.has(p.id))
      .map((p) => `<option value="${p.id}">${esc(indentLabel(p.name, p.depth))}</option>`).join('');
  $('pjParent').value = keepParent;

  $('projList').innerHTML = tree.length
    ? `<div class="project-list-head" aria-hidden="true">
        <span>${translateText('project.project')}</span><span>${translateText('report.totalWork')}</span><span>${translateText('project.directWork')}</span><span>${translateText('common.actions')}</span>
      </div>
      ${tree.map((p) => {
        const open = S.tasks.filter((x) => x.projectId === p.id && x.status !== 'done' && x.status !== 'archived').length;
        const r = roll.get(p.id) || { own: 0, total: 0 };
        const kids = childrenOf(S.projects, p.id).length;
        const color = esc(p.color || '#9a9898');
        return `<div class="row-item project-row" data-workspace-p="${p.id}"
          style="--project-color:${color};--project-depth:${p.depth}">
          <div class="project-info">
            <span class="tree-branch">${p.depth ? '└' : ''}</span>
            <span class="project-color" aria-hidden="true"></span>
            <div class="main">
              <div>${esc(p.name)} ${p.archivedAt ? `<span class="badge">${translateText('common.archived')}</span>` : ''}</div>
              <div class="sub">
                ${kids ? translateText('project.childCount', { count: kids }) + ' · ' : ''}${open > 0 ? translateText('project.openTodoCount', { count: open }) : translateText('project.noOpenTodos')}
              </div>
            </div>
          </div>
          <div class="project-hours">
            <span class="project-hours-label">${translateText('report.totalWork')}</span>
            <span class="num">${fmtHM(r.total)}</span>
          </div>
          <div class="project-hours project-hours-direct">
            <span class="project-hours-label">${translateText('project.directWork')}</span>
            <span class="num">${fmtHM(r.own)}</span>
          </div>
          <div class="act project-actions">
            <button class="btn-sm workspace-open" data-open-workspace="${p.id}">${translateText('project.openWorkspace')}</button>
            <div class="project-secondary-actions">
              <button class="btn-sm" data-edit-p="${p.id}">${translateText('project.edit')}</button>
              <button class="btn-sm" data-arch-p="${p.id}">${p.archivedAt ? `[${translateText('common.restored')}]` : `[${translateText('common.archive')}]`}</button>
              <button class="btn-sm btn-danger" data-del-p="${p.id}">[x]</button>
            </div>
          </div>
        </div>`;
      }).join('')}`
    : `<div class="empty">${translateText('project.noProjectsHint')}</div>`;
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
  $('pjNotesTitle').textContent = `${p.name} · ${translateText('project.goalsNotes')}${notes.length ? ` (${notes.length})` : ''}`;

  $('pjNoteList').innerHTML = notes.length
    ? notes.map((n) => {
        const editing = noteEditingId === n.id;
        return `<div class="note-entry">
          <div class="row cap" style="margin-bottom:4px">
            <span class="num">${fmtDate(n.createdAt)} ${fmtClock(n.createdAt)}</span>
            ${n.updatedAt ? `<span class="ash" title="${translateText('project.lastEdited', { date: `${fmtDate(n.updatedAt)} ${fmtClock(n.updatedAt)}` })}">${translateText('project.edited')}</span>` : ''}
            <span class="grow"></span>
            ${editing
              ? `<button class="btn-sm" data-note-cancel="1">${translateText('common.cancel')}</button>
                 <button class="btn-sm btn-primary" style="height:26px" data-note-save="${n.id}">${translateText('common.save')}</button>`
              : `<span class="act">
                   <button class="btn-sm" data-note-edit="${n.id}">${translateText('project.edit')}</button>
                   <button class="btn-sm btn-danger" data-note-del="${n.id}">[x]</button>
                 </span>`}
          </div>
          ${editing
            ? `<textarea data-note-input="${n.id}" data-markdown-editor-input>${esc(n.text)}</textarea>`
            : `<div class="note-body">${renderMarkdownPreview(n.text)}</div>`}
        </div>`;
      }).join('')
    : `<div class="empty">${translateText('project.noNotes')}</div>`;

  if (noteEditingId) {
    const ta = $('pjNoteList').querySelector(`[data-note-input="${noteEditingId}"]`);
    if (ta) {
      autoGrow(ta, { min: 72, max: 400 });
      markdownEditors.set(ta, mountMarkdownEditor(ta, { mode: markdownEditorMode(S.settings.notesEditor) }));
      markdownEditors.get(ta).focus();
    }
  }
}

$('pjNoteAdd').addEventListener('click', async () => {
  const pid = workspaceProjectId || $('pjId').value;
  const text = $('pjNoteDraft').value;
  if (!pid || !text.trim()) return;
  await db.addProjectNote(pid, text);
  $('pjNoteDraft').value = '';
  $('pjNoteDraft').dispatchEvent(new Event('input'));
  syncMarkdownEditor($('pjNoteDraft'));
  await load();
  renderProjectNotes();
});

$('pjNoteDraft').addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') $('pjNoteAdd').click();
});

document.addEventListener('keydown', (e) => {
  if (!(e.metaKey || e.ctrlKey) || e.key !== 'Enter' || e.target === $('pjNoteDraft')) return;
  const textarea = e.target.closest?.('.markdown-editor')?.querySelector('#pjNoteDraft');
  if (textarea) $('pjNoteAdd').click();
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
    if (!confirm(translateText('project.deleteNoteConfirm'))) return;
    await db.deleteProjectNote(pid, del);
  } else return;

  await load();
  renderProjectNotes();
});

$('pjNoteList').addEventListener('keydown', (e) => {
  const textarea = e.target.closest?.('.markdown-editor')?.querySelector('[data-note-input]') || e.target.closest?.('[data-note-input]');
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && textarea?.dataset.noteInput) {
    $('pjNoteList').querySelector(`[data-note-save="${textarea.dataset.noteInput}"]`)?.click();
  }
});

function workspaceTodoDepth(task, tasks) {
  let depth = 0;
  let parent = task.parentId ? tasks.find((item) => item.id === task.parentId) : null;
  const seen = new Set();
  while (parent && !seen.has(parent.id)) {
    seen.add(parent.id);
    depth += 1;
    parent = parent.parentId ? tasks.find((item) => item.id === parent.parentId) : null;
  }
  return depth;
}

function renderWorkspaceTodoLog(task) {
  const workEntries = entriesForTask(task, S.entries);
  const total = workEntries.reduce((sum, entry) => sum + db.durationSec(entry), 0);
  return `<details class="workspace-todo-log">
    <summary><span>${translateText('project.workLog')}</span><span class="workspace-todo-log-stats">${fmtHM(total)} · ${translateText('report.entryCount', { count: workEntries.length })}</span></summary>
    ${workEntries.length ? `<div class="workspace-log-list workspace-todo-log-list">${workEntries.map((entry) => renderWorkspaceLogEntry(entry, task)).join('')}</div>` : `<div class="workspace-todo-log-empty">${translateText('report.entryCount', { count: 0 })}</div>`}
  </details>`;
}

function renderWorkspaceTodo(task, project, allTasks) {
  const done = task.status === 'done';
  const metrics = taskMetrics(task, S.entries);
  const due = task.dueDate
    ? `${task.dueDate}${task.dueTime ? ` ${task.dueTime}` : ''}`
    : translateText('todo.noDueDate');
  const noteLabel = translateText('todo.notes');
  return `<article class="workspace-todo-card${done ? ' is-done' : ''}" style="--workspace-task-depth:${workspaceTodoDepth(task, allTasks)}">
    <button type="button" class="workspace-todo-check" data-workspace-todo-check="${esc(task.id)}" aria-label="${esc(done ? translateText('todo.reopen') : translateText('todo.markDone'))}" aria-pressed="${done}">${done ? '✓' : '○'}</button>
    <div class="workspace-todo-body">
      <div class="workspace-todo-title-row"><strong class="workspace-todo-title">${esc(task.title)}</strong>${task.status === 'doing' ? `<span class="badge workspace-todo-status">${translateText('todo.status.doing')}</span>` : ''}</div>
      <div class="workspace-todo-meta"><span>${esc(due)}</span>${metrics.worked ? `<span>${fmtHM(metrics.worked)}</span>` : ''}${project ? `<span>${esc(project.name)}</span>` : ''}</div>
      <details class="workspace-todo-note">
        <summary>${esc(noteLabel)}</summary>
        <div class="workspace-todo-note-editor">
          <textarea data-workspace-todo-note-input="${esc(task.id)}" aria-label="${esc(noteLabel)}" placeholder="${esc(translateText('todo.notesPlaceholder'))}">${esc(task.notes || '')}</textarea>
          <button type="button" class="btn-sm btn-primary" data-workspace-todo-save="${esc(task.id)}">${translateText('common.save')}</button>
        </div>
      </details>
      ${renderWorkspaceTodoLog(task)}
    </div>
  </article>`;
}

function renderWorkspaceTodoGroup(label, items, status, allTasks) {
  const doneClass = status === 'done' ? ' workspace-todo-group-done' : '';
  const body = items.length ? items.map((task) => {
      const project = S.projects.find((item) => item.id === task.projectId);
      return renderWorkspaceTodo(task, project, allTasks);
    }).join('') : `<div class="empty">${translateText('project.noItems')}</div>`;
  if (status === 'done') {
    const total = items.reduce((sum, task) => sum + taskMetrics(task, S.entries).worked, 0);
    return `<details class="workspace-todo-group${doneClass}" data-workspace-todo-group="done">
      <summary class="workspace-todo-group-head"><span>${label}</span><span class="badge">${items.length}</span><span class="workspace-todo-group-stats">${fmtHM(total)}</span></summary>
      <div class="workspace-todo-group-content">${body}</div>
    </details>`;
  }
  return `<div class="workspace-todo-group${doneClass}" data-workspace-todo-group="${status}">
    <div class="workspace-todo-group-head"><span>${label}</span><span class="badge">${items.length}</span></div>
    ${body}
  </div>`;
}

function renderWorkspaceLogEntry(entry, task) {
  return `<div class="workspace-log"><div class="workspace-log-time"><strong>${fmtDate(entry.startedAt)}</strong><span>${fmtClock(entry.startedAt)}–${fmtClock(entry.endedAt)}</span></div><div class="workspace-log-dot" aria-hidden="true"></div><div class="grow"><strong>${esc(entry.description || task?.title || translateText('common.unnamedWork'))}</strong>${entry.notes ? renderMarkdownPreview(entry.notes) : ''}</div><span class="num workspace-log-duration">${fmtHM(db.durationSec(entry))}</span></div>`;
}

function renderWorkspaceLog(entries, tasks) {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const groups = new Map();
  entries.forEach((entry) => {
    const task = entry.taskId ? taskById.get(entry.taskId) : null;
    const key = task?.id || 'unlinked';
    if (!groups.has(key)) groups.set(key, { task, entries: [] });
    groups.get(key).entries.push(entry);
  });

  return [...groups.values()]
    .sort((a, b) => {
      if (!a.task && b.task) return 1;
      if (a.task && !b.task) return -1;
      return String(b.entries[0]?.startedAt || '').localeCompare(String(a.entries[0]?.startedAt || ''));
    })
    .map(({ task, entries: groupEntries }) => {
      const total = groupEntries.reduce((sum, entry) => sum + db.durationSec(entry), 0);
      const title = task?.title || translateText('entry.uncategorized');
      const status = task?.status === 'done' ? translateText('todo.status.done') : task?.status === 'doing' ? translateText('todo.status.doing') : '';
      return `<details class="workspace-log-group" data-workspace-log-task="${esc(task?.id || 'unlinked')}">
        <summary><span class="workspace-log-group-title"><strong>${esc(title)}</strong>${status ? `<span class="badge">${status}</span>` : ''}</span><span class="workspace-log-group-stats">${fmtHM(total)} · ${translateText('report.entryCount', { count: groupEntries.length })}</span></summary>
        <div class="workspace-log-list">${groupEntries.map((entry) => renderWorkspaceLogEntry(entry, task)).join('')}</div>
      </details>`;
    }).join('');
}

function renderProjectWorkspace(id, { openSections = [] } = {}) {
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
  const unlinkedEntries = entries.filter((entry) => !entry.taskId || !taskIds.has(entry.taskId));
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
  const dailyChartRows = [...dailyRows].reverse();
  $('projectWorkspace').hidden = false;
  $('projectWorkspace').innerHTML = `<div class="row"><h2 class="grow">${esc(project.name)} ${translateText('project.workspace')}</h2><button class="btn-sm" data-close-workspace>${translateText('common.close')}</button></div>
    <div class="workspace-section" data-workspace-section="summary"><div class="workspace-section-head"><h3>${translateText('project.summary')}</h3><span class="cap">${translateText('project.summaryHint')}</span></div><div class="workspace-kpis"><span class="badge">${fmtHM(seconds)} ${translateText('report.totalWork')}</span><span class="badge">${done}/${tasks.length} ${translateText('report.todoCompleted')}</span><span class="badge">${entries.length} ${translateText('report.workEntries')}</span></div></div>
    <div class="workspace-section" data-workspace-section="todo"><div class="workspace-section-head"><h3>Todo</h3><span class="cap">${translateText('project.todoItems', { count: tasks.length })}</span></div><div class="workspace-todo-board">${renderWorkspaceTodoGroup(translateText('todo.status.doing'), taskGroups.doing, 'doing', tasks)}${renderWorkspaceTodoGroup(translateText('todo.status.todo'), taskGroups.todo, 'todo', tasks)}${renderWorkspaceTodoGroup(translateText('todo.status.done'), taskGroups.done, 'done', tasks)}${unlinkedEntries.length ? `<div class="workspace-todo-unlinked"><div class="workspace-todo-unlinked-head"><strong>${translateText('entry.uncategorized')}</strong><span class="cap">${translateText('report.entryCount', { count: unlinkedEntries.length })}</span></div><div class="workspace-log-groups">${renderWorkspaceLog(unlinkedEntries, [])}</div></div>` : ''}</div></div>
    <div class="workspace-section" data-workspace-section="process"><div class="workspace-section-head"><h3>${translateText('project.process')}</h3><span class="cap">${translateText('project.byDate')}</span></div><div class="workspace-process">${dailyChartRows.length ? lineSVG({ dates: dailyChartRows.map(([date]) => date), values: dailyChartRows.map(([, value]) => value) }, currentLocale) : `<div class="empty">${translateText('project.noWorkData')}</div>`}</div></div>`;
  if (notesBox) {
    $('projectWorkspace').appendChild(notesBox);
    notesBox.hidden = false;
    notesBox.removeAttribute('hidden');
    renderProjectNotes();
  }
  initializeMarkdownPreviews($('projectWorkspace'));
  const workspaceSections = $('projectWorkspace').querySelectorAll('.workspace-section');
  workspaceSections[0]?.classList.add('workspace-section-first');
  workspaceSections.forEach((section, index) => {
    if (index > 0 && !openSections.includes(section.dataset.workspaceSection)) section.classList.add('is-collapsed');
    const head = section.querySelector('.workspace-section-head');
    if (!head) return;
    if (section.dataset.workspaceSection === 'summary') return;
    head.insertAdjacentHTML('beforeend', `<button type="button" class="btn-sm workspace-toggle" data-workspace-toggle>${section.classList.contains('is-collapsed') ? '[+]' : '[−]'}</button>`);
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
document.getElementById('projectWorkspace').addEventListener('click', async (event) => {
  const toggle = event.target.closest('[data-workspace-toggle]');
  if (toggle) {
    const section = toggle.closest('.workspace-section, #pjNotesBox');
    section.classList.toggle('is-collapsed');
    toggle.textContent = section.classList.contains('is-collapsed') ? '[+]' : '[−]';
    return;
  }
  const checkId = event.target.closest('[data-workspace-todo-check]')?.dataset.workspaceTodoCheck;
  const saveNoteId = event.target.closest('[data-workspace-todo-save]')?.dataset.workspaceTodoSave;
  if (checkId || saveNoteId) {
    event.preventDefault();
    const taskId = checkId || saveNoteId;
    const task = S.tasks.find((item) => item.id === taskId);
    if (!task) return;
    const projectId = workspaceProjectId;
    const section = event.target.closest('[data-workspace-section="todo"]');
    const keepOpen = section && !section.classList.contains('is-collapsed');
    if (checkId) {
      await db.upsertTask({ ...task, status: task.status === 'done' ? 'todo' : 'done' });
      showToast(translateText(task.status === 'done' ? 'toast.todoReopened' : 'toast.todoCompleted', { title: task.title }));
    } else {
      const textarea = section?.querySelector(`[data-workspace-todo-note-input="${saveNoteId}"]`);
      if (!textarea) return;
      await db.upsertTask({ ...task, notes: textarea.value });
      showToast(translateText('toast.todoUpdated', { title: task.title }));
    }
    await load();
    if (workspaceProjectId === projectId) renderProjectWorkspace(projectId, { openSections: keepOpen ? ['todo'] : [] });
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
    const project = S.projects.find((item) => item.id === dl);
    if (!confirm(translate(currentLocale, 'common.confirmDelete', { name: project?.name || 'project' }))) return;
    await db.deleteProject(dl);
    await load();
  }
});

/* ---------------- Todo ---------------- */

function renderTodos() {
  const noTodosLabel = translate(currentLocale, 'todo.noTodos');
  const tree = flattenTree(S.projects);
  const opts = (blank) => `<option value="">${blank}</option>` +
    tree.map((p) => `<option value="${p.id}">${esc(indentLabel(p.name, p.depth))}</option>`).join('');
  const priorityOpts = (blank = null) => (blank === null ? '' : `<option value="">${blank}</option>`) +
    TODO_PRIORITIES.map((p) => `<option value="${p.value}">${priorityLabel(p.value, currentLocale)}</option>`).join('');
  const statusOpts = TODO_STATUSES
    .map((item) => `<option value="${item.value}">${statusLabel(item.value, currentLocale)}</option>`).join('');

  const keepP = $('tdProject').value;
  $('tdProject').innerHTML = opts(translateText('common.uncategorizedOption'));
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
  $('tdParent').innerHTML = `<option value="">${esc(translateText('common.topLevelTask'))}</option>` + S.tasks
    .filter((task) => task.status !== 'archived' && task.id !== editingId && !descendants.has(task.id))
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((task) => `<option value="${task.id}">${esc(task.title)}</option>`).join('');
  $('tdParent').value = keepParent;

  const keepF = $('tdFilter').value;
  $('tdFilter').innerHTML = opts(translateText('common.projectOption'));
  $('tdFilter').value = keepF;

  const keepPriority = normalizePriority($('tdPriority').value);
  $('tdPriority').innerHTML = priorityOpts();
  $('tdPriority').value = keepPriority;

  const keepPriorityFilter = $('tdPriorityFilter').value;
  $('tdPriorityFilter').innerHTML = priorityOpts(translateText('todo.allPriorities'));
  $('tdPriorityFilter').value = keepPriorityFilter;
  const statusFilter = normalizeStatus($('tdStatusFilter').value);
  $('tdStatusFilter').innerHTML = statusOpts;
  $('tdStatusFilter').value = statusFilter;

  // 選了父專案時，子專案的 todo 也一起列出來
  const scope = keepF ? new Set([keepF, ...descendantSet(keepF)]) : null;

  const list = filterTasks(S.tasks, {
    projectScope: scope,
    priority: keepPriorityFilter,
    status: statusFilter,
  })
    .filter((task) => !todoFocusId || task.id === todoFocusId)
    .sort(compareTodoTasks);

  const visibleTaskIds = new Set(list.map((task) => task.id));
  const orderedTasks = tree.flatMap((project) =>
    flattenTodoTree(S.tasks.filter((task) => task.projectId === project.id))
      .filter((task) => visibleTaskIds.has(task.id))
  ).concat(flattenTodoTree(S.tasks.filter((task) => !task.projectId))
    .filter((task) => visibleTaskIds.has(task.id)));

  $('tdCount').textContent = taskCountLabel(list, statusFilter === 'all', statusFilter, currentLocale);

  $('todoList').innerHTML = list.length
    ? orderedTasks.map((t, index) => {
        const p = S.projects.find((x) => x.id === t.projectId);
        const previous = orderedTasks[index - 1];
        const showProject = (t.projectId || null) !== (previous?.projectId || null);
        const done = t.status === 'done';
        const m = taskMetrics(t, S.entries);
        const workEntries = entriesForTask(t, S.entries);
        const dl = dueLabel(m, done, currentLocale);
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
          `${translateText('todo.openedAt')} ${stampLabel(t.openedAt, currentLocale)}`,
          `${translateText('todo.dueDate')} ${t.dueDate ? t.dueDate + (t.dueTime ? ` ${t.dueTime}` : '') : '—'}`,
          `${translateText('todo.completedAt')} ${stampLabel(t.completedAt, currentLocale)}`,
        ].join(' · ');

        return `${showProject ? `<div class="task-project-heading"><span class="swatch" style="background:${p ? p.color : '#9a9898'}"></span>${p ? esc(pathOf(S.projects, p.id).join(' / ')) : translateText('todo.unclassified')}</div>` : ''}
        <div class="row-item todo-card task-item activity-row priority-${t.priority || 'normal'}${done ? ' done' : ''}" data-todo-id="${esc(t.id)}" style="--task-depth:${t.depth}">
          ${t.depth ? '<span class="task-branch" aria-hidden="true">↳</span>' : ''}
          <button class="btn-sm btn-ghost activity-status" data-check="${t.id}"
            title="${done ? translateText('todo.reopen') : translateText('todo.markDone')}" style="width:34px">${done ? '[x]' : '[ ]'}</button>
          <span class="swatch activity-swatch" style="background:${p ? p.color : '#9a9898'}"></span>
          <div class="main">
            <div class="ellipsis">${esc(t.title)}
              <span class="badge priority-${normalizePriority(t.priority)}">${priorityLabel(t.priority, currentLocale)}</span>
              ${t.scheduleId ? `<span class="badge" title="${translateText('todo.generatedBySchedule')}">${translateText('todo.schedule')}</span>` : ''}
              ${t.status === 'doing' ? `<span class="badge">${translateText('todo.status.doing')}</span>` : ''}
              ${dl ? `<span class="badge${m.isLate ? ' overdue' : ''}">${dl}</span>` : ''}
              ${m.leadMs !== null ? `<span class="badge">${translateText('summary.lead', { duration: leadLabel(m.leadMs, currentLocale) })}</span>` : ''}
              ${t.reopenCount ? `<span class="badge">${translateText('todo.reopened', { count: t.reopenCount })}</span>` : ''}
            </div>
            <div class="sub">${p ? esc(pathOf(S.projects, p.id).join(' / ')) : translateText('todo.unclassified')}</div>
            <div class="sub num">${dates}</div>
            ${t.notes ? renderMarkdownPreview(t.notes, 'notes') : ''}
            ${workEntries.length ? `<details class="todo-worklog"><summary>${translateText('todo.workLog', { count: workEntries.length, duration: fmtHM(m.worked) })}</summary>
              <div class="todo-worklog-list">${workEntries.map((entry) => `<div class="todo-worklog-row">
                <span class="num mute">${fmtDate(entry.startedAt)}<br />${fmtClock(entry.startedAt)}–${fmtClock(entry.endedAt)}</span>
                <span class="grow">${esc(entry.description || translateText('common.noDescription'))}${entry.notes ? renderMarkdownPreview(entry.notes) : ''}</span>
                <span class="num">${fmtHM(db.durationSec(entry))}</span>
              </div>`).join('')}</div></details>` : ''}
          </div>
          <span class="num activity-duration" title="${translateText('entry.duration')}">${m.worked ? fmtHM(m.worked) : '—'}</span>
          <div class="act">
            ${done ? '' : `<button class="btn-sm" data-run="${t.id}" title="${translateText('todo.start')}">[&gt;]</button>`}
            <button class="btn-sm" data-add-subtask="${t.id}" title="${translateText('todo.addSubtask')}">＋${translateText('todo.addSubtask')}</button>
            <button class="btn-sm" data-edit-t="${t.id}">${translateText('project.edit')}</button>
            <button class="btn-sm btn-danger" data-del-t="${t.id}">[x]</button>
          </div>
        </div>`;
      }).join('')
    : `<div class="empty">${translateText('todo.noMatching')}</div>`;
  initializeMarkdownPreviews($('todoList'));
}

function resetTodoForm() {
  $('tdId').value = ''; $('tdTitle').value = ''; $('tdNotes').value = '';
  syncMarkdownEditor($('tdNotes'));
  $('tdParent').value = '';
  $('tdStatus').value = 'todo'; $('tdPriority').value = 'normal'; $('tdDue').value = ''; $('tdDueTime').value = '';
  $('tdOpened').value = translateText('todo.openedAuto');
  $('tdDone').value = '—';
  $('tdWorked').value = '—';
  $('tdCancel').hidden = true;
}

$('todoForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!$('tdTitle').value.trim()) return;
  const old = S.tasks.find((t) => t.id === $('tdId').value);
  const savedTask = await db.upsertTask({
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
  showToast(translateText(old ? 'toast.todoUpdated' : 'toast.todoCreated', { title: savedTask.title }));
  resetTodoForm();
  await load();
});

$('tdCancel').addEventListener('click', resetTodoForm);
$('tdProject').addEventListener('change', renderTodos);
$('tdFilter').addEventListener('change', () => { clearFocusedReportTarget(); renderTodos(); });
$('tdStatusFilter').addEventListener('change', () => { clearFocusedReportTarget(); renderTodos(); });
$('tdPriorityFilter').addEventListener('change', () => { clearFocusedReportTarget(); renderTodos(); });

$('todoList').addEventListener('click', async (e) => {
  const check = e.target.closest('[data-check]')?.dataset.check;
  const run = e.target.closest('[data-run]')?.dataset.run;
  const addSubtask = e.target.closest('[data-add-subtask]')?.dataset.addSubtask;
  const ed = e.target.closest('[data-edit-t]')?.dataset.editT;
  const del = e.target.closest('[data-del-t]')?.dataset.delT;

  if (check) {
    const t = S.tasks.find((x) => x.id === check);
    await db.upsertTask({ ...t, status: t.status === 'done' ? 'todo' : 'done' });
    showToast(translateText(t.status === 'done' ? 'toast.todoReopened' : 'toast.todoCompleted', { title: t.title }));
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
    syncMarkdownEditor($('tdNotes'));
    $('tdPriority').value = normalizePriority(t.priority);
    $('tdDue').value = t.dueDate || '';
    $('tdDueTime').value = t.dueTime || '';
    $('tdOpened').value = stampLabel(t.openedAt, currentLocale);
    $('tdDone').value = stampLabel(t.completedAt, currentLocale);
    const m = taskMetrics(t, S.entries);
    $('tdWorked').value = m.worked ? fmtHM(m.worked) : '—';
    $('tdCancel').hidden = false; $('tdTitle').focus();
    $('tdNotes').dispatchEvent(new Event('input')); // 讓備註重算高度
    return;
  } else if (del) {
    const t = S.tasks.find((x) => x.id === del);
    if (!confirm(translateText('todo.deleteConfirm'))) return;
    await db.deleteTask(del);
    showToast(translateText('toast.todoDeleted', { title: t?.title || '' }));
  } else return;

  await load();
});

/* ---------------- 排程 ---------------- */

const DOW_NAME = [
  'schedule.days.sun', 'schedule.days.mon', 'schedule.days.tue',
  'schedule.days.wed', 'schedule.days.thu', 'schedule.days.fri', 'schedule.days.sat',
];
let scDays = new Set([1, 2, 3, 4, 5]);   // 預設平日

function paintDow() {
  $('scDow').querySelectorAll('[data-dow]').forEach((b) => {
    b.classList.toggle('on', scDays.has(Number(b.dataset.dow)));
  });
}

function dowLabel(days) {
  const s = [...days].sort();
  if (s.length === 7) return translateText('schedule.everyday');
  if (s.join() === '1,2,3,4,5') return translateText('schedule.weekdays');
  if (s.join() === '0,6') return translateText('schedule.weekends');
  return s.map((d) => translateText(DOW_NAME[d])).join(' · ');
}

function renderSchedules() {
  const noSchedulesLabel = translate(currentLocale, 'schedule.noSchedules');
  const keep = $('scProject').value;
  $('scProject').innerHTML = `<option value="">${esc(translateText('common.uncategorizedOption'))}</option>` +
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
          translateText('schedule.createLabel', { time: s.createTime }),
          s.dueTime ? translateText('schedule.dueLabel', { time: s.dueTime }) : null,
          s.remindMinutes ? translateText('schedule.reminderLabel', { count: s.remindMinutes }) : null,
        ].filter(Boolean).join(' · ');
        return `<div class="row-item${s.enabled ? '' : ' done'}">
          <button class="btn-sm btn-ghost" data-sc-toggle="${s.id}" style="width:34px"
            title="${s.enabled ? translateText('common.disabled') : translateText('common.enabled')}">${s.enabled ? '[x]' : '[ ]'}</button>
          <span class="swatch" style="background:${p ? p.color : '#9a9898'}"></span>
          <div class="main">
            <div class="ellipsis">${esc(s.title)}
              <span class="badge priority-${priority}">${priorityLabel(priority, currentLocale)}</span>
              ${s.enabled ? '' : `<span class="badge">${translateText('schedule.disabled')}</span>`}</div>
            <div class="sub num">${bits}</div>
            <div class="sub">${p ? esc(pathOf(S.projects, p.id).join(' / ')) : translateText('todo.unclassified')}${
              s.lastRunDate ? ` · ${translateText('schedule.lastRun', { date: s.lastRunDate })}` : ` · ${translateText('schedule.neverRun')}`}</div>
            ${s.notes ? `<div class="notes">${esc(s.notes)}</div>` : ''}
          </div>
          <div class="act">
            <button class="btn-sm" data-sc-edit="${s.id}">${translateText('project.edit')}</button>
            <button class="btn-sm btn-danger" data-sc-del="${s.id}">[x]</button>
          </div>
        </div>`;
      }).join('')
    : `<div class="empty">${noSchedulesLabel}</div>`;
}

function resetSchForm() {
  $('scId').value = ''; $('scTitle').value = ''; $('scNotes').value = '';
  syncMarkdownEditor($('scNotes'));
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
  if (!scDays.size) { alert(translateText('schedule.atLeastOneDay')); return; }
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
  btn.textContent = created.length ? translateText('schedule.createdCount', { count: created.length }) : translateText('schedule.noneDue');
  setTimeout(() => { btn.textContent = translateText('schedule.runNow'); }, 1800);
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
    syncMarkdownEditor($('scNotes'));
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
    if (!confirm(translateText('schedule.deleteConfirm'))) return;
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
    : `<div class="empty">${translateText('tag.noTags')}</div>`;
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
const enUI = { q: '', projectId: '', range: 'all', limit: 50, expanded: new Set(), allOpen: false, focusId: null };

function entriesRangeBounds() {
  const customBounds = enUI.range === 'custom' ? localDateRange(customRange.from, customRange.to) : null;
  if (customBounds) return customBounds;
  if (enUI.range === 'all') return { from: null, to: null };
  return reportRangeBounds(enUI.range, new Date(), S.settings.weekStartsOn);
}

/** 套用搜尋 / 專案 / 區間之後的紀錄，新的在前 */
function filteredEntries() {
  const { from, to } = entriesRangeBounds();

  // 選了父專案時，子專案的紀錄也一起算進來
  const scope = enUI.projectId
    ? new Set([enUI.projectId, ...descendantSet(enUI.projectId)])
    : null;

  const kw = enUI.q.trim().toLowerCase();

  return S.entries
    .filter((e) => e.endedAt && !e.deletedAt)
    .filter((e) => !from || entryOverlapsRange(e, from, to))
    .filter((e) => !scope || (e.projectId && scope.has(e.projectId)))
    .filter((e) => !kw || `${e.description} ${e.notes || ''}`.toLowerCase().includes(kw))
    .filter((e) => !enUI.focusId || e.id === enUI.focusId)
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
}

function renderEntries() {
  const noEntriesLabel = translate(currentLocale, 'entry.noEntries');
  // 專案下拉
  const keep = $('enFilter').value;
  $('enFilter').innerHTML = `<option value="">${esc(translateText('common.projectOption'))}</option>` +
    flattenTree(S.projects).map((p) =>
      `<option value="${p.id}">${esc(indentLabel(p.name, p.depth))}</option>`).join('');
  $('enFilter').value = keep;

  const rows = filteredEntries();
  const { from, to } = entriesRangeBounds();
  const shown = rows.slice(0, enUI.limit)
    .map((entry) => (from ? clipEntryToRange(entry, from, to) : entry))
    .filter(Boolean);
  const totalSec = rows.reduce((s, e) => s + (from ? durationInRange(e, from, to) : db.durationSec(e)), 0);
  $('entryCount').textContent = `${translateText('report.entryCount', { count: rows.length })} · ${fmtHM(totalSec)}`;
  $('enExpandAll').textContent = enUI.allOpen ? translateText('entry.collapseAll') : translateText('entry.expandAll');

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
            <span class="num mute">${fmtHM(daySec)} · ${translateText('report.entryCount', { count: list.length })}</span>
          </div>
          ${list.map((e) => {
            const p = S.projects.find((x) => x.id === e.projectId);
            const task = S.tasks.find((x) => x.id === e.taskId);
            const tags = (e.tagIds || []).map((id) => S.tags.find((t) => t.id === id)?.name).filter(Boolean);
            const notes = e.notes || '';
            // 太長的工作紀錄預設收起來，不然一筆就吃掉整個畫面
            
            return `<div class="row-item activity-row entry-row" data-entry-id="${esc(e.id)}">
              <span class="activity-time num mute">
                ${fmtClock(e.startedAt)}–${fmtClock(e.endedAt)}</span>
              <span class="swatch activity-swatch" style="background:${p ? p.color : '#9a9898'}"></span>
              <div class="main">
                <div class="ellipsis">${esc(e.description || translateText('common.noDescription'))}
                  ${task ? `<span class="badge">${esc(task.title)}</span>` : ''}
                  ${tags.map((t) => `<span class="badge">${esc(t)}</span>`).join(' ')}</div>
                <div class="sub">${p ? esc(pathOf(S.projects, p.id).join(' / ')) : translateText('todo.unclassified')}</div>
                ${notes ? renderMarkdownPreview(notes, 'notes') : ''}
                ${task?.notes?.trim() ? `<details class="entry-todo-note">
                  <summary>${translateText('entry.todoNotes')}</summary>
                  ${renderMarkdownPreview(task.notes, 'notes')}
                </details>` : ''}
              </div>
              <span class="num activity-duration">${fmtHM(db.durationSec(e))}</span>
              <div class="act">
                <button class="btn-sm" data-edit-e="${e.id}">${translateText('entry.edit')}</button>
                <button class="btn-sm btn-danger" data-del-e="${e.id}">[x]</button>
              </div>
            </div>`;
          }).join('')}
        </div>`;
      }).join('')
    : `<div class="empty">${S.entries.length ? translateText('entry.noEntriesInCondition') : noEntriesLabel}</div>`;

  initializeMarkdownPreviews($('entryList'));
  $('entryMore').innerHTML = rows.length > enUI.limit
    ? `<button id="enMore">${translateText('entry.noMore', { count: rows.length - enUI.limit })}</button>`
    : '';
}

/* 篩選事件 */
$('enSearch').addEventListener('input', (e) => {
  clearFocusedReportTarget();
  enUI.q = e.target.value; enUI.limit = 50; renderEntries();
});
$('enFilter').addEventListener('change', (e) => {
  clearFocusedReportTarget();
  enUI.projectId = e.target.value; enUI.limit = 50; renderEntries();
});
$('enRange').addEventListener('click', (e) => {
  const r = e.target.dataset.erange;
  if (!r) return;
  clearFocusedReportTarget();
  if (r === 'back') { closeCustomRange(); return; }
  if (r === 'custom') { openCustomRange(); return; }
  enUI.range = r; enUI.limit = 50;
  customRangeOpen = false;
  syncRangeControls();
  renderEntries();
});
$('entriesApplyRange').addEventListener('click', () => { clearFocusedReportTarget(); applyCustomRange('entries'); });
$('enExpandAll').addEventListener('click', () => {
  clearFocusedReportTarget();
  enUI.allOpen = !enUI.allOpen;
  enUI.expanded.clear();
  renderEntries();
});
$('entryMore').addEventListener('click', (e) => {
  if (e.target.id === 'enMore') { clearFocusedReportTarget(); enUI.limit += 50; renderEntries(); }
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
  const md = buildSummary({ dates, entries: S.entries, projects: S.projects, tasks: S.tasks, locale: currentLocale });
  const label = btn.textContent;
  if (!md) btn.textContent = translateText('entry.noRecords');
  else btn.textContent = (await copyToClipboard(md)) ? translateText('common.copied') + ' ✓' : translateText('entry.copyFailed');
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
  $('dlgTitle').textContent = e.id ? translateText('dialog.edit') : translateText('dialog.manual');
  $('enId').value = e.id || '';
  $('enDesc').value = e.description || '';
  $('enProject').innerHTML = `<option value="">${esc(translateText('dialog.noProject'))}</option>` +
    flattenTree(S.projects).map((p) =>
      `<option value="${p.id}">${esc(indentLabel(p.name, p.depth))}</option>`).join('');
  $('enProject').value = e.projectId || '';
  $('enTaskIncludeDone').checked = S.tasks.some((task) => task.id === e.taskId && task.status === 'done');
  renderEntryTasks(e.taskId || '');
  $('enStart').value = toLocalInput(e.startedAt);
  $('enEnd').value = toLocalInput(e.endedAt);
  $('enNotes').value = e.notes || '';
  syncMarkdownEditor($('enNotes'));
  $('entryDlg').showModal();
  growNotes();   // dialog 開啟後才量得到高度
}

$('entryCancel').addEventListener('click', () => $('entryDlg').close('cancel'));

$('entryForm').addEventListener('submit', async (ev) => {
  if (ev.submitter?.value !== 'save') return;
  const start = fromLocalInput($('enStart').value);
  const end = fromLocalInput($('enEnd').value);
  if (new Date(end) <= new Date(start)) { alert(translateText('entry.endMustFollowStart')); return; }
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
  $('stNotesEditor').value = normalizeMarkdownEditorMode(S.settings.notesEditor);
  $('stLanguage').value = normalizeLanguagePreference(S.settings.language);
  initializeMarkdownEditors(S.settings.notesEditor);
}
$('saveSettings').addEventListener('click', async () => {
  await db.saveSettings({
    idleThresholdMin: Math.max(1, Number($('stIdle').value) || 15),
    roundToMin: Number($('stRound').value) || 0,
    notesEditor: normalizeMarkdownEditorMode($('stNotesEditor').value),
    language: normalizeLanguagePreference($('stLanguage').value),
  });
  await load();
  alert(translate(currentLocale, 'settings.saved'));
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
  if (!confirm(translateText('settings.importConfirm'))) return;
  try {
    await db.importAll(JSON.parse(await f.text()));
    await load();
    alert(translateText('settings.imported'));
  } catch (err) {
    alert(`${translateText('settings.importFailed')}: ${err.message}`);
  }
  e.target.value = '';
});

$('wipe').addEventListener('click', async () => {
  if (!confirm(translateText('settings.wipeConfirm'))) return;
  await chrome.storage.local.clear();
  await load();
});

/* ---------------- 分頁 / 區間 ---------------- */
function clearFocusedReportTarget() {
  const next = clearReportFocus({ entryId: enUI.focusId, todoId: todoFocusId });
  enUI.focusId = next.entryId;
  todoFocusId = next.todoId;
}

function selectTab(name, preserveFocus = false) {
  if (!name) return;
  if (!preserveFocus) {
    const hadFocusedTarget = hasReportFocus({ entryId: enUI.focusId, todoId: todoFocusId });
    clearFocusedReportTarget();
    if (hadFocusedTarget) { renderEntries(); renderTodos(); }
  }
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  ['report', 'timer', 'projects', 'todos', 'entries', 'schedules', 'tags', 'settings']
    .forEach((n) => { $('p-' + n).hidden = n !== name; });
  initializeMarkdownPreviews($('p-' + name));
}

function focusReportEntry(id) {
  const entry = S.entries.find((item) => item.id === id);
  if (!entry) return;
  const next = setReportFocus({ entryId: enUI.focusId, todoId: todoFocusId }, 'entry', id);
  enUI.focusId = next.entryId;
  todoFocusId = next.todoId;
  enUI.q = '';
  enUI.projectId = '';
  enUI.range = 'all';
  $('enSearch').value = '';
  $('enFilter').value = '';
  customRangeOpen = false;
  syncRangeControls();
  selectTab('entries', true);
  renderEntries();
  requestAnimationFrame(() => {
    const row = [...document.querySelectorAll('#entryList [data-entry-id]')]
      .find((item) => item.dataset.entryId === id);
    row?.classList.add('report-focus');
    row?.scrollIntoView({ block: 'center' });
  });
}

function focusReportTodo(id) {
  const task = S.tasks.find((item) => item.id === id);
  if (!task) return;
  const next = setReportFocus({ entryId: enUI.focusId, todoId: todoFocusId }, 'todo', id);
  enUI.focusId = next.entryId;
  todoFocusId = next.todoId;
  $('tdFilter').value = '';
  $('tdStatusFilter').value = 'active';
  $('tdPriorityFilter').value = '';
  selectTab('todos', true);
  renderTodos();
  requestAnimationFrame(() => {
    const row = [...document.querySelectorAll('#todoList [data-todo-id]')]
      .find((item) => item.dataset.todoId === id);
    row?.classList.add('report-focus');
    row?.scrollIntoView({ block: 'center' });
  });
}

$('tabs').addEventListener('click', (e) => selectTab(e.target.dataset.tab));
$('reportInsights').addEventListener('click', (e) => {
  const entryId = e.target.closest('[data-report-entry-id]')?.dataset.reportEntryId;
  if (entryId) { focusReportEntry(entryId); return; }
  const taskId = e.target.closest('[data-report-task-id]')?.dataset.reportTaskId;
  if (taskId) focusReportTodo(taskId);
});
$('reportDueAlerts').addEventListener('click', (e) => {
  const taskId = e.target.closest('[data-report-task-id]')?.dataset.reportTaskId;
  if (taskId) focusReportTodo(taskId);
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
