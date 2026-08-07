export function removeProjectData(id, { projects, tasks, entries }) {
  const target = projects.find((project) => project.id === id);
  const deletedTaskIds = new Set(tasks.filter((task) => task.projectId === id).map((task) => task.id));
  return {
    projects: projects
      .filter((project) => project.id !== id)
      .map((project) => project.parentId === id
        ? { ...project, parentId: target?.parentId || null }
        : project),
    tasks: tasks.filter((task) => task.projectId !== id),
    entries: entries.map((entry) => ({
      ...entry,
      projectId: entry.projectId === id ? null : entry.projectId,
      taskId: deletedTaskIds.has(entry.taskId) ? null : entry.taskId,
    })),
  };
}
