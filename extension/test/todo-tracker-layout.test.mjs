import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../src/options/options.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/options/options.css', import.meta.url), 'utf8');
const options = await readFile(new URL('../src/options/options.js', import.meta.url), 'utf8');

assert.match(html, /id="projectHeatmap"/, 'Report should keep the project heatmap mount point');
assert.match(html, /id="todoTracker"/, 'Report should provide a Todo tracker mount point');
assert.match(html, /id="todoTrackerDetail"/, 'Report should provide a Todo tracker detail mount point');
assert.match(options, /from ['"]\.\.\/lib\/todo-tracker\.js['"]/, 'Report should import Todo tracker data');
assert.match(options, /const trackerEntries = S\.entries\.filter/, 'Todo tracker should receive complete ended entries');
assert.match(options, /renderProjectTrend\(trendEntries, trendDates, trackerEntries\)/, 'Project trend and Todo tracker should use separate entry ranges');
assert.match(options, /renderTodoTracker\(trackerEntries\)/, 'Todo tracker should derive its own full-history range');
assert.match(options, /lifecycleDays|workedDays/, 'Todo tracker should expose cross-day work statistics');
assert.match(options, /data-todo-tracker-id/, 'Todo tracker bars should expose their Todo id');
assert.match(options, /todo-tracker-work/, 'Todo tracker should render actual work segments');
assert.match(options, /todo-tracker-lifecycle/, 'Todo tracker should render the Todo lifecycle separately');
assert.match(options, /workedDates/, 'Todo tracker should render one cell for each worked date');
assert.match(options, /--todo-day/, 'Todo tracker work cells should be positioned by calendar day');
assert.match(options, /todoTrackerColor\(project\)/, 'Todo tracker should use the Todo project color');
assert.match(options, /--todo-color/, 'Todo tracker should pass the project color to its cells');
assert.doesNotMatch(options, /showSegmentLabel/, 'Date cells should not display work duration labels');
assert.match(options, /let todoTrackerFilter = ['"]active['"]/, 'Todo tracker should hide completed items by default');
assert.match(options, /data-todo-tracker-filter/, 'Todo tracker should expose a status filter');
assert.match(options, /item\.status !== ['"]done['"]|item\.status === ['"]done['"]/, 'Todo tracker should filter completed items by status');
assert.match(options, /todoTrackerVisibleDays|visibleDays/, 'Todo tracker should calculate visible dates from the viewport');
assert.match(options, /data-todo-tracker-shift="-1"|data-todo-tracker-shift='-1'/, 'Todo tracker should navigate one day backward');
assert.match(options, /data-todo-tracker-shift="-7"|data-todo-tracker-shift='-7'/, 'Todo tracker should navigate one week backward');
assert.match(options, /data-todo-tracker-today/, 'Todo tracker should provide a today navigation action');
assert.match(options, /data-todo-tracker-range/, 'Todo tracker should expose the visible date range');
assert.match(options, /data-todo-tracker-close/, 'Todo tracker should expose a detail close action');
assert.match(options, /setInterval\([^\n]*60000|setInterval\([\s\S]{0,160}60000/, 'Todo tracker should refresh every 60 seconds');
assert.match(css, /\.todo-tracker\s*\{/, 'Todo tracker should have dedicated layout styles');
assert.match(css, /\.todo-tracker\s*\{[^}]*overflow:\s*hidden/s, 'Todo tracker should not display a horizontal scrollbar');
assert.match(css, /\.todo-tracker-axis\s*>\s*div\s*\{[^}]*grid-template-columns:\s*repeat\(var\(--todo-tracker-days\)/s, 'Todo tracker dates should fit the current viewport');
assert.match(css, /\.todo-tracker-work\s*\{[^}]*var\(--todo-day\)/s, 'Todo tracker cells should be positioned by day index');
assert.match(css, /\.todo-tracker-work\s*\{[^}]*width:\s*calc\(100% \/ var\(--todo-tracker-days\)/s, 'Todo tracker cells should fill one date column');
assert.doesNotMatch(css, /\.todo-tracker-work\s*\{[^}]*var\(--todo-width\)/s, 'Todo tracker cells should not use work duration width');
assert.match(css, /\.project-heatmap-svg \.heatmap-cell\.is-hovered rect\s*\{[^}]*stroke:\s*(?!var\(--ink\))/s,
  'Heatmap hover should not use the heavy black ink outline');

console.log('todo tracker layout contract passed');
