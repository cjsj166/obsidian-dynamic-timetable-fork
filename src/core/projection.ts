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
  /** True when this row is a fixed `@`-time appointment. */
  fixed: boolean;
  /** 0-based index of this segment within its task. */
  segmentIndex: number;
  /** Total number of segments the task was split into (1 when not split). */
  segmentCount: number;
  /** True when a fixed appointment overlaps another fixed appointment. */
  conflict: boolean;
}

export interface TodayProjection {
  rows: TodayRow[];
  clockEndMin: number;
  workTotalMin: number;
  capacityMin: number;
  overBudget: boolean;
  /** True when any two fixed appointments overlap in time. */
  hasConflict: boolean;
}

interface Interval {
  start: number;
  end: number;
}

/**
 * Fill `dur` minutes of flexible work starting at `start`, flowing around the
 * `occupied` (fixed-appointment) intervals — splitting into multiple segments
 * when the work would otherwise overlap an appointment. `occupied` must be
 * sorted by start and contain only non-zero-width intervals.
 */
function fillFlexible(
  start: number,
  dur: number,
  occupied: Interval[]
): { segments: Interval[]; endClock: number } {
  const segments: Interval[] = [];
  let t = start;
  let remaining = dur;
  let guard = 0;

  while (remaining > 0 && guard++ < 100000) {
    const inside = occupied.find((iv) => iv.start <= t && t < iv.end);
    if (inside) {
      t = inside.end;
      continue;
    }
    let nextStart = Infinity;
    for (const iv of occupied) {
      if (iv.start > t && iv.start < nextStart) nextStart = iv.start;
    }
    const free = nextStart - t;
    const take = Math.min(remaining, free);
    segments.push({ start: t, end: t + take });
    t += take;
    remaining -= take;
  }

  return { segments, endClock: t };
}

/**
 * Project the today section. Fixed `@`-time tasks are immovable appointments
 * placed at their anchor; flexible tasks fill the gaps in document order,
 * starting at `dayStartMin`, and are split around the appointments. Rows are
 * returned sorted by start time. `capacityMin` is working_hours + today's
 * override (compute with capacityFor at the call site).
 */
export function projectToday(
  today: TaskLine[],
  dayStartMin: number,
  capacityMin: number
): TodayProjection {
  // 1. Fixed appointments, in time order, with conflict detection.
  const fixed = today
    .filter((t) => t.anchorMinutes !== null)
    .map((t) => ({
      task: t,
      start: t.anchorMinutes as number,
      end: (t.anchorMinutes as number) + (t.durationMin ?? 0),
      conflict: false,
    }))
    .sort((a, b) => a.start - b.start || a.end - b.end);

  for (let i = 1; i < fixed.length; i++) {
    if (fixed[i].start < fixed[i - 1].end) {
      fixed[i].conflict = true;
      fixed[i - 1].conflict = true;
    }
  }
  const hasConflict = fixed.some((f) => f.conflict);

  // Only non-zero-width appointments block flexible work.
  const occupied: Interval[] = fixed
    .filter((f) => f.end > f.start)
    .map((f) => ({ start: f.start, end: f.end }));

  const rows: TodayRow[] = [];
  let workTotalMin = 0;

  // 2. Fixed rows.
  for (const f of fixed) {
    workTotalMin += f.end - f.start;
    rows.push({
      task: f.task,
      startMin: f.start,
      endMin: f.end,
      fixed: true,
      segmentIndex: 0,
      segmentCount: 1,
      conflict: f.conflict,
    });
  }

  // 3. Flexible tasks fill the gaps in document order, splitting as needed.
  let fillClock = dayStartMin;
  for (const task of today) {
    if (task.anchorMinutes !== null) continue;
    const dur = task.durationMin ?? 0;
    workTotalMin += dur;

    if (dur === 0) {
      rows.push({
        task,
        startMin: fillClock,
        endMin: fillClock,
        fixed: false,
        segmentIndex: 0,
        segmentCount: 1,
        conflict: false,
      });
      continue;
    }

    const { segments, endClock } = fillFlexible(fillClock, dur, occupied);
    fillClock = endClock;
    segments.forEach((seg, i) => {
      rows.push({
        task,
        startMin: seg.start,
        endMin: seg.end,
        fixed: false,
        segmentIndex: i,
        segmentCount: segments.length,
        conflict: false,
      });
    });
  }

  // 4. Sort the timeline by start (stable for equal starts).
  rows.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  const clockEndMin = rows.reduce((m, r) => Math.max(m, r.endMin), dayStartMin);

  return {
    rows,
    clockEndMin,
    workTotalMin,
    capacityMin,
    overBudget: workTotalMin > capacityMin,
    hasConflict,
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
