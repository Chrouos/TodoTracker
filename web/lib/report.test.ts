import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildProjectTaskMetrics,
  buildReportQuality,
  filterReportEntries,
  splitEntryByDay,
} from './report';

test('splitEntryByDay preserves total seconds while splitting overnight work', () => {
  const result = splitEntryByDay({
    startedAt: '2026-08-20T23:30:00+08:00',
    endedAt: '2026-08-21T01:30:00+08:00',
  });

  assert.deepEqual(result, [
    { date: '2026-08-20', seconds: 1800 },
    { date: '2026-08-21', seconds: 5400 },
  ]);
});

test('filterReportEntries excludes unfinished and deleted records and applies dimensions', () => {
  const baseEntry = { clientEntryId: '', source: 'manual' as const, createdAt: '', updatedAt: '' };
  const entries = [
    {
      ...baseEntry,
      id: 'keep', projectId: 'p1', taskId: 't1', tagIds: ['tag-a'], description: 'Build', notes: '',
      startedAt: '2026-08-20T09:00:00+08:00', endedAt: '2026-08-20T10:00:00+08:00', deletedAt: null,
    },
    { ...baseEntry, id: 'other', projectId: 'p2', taskId: 't2', tagIds: ['tag-b'], description: 'Other', notes: '', startedAt: '2026-08-20T09:00:00+08:00', endedAt: '2026-08-20T10:00:00+08:00', deletedAt: null },
    { ...baseEntry, id: 'running', projectId: 'p1', taskId: 't1', tagIds: ['tag-a'], description: 'Running', notes: '', startedAt: '2026-08-20T09:00:00+08:00', endedAt: null, deletedAt: null },
    { ...baseEntry, id: 'deleted', projectId: 'p1', taskId: 't1', tagIds: ['tag-a'], description: 'Deleted', notes: '', startedAt: '2026-08-20T09:00:00+08:00', endedAt: '2026-08-20T10:00:00+08:00', deletedAt: '2026-08-20T11:00:00+08:00' },
  ];

  assert.deepEqual(filterReportEntries(entries, { projectId: 'p1', taskId: 't1', tagId: 'tag-a', query: 'build' }).map((entry) => entry.id), ['keep']);
});

test('Web report metrics expose quality and project Todo summaries', () => {
  const entries = [{
    clientEntryId: '', source: 'manual' as const, createdAt: '', updatedAt: '',
    id: 'e1', projectId: 'p1', taskId: null, tagIds: [], description: '', notes: '',
    startedAt: '2026-08-21T09:00:00+08:00', endedAt: '2026-08-21T10:00:00+08:00', deletedAt: null,
  }];
  const tasks = [{
    id: 't1', projectId: 'p1', title: 'Late', notes: '', status: 'todo' as const,
    openedAt: '2026-08-18T09:00:00+08:00', dueDate: '2026-08-20', completedAt: null,
    reopenCount: 0, sortOrder: 0, createdAt: '', updatedAt: '', dueTime: null, scheduleId: null,
  }];

  assert.equal(buildReportQuality(entries, tasks, '2026-08-21').unlinkedTaskSeconds, 3600);
  assert.equal(buildReportQuality(entries, tasks, '2026-08-21').overdueTodoCount, 1);
  assert.equal(buildProjectTaskMetrics(tasks, entries, '2026-08-21')[0].overdue, 1);
});
