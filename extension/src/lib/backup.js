/** 資料只存在這台瀏覽器，隔太久沒備份就提醒。 */
const DAY_MS = 86400000;
export const BACKUP_INTERVAL_DAYS = 14;
export const BACKUP_SNOOZE_DAYS = 7;

/**
 * 該提醒時回傳 { days }；從來沒備份過時 days 是 null。不用提醒時回傳 null。
 * 還沒有紀錄就沒有東西要保護，從沒備份過則從最早的紀錄開始算。
 */
export function backupReminder({ lastBackupAt = null, snoozeUntil = null, oldestEntryAt = null, now = new Date() } = {}) {
  if (!oldestEntryAt) return null;
  const nowMs = new Date(now).getTime();
  if (snoozeUntil && nowMs < new Date(snoozeUntil).getTime()) return null;
  const days = Math.floor((nowMs - new Date(lastBackupAt || oldestEntryAt).getTime()) / DAY_MS);
  if (days < BACKUP_INTERVAL_DAYS) return null;
  return { days: lastBackupAt ? days : null };
}

export function backupSnoozeUntil(now = new Date()) {
  return new Date(new Date(now).getTime() + BACKUP_SNOOZE_DAYS * DAY_MS).toISOString();
}
