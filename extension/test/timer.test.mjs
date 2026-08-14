import assert from 'node:assert/strict';

const storage = {};
globalThis.chrome = {
  storage: {
    local: {
      async get(key) { return { [key]: storage[key] }; },
      async set(patch) { Object.assign(storage, patch); },
      async remove(key) { delete storage[key]; },
    },
  },
};

const {
  listTasks, startTimer, stopTimer, upsertTask,
} = await import('../src/lib/db.js');

await upsertTask({ id: 'task-complete', title: '完成測試', status: 'doing' });
await startTimer({
  taskId: 'task-complete',
  description: '工作描述',
  notes: '當下紀錄',
});
const completedEntry = await stopTimer(null, 0, { completeTask: true });

assert.equal(completedEntry.taskId, 'task-complete');
assert.equal(completedEntry.notes, '當下紀錄');
assert.equal((await listTasks()).find((t) => t.id === 'task-complete').status, 'done');

await upsertTask({ id: 'task-keep', title: '保留測試', status: 'doing' });
await startTimer({ taskId: 'task-keep', description: '另一段工作' });
await stopTimer(null, 0, { completeTask: false });

assert.equal((await listTasks()).find((t) => t.id === 'task-keep').status, 'doing');

console.log('timer completion contract passed');
