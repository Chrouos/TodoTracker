import assert from 'node:assert/strict';
import test from 'node:test';
import {
  overlapSeconds,
  buildReportQuality,
  buildProjectTaskMetrics,
  buildProjectTodoStatusMetrics,
  buildProjectMetricChartData,
  buildReportActionItems,
  buildWorkspaceTodoProgress,
  buildProjectHealthRows,
  compareSeconds,
} from '../src/lib/report-metrics.js';

const entry = (overrides = {}) => ({
  id: 'entry-1',
  projectId: null,
  taskId: null,
  tagIds: [],
  description: '',
  notes: '',
  startedAt: '2026-08-20T23:30:00+08:00',
  endedAt: '2026-08-21T01:30:00+08:00',
  deletedAt: null,
  ...overrides,
});

test('overlapSeconds splits an overnight entry at local day boundaries', () => {
  const overnight = entry();
  assert.equal(overlapSeconds(overnight, '2026-08-20', '2026-08-20'), 1800);
  assert.equal(overlapSeconds(overnight, '2026-08-21', '2026-08-21'), 5400);
});

test('buildReportQuality counts unclassified, missing-note, and unlinked-task work', () => {
  const entries = [
    entry({ id: 'unclassified', endedAt: '2026-08-20T23:45:00+08:00' }),
    entry({
      id: 'linked', projectId: 'p1', taskId: 't1', notes: 'done',
      startedAt: '2026-08-21T09:00:00+08:00', endedAt: '2026-08-21T11:00:00+08:00',
    }),
    entry({
      id: 'missing-note', projectId: 'p1',
      startedAt: '2026-08-21T13:00:00+08:00', endedAt: '2026-08-21T14:00:00+08:00',
    }),
  ];
  const tasks = [
    { id: 't1', status: 'doing', dueDate: '2026-08-19' },
    { id: 't2', status: 'todo', dueDate: '2026-08-20' },
  ];

  assert.deepEqual(buildReportQuality(entries, tasks, '2026-08-21'), {
    unclassifiedSeconds: 900,
    missingNotesCount: 2,
    unlinkedTaskSeconds: 3600,
    overdueTodoCount: 2,
    overdueTaskIds: ['t1', 't2'],
    unclassifiedEntryIds: ['unclassified'],
    missingNotesEntryIds: ['unclassified', 'missing-note'],
    unlinkedTaskEntryIds: ['missing-note'],
  });
});

test('buildProjectTaskMetrics reports completion, work, and overdue state by project', () => {
  const tasks = [
    { id: 't1', projectId: 'p1', status: 'done', openedAt: '2026-08-18T09:00:00+08:00', completedAt: '2026-08-20T09:00:00+08:00', dueDate: '2026-08-21' },
    { id: 't2', projectId: 'p1', status: 'todo', openedAt: '2026-08-19T09:00:00+08:00', completedAt: null, dueDate: '2026-08-20' },
  ];
  const entries = [
    entry({ id: 'work-1', projectId: 'p1', taskId: 't1', startedAt: '2026-08-20T10:00:00+08:00', endedAt: '2026-08-20T12:00:00+08:00' }),
    entry({ id: 'work-2', projectId: 'p1', taskId: 't2', startedAt: '2026-08-21T10:00:00+08:00', endedAt: '2026-08-21T11:00:00+08:00' }),
    entry({ id: 'work-direct', projectId: 'p1', startedAt: '2026-08-21T11:00:00+08:00', endedAt: '2026-08-21T12:00:00+08:00' }),
  ];

  assert.deepEqual(buildProjectTaskMetrics(tasks, entries, '2026-08-21'), [{
    projectId: 'p1',
    total: 2,
    done: 1,
    completionRate: 0.5,
    overdue: 1,
    workedSeconds: 14400,
    averageLeadMs: 172800000,
  }]);
});

test('compareSeconds returns a safe percentage when the previous period is empty', () => {
  assert.deepEqual(compareSeconds(10 * 3600, 8 * 3600), {
    deltaSeconds: 7200,
    percent: 25,
  });
  assert.deepEqual(compareSeconds(3600, 0), {
    deltaSeconds: 3600,
    percent: null,
  });
});

test('buildProjectTodoStatusMetrics counts each Todo status by project', () => {
  const tasks = [
    { id: 'done', projectId: 'p1', status: 'done' },
    { id: 'doing', projectId: 'p1', status: 'doing' },
    { id: 'todo', projectId: 'p2', status: 'todo' },
    { id: 'archived', projectId: 'p2', status: 'archived' },
  ];

  assert.deepEqual(buildProjectTodoStatusMetrics(tasks), [
    { projectId: 'p1', total: 2, done: 1, doing: 1, todo: 0 },
    { projectId: 'p2', total: 1, done: 0, doing: 0, todo: 1 },
  ]);
});

