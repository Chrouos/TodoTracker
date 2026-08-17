export function projectIdForTask(taskId, tasks, currentProjectId) {
  const task = tasks.find((item) => item.id === taskId);
  return task ? (task.projectId || '') : currentProjectId;
}
