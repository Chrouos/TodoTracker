import assert from 'node:assert/strict';
import {
  buildProjectTrendData,
  buildProjectDetailData,
} from '../src/lib/project-trend.js';
import { donutSVG, heatmapSVG, lineSVG, stackedAreaSVG } from '../src/lib/charts.js';

const projects = [
  { id: 'project-a', parentId: null, name: '專案 A', color: '#61b5dc' },
  { id: 'project-a-child', parentId: 'project-a', name: '子專案 A', color: '#ff9c9f' },
  { id: 'project-b', parentId: null, name: '專案 B', color: '#252323' },
];
const entries = [
  { id: 'a-direct', projectId: 'project-a', startedAt: '2026-08-10T09:00:00Z', seconds: 3600 },
  { id: 'a-child', projectId: 'project-a-child', startedAt: '2026-08-10T10:00:00Z', seconds: 7200 },
  { id: 'b', projectId: 'project-b', startedAt: '2026-08-11T09:00:00Z', seconds: 1800 },
  { id: 'unclassified', projectId: null, startedAt: '2026-08-10T13:00:00Z', seconds: 900 },
];
const tasks = [
  { id: 'task-child', projectId: 'project-a-child', title: '子專案工作', status: 'doing' },
  { id: 'task-done', projectId: 'project-a', title: '已完成工作', status: 'done' },
];

const data = buildProjectTrendData({
  entries,
  projects,
  dates: ['2026-08-10', '2026-08-11'],
  durationSec: (entry) => entry.seconds,
});

assert.deepEqual(data.dates, ['2026-08-10', '2026-08-11']);
assert.deepEqual(data.dailyTotals, [11700, 1800]);
assert.equal(data.series.find((series) => series.id === 'project-a').values[0], 10800);
assert.equal(data.series.find((series) => series.id === null).values[0], 900);
const detail = buildProjectDetailData({
  entries: [
    ...entries,
    { id: 'task-entry', projectId: null, taskId: 'task-child', startedAt: '2026-08-11T10:00:00Z', seconds: 1800 },
  ],
  projects,
  tasks,
  projectId: 'project-a',
  dates: ['2026-08-10', '2026-08-11'],
  durationSec: (entry) => entry.seconds,
});
assert.equal(detail.totalSeconds, 12600);
assert.equal(detail.totalEntries, 3);
assert.deepEqual(detail.dailyTotals, [10800, 1800]);
assert.equal(detail.tasksDone, 1);
assert.equal(detail.tasksTotal, 2);
assert.deepEqual(detail.projectSeries.map(({ id, seconds }) => ({ id, seconds })), [
  { id: 'project-a-child', seconds: 9000 },
  { id: 'project-a', seconds: 3600 },
]);

const stacked = stackedAreaSVG(data);
const heatmap = heatmapSVG(data);
const line = lineSVG({ dates: data.dates, values: data.dailyTotals });
const donut = donutSVG([
  { label: '已完成', value: 3, color: '#22c55e' },
  { label: '進行中', value: 2, color: '#60a5fa' },
  { label: '待辦', value: 1, color: '#d6d3d1' },
]);
const interactiveDonut = donutSVG([{ id: 'done', label: 'Done', value: 1, color: '#22c55e' }]);
assert.match(stacked, /role="img"/);
assert.match(stacked, /data-trend-date="2026-08-10"/);
assert.match(stacked, /<title>/);
const polygons = [...stacked.matchAll(/<polygon[^>]+points="([^"]+)"/g)]
  .map((match) => match[1].split(' ').map((point) => point.split(',').map(Number)));
assert.deepEqual(polygons[1].slice(-2), [[742, 226], [48, 71.5]],
  'stacked area polygons should reverse both x and y coordinates for the lower edge');
assert.match(heatmap, /role="img"/);
assert.match(heatmap, /data-trend-date="2026-08-11"/);
assert.match(heatmap, /data-project-id="project-a"/);
assert.match(heatmap, /專案 A/);
assert.match(heatmap, />3h 00m</, 'Heatmap cell labels should use a compact duration format');
assert.doesNotMatch(heatmap, /class="heatmap-cell-text"[^>]*>[^<]*(?:小時|分)/, 'Heatmap cell labels should not overflow with the full duration format');
assert.match(line, /class="workspace-process-svg"/);
assert.match(line, /<polyline[^>]+stroke="var\(--ink\)"/);
assert.match(line, /data-process-date="2026-08-10"/);
assert.match(line, /<circle[^>]+data-process-date="2026-08-11"/);
assert.match(line, /<title>/);
assert.match(donut, /class="todo-health-donut-svg"/);
assert.match(donut, /stroke-dasharray=/);
assert.match(donut, /已完成/);
assert.match(donut, /role="img"/);
assert.match(interactiveDonut, /data-todo-health-status="done"/);
assert.match(interactiveDonut, /tabindex="0"/);

const empty = buildProjectTrendData({
  entries: [], projects, dates: [], durationSec: () => 0,
});
assert.match(stackedAreaSVG(empty), /沒有可顯示的資料/);
assert.match(heatmapSVG(empty), /沒有可顯示的資料/);
assert.match(lineSVG({ dates: [], values: [] }), /沒有可顯示的資料/);

const overnight = buildProjectTrendData({
  entries: [{
    id: 'overnight', projectId: 'project-a',
    startedAt: '2026-08-10T23:30:00+08:00', endedAt: '2026-08-11T01:30:00+08:00',
  }],
  projects,
  dates: ['2026-08-10', '2026-08-11'],
  durationSec: (entry) => entry.seconds ?? 0,
});
assert.deepEqual(overnight.dailyTotals, [1800, 5400]);

console.log('report trend contract passed');
