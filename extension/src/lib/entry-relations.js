export function projectIdForTask(taskId, tasks, currentProjectId) {
  const task = tasks.find((item) => item.id === taskId);
  return task ? (task.projectId || '') : currentProjectId;
}

export function tasksForProject(tasks, projectId) {
  return tasks.filter((task) => !projectId || task.projectId === projectId);
}

function timestampMs(value) {
  const ms = Date.parse(value || '');
  return Number.isFinite(ms) ? ms : -Infinity;
}

export function sortTasksForManualEntry(tasks, entries = []) {
  const entryActivity = new Map();
  for (const entry of entries) {
    if (!entry.taskId || entry.deletedAt) continue;
    const activity = Math.max(
      timestampMs(entry.updatedAt),
      timestampMs(entry.endedAt),
      timestampMs(entry.startedAt),
    );
    entryActivity.set(entry.taskId, Math.max(entryActivity.get(entry.taskId) ?? -Infinity, activity));
  }

  return tasks
    .map((task, index) => ({
      task,
      index,
      isDone: task.status === 'done',
      activity: Math.max(
        timestampMs(task.updatedAt),
        timestampMs(task.completedAt),
        timestampMs(task.createdAt),
        timestampMs(task.openedAt),
        entryActivity.get(task.id) ?? -Infinity,
      ),
    }))
    .sort((left, right) => (left.isDone - right.isDone)
      || (right.activity - left.activity)
      || (left.index - right.index))
    .map(({ task }) => task);
}
