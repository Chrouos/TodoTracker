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
assert.match(options, /data-todo-tracker-close/, 'Todo tracker should expose a detail close action');
assert.match(options, /setInterval\([^\n]*60000|setInterval\([\s\S]{0,160}60000/, 'Todo tracker should refresh every 60 seconds');
assert.match(css, /\.todo-tracker\s*\{/, 'Todo tracker should have dedicated layout styles');
assert.match(css, /\.project-heatmap-svg \.heatmap-cell\.is-hovered rect\s*\{[^}]*stroke:\s*(?!var\(--ink\))/s,
  'Heatmap hover should not use the heavy black ink outline');

console.log('todo tracker layout contract passed');
