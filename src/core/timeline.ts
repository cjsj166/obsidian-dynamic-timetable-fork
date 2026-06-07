// Render model for the unified inline layout: tasks and their memos live in one
// region (today above the `---` divider, below under it). Each `- [ ]` line is
// resolved to its projected time; the editor draws that inline on the line and a
// ruler beside the memo under it. No %%task%% mirror region.

import {
  DEFAULT_PARSE_OPTIONS,
  ParseOptions,
  TaskLine,
  TaskStatus,
} from './types';
import { parseDocument } from './document';
import {
  GapSpan,
  TodayRow,
  capacityFor,
  projectBelow,
  projectToday,
} from './projection';
import { formatClock } from './time';
import { formatShort } from './date';

export interface TimelineSegment {
  startMin: number;
  endMin: number;
}

export interface TimelineRow {
  /** Absolute 0-based line index of the `- [ ]` task line. */
  lineNo: number;
  kind: 'today' | 'below';
  status: TaskStatus;
  name: string;
  /** Fixed `@`-time (today) or date-pinned (below). */
  fixed: boolean;
  conflict: boolean;
  parseError: string | null;
  /** e.g. "09:00–11:00, 12:00–14:00" (today) · "→ Mon 6/8 11:00–14:00" (below). */
  timeLabel: string;
  // today only
  startMin: number | null;
  endMin: number | null;
  segments: TimelineSegment[];
  splitCount: number;
  // below only
  endDate: string | null;
}

export interface Timeline {
  rows: TimelineRow[];
  /** Idle today gaps (display-only), in time order. */
  gaps: GapSpan[];
  /** Sorted line indices of every task line + the divider — block boundaries. */
  boundaries: number[];
  dividerLineNo: number | null;
}

/** Resolve the whole note into per-task render rows + today gaps. */
export function resolveTimeline(
  content: string,
  noteDate: string,
  opts: ParseOptions = DEFAULT_PARSE_OPTIONS
): Timeline {
  const doc = parseDocument(content, opts);
  const fm = doc.frontmatter;
  const today = projectToday(doc.today, fm.dayStartMin, capacityFor(fm, noteDate));
  const below = projectBelow(doc.below, fm, noteDate);

  const segsByTask = new Map<TaskLine, TodayRow[]>();
  for (const r of today.rows) {
    const arr = segsByTask.get(r.task) ?? [];
    arr.push(r);
    segsByTask.set(r.task, arr);
  }
  for (const arr of segsByTask.values()) {
    arr.sort((x, y) => x.startMin - y.startMin);
  }

  const rows: TimelineRow[] = [];

  for (const t of doc.today) {
    const segs = segsByTask.get(t) ?? [];
    const segments = segs.map((s) => ({ startMin: s.startMin, endMin: s.endMin }));
    const timeLabel = segments
      .map((s) => `${formatClock(s.startMin)}–${formatClock(s.endMin)}`)
      .join(', ');
    rows.push({
      lineNo: t.lineNo,
      kind: 'today',
      status: t.status,
      name: t.name,
      fixed: segs.some((s) => s.fixed),
      conflict: segs.some((s) => s.conflict),
      parseError: t.parseError,
      timeLabel,
      startMin: segments.length ? segments[0].startMin : null,
      endMin: segments.length ? segments[segments.length - 1].endMin : null,
      segments,
      splitCount: segments.length || 1,
      endDate: null,
    });
  }

  const belowByTask = new Map(below.rows.map((r) => [r.task, r]));
  for (const t of doc.below) {
    const r = belowByTask.get(t);
    const dur = t.durationMin ?? 0;
    let s: number | null = null;
    let e: number | null = null;
    if (r) {
      if (r.pinned) {
        const a = t.anchorMinutes ?? fm.dayStartMin;
        s = a;
        e = a + dur;
      } else if (r.endHoursIntoDayMin !== null) {
        e = fm.dayStartMin + r.endHoursIntoDayMin;
        s = fm.dayStartMin + Math.max(0, r.endHoursIntoDayMin - dur);
      }
    }
    const timeLabel =
      r && r.endDate
        ? `→ ${formatShort(r.endDate)}` +
          (s !== null && e !== null ? ` ${formatClock(s)}–${formatClock(e)}` : '')
        : 'unscheduled';
    rows.push({
      lineNo: t.lineNo,
      kind: 'below',
      status: t.status,
      name: t.name,
      fixed: r ? r.pinned : false,
      conflict: false,
      parseError: t.parseError,
      timeLabel,
      startMin: null,
      endMin: null,
      segments: [],
      splitCount: 1,
      endDate: r ? r.endDate : null,
    });
  }

  const boundaries = [...doc.today, ...doc.below].map((t) => t.lineNo);
  if (doc.dividerLineNo !== null) boundaries.push(doc.dividerLineNo);
  boundaries.sort((a, b) => a - b);

  return { rows, gaps: today.gaps, boundaries, dividerLineNo: doc.dividerLineNo };
}
