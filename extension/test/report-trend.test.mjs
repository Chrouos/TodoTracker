import assert from 'node:assert/strict';
import {
  buildProjectTrendData,
  formatTrendSeconds,
} from '../src/lib/project-trend.js';
import { heatmapSVG, stackedAreaSVG } from '../src/lib/charts.js';

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
assert.equal(formatTrendSeconds(11700), '3h 15m');

const focused = buildProjectTrendData({
  entries,
  projects,
  dates: ['2026-08-10', '2026-08-11'],
  durationSec: (entry) => entry.seconds,
  focusId: 'project-a',
});
assert.deepEqual(focused.series.map((series) => series.name), ['子專案 A', '專案 A（直接）']);
assert.deepEqual(focused.dailyTotals, [10800, 0]);

const stacked = stackedAreaSVG(data);
const heatmap = heatmapSVG(data);
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

const empty = buildProjectTrendData({
  entries: [], projects, dates: [], durationSec: () => 0,
});
assert.match(stackedAreaSVG(empty), /沒有可顯示的資料/);
assert.match(heatmapSVG(empty), /沒有可顯示的資料/);

console.log('report trend contract passed');
