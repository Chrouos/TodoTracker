import test from 'node:test';
import assert from 'node:assert/strict';
import { entriesForTask } from './tasks.js';

test('returns completed work records for a todo, newest first', () => {
  const result = entriesForTask(
    { id: 'task-1' },
    [
      { id: 'old', taskId: 'task-1', startedAt: '2026-08-01T09:00:00.000Z', endedAt: '2026-08-01T10:00:00.000Z' },
      { id: 'deleted', taskId: 'task-1', startedAt: '2026-08-03T09:00:00.000Z', endedAt: '2026-08-03T10:00:00.000Z', deletedAt: '2026-08-03T10:00:00.000Z' },
      { id: 'new', taskId: 'task-1', startedAt: '2026-08-05T09:00:00.000Z', endedAt: '2026-08-05T10:00:00.000Z' },
      { id: 'other', taskId: 'task-2', startedAt: '2026-08-06T09:00:00.000Z', endedAt: '2026-08-06T10:00:00.000Z' },
    ],
  );

  assert.deepEqual(result.map((entry) => entry.id), ['new', 'old']);
});
