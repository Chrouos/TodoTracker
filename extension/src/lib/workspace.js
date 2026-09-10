import { flattenTree } from './tree.js';

export function sortProjectsByRecentActivity(projects, entries, tasks = []) {
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const latestActivity = new Map(projects.map((project) => [project.id, null]));

  const updateProjectAndAncestors = (projectId, timestamp) => {
    let project = projectById.get(projectId);
    const visited = new Set();
    while (project && !visited.has(project.id)) {
      visited.add(project.id);
      const current = latestActivity.get(project.id);
      if (!current || String(timestamp) > String(current)) latestActivity.set(project.id, timestamp);
      project = project.parentId ? projectById.get(project.parentId) : null;
    }
  };

  entries
    .filter((entry) => !entry.deletedAt && entry.endedAt)
    .forEach((entry) => {
      const projectId = entry.projectId || taskById.get(entry.taskId)?.projectId;
      if (projectId && entry.endedAt) updateProjectAndAncestors(projectId, entry.endedAt);
    });

  return flattenTree(projects).map((project) => ({
    ...project,
    latestActivity: latestActivity.get(project.id) || null,
  })).sort((a, b) => {
    if (a.latestActivity && b.latestActivity) {
      const recent = String(b.latestActivity).localeCompare(String(a.latestActivity));
      if (recent) return recent;
    } else if (a.latestActivity) {
      return -1;
    } else if (b.latestActivity) {
      return 1;
    }
    return a.path.join('/').localeCompare(b.path.join('/'));
  });
}
