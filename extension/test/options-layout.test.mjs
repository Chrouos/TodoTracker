import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../src/options/options.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/options/options.css', import.meta.url), 'utf8');
const collapse = await readFile(new URL('../src/lib/collapse.js', import.meta.url), 'utf8');

assert.match(html, /<div class="grid4 todo-form-main">/,
  'Todo 主表單應使用可調整專案欄寬的 grid class');
assert.match(css, /\.todo-form-main\s*\{[^}]*grid-template-columns:\s*2fr\s+1fr\s+1\.5fr\s+1fr/s,
  'Todo 主表單應給子專案選單比狀態欄更多寬度');

assert.match(html, /id="tdPriority"/, 'Todo should have a priority field');
assert.match(html, /id="tdPriorityFilter"/, 'Todo should have a priority filter');
assert.match(html, /id="scPriority"/, 'Schedule should have a priority field');
assert.match(html, /data-tab="timer"/, 'Management timer should have its own tab');
assert.match(html, /id="p-timer"/, 'Management timer should be inside its own panel');
assert.match(html, /id="reportDueAlerts"/, 'Report should reserve a first-glance area for due Todo alerts');
assert.match(html,
  /data-tab="report"[\s\S]*data-tab="timer"[\s\S]*data-tab="projects"[\s\S]*data-tab="todos"[\s\S]*data-tab="entries"[\s\S]*data-tab="schedules"[\s\S]*data-tab="tags"[\s\S]*data-tab="settings"/,
  'Management tabs should follow the requested order');
for (const id of [
  'managementTimer', 'mgTimerClock', 'mgTimerDescription', 'mgTimerProject',
  'mgTimerTask', 'mgTimerTags', 'mgTimerNotes', 'mgTimerComplete', 'mgTimerToggle',
]) {
  assert.match(html, new RegExp(`id="${id}"`), `Management timer should have ${id}`);
}
assert.match(html, /id="stNotesEditor"/, 'Settings should expose the Markdown editor mode');
assert.match(html, /id="appToast"[^>]*role="status"[^>]*aria-live="polite"/,
  'Options should expose one unobtrusive live toast region');
assert.doesNotMatch(html, /id="appToast"[^>]*hidden/,
  'Options toast live region should remain available to assistive technology');
assert.match(html, /<button type="button"[^>]*value="cancel"[^>]*data-i18n="dialog\.cancel"/,
  'Entry dialog cancel must not be the implicit submit action');
assert.match(html, /<button type="submit"[^>]*id="entrySave"[^>]*value="save"[^>]*data-i18n="dialog\.save"/,
  'Entry dialog save should be the explicit submit action');
