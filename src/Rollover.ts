import { Notice } from 'obsidian';
import DynamicTimetable from './main';
import { addDays, todayISO } from './core/date';
import { rolloverInto, shouldRollover } from './core/rollover';
import { createDailyNote, getDailyNote } from './DailyNotes';

/**
 * Carry yesterday's incomplete today tasks into the top of today's below
 * section. Idempotent per day via `settings.lastRollover`.
 *
 * @param force run even when already rolled over today (manual command).
 */
export async function runRollover(
  plugin: DynamicTimetable,
  force = false
): Promise<void> {
  const today = todayISO();
  if (!force && !shouldRollover(plugin.settings.lastRollover, today)) {
    return;
  }

  const yesterday = addDays(today, -1);
  const yesterdayNote = getDailyNote(plugin.app, yesterday);
  if (!yesterdayNote) {
    // Nothing to carry from; still record the run so we don't retry all day.
    await plugin.updateSetting('lastRollover', today);
    return;
  }

  const yesterdayContent = await plugin.app.vault.cachedRead(yesterdayNote);
  const todayNote = await createDailyNote(plugin.app, today);
  const todayContent = await plugin.app.vault.cachedRead(todayNote);

  const { content, carried } = rolloverInto(yesterdayContent, todayContent);

  if (carried.length > 0 && content !== todayContent) {
    await plugin.app.vault.modify(todayNote, content);
    if (force) {
      new Notice(`Rolled over ${carried.length} task(s) into today.`);
    }
  } else if (force) {
    new Notice('Nothing to roll over.');
  }

  await plugin.updateSetting('lastRollover', today);
}
