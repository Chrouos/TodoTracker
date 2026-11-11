import assert from 'node:assert/strict';
import {
  buildProjectTrendData,
  buildProjectDetailData,
  buildProjectShare,
} from '../src/lib/project-trend.js';
import { lineSVG, stackedBarSVG } from '../src/lib/charts.js';
import { formatCompactDuration } from '../src/lib/i18n.js';
import { reviewDatesInRange } from '../src/lib/report-range.js';

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

const stacked = stackedBarSVG(data, 'zh-TW', { goalHours: 8 });
const line = lineSVG({ dates: data.dates, values: data.dailyTotals });
assert.match(stacked, /role="img"/);
assert.match(stacked, /data-trend-date="2026-08-10"/);
assert.match(stacked, /<title>/);
assert.match(stacked, /class="trend-goal-line"/);
assert.match(stacked, /目標 8h/);
assert.doesNotMatch(stackedBarSVG(data), /trend-goal-line/, 'no goal line when no goal is set');
assert.deepEqual(data.series.at(-1).id, null, 'unclassified time should stack on top, not at the base');

const widths = (svg) => [...svg.matchAll(/class="trend-segment"[^>]+width="([\d.]+)"/g)].map((match) => Number(match[1]));
const oneDay = buildProjectTrendData({
  entries: entries.slice(0, 1), projects, dates: ['2026-08-10'], durationSec: (entry) => entry.seconds,
});
assert.ok(widths(stackedBarSVG(oneDay)).length === 1 && widths(stackedBarSVG(oneDay))[0] > 0,
  'a single-day range should still draw a visible bar');
const manyDates = Array.from({ length: 60 }, (_, index) => new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10));
const many = stackedBarSVG({ ...data, dates: manyDates, dailyTotals: manyDates.map(() => 3600), detailsByDate: [], series: [{ id: 'a', name: 'A', color: '#111111', values: manyDates.map(() => 3600) }] }, 'zh-TW', { width: 500 });
assert.ok(many.includes('>03/01<'), 'the newest date should always be labelled');
assert.ok((many.match(/axis-label-sub/g) || []).length < 12, 'date labels should thin out instead of overlapping');
assert.ok(many.includes('viewBox="0 0 500 260"'), 'the chart should draw at its real width so text keeps its size');
assert.equal(new Set(stackedBarSVG(oneDay, 'en').match(/>[^<]*(?:Mon|Sun)[^<]*</g) || []).size, 1, 'weekday follows the locale');

const share = buildProjectShare({
  projects,
  items: [
    { projectId: 'project-a-child', seconds: 3600 },
    { projectId: 'project-a', seconds: 3600 },
    { projectId: null, seconds: 7200 },
    { projectId: 'project-b', seconds: 1800 },
    { projectId: 'deleted-project', seconds: 1800 },
    { projectId: 'project-b', seconds: 0 },
  ],
});
assert.equal(share.total, 18000, 'share total should match every tracked second');
assert.deepEqual(share.rows.map(({ id, seconds }) => [id, seconds]), [
  ['project-a', 7200], ['project-b', 1800], [null, 9000],
], 'child projects roll up, deleted projects count as unclassified, neutral rows go last');
assert.equal(share.rows[0].share, 0.4);
const folded = buildProjectShare({
  projects: Array.from({ length: 5 }, (_, index) => ({ id: `p${index}`, name: `P${index}`, color: '#111111' })),
  items: Array.from({ length: 5 }, (_, index) => ({ projectId: `p${index}`, seconds: (index + 1) * 60 })),
  limit: 3,
});
assert.deepEqual(folded.rows.map(({ id, seconds }) => [id, seconds]), [['p4', 300], ['p3', 240], ['other', 360]]);

assert.equal(formatCompactDuration(0), '0m');
assert.equal(formatCompactDuration(45 * 60), '45m');
assert.equal(formatCompactDuration(7200), '2h');
assert.equal(formatCompactDuration(4800), '1h 20m');

const reviewFrom = new Date(2026, 10, 5);
assert.deepEqual(reviewDatesInRange(['2026-11-04', '2026-11-05', '2026-11-06'], reviewFrom, new Date(2026, 10, 6)), ['2026-11-05'],
  'a one-day report must not list neighbouring days it has no data for');
assert.deepEqual(reviewDatesInRange(['2026-11-04', '2026-11-05'], new Date(0), null), ['2026-11-04', '2026-11-05']);

assert.match(line, /class="workspace-process-svg"/);
assert.match(line, /<polyline[^>]+stroke="var\(--ink\)"/);
assert.match(line, /data-process-date="2026-08-10"/);
assert.match(line, /<circle[^>]+data-process-date="2026-08-11"/);
assert.match(line, /<title>/);

const empty = buildProjectTrendData({
  entries: [], projects, dates: [], durationSec: () => 0,
});
assert.match(stackedBarSVG(empty), /沒有可顯示的資料/);
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
