import { Frontmatter, TaskLine } from './types';
import { addDays } from './date';

// ---------------------------------------------------------------------------
// Capacity
// ---------------------------------------------------------------------------

/** Available working minutes for a date: working_hours + override (if any). */
export function capacityFor(fm: Frontmatter, date: string): number {
  const ov = fm.capacityOverrides.find((o) => o.date === date);
  return fm.workingHoursMin + (ov ? ov.deltaMin : 0);
}

// ---------------------------------------------------------------------------
// Today projection
// ---------------------------------------------------------------------------

export interface TodayRow {
  task: TaskLine;
  startMin: number; // minutes-of-day
  endMin: number; // minutes-of-day (may exceed 1440 if the plan runs past midnight)
  /** anchor - running_clock when the task has an `@` time, else null. */
  bufferMin: number | null;
}

export interface TodayProjection {
  rows: TodayRow[];
  clockEndMin: number;
  workTotalMin: number;
  capacityMin: number;
  overBudget: boolean;
}

/**
 * Project cumulative start/end clock times for the today section.
 * `nowMin` and `capacityMin` are minutes; capacity is working_hours + today's
 * override (compute with capacityFor at the call site).
 */
export function projectToday(
  today: TaskLine[],
  nowMin: number,
  capacityMin: number
): TodayProjection {
  let runningClock =
    today.length > 0 && today[0].anchorMinutes !== null
      ? today[0].anchorMinutes
      : nowMin;

  const rows: TodayRow[] = [];
  let workTotalMin = 0;

  for (const task of today) {
    const dur = task.durationMin ?? 0;
    const anchor = task.anchorMinutes;
    const startMin = anchor !== null ? Math.max(runningClock, anchor) : runningClock;
    const endMin = startMin + dur;
    const bufferMin = anchor !== null ? anchor - runningClock : null;

    rows.push({ task, startMin, endMin, bufferMin });
    workTotalMin += dur;
    runningClock = endMin;
  }

  return {
    rows,
    clockEndMin: runningClock,
    workTotalMin,
    capacityMin,
    overBudget: workTotalMin > capacityMin,
  };
}

// ---------------------------------------------------------------------------
// Below projection
// ---------------------------------------------------------------------------

export interface BelowRow {
  task: TaskLine;
  pinned: boolean;
  /** End date (`YYYY-MM-DD`) for a queue task, or the anchor date for a pinned task. */
  endDate: string | null;
  /** Minutes consumed on the end date up to and including this task (queue only). */
  endHoursIntoDayMin: number | null;
}

export interface BelowProjection {
  rows: BelowRow[];
  /** Dates whose pinned reservations exceed their capacity. */
  overBookedDates: string[];
}

const MAX_LOOKAHEAD_DAYS = 366 * 5;

/**
 * Project the below queue across future dates by daily capacity.
 *
 * Date-pinned tasks (an `@ YYYY-MM-DD` anchor) reserve time on their date; the
 * remaining capacity is filled by the non-pinned queue in document order,
 * spilling across day boundaries when a task does not fit.
 */
export function projectBelow(
  below: TaskLine[],
  fm: Frontmatter,
  todayDate: string
): BelowProjection {
  // 1. Tally pinned reservations per date.
  const reserved = new Map<string, number>();
  for (const t of below) {
    if (t.anchorDate) {
      reserved.set(
        t.anchorDate,
        (reserved.get(t.anchorDate) ?? 0) + (t.durationMin ?? 0)
      );
    }
  }

  const overBookedDates: string[] = [];
  for (const [date, used] of reserved) {
    if (used > capacityFor(fm, date)) {
      overBookedDates.push(date);
    }
  }

  // 2. Walk the non-pinned queue across days.
  const endByTask = new Map<TaskLine, { endDate: string; endHours: number }>();

  let cursorDate = addDays(todayDate, 1);
  let dayCap = capacityFor(fm, cursorDate);
  let dayUsed = reserved.get(cursorDate) ?? 0;
  let daysAdvanced = 0;

  const advance = (): boolean => {
    if (daysAdvanced >= MAX_LOOKAHEAD_DAYS) {
      return false;
    }
    cursorDate = addDays(cursorDate, 1);
    dayCap = capacityFor(fm, cursorDate);
    dayUsed = reserved.get(cursorDate) ?? 0;
    daysAdvanced++;
    return true;
  };

  for (const task of below) {
    if (task.anchorDate) {
      continue; // pinned — handled separately
    }
    let remaining = task.durationMin ?? 0;

    // A zero-duration queue task lands at the current cursor position.
    if (remaining === 0) {
      endByTask.set(task, { endDate: cursorDate, endHours: dayUsed });
      continue;
    }

    let scheduled = false;
    while (remaining > 0) {
      const free = dayCap - dayUsed;
      if (free <= 0) {
        if (!advance()) {
          break;
        }
        continue;
      }
      const take = Math.min(remaining, free);
      dayUsed += take;
      remaining -= take;
      if (remaining === 0) {
        endByTask.set(task, { endDate: cursorDate, endHours: dayUsed });
        scheduled = true;
      } else if (!advance()) {
        break;
      }
    }
    if (!scheduled && !endByTask.has(task)) {
      // Could not be scheduled within the lookahead window.
      endByTask.set(task, { endDate: '', endHours: 0 });
    }
  }

  // 3. Build rows in original document order.
  const rows: BelowRow[] = below.map((task) => {
    if (task.anchorDate) {
      return {
        task,
        pinned: true,
        endDate: task.anchorDate,
        endHoursIntoDayMin: null,
      };
    }
    const r = endByTask.get(task);
    return {
      task,
      pinned: false,
      endDate: r && r.endDate ? r.endDate : null,
      endHoursIntoDayMin: r && r.endDate ? r.endHours : null,
    };
  });

  return { rows, overBookedDates };
}
