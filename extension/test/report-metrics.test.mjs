import assert from 'node:assert/strict';
import test from 'node:test';
import {
  overlapSeconds,
  buildReportQuality,
  buildProjectTaskMetrics,
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
  ];

  assert.deepEqual(buildProjectTaskMetrics(tasks, entries, '2026-08-21'), [{
    projectId: 'p1',
    total: 2,
    done: 1,
    completionRate: 0.5,
    overdue: 1,
    workedSeconds: 10800,
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