for (const id of ['mgTimerNotes', 'tdNotes', 'enNotes', 'pjNoteDraft', 'scNotes']) {
  assert.match(html, new RegExp(`id="${id}"[^>]*data-markdown-editor-input`), `${id} should use the shared Markdown editor`);
}
const options = await readFile(new URL('../src/options/options.js', import.meta.url), 'utf8');
const db = await readFile(new URL('../src/lib/db.js', import.meta.url), 'utf8');
const editor = await readFile(new URL('../src/lib/markdown-editor.js', import.meta.url), 'utf8');
assert.match(options, /projectIdForTask/, 'Entry Todo selection should synchronize its project');
assert.match(options, /normalizeMarkdownEditorMode/, 'Options should normalize the shared Markdown editor setting');
assert.match(html, /id="stLanguage"/, 'Settings should expose a language selector');
for (const value of ['auto', 'zh-TW', 'en', 'ja']) {
  assert.match(html, new RegExp(`<option value="${value}"`), `Language selector should include ${value}`);
}
assert.match(options, /from ['"]\.\.\/lib\/i18n\.js['"]/, 'Options should import the shared locale engine');
assert.match(options, /applyTranslations/, 'Options should apply static translations');
assert.match(options, /language:\s*normalizeLanguagePreference/, 'Options should persist the normalized language preference');
assert.match(db, /language:\s*'auto'/, 'Settings should default to the automatic browser language');
assert.match(options, /formatDuration/, 'Options should use the shared duration formatter');
assert.match(options, /statusLabel/, 'Options should use the shared status label formatter');
for (const key of [
  'report.completed', 'todo.noTodos', 'schedule.noSchedules', 'entry.noEntries', 'common.confirmDelete',
]) {
  assert.match(options, new RegExp(`translate\\(currentLocale, ['"]${key}['"]`), `Options should translate ${key}`);
}
for (const key of ['nav.report', 'nav.projects', 'nav.todos', 'nav.settings', 'common.save']) {
  assert.match(html, new RegExp(`data-i18n="${key}"`), `Options markup should mark ${key}`);
}
assert.match(options, /enTask.*addEventListener\('change'/, 'Entry Todo selection should update the project selector');
assert.match(options, /tasksForProject/, 'Manual entry Todo options should use the selected project');
assert.match(options, /sortTasksForManualEntry/, 'Manual entry Todo options should prioritize recent activity');
assert.match(options, /enProject.*addEventListener\('change'/, 'Manual entry project changes should refresh Todo options');
assert.match(html, /id="enTaskIncludeDone"/, 'Manual entry should expose a completed Todo visibility toggle');
assert.match(html, /data-i18n="entry\.includeCompletedTodos"/, 'Completed Todo visibility toggle should be translatable');
assert.match(options, /const includeCompleted = \$\('enTaskIncludeDone'\)\?\.checked/, 'Manual entry should read the completed Todo visibility toggle');
assert.match(options, /filter\(\(task\) => task\.status !== 'done'\)/, 'Manual entry should hide completed Todos by default');
assert.match(options, /<optgroup label="\$\{esc\(translateText\('todo\.status\.done'\)\)\}">/, 'Completed Todos should render in a separate group');
assert.match(options, /enTaskIncludeDone.*addEventListener\('change'/s, 'Manual entry should refresh Todo options when completed visibility changes');
assert.match(css, /\.entry-task-filter\s*\{/, 'Manual entry completed Todo toggle should have a dedicated style');
assert.match(options, /class="project-list-head"/, 'Project list should expose readable column labels');
assert.match(options, /class="row-item project-row"/, 'Project list rows should have a dedicated layout class');
assert.match(options, /class="project-color"/, 'Project rows should show a prominent color marker');
assert.match(options, /class="project-hours"/, 'Project hours should have readable labels');
assert.match(options, /class="project-secondary-actions"/, 'Secondary project actions should be visually quieter');
assert.match(html, /id="tdStatusFilter"/, 'Options Todo should expose a status filter');
assert.doesNotMatch(html, /id="tdToggleDone"/, 'Options Todo should replace the completed toggle with a status filter');
assert.match(options, /statusFilter/, 'Options Todo should pass the selected status to filtering');
const popupHtml = await readFile(new URL('../src/popup/popup.html', import.meta.url), 'utf8');
const popup = await readFile(new URL('../src/popup/popup.js', import.meta.url), 'utf8');
assert.match(popupHtml, /id="todoStatusFilter"/, 'Popup Todo should expose a status filter');
assert.match(popup, /statusFilter/, 'Popup Todo should pass the selected status to filtering');
assert.match(css, /\.project-color\s*\{[^}]*width:\s*10px[^}]*height:\s*32px/s,
  'Project color marker should be easy to see');
assert.match(css, /\.project-row\s*\{[^}]*grid-template-columns:/s,
  'Project rows should align project, hours, and actions into columns');
assert.match(css, /\.project-list-head\s*\{[^}]*grid-template-columns:/s,
  'Project list should align its column labels with project rows');
assert.match(css, /--project-list-columns:\s*minmax\(0,\s*1fr\)\s+110px\s+110px\s+96px/s,
  'Project list should define one shared column template');
assert.doesNotMatch(css, /--project-list-columns:[^;]*\bauto\b/s,
  'Project list should not let content change the shared action column width');
assert.match(css, /\.project-list-head\s*,\s*\.project-row\s*\{[^}]*grid-template-columns:\s*var\(--project-list-columns\)/s,
  'Project list header and rows should use the same column template');
assert.match(css, /\.project-list-head\s*,\s*\.project-row\s*\{[^}]*width:\s*100%[^}]*box-sizing:\s*border-box/s,
  'Project list header and rows should share the same available width');
assert.match(css, /\.project-list-head\s*\{[^}]*color:\s*var\(--text-body\)/s,
  'Project list column labels should remain readable on light backgrounds');
assert.match(css, /\.project-row\s*\{[^}]*color:\s*var\(--text-ink\)/s,
  'Project rows should use dark primary text on tinted backgrounds');
assert.match(css, /\.project-row \.sub\s*\{[^}]*color:\s*var\(--text-body\)/s,
  'Project metadata should use readable secondary text');
assert.match(css, /\.project-hours-label\s*\{[^}]*color:\s*var\(--text-body\)/s,
  'Project hour labels should use readable secondary text');
assert.match(css, /\.project-hours \.num\s*\{[^}]*color:\s*var\(--text-ink\)/s,
  'Project hour values should use dark primary text');
assert.match(css, /\.markdown-preview hr\s*\{[^}]*width:\s*100%[^}]*height:\s*1px[^}]*margin:\s*16px 0/s,
  'Markdown separators should span the preview content with readable spacing');
assert.match(css, /\.markdown-preview hr\s*\{[^}]*background:\s*var\(--hairline\)/s,
  'Markdown separators should use a subtle hairline');
assert.match(css, /\.project-info \.tree-branch\s*\{[^}]*font-size:\s*16px/s,
  'Project hierarchy branches should be large enough to see');
assert.match(css, /\.project-info \.tree-branch\s*\{[^}]*color:\s*color-mix\(/s,
  'Project hierarchy branches should use a darker mixed project color');
assert.match(options, /from ['"]\.\.\/lib\/report-range\.js['"]/, 'Report should import trend date bounds');
assert.match(options, /trendDateBounds\(range, new Date\(\), S\.settings\.weekStartsOn\)/, 'Report should derive quick-range trend bounds');
assert.match(options, /const trendEndExclusive = new Date\(lineTo\.getTime\(\) \+ 864e5\)/, 'Report should cap trend entries at the inclusive axis end');
assert.match(options, /const trendEntries = S\.entries\.filter/, 'Report should use bounded entries for the trend chart');
assert.match(css, /\.project-trend-tooltip\s*\{[^}]*box-sizing:\s*border-box/s, 'Trend tooltip should include padding in its fixed height');
assert.match(css, /\.project-trend-tooltip\s*\{[^}]*height:\s*\d+px/s, 'Trend tooltip should reserve a fixed height');
assert.match(css, /\.project-trend-tooltip\s*\{[^}]*overflow:\s*hidden/s, 'Trend tooltip should hide overflow instead of growing');
assert.match(css, /\.project-trend-tooltip\s*>\s*(?:strong|span)[^{]*\{[^}]*white-space:\s*nowrap/s, 'Trend tooltip summary lines should not wrap');
assert.match(css, /\.project-trend-tooltip\s*>\s*(?:strong|span)[^{]*\{[^}]*text-overflow:\s*ellipsis/s, 'Trend tooltip summary lines should ellipsize');
assert.match(css, /\.markdown-editor-content \.markdown-task-list input\[type="checkbox"\]\s*\{[^}]*width:\s*13px[^}]*height:\s*13px[^}]*flex:\s*0 0 13px/s,
  'Editable Markdown task checkboxes should remain compact');
assert.match(options, /filterTasks/, 'Todo should apply the shared task filter');
assert.match(options, /taskCountLabel/, 'Todo should use the informative task count');
assert.match(options, /compareTodoTasks/, 'Todo should use the shared priority and recency ordering');
assert.match(options, /task\?\.notes\?\.trim\(\)\s*\?\s*`<details class="entry-todo-note">/,
  'Only linked Todos with non-empty notes should expose the note disclosure');
assert.doesNotMatch(options, /<details class="entry-todo-note"\s+open/,
  'Linked Todo notes should remain collapsed by default');
assert.match(options, /renderMarkdownPreview\(task\.notes, 'notes'\)/,
  'Linked Todo notes should render with the shared Markdown preview');
assert.match(css, /\.entry-todo-note\s*>\s*summary\s*\{[^}]*cursor:\s*pointer/s,
  'Linked Todo notes should remain collapsed behind a subtle interactive summary');
assert.match(html, /id="byProject"[\s\S]*id="projectTrend"[\s\S]*id="projectHeatmap"/, 'Report should combine trend and heatmap in the project panel');
assert.match(html, /id="reportInsights"/, 'Report should expose data quality and Todo performance insights');
assert.match(html, /data-collapse="rep-insights"/, 'Workspace status should have its own collapsible heading');
assert.match(html, /data-collapse-body="rep-insights"/, 'Workspace status should have a collapsible body');
assert.match(html, /data-collapse="rep-insights"[^>]*data-collapse-default="closed"/, 'Workspace status should default to collapsed');
assert.match(html, /data-collapse="rep-donut"[^>]*data-collapse-default="closed"/, 'Project analytics should default to collapsed');
assert.doesNotMatch(html, /data-collapse="rep-review"[^>]*data-collapse-default="closed"/, 'Daily review should remain open by default');
assert.match(html, /data-collapse="rep-insights"[\s\S]*data-collapse="rep-review"[\s\S]*data-collapse="rep-donut"/, 'Report panels should put the important sections first');
assert.doesNotMatch(html, /data-collapse="rep-todo-tracker"|data-collapse-body="rep-todo-tracker"/, 'Todo Tracker should not keep the obsolete nested collapse markup');
assert.match(options, /const todoTrackerMount = report\.querySelector\('#todoTracker'\)/, 'Todo Tracker should preserve its mount when the project report rerenders');
assert.match(html, /data-review-mode="calendar"[^>]*active|class="btn-sm active"[^>]*data-review-mode="calendar"/, 'Calendar should be the default review mode');
assert.doesNotMatch(html, /id="byDay"/, 'Report should not render a separate daily trend panel');
assert.match(options, /buildProjectTrendData/, 'Report should build the fused project trend data');
assert.match(options, /entryOverlapsRange/, 'Report ranges should include entries that cross midnight');
assert.match(options, /durationInRange/, 'Report totals should clip entries to the selected range');
assert.match(options, /function filteredEntries\(\)[\s\S]*?entryOverlapsRange/, 'Entry list ranges should include entries that cross midnight');
assert.match(options, /function renderEntries\(\)[\s\S]*?durationInRange/, 'Entry list totals should clip entries to the selected range');
assert.match(options, /function entriesRangeBounds\(\)[\s\S]*?reportRangeBounds/, 'Entry list quick ranges should have end boundaries');
assert.match(options, /data-trend-date/, 'Report should wire date hover interaction');
assert.match(options, /highlightProjectId/, 'Project selection should highlight without changing the data range');
assert.match(options, /trendOverview/, 'Report should show a useful summary before hover');
assert.match(options, /focusReportEntry/, 'Report should navigate directly to work records');
assert.match(options, /focusReportTodo/, 'Report should navigate directly to Todo items');
assert.match(options, /dueTodoAlerts/, 'Report should derive a compact list of upcoming Todo deadlines');
assert.match(options, /data-report-task-id/, 'Due Todo alerts should link directly to Todo items');
assert.match(options, /if \(!visible\.length\) \{\s*mount\.innerHTML = '';/, 'Report should hide the due alert region when there is nothing to remind');
assert.match(options, /buildWorkspaceTodoProgress/, 'Workspace status should derive its Todo completion progress');
assert.match(options, /report-status-metrics/, 'Workspace status should show compact Todo completion metrics');
assert.match(options, /donutSVG\(/, 'Workspace status should retain a compact Todo status donut');
assert.match(options, /report-status-donut/, 'Workspace status should mount the compact Todo status donut');
assert.doesNotMatch(html, /id="todoHealth"|data-collapse="rep-health"/, 'Report should not render a separate Todo health section');
assert.doesNotMatch(options, /renderTodoHealth\(|todoHealthSelectedStatus/, 'Todo health should not render as a separate chart');
assert.match(options, /report-status-metrics/, 'Workspace status should contain the compact Todo summary');
assert.match(css, /\.report-status-metrics\s*\{/, 'Compact Todo summary should have a dedicated layout style');
assert.match(css, /\.report-status-donut\s*\{[^}]*flex:\s*0\s+0\s+128px/s, 'Todo donut should be large enough to read');
assert.match(css, /\.report-status-donut \.todo-health-donut-svg\s*\{[^}]*width:\s*128px[^}]*height:\s*128px/s, 'Todo donut SVG should use the larger size');
assert.match(css, /#p-report > h2\.sec,\s*#p-report > \.report-panel > h2\.sec\s*\{/, 'Report section headings should share one typography rule');
assert.match(css, /\.project-heatmap-svg \.heatmap-cell rect\s*\{[^}]*fill-opacity:/s, 'Heatmap cells should use a readable translucent project color');
assert.match(options, /function clearFocusedReportTarget\(\)/,
  'Report navigation should expose one way to clear a stale focused target');
assert.match(options, /function selectTab\(name, preserveFocus = false\)/,
  'Normal tab changes should clear a focused report target');
assert.match(options, /if \(!preserveFocus\) \{[\s\S]{0,220}clearFocusedReportTarget\(\)/,
  'Tab changes should clear report focus unless navigation explicitly preserves it');
assert.match(options, /const hadFocusedTarget = hasReportFocus\(\{ entryId: enUI\.focusId, todoId: todoFocusId \}\)/,
  'Tab changes should detect whether a focused list needs to be refreshed');
assert.match(options, /if \(hadFocusedTarget\) \{ renderEntries\(\); renderTodos\(\); \}/,
  'Tab changes should refresh lists after clearing a focused target');
assert.match(options, /selectTab\('entries', true\)/,
  'Entry report navigation should preserve focus while switching tabs');
assert.match(options, /selectTab\('todos', true\)/,
  'Todo report navigation should preserve focus while switching tabs');
assert.match(options, /clearReportFocus/,
  'Entry and Todo filters should use the shared report focus reset');
assert.match(options, /enUI\.focusId = next\.entryId/,
  'Entry report navigation should apply the shared focus state');
assert.match(options, /todoFocusId = next\.todoId/,
  'Todo report navigation should apply the shared focus state');
assert.match(options, /\$\('enSearch'\)\.value = '';[\s\S]{0,80}\$\('enFilter'\)\.value = '';/,
  'Entry report navigation should reset visible entry filters');
assert.match(options, /\$\('entriesApplyRange'\)\.addEventListener\('click', \(\) => \{ clearFocusedReportTarget\(\); applyCustomRange\('entries'\); \}\)/,
  'Applying a custom entry range should clear a stale focused entry');
assert.doesNotMatch(options, /移動滑鼠到日期或儲存格查看明細/, 'Report should not use a meaningless hover placeholder');
assert.match(options, /buildProjectDetailData/, 'Project selection should render project detail data');
assert.match(options, /buildReportQuality/, 'Report should render data quality metrics');
assert.match(options, /buildProjectTaskMetrics/, 'Report should render project Todo performance metrics');
assert.match(options, /buildProjectHealthRows/, 'Report should sort project status by attention');
assert.match(options, /buildReportActionItems/, 'Report should render actionable data quality items');
assert.match(options, /reportActionTarget/, 'Report action items should expose navigation targets');
assert.match(options, /data-report-entry-id/, 'Report should expose a direct target for work records');
assert.match(options, /data-report-task-id/, 'Report should expose a direct target for Todo items');
assert.match(options, /translateText\('report\.attention'\)/, 'Report should show actionable attention items');
assert.match(options, /const attentionMarkup = statusItem\.kind === 'clear'/, 'Report should hide the attention section when there are no actionable items');
assert.match(options, /translateText\('report\.projectStatus'\)/, 'Report should show a scannable project status list');
assert.match(options, /projectTrendDetail/, 'Report should have an expandable project detail panel');
assert.match(options, /createReportChartSection/, 'Report charts should be wrapped in independent collapse sections');
assert.match(options, /dataset\.reportChart = id/, 'Report chart sections should expose a collapse identity');
assert.match(options, /wrapReportChartContent/, 'Report charts should be grouped after rendering');
assert.match(options, /reportChartCollapsed/, 'Report chart collapse state should be tracked');
assert.match(options, /let reportChartCollapsed = new Set\(\['trend', 'heatmap'\]\)/, 'Todo Tracker should be visible when the project report is opened');
assert.match(css, /\.report-chart-title/, 'Report chart collapse headings should have dedicated styles');
assert.match(css, /\.report-action-grid\s*\{/, 'Report should group actionable items in a compact grid');
assert.match(css, /\.report-due-alerts\s*\{/, 'Report due alerts should have a dedicated compact style');
assert.match(css, /\.report-due-alerts\s*\{[^}]*border:\s*0;[^}]*border-left:\s*3px\s+solid/s, 'Due alerts should use a single accent edge instead of a nested frame');
assert.match(css, /\.report-due-alert\s*\{[^}]*border:\s*0;[^}]*border-top:\s*1px\s+solid/s, 'Due alert rows should use separators instead of individual boxes');
assert.match(css, /\.report-project-row\s*\{/, 'Report should render projects as scannable status rows');
assert.match(options, /data-report-project-tooltip/, 'Project progress bars should expose Todo summary tooltips');
assert.match(options, /class="report-project-color"/, 'Project status rows should expose a project color marker');
assert.match(css, /\.report-project-progress::after\s*\{/, 'Project progress bars should render a hover summary');
assert.match(css, /\.report-project-color\s*\{/, 'Project status rows should style the project color marker');
assert.match(css, /\.report-project-work\s*\{[^}]*white-space:\s*nowrap/s,
  'Project status work durations should stay on one line');
assert.match(css, /\.kpi \.num\s*\{[^}]*white-space:\s*nowrap/s,
  'Report KPI durations should stay on one line');
assert.doesNotMatch(options, /const metricRows\s*=|report-details-collapse|report\.averageCycle/, 'Report should not render the duplicate full project report');
assert.doesNotMatch(css, /\.report-details-collapse\s*>\s*summary/, 'Report should not keep the duplicate full project report styles');
assert.match(css, /@media \(max-width: 720px\)[\s\S]*?\.report-action-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2/s,
  'Report action cards should remain compact on narrow screens');
assert.match(css, /@media \(max-width: 720px\)[\s\S]*?\.report-project-row\s*\{[^}]*grid-template-columns:/s,
  'Report project rows should reflow on narrow screens');
assert.match(options, /review-calendar-tooltip/, 'Calendar hover should use a real tooltip element');
assert.match(options, /let reviewMode = 'calendar'/, 'Report should initialize the review in calendar mode');
assert.doesNotMatch(options, /groups\.length\s*<=\s*7/, 'Calendar should remain available for ranges longer than one week');
assert.doesNotMatch(options, /data-tooltip="\$\{esc\(tooltip\)\}"/, 'Calendar hover should not render tooltip content through attr()');
assert.match(options, /getTimer/, 'Management timer should load the shared timer');
assert.match(options, /completeTask/, 'Management timer should pass the completion choice when stopping');
assert.match(options, /const scrollY = window\.scrollY/, 'Management timer should capture scroll position before reload');
assert.match(options, /window\.scrollTo\(0, scrollY\)/, 'Management timer should restore scroll position after reload');
assert.match(options, /isMarkdownEditorFocused\(\$\('mgTimerNotes'\)\)/,
  'Management timer should not overwrite an active block editor while refreshing');
assert.doesNotMatch(options, /growTimerNotes\(/,
  'Management timer should not resize the page while typing notes');
assert.match(css, /\.timer-complete input\[type="checkbox"\]/,
  'Management timer checkbox should have compact custom styling');
assert.match(css, /\.timer-fields\s*\{[^}]*grid-template-columns:\s*2fr\s+1\.5fr\s+1\.5fr/s,
  'Management timer should give project and Todo selectors enough width');
assert.match(css, /\.timer-notes-field textarea\s*\{[^}]*min-height:\s*240px[^}]*overflow-y:\s*auto\s*!important/s,
  'Management timer notes should be larger and scrollable');
assert.match(options, /'› '\.repeat\(p\.depth\)/,
  'Management timer project options should use compact hierarchy labels');
assert.match(css, /\.review-calendar\s*\{[^}]*overflow-x:\s*auto/s, 'Calendar should scroll horizontally');
assert.match(css, /\.review-calendar\s*\{[^}]*display:\s*grid/s, 'Calendar should keep its grid layout');
assert.match(css, /\.review-calendar\s*\{[^}]*overflow-x:\s*auto[^}]*overflow-y:\s*auto/s,
  'Calendar should allow vertical scrolling while keeping horizontal scrolling');
assert.match(css, /\.review-calendar\s*\{[^}]*max-height:\s*min\(72vh,\s*640px\)/s,
  'Calendar should cap its viewport height');
assert.match(css, /\.review-calendar-tooltip\[hidden\]\s*\{[^}]*display:\s*none/s,
  'Hidden calendar tooltips should not expand the scroll range');
assert.match(options, /reviewCalendarHoverTooltip/, 'Calendar should use one shared click preview');
assert.match(html, /id="reviewCalendarHoverTooltip"[^>]*role="tooltip"/, 'Calendar tooltip should live outside the scrollable grid');
assert.match(options, /dailyReview'\)\.addEventListener\('click'/, 'Calendar preview should open from a click');
assert.match(options, /dailyReview'\)\.addEventListener\('keydown'/, 'Calendar preview should support keyboard activation');
assert.match(options, /reviewCalendarSelectedTarget/, 'Calendar preview should keep the selected entry stable');
assert.match(options, /showReviewCalendarTooltip/, 'Calendar click should position the shared preview');
assert.match(options, /repositionReviewCalendarTooltip/, 'Calendar preview should reposition while the viewport moves');
assert.doesNotMatch(options, /dailyReview'\)\.addEventListener\('pointerover'/, 'Calendar preview should not depend on hover');
assert.doesNotMatch(options, /dailyReview'\)\.addEventListener\('pointerout'/, 'Calendar preview should not close when the pointer leaves an entry');
assert.doesNotMatch(options, /class="review-calendar-entry"[^>]*\stitle=/, 'Calendar entries should not create a second native title preview');
assert.match(css, /\.review-calendar-tooltip\s*\{[^}]*position:\s*fixed/s,
  'Calendar tooltip should escape the scrollable calendar');
assert.match(css, /\.review-calendar-tooltip\s*\{[^}]*pointer-events:\s*none/s,
  'Calendar tooltip should not capture the pointer');
assert.doesNotMatch(options, /<div class="review-calendar-tooltip" role="tooltip">/,
  'Calendar entries should not own tooltips inside the scrollable grid');
assert.doesNotMatch(css, /\.review-calendar\s*\{\s*overflow:\s*visible;\s*\}/, 'Calendar should not override horizontal scrolling');
assert.match(collapse, /collapseDefault/, 'Collapse should support a default closed state');
assert.match(options,
  /const workspaceSections = \$\('projectWorkspace'\)\.querySelectorAll\('\.workspace-section'\);[\s\S]*?workspaceSections\.forEach\(\(section, index\) => \{\s*if \(index > 0 && !openSections\.includes\(section\.dataset\.workspaceSection\)\) section\.classList\.add\('is-collapsed'\);/,
  'Project workspace should keep the summary open and collapse later sections by default');
assert.doesNotMatch(options, /notesBox\.classList\.add\('is-collapsed'\)/,
  'Project notes should remain open by default');
assert.match(options, /data-workspace-todo-check/, 'Workspace Todo items should expose a completion control');
assert.match(options, /data-workspace-todo-note-input/, 'Workspace Todo items should expose an editable note field');
assert.match(options, /data-workspace-todo-save/, 'Workspace Todo notes should expose a save action');
assert.match(options, /function renderWorkspaceTodo/, 'Workspace Todo rendering should have its own presentation boundary');
assert.match(options, /workspace-todo-group-done/, 'Completed workspace Todos should use a dedicated visual group');
assert.match(options, /if \(status === 'done'\) \{[\s\S]*?<details class="workspace-todo-group\$\{doneClass\}" data-workspace-todo-group="done">/, 'Completed workspace Todos should render inside a collapsed details group');
assert.doesNotMatch(options, /<details class="workspace-todo-group\$\{doneClass\}"[^>]*\sopen[=>]/, 'Completed workspace Todos should be collapsed by default');
assert.match(css, /\.workspace-todo-group-done\s*>\s*summary/, 'Completed Todo summary should have an expandable treatment');
assert.match(options, /db\.upsertTask\(\{ \.\.\.task, status:/, 'Workspace Todo completion should persist through the shared database boundary');
assert.match(css, /\.workspace-todo-card\s*\{/, 'Workspace Todo items should have a dedicated card style');
assert.match(css, /\.workspace-todo-group-done\s+\.workspace-todo-card\s*\{/, 'Completed workspace Todos should have distinct styling');
assert.match(options, /function renderWorkspaceLog/, 'Workspace work logs should have a Todo-aware grouping boundary');
assert.match(options, /data-workspace-log-task/, 'Workspace work log groups should expose their related Todo');
assert.match(options, /entry\.uncategorized/, 'Workspace work logs should keep unlinked records in a separate group');
assert.match(options, /workspace-todo-log/, 'Each workspace Todo should expose its related work log');
assert.match(options, /entriesForTask\(task, S\.entries\)/, 'Workspace Todo cards should derive work logs from the Todo relation');
assert.doesNotMatch(options, /<details class="workspace-todo-log" open>/, 'Workspace Todo work logs should remain collapsed by default');
assert.match(options, /workspace-todo-unlinked/, 'Unlinked work should remain visible under the Todo workspace');
assert.doesNotMatch(options, /data-workspace-section="work-log"/, 'Workspace should not render a separate work log section');
assert.match(options, /function renderProjectWorkspace\(id, \{ openSections = \[\] \}/, 'Workspace Todo should remain collapsed by default');
assert.match(options, /if \(section\.dataset\.workspaceSection === 'summary'\) return;/, 'Project summary should be treated as a fixed open section');
assert.match(css, /\.workspace-log-group\s*\{/, 'Workspace work log groups should have a dedicated style');
assert.match(css, /\.workspace-log-group\s*>\s*summary/, 'Workspace work log groups should be expandable by Todo');
assert.match(css, /\.workspace-todo-log\s*\{/, 'Todo cards should have a dedicated related-work-log style');
assert.match(css, /\.workspace-todo-unlinked\s*\{/, 'Unlinked work should have a dedicated workspace style');
assert.match(css, /#projectWorkspace\.card\s*\{[^}]*border:\s*0/s, 'Workspace should avoid a nested outer card frame');
assert.match(css, /\.workspace-todo-card\s*\{[^}]*border-bottom:/s, 'Todo rows should use light separators instead of nested cards');
assert.match(css, /#projectWorkspace\s*>\s*#pjNotesBox\s*\{[^}]*margin-top:\s*18px/s, 'Project notes should be separated from the section above');
assert.match(css, /\.workspace-log\s*\{[^}]*border-left:/s, 'Workspace work logs should use a timeline treatment');
assert.match(css, /\.workspace-process\s*\{/, 'Workspace process should have a dedicated visual container');
assert.match(css, /\.daily-review-entry\s*\{[^}]*grid-template-columns:\s*126px\s+8px\s+minmax\(0,\s*1fr\)\s+max-content/s, 'Daily review should reserve the natural width for durations');
assert.match(css, /\.daily-review-duration\s*\{[^}]*white-space:\s*nowrap/s, 'Daily review durations should stay on one line');
assert.match(css, /\.activity-row\s*\{[^}]*grid-template-columns:[^;]*max-content/s, 'Entry rows should reserve the natural width for durations');
assert.match(css, /\.activity-row \.activity-duration\s*\{[^}]*white-space:\s*nowrap/s, 'Entry row durations should stay on one line');
assert.match(css, /\.markdown-editor-toolbar\s*\{/, 'Markdown fields should render an editor toolbar');
assert.match(editor, /data-markdown-command/, 'Markdown toolbar controls should be discoverable');
assert.match(options, /mountMarkdownEditor/, 'Options should mount the native Markdown block editor');
assert.match(options, /onEmptyParagraphEnter:[\s\S]{0,160}requestSubmit\(\$\('entrySave'\)\)/,
  'A second Enter on an empty entry-note paragraph should submit the entry');
for (const key of ['todoCreated', 'todoUpdated', 'todoCompleted', 'todoReopened', 'todoDeleted']) {
  assert.match(options, new RegExp(`['"]toast\\.${key}['"]`), `Options should expose ${key} feedback`);
}
assert.match(options, /showToast\(translateText\(/, 'Options Todo actions should display translated toast feedback');
assert.match(css, /\.app-toast\s*\{[^}]*position:\s*fixed[^}]*right:/s,
  'Options toast should stay compact in the lower-right viewport');
assert.match(editor, /dataset\.markdownEditorRoot\s*=\s*'true'/,
  'Options Markdown editors should mount one delegated editable root');
assert.doesNotMatch(editor, /data-editor-surface|editorSurface|activeSurface/,
  'Options Markdown editors should not reintroduce independent editable surfaces');
assert.match(editor, /\['todo',/, 'Markdown editor should expose a Todo command');
assert.match(editor, /\['table',/, 'Markdown editor should expose a table command');
assert.match(css, /\.markdown-editor-content\s*\{/, 'Markdown editor should expose a block content surface');
assert.match(css, /\.markdown-editor\.is-source\s+textarea/, 'Source mode should keep the original textarea discoverable');
assert.match(options, /data-note-input="\$\{n\.id\}" data-markdown-editor-input/, 'Dynamic Project Notes should mount the Markdown editor');
console.log('options layout contract passed');
