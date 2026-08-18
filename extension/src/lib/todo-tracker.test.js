import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTodoTrackerData } from './todo-tracker.js';

const local = (value) => new Date(value);
const durationSec = (entry) => Math.max(0,
  Math.round((new Date(entry.endedAt) - new Date(entry.startedAt)) / 1000));

test('clamps a completed task lifecycle to the report window', () => {
  const result = buildTodoTrackerData({
    dates: ['2026-08-18', '2026-08-19', '2026-08-20'],
    now: local('2026-08-20T15:00:00'),
    tasks: [{
      id: 'task-a', title: 'A', projectId: 'project-a', status: 'done', notes: '',
      openedAt: '2026-08-17T23:00:00', completedAt: '2026-08-21T10:00:00',
    }],
    entries: [{
      id: 'entry-a', taskId: 'task-a', startedAt: '2026-08-17T23:00:00',
      endedAt: '2026-08-18T01:00:00', notes: '', description: 'A work',
    }],
    durationSec,
  });

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].visibleStart.getTime(), local('2026-08-18T00:00:00').getTime());
  assert.equal(result.items[0].visibleEnd.getTime(), local('2026-08-21T00:00:00').getTime());
  assert.equal(result.items[0].openedAt, '2026-08-17T23:00:00');
  assert.equal(result.items[0].endedAt, '2026-08-21T10:00:00');
  assert.equal(result.items[0].trackedSeconds, 3600);
  assert.equal(result.items[0].entries[0].seconds, 3600);
});

test('uses now for an active task and excludes a task with no entries', () => {
  const now = local('2026-08-20T15:00:00');
  const result = buildTodoTrackerData({
    dates: ['2026-08-18', '2026-08-19', '2026-08-20'],
    now,
    tasks: [
      {
        id: 'task-b', title: 'B', projectId: null, status: 'doing', notes: '',
        openedAt: '2026-08-19T09:00:00', completedAt: null,
      },
      {
        id: 'task-c', title: 'C', projectId: null, status: 'todo', notes: '',
        openedAt: '2026-08-20T10:00:00', completedAt: null,
      },
    ],
    entries: [{
      id: 'entry-b', taskId: 'task-b', startedAt: '2026-08-19T10:00:00',
      endedAt: '2026-08-19T11:00:00', notes: '', description: '',
    }],
    durationSec,
  });

  assert.deepEqual(result.items.map((item) => item.id), ['task-b']);
  assert.equal(result.items[0].visibleEnd.getTime(), now.getTime());
  assert.equal(result.items[0].trackedSeconds, 3600);
});

test('excludes archived tasks and tasks outside the report window', () => {
  const result = buildTodoTrackerData({
    dates: ['2026-08-18', '2026-08-19'],
    now: local('2026-08-20T15:00:00'),
    tasks: [
      {
        id: 'archived', title: 'Archived', status: 'archived',
        openedAt: '2026-08-18T09:00:00', completedAt: null,
      },
      {
        id: 'old', title: 'Old', status: 'done',
        openedAt: '2026-08-10T09:00:00', completedAt: '2026-08-12T09:00:00',
      },
    ],
    entries: [],
    durationSec,
  });

  assert.deepEqual(result.items, []);
});

test('sorts by opened time and clips entry work at both window boundaries', () => {
  const result = buildTodoTrackerData({
    dates: ['2026-08-18', '2026-08-19'],
    now: local('2026-08-19T18:00:00'),
    tasks: [
      {
        id: 'later', title: 'Later', status: 'todo', openedAt: '2026-08-18T12:00:00',
      },
      {
        id: 'earlier', title: 'Earlier', status: 'todo', openedAt: '2026-08-17T12:00:00',
      },
    ],
    entries: [
      {
        id: 'entry-earlier', taskId: 'earlier', startedAt: '2026-08-17T23:00:00',
        endedAt: '2026-08-18T01:00:00', notes: '', description: '',
      },
      {
        id: 'entry-later', taskId: 'later', startedAt: '2026-08-19T23:00:00',
        endedAt: '2026-08-20T01:00:00', notes: '', description: '',
      },
      {
        id: 'deleted', taskId: 'later', startedAt: '2026-08-18T10:00:00',
        endedAt: '2026-08-18T11:00:00', deletedAt: '2026-08-18T11:01:00', notes: '', description: '',
      },
      {
        id: 'open', taskId: 'later', startedAt: '2026-08-18T10:00:00',
        endedAt: null, notes: '', description: '',
      },
    ],
    durationSec,
  });

  assert.deepEqual(result.items.map((item) => item.id), ['earlier', 'later']);
  assert.equal(result.items[0].trackedSeconds, 3600);
  assert.equal(result.items[1].trackedSeconds, 3600);
  assert.equal(result.items[1].entries.length, 1);
});