test('buildProjectMetricChartData prepares comparable completion, work, and lead charts', () => {
  const metrics = [
    { projectId: 'slow', total: 4, done: 1, completionRate: 0.25, workedSeconds: 3600, averageLeadMs: 4 * 86400000 },
    { projectId: 'fast', total: 8, done: 8, completionRate: 1, workedSeconds: 7200, averageLeadMs: 86400000 },
    { projectId: null, total: 2, done: 0, completionRate: 0, workedSeconds: 0, averageLeadMs: null },
  ];

  assert.deepEqual(buildProjectMetricChartData(metrics), {
    completion: [
      { projectId: null, value: 0, percentage: 0 },
      { projectId: 'slow', value: 0.25, percentage: 25 },
      { projectId: 'fast', value: 1, percentage: 100 },
    ],
    worked: [
      { projectId: 'fast', value: 7200, percentage: 100 },
      { projectId: 'slow', value: 3600, percentage: 50 },
    ],
    lead: [
      { projectId: 'slow', value: 4 * 86400000, percentage: 100 },
      { projectId: 'fast', value: 86400000, percentage: 25 },
    ],
  });
});

test('buildReportQuality keeps entry ids for actionable data issues', () => {
  const quality = buildReportQuality([
    entry({ id: 'missing-note', projectId: 'p1', taskId: 't1' }),
    entry({ id: 'unlinked', projectId: 'p1' }),
    entry({ id: 'unclassified' }),
  ], [], '2026-08-21');

  assert.deepEqual(quality.missingNotesEntryIds, ['missing-note', 'unlinked', 'unclassified']);
  assert.deepEqual(quality.unlinkedTaskEntryIds, ['unlinked']);
  assert.deepEqual(quality.unclassifiedEntryIds, ['unclassified']);
});

test('buildReportActionItems puts actionable data issues before informational ones', () => {
  assert.deepEqual(buildReportActionItems({
    overdueTodoCount: 2,
    unlinkedTaskSeconds: 3600,
    unclassifiedSeconds: 900,
    missingNotesCount: 1,
  }), [
    { kind: 'overdue', tone: 'danger', label: '逾期 Todo', value: 2 },
    { kind: 'unlinked', tone: 'warning', label: '未綁定 Todo', value: 3600 },
    { kind: 'unclassified', tone: 'warning', label: '未分類工時', value: 900 },
    { kind: 'missing-notes', tone: 'muted', label: '未填寫工作備註', value: 1 },
  ]);
});

test('buildReportActionItems returns a clear state when there is nothing to fix', () => {
  assert.deepEqual(buildReportActionItems({
    overdueTodoCount: 0,
    unlinkedTaskSeconds: 0,
    unclassifiedSeconds: 0,
    missingNotesCount: 0,
  }), [
    { kind: 'clear', tone: 'success', label: '目前沒有待處理項目', value: 0 },
  ]);
});

test('buildWorkspaceTodoProgress reflects Todo completion changes', () => {
  assert.deepEqual(buildWorkspaceTodoProgress([
    { total: 10, done: 9 },
    { total: 4, done: 2 },
  ]), { done: 11, total: 14 });
  assert.deepEqual(buildWorkspaceTodoProgress([
    { total: 10, done: 10 },
    { total: 4, done: 2 },
  ]), { done: 12, total: 14 });
});

test('buildProjectHealthRows sorts projects by attention before workload', () => {
  const metrics = [
    { projectId: 'busy', total: 8, done: 7, completionRate: 0.875, overdue: 0, workedSeconds: 7200, averageLeadMs: 86400000 },
    { projectId: 'late', total: 2, done: 1, completionRate: 0.5, overdue: 1, workedSeconds: 1800, averageLeadMs: 86400000 },
    { projectId: 'slow', total: 4, done: 1, completionRate: 0.25, overdue: 0, workedSeconds: 3600, averageLeadMs: 8 * 86400000 },
  ];

  assert.deepEqual(buildProjectHealthRows(metrics).map((row) => ({
    projectId: row.projectId,
    status: row.status,
    tone: row.tone,
    remaining: row.remaining,
  })), [
    { projectId: 'late', status: '逾期', tone: 'danger', remaining: 1 },
    { projectId: 'slow', status: '進度偏低', tone: 'warning', remaining: 3 },
    { projectId: 'busy', status: '進行中', tone: 'muted', remaining: 1 },
  ]);
});
