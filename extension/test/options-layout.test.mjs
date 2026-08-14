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
const options = await readFile(new URL('../src/options/options.js', import.meta.url), 'utf8');
assert.match(options, /filterTasks/, 'Todo should apply the shared task filter');
assert.match(options, /taskCountLabel/, 'Todo should use the informative task count');
assert.match(html, /id="byProject"[\s\S]*id="projectTrend"[\s\S]*id="projectHeatmap"/, 'Report should combine trend and heatmap in the project panel');
assert.doesNotMatch(html, /id="byDay"/, 'Report should not render a separate daily trend panel');
assert.match(options, /buildProjectTrendData/, 'Report should build the fused project trend data');
assert.match(options, /data-trend-date/, 'Report should wire date hover interaction');
assert.match(options, /highlightProjectId/, 'Project selection should highlight without changing the data range');
assert.match(options, /trendOverview/, 'Report should show a useful summary before hover');
assert.doesNotMatch(options, /focusId = project\.dataset\.trendProject/, 'Project selection should not enter drill-down mode');
assert.doesNotMatch(options, /移動滑鼠到日期或儲存格查看明細/, 'Report should not use a meaningless hover placeholder');
console.log('options layout contract passed');
