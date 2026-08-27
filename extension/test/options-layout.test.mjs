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
assert.match(html, /id="byProject"[\s\S]*id="projectTrend"[\s\S]*id="projectHeatmap"/, 'Report should combine trend and heatmap in the project panel');
assert.match(html, /id="reportInsights"/, 'Report should expose data quality and Todo performance insights');
assert.match(html, /data-collapse="rep-insights"/, 'Workspace status should have its own collapsible heading');
assert.match(html, /data-collapse-body="rep-insights"/, 'Workspace status should have a collapsible body');
assert.match(html, /data-collapse="rep-insights"[^>]*data-collapse-default="closed"/, 'Workspace status should default to collapsed');
assert.match(html, /data-collapse="rep-health"[^>]*data-collapse-default="closed"/, 'Todo health should default to collapsed');
assert.match(html, /data-collapse="rep-donut"[^>]*data-collapse-default="closed"/, 'Project analytics should default to collapsed');
assert.doesNotMatch(html, /data-collapse="rep-review"[^>]*data-collapse-default="closed"/, 'Daily review should remain open by default');
assert.match(html, /data-collapse="rep-insights"[\s\S]*data-collapse="rep-health"[\s\S]*data-collapse="rep-review"[\s\S]*data-collapse="rep-donut"/, 'Report panels should put the important sections first');
assert.match(html, /data-collapse="rep-todo-tracker"[\s\S]*data-collapse-default="closed"/, 'Todo Tracker should default to collapsed');
assert.match(html, /data-collapse-body="rep-todo-tracker"/, 'Todo Tracker should have a collapsible body');
assert.match(html, /data-review-mode="calendar"[^>]*active|class="btn-sm active"[^>]*data-review-mode="calendar"/, 'Calendar should be the default review mode');
assert.doesNotMatch(html, /id="byDay"/, 'Report should not render a separate daily trend panel');
assert.match(options, /buildProjectTrendData/, 'Report should build the fused project trend data');
assert.match(options, /data-trend-date/, 'Report should wire date hover interaction');
assert.match(options, /highlightProjectId/, 'Project selection should highlight without changing the data range');
assert.match(options, /trendOverview/, 'Report should show a useful summary before hover');
assert.match(options, /focusReportEntry/, 'Report should navigate directly to work records');
assert.match(options, /focusReportTodo/, 'Report should navigate directly to Todo items');
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
assert.match(options, /需要注意/, 'Report should show actionable attention items');
assert.match(options, /專案狀況/, 'Report should show a scannable project status list');
assert.match(options, /查看完整專案報表/, 'Report should keep detailed project metrics behind an expandable section');
assert.match(options, /projectTrendDetail/, 'Report should have an expandable project detail panel');
assert.match(options, /createReportChartSection/, 'Report charts should be wrapped in independent collapse sections');
assert.match(options, /dataset\.reportChart = id/, 'Report chart sections should expose a collapse identity');
assert.match(options, /wrapReportChartContent/, 'Report charts should be grouped after rendering');
assert.match(options, /reportChartCollapsed/, 'Report chart collapse state should be tracked');
assert.match(options, /let reportChartCollapsed = new Set\(\['trend', 'heatmap', 'tracker'\]\)/, 'Report chart sections should default to collapsed');
assert.match(css, /\.report-chart-title/, 'Report chart collapse headings should have dedicated styles');
assert.match(css, /\.report-action-grid\s*\{/, 'Report should group actionable items in a compact grid');
assert.match(css, /\.report-project-row\s*\{/, 'Report should render projects as scannable status rows');
assert.match(css, /\.report-details-collapse\s*>\s*summary/, 'Detailed project metrics should be expandable');
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
assert.doesNotMatch(css, /\.review-calendar\s*\{\s*overflow:\s*visible;\s*\}/, 'Calendar should not override horizontal scrolling');
assert.match(collapse, /collapseDefault/, 'Collapse should support a default closed state');
assert.match(css, /\.markdown-editor-toolbar\s*\{/, 'Markdown fields should render an editor toolbar');
assert.match(editor, /data-markdown-command/, 'Markdown toolbar controls should be discoverable');
assert.match(options, /mountMarkdownEditor/, 'Options should mount the native Markdown block editor');
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
