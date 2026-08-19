import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../src/options/options.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/options/options.css', import.meta.url), 'utf8');

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
const options = await readFile(new URL('../src/options/options.js', import.meta.url), 'utf8');
assert.match(options, /projectIdForTask/, 'Entry Todo selection should synchronize its project');
assert.match(options, /enTask.*addEventListener\('change'/, 'Entry Todo selection should update the project selector');
assert.match(options, /tasksForProject/, 'Manual entry Todo options should use the selected project');
assert.match(options, /sortTasksForManualEntry/, 'Manual entry Todo options should prioritize recent activity');
assert.match(options, /enProject.*addEventListener\('change'/, 'Manual entry project changes should refresh Todo options');
assert.match(options, /class="project-list-head"/, 'Project list should expose readable column labels');
assert.match(options, /class="row-item project-row"/, 'Project list rows should have a dedicated layout class');
assert.match(options, /class="project-color"/, 'Project rows should show a prominent color marker');
assert.match(options, /class="project-hours"/, 'Project hours should have readable labels');
assert.match(options, /class="project-secondary-actions"/, 'Secondary project actions should be visually quieter');
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
assert.match(options, /filterTasks/, 'Todo should apply the shared task filter');
assert.match(options, /taskCountLabel/, 'Todo should use the informative task count');
assert.match(html, /id="byProject"[\s\S]*id="projectTrend"[\s\S]*id="projectHeatmap"/, 'Report should combine trend and heatmap in the project panel');
assert.doesNotMatch(html, /id="byDay"/, 'Report should not render a separate daily trend panel');
assert.match(options, /buildProjectTrendData/, 'Report should build the fused project trend data');
assert.match(options, /data-trend-date/, 'Report should wire date hover interaction');
assert.match(options, /highlightProjectId/, 'Project selection should highlight without changing the data range');
assert.match(options, /trendOverview/, 'Report should show a useful summary before hover');
assert.doesNotMatch(options, /focusId/, 'Report should not retain the removed drill-down state');
assert.doesNotMatch(options, /移動滑鼠到日期或儲存格查看明細/, 'Report should not use a meaningless hover placeholder');
assert.match(options, /buildProjectDetailData/, 'Project selection should render project detail data');
assert.match(options, /projectTrendDetail/, 'Report should have an expandable project detail panel');
assert.match(options, /createReportChartSection/, 'Report charts should be wrapped in independent collapse sections');
assert.match(options, /dataset\.reportChart = id/, 'Report chart sections should expose a collapse identity');
assert.match(options, /wrapReportChartContent/, 'Report charts should be grouped after rendering');
assert.match(options, /reportChartCollapsed/, 'Report chart collapse state should be tracked');
assert.match(css, /\.report-chart-title/, 'Report chart collapse headings should have dedicated styles');
assert.match(options, /review-calendar-tooltip/, 'Calendar hover should use a real tooltip element');
assert.doesNotMatch(options, /data-tooltip="\$\{esc\(tooltip\)\}"/, 'Calendar hover should not render tooltip content through attr()');
assert.match(options, /getTimer/, 'Management timer should load the shared timer');
assert.match(options, /completeTask/, 'Management timer should pass the completion choice when stopping');
assert.match(options, /const scrollY = window\.scrollY/, 'Management timer should capture scroll position before reload');
assert.match(options, /window\.scrollTo\(0, scrollY\)/, 'Management timer should restore scroll position after reload');
assert.match(options, /name === 'timer'[\s\S]*growTimerNotes\(\)/,
  'Management timer should recalculate notes height when its tab becomes visible');
assert.match(options, /if \(\$\('mgTimerNotes'\) !== document\.activeElement\) \$\('mgTimerNotes'\)\.value = current\.notes \|\| '';/,
  'Management timer should clear notes after stopping when the draft is empty');
assert.match(css, /\.timer-complete input\[type="checkbox"\]/,
  'Management timer checkbox should have compact custom styling');
assert.match(css, /\.timer-fields\s*\{[^}]*grid-template-columns:\s*2fr\s+1\.5fr\s+1\.5fr/s,
  'Management timer should give project and Todo selectors enough width');
assert.match(css, /\.timer-notes-field textarea\s*\{[^}]*min-height:\s*180px[^}]*overflow-y:\s*auto\s*!important/s,
  'Management timer notes should be larger and scrollable');
assert.match(options, /'› '\.repeat\(p\.depth\)/,
  'Management timer project options should use compact hierarchy labels');
console.log('options layout contract passed');
