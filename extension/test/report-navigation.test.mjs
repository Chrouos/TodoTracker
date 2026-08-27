import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearReportFocus,
  hasReportFocus,
  reportActionTarget,
  setReportFocus,
} from '../src/lib/report-navigation.js';

test('reportActionTarget routes entry issues to records and overdue todos to todos', () => {
  assert.deepEqual(reportActionTarget('missing-notes'), { tab: 'entries', type: 'entry' });
  assert.deepEqual(reportActionTarget('unclassified'), { tab: 'entries', type: 'entry' });
  assert.deepEqual(reportActionTarget('unlinked'), { tab: 'entries', type: 'entry' });
  assert.deepEqual(reportActionTarget('overdue'), { tab: 'todos', type: 'todo' });
});

test('reportActionTarget leaves clear states without a navigation target', () => {
  assert.equal(reportActionTarget('clear'), null);
  assert.equal(reportActionTarget('unknown'), null);
});

test('report focus keeps one target and clears it for ordinary navigation', () => {
  const empty = { entryId: null, todoId: null };
  const entryFocus = setReportFocus(empty, 'entry', 'entry-1');
  assert.deepEqual(entryFocus, { entryId: 'entry-1', todoId: null });
  assert.equal(hasReportFocus(entryFocus), true);

  const todoFocus = setReportFocus(entryFocus, 'todo', 'todo-1');
  assert.deepEqual(todoFocus, { entryId: null, todoId: 'todo-1' });
  assert.deepEqual(clearReportFocus(todoFocus), empty);
  assert.equal(hasReportFocus(empty), false);
});