test('derives the full history axis and keeps only tasks with tracked work', () => {
  const result = buildTodoTrackerData({
    now: local('2026-08-20T15:00:00'),
    tasks: [
      {
        id: 'task-worked', title: '金福氣', status: 'done',
        openedAt: '2026-08-17T09:00:00', completedAt: '2026-08-20T18:00:00',
      },
      {
        id: 'task-active', title: '日文', status: 'doing',
        openedAt: '2026-08-18T09:00:00', completedAt: null,
      },
      {
        id: 'task-empty', title: '沒有時間', status: 'todo',
        openedAt: '2026-08-17T09:00:00', completedAt: null,
      },
    ],
    entries: [
      {
        id: 'worked-1', taskId: 'task-worked', startedAt: '2026-08-17T10:00:00',
        endedAt: '2026-08-17T11:00:00', notes: '', description: '',
      },
      {
        id: 'worked-2', taskId: 'task-worked', startedAt: '2026-08-19T10:00:00',
        endedAt: '2026-08-19T11:30:00', notes: '', description: '',
      },
      {
        id: 'active-1', taskId: 'task-active', startedAt: '2026-08-18T14:00:00',
        endedAt: '2026-08-18T15:00:00', notes: '', description: '',
      },
    ],
    durationSec,
  });

  assert.deepEqual(result.dates, ['2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20']);
  assert.deepEqual(result.items.map((item) => item.id), ['task-worked', 'task-active']);
  assert.equal(result.items[0].lifecycleDays, 4);
  assert.equal(result.items[0].workedDays, 2);
  assert.equal(result.items[0].trackedSeconds, 9000);
  assert.equal(result.items[1].lifecycleDays, 3);
  assert.equal(result.items[1].workedDays, 1);
});

test('counts every calendar day touched by an overnight work entry', () => {
  const result = buildTodoTrackerData({
    now: local('2026-08-20T15:00:00'),
    tasks: [{
      id: 'overnight', title: 'Overnight', status: 'done',
      openedAt: '2026-08-18T23:00:00', completedAt: '2026-08-19T02:00:00',
    }],
    entries: [{
      id: 'overnight-entry', taskId: 'overnight', startedAt: '2026-08-18T23:30:00',
      endedAt: '2026-08-19T00:30:00', notes: '', description: '',
    }],
    durationSec,
  });

  assert.equal(result.items[0].workedDays, 2);
  assert.equal(result.items[0].trackedSeconds, 3600);
});

test('hides tracker work records that round down to 0m', () => {
  const result = buildTodoTrackerData({
    now: local('2026-08-20T15:00:00'),
    tasks: [{
      id: 'short-work', title: 'Short work', status: 'done',
      openedAt: '2026-08-18T09:00:00', completedAt: '2026-08-18T12:00:00',
    }],
    entries: [
      {
        id: 'zero-minute', taskId: 'short-work', startedAt: '2026-08-18T09:00:00',
        endedAt: '2026-08-18T09:00:20', notes: '', description: '',
      },
      {
        id: 'visible-minute', taskId: 'short-work', startedAt: '2026-08-18T10:00:00',
        endedAt: '2026-08-18T10:00:30', notes: '', description: '',
      },
    ],
    durationSec,
  });

  assert.deepEqual(result.items[0].entries.map((entry) => entry.id), ['visible-minute']);
  assert.equal(result.items[0].trackedSeconds, 30);
});

test('lays out actual work segments in separate lanes when they overlap', () => {
  const result = buildTodoTrackerData({
    now: local('2026-08-20T15:00:00'),
    tasks: [{
      id: 'overlap', title: 'Overlap', status: 'done',
      openedAt: '2026-08-17T09:00:00', completedAt: '2026-08-19T18:00:00',
    }],
    entries: [
      {
        id: 'work-a', taskId: 'overlap', startedAt: '2026-08-17T09:00:00',
        endedAt: '2026-08-17T10:00:00', notes: '', description: '',
      },
      {
        id: 'work-b', taskId: 'overlap', startedAt: '2026-08-17T09:30:00',
        endedAt: '2026-08-17T10:30:00', notes: '', description: '',
      },
      {
        id: 'work-c', taskId: 'overlap', startedAt: '2026-08-18T12:00:00',
        endedAt: '2026-08-18T13:00:00', notes: '', description: '',
      },
    ],
    durationSec,
  });

  assert.equal(result.items[0].laneCount, 2);
  assert.deepEqual(
    result.items[0].workSegments.map((segment) => [segment.id, segment.lane]),
    [['work-a', 0], ['work-b', 1], ['work-c', 0]],
  );
  assert.equal(result.items[0].workSegments[0].visibleStart.getTime(), local('2026-08-17T09:00:00').getTime());
  assert.equal(result.items[0].workSegments[2].visibleEnd.getTime(), local('2026-08-18T13:00:00').getTime());
});
