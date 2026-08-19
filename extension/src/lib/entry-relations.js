export function projectIdForTask(taskId, tasks, currentProjectId) {
  const task = tasks.find((item) => item.id === taskId);
  return task ? (task.projectId || '') : currentProjectId;
}

export function tasksForProject(tasks, projectId) {
  return tasks.filter((task) => !projectId || task.projectId === projectId);
}
