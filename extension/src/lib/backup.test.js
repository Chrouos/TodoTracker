import test from 'node:test';
import assert from 'node:assert/strict';
import { backupReminder, backupSnoozeUntil } from './backup.js';

const now = new Date('2026-11-02T12:00:00Z');
const daysAgo = (days) => new Date(now.getTime() - days * 86400000).toISOString();

test('stays quiet while there is nothing to protect or the backup is recent', () => {
  assert.equal(backupReminder({ now }), null);
  assert.equal(backupReminder({ oldestEntryAt: daysAgo(100), lastBackupAt: daysAgo(13), now }), null);
  assert.equal(backupReminder({ oldestEntryAt: daysAgo(13), now }), null);
});

test('reminds once the last backup is two weeks old', () => {
  assert.deepEqual(backupReminder({ oldestEntryAt: daysAgo(100), lastBackupAt: daysAgo(14), now }), { days: 14 });
});

test('counts from the oldest entry when there has never been a backup', () => {
  assert.deepEqual(backupReminder({ oldestEntryAt: daysAgo(14), now }), { days: null });
});

test('a snooze silences the reminder until it runs out', () => {
  const snoozeUntil = backupSnoozeUntil(now);
  const input = { oldestEntryAt: daysAgo(100), lastBackupAt: daysAgo(30), snoozeUntil };
  assert.equal(backupReminder({ ...input, now }), null);
  assert.equal(backupReminder({ ...input, now: new Date(now.getTime() + 6 * 86400000) }), null);
  assert.deepEqual(backupReminder({ ...input, now: new Date(now.getTime() + 7 * 86400000) }), { days: 37 });
});
