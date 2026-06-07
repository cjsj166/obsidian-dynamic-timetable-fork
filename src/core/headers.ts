// Pure computation of the header shown at each `%%task:<id>%%` marker:
// the matched task's name + projected time. Kept pure so the CM6 layer is thin.

import { DEFAULT_PARSE_OPTIONS, ParseOptions, TaskLine, TaskStatus } from './types';
import { analyzeNotes } from './notes';
import { capacityFor, projectBelow, projectToday } from './projection';
import { formatClock, formatDuration } from './time';
import { formatShort } from './date';

export interface MarkerHeader {
  id: string;
  markerLineNo: number;
  /** Marker whose id matches no task (e.g. the task was deleted). */
  orphan: boolean;
  section: 'today' | 'below' | null;
  status: TaskStatus | null;
  name: string | null;
  /** e.g. "09:00–12:00" (today) · "→ Wed 6/3 (6:00)" (below) · "?" (orphan). */
  timeLabel: string;
  /** Fixed `@`-time appointment (today) or date-pinned (below). */
  fixed: boolean;
  /** Number of timeline segments the today task was split into (1 = not split). */
  splitCount: number;
  parseError: string | null;
}

function findTaskById(tasks: TaskLine[], id: string): TaskLine | null {
  return tasks.find((t) => t.id === id) ?? null;
}

/** Header data for every `%%task:<id>%%` marker, in document order. */
export function computeMarkerHeaders(
  content: string,
  noteDate: string,
  opts: ParseOptions = DEFAULT_PARSE_OPTIONS
): MarkerHeader[] {
  const a = analyzeNotes(content, opts);
  const fm = a.doc.frontmatter;
  const capacity = capacityFor(fm, noteDate);
  const today = projectToday(a.doc.today, fm.dayStartMin, capacity);
  const below = projectBelow(a.doc.below, fm, noteDate);

  // Aggregate today rows per task (a split task has several segments).
  const todayByTask = new Map<
    TaskLine,
    { segments: { start: number; end: number }[]; fixed: boolean }
  >();
  for (const r of today.rows) {
    const cur = todayByTask.get(r.task);
    if (!cur) {
      todayByTask.set(r.task, {
        segments: [{ start: r.startMin, end: r.endMin }],
        fixed: r.fixed,
      });
    } else {
      cur.segments.push({ start: r.startMin, end: r.endMin });
      cur.fixed = cur.fixed || r.fixed;
    }
  }
  const belowByTask = new Map(below.rows.map((r) => [r.task, r]));

  return a.segments.map((seg): MarkerHeader => {
    const task = findTaskById(a.tasks, seg.id);
    const base = { id: seg.id, markerLineNo: seg.markerLineNo };

    if (!task) {
      return {
        ...base,
        orphan: true,
        section: null,
        status: null,
        name: null,
        timeLabel: '?',
        fixed: false,
        splitCount: 0,
        parseError: null,
      };
    }

    const todayAgg = todayByTask.get(task);
    if (todayAgg) {
      // Each segment as its own clock range, so a split reads "09:00–12:00, 13:00–15:00".
      const segs = [...todayAgg.segments].sort((a, b) => a.start - b.start);
      const timeLabel = segs
        .map((s) => `${formatClock(s.start)}–${formatClock(s.end)}`)
        .join(', ');
      return {
        ...base,
        orphan: false,
        section: 'today',
        status: task.status,
        name: task.name,
        timeLabel,
        fixed: todayAgg.fixed,
        splitCount: segs.length,
        parseError: task.parseError,
      };
    }

    const belowRow = belowByTask.get(task);
    if (belowRow) {
      const label = belowRow.endDate
        ? `→ ${formatShort(belowRow.endDate)}` +
          (belowRow.endHoursIntoDayMin !== null
            ? ` (${formatDuration(belowRow.endHoursIntoDayMin)})`
            : '')
        : 'unscheduled';
      return {
        ...base,
        orphan: false,
        section: 'below',
        status: task.status,
        name: task.name,
        timeLabel: label,
        fixed: belowRow.pinned,
        splitCount: 1,
        parseError: task.parseError,
      };
    }

    // Task exists but isn't in either projection (shouldn't happen).
    return {
      ...base,
      orphan: false,
      section: null,
      status: task.status,
      name: task.name,
      timeLabel: '',
      fixed: false,
      splitCount: 1,
      parseError: task.parseError,
    };
  });
}
