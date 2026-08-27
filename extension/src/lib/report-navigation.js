const ENTRY_ACTIONS = new Set(['missing-notes', 'unclassified', 'unlinked']);

function normalizedFocus(focus) {
  return {
    entryId: focus?.entryId || null,
    todoId: focus?.todoId || null,
  };
}

export function clearReportFocus(focus) {
  return { ...normalizedFocus(focus), entryId: null, todoId: null };
}

export function setReportFocus(focus, type, id) {
  if (type === 'entry') return { ...normalizedFocus(focus), entryId: id || null, todoId: null };
  if (type === 'todo') return { ...normalizedFocus(focus), entryId: null, todoId: id || null };
  return clearReportFocus(focus);
}

export function hasReportFocus(focus) {
  return Boolean(focus?.entryId || focus?.todoId);
}

export function reportActionTarget(kind) {
  if (ENTRY_ACTIONS.has(kind)) return { tab: 'entries', type: 'entry' };
  if (kind === 'overdue') return { tab: 'todos', type: 'todo' };
  return null;
}
