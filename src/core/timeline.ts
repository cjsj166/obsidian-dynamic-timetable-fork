// Render model for the unified inline layout: tasks and their memos live in one
// region (today above the `---` divider, below under it). Each `- [ ]` line is
// resolved to its projected time; a split task also has `%%task:<id> k/n%%`
// continuation blocks for its later segments. The editor draws the time inline
// and a ruler beside the memo under each block.

import {
  DEFAULT_PARSE_OPTIONS,
  ParseOptions,
  TaskLine,
  TaskStatus,
} from './types';
import { hasTimeCondition, parseDocument } from './document';
import {
  GapSpan,
  TodayRow,
  capacityFor,
  projectBelow,
  projectToday,
} from './projection';
import { CONT_RE } from './layout';
import { formatClock } from './time';
import { formatShort } from './date';

export interface TimelineSegment {
  startMin: number;
  endMin: number;
}

export interface TimelineRow {
  /** Absolute 0-based line index of the task line or continuation marker. */
  lineNo: number;
  kind: 'today' | 'below';
  /** True for a `%%task:<id> k/n%%` continuation line (segment >= 2). */
  isContinuation: boolean;
  /** 1-based segment index this row represents. */
  segIndex: number;
  splitCount: number;
  status: TaskStatus;
  name: string | null;
  fixed: boolean;
  conflict: boolean;
  parseError: string | null;
  hasTime: boolean;
  timeLabel: string;
  startMin: number | null;
  endMin: number | null;
  segments: TimelineSegment[];
  endDate: string | null;
}

export interface Timeline {
  rows: TimelineRow[];
  gaps: GapSpan[];
  /** Sorted line indices of every block start + the divider — ruler boundaries. */
  boundaries: number[];
  dividerLineNo: number | null;
}

const segLabel = (s: TimelineSegment): string =>
  s.startMin === s.endMin
    ? formatClock(s.startMin)
    : `${formatClock(s.startMin)}–${formatClock(s.endMin)}`;

/** Resolve the whole note into per-block render rows + today gaps. */
export function resolveTimeline(
  content: string,
  noteDate: string,
  opts: ParseOptions = DEFAULT_PARSE_OPTIONS
): Timeline {
  const lines = content.split('\n');
  const doc = parseDocument(content, opts);
  const fm = doc.frontmatter;
  const today = projectToday(
    doc.today,
    fm.dayStartMin,
    capacityFor(fm, noteDate)
  );
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

  // Primary `- [ ]` rows (segment 1 of each today task).
  for (const t of doc.today) {
    const segs = segsByTask.get(t) ?? [];
    const n = segs.length;
    const seg0 = segs[0];
    const shown = n >= 2 ? segs.slice(0, 1) : segs;
    const segments = shown.map((s) => ({
      startMin: s.startMin,
      endMin: s.endMin,
    }));
    const label = seg0
      ? segLabel({ startMin: seg0.startMin, endMin: seg0.endMin }) +
        (n >= 2 ? ` (1/${n})` : '')
      : '';
    rows.push({
      lineNo: t.lineNo,
      kind: 'today',
      isContinuation: false,
      segIndex: 1,
      splitCount: n || 1,
      status: t.status,
      name: t.name,
      fixed: seg0 ? seg0.fixed : false,
      conflict: segs.some((s) => s.conflict),
      parseError: t.parseError,
      hasTime: hasTimeCondition(t),
      timeLabel: label,
      startMin: seg0 ? seg0.startMin : null,
      endMin: seg0 ? seg0.endMin : null,
      segments,
      endDate: null,
    });
  }

  // Continuation rows (`%%task:<id> k/n%%`), mapped to their parent task by id.
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(CONT_RE);
    if (!m) continue;
    const id = m[1];
    const k = Number(m[2]);
    const task = doc.today.find((t) => t.id === id) ?? null;
    const segs = task ? segsByTask.get(task) ?? [] : [];
    const seg = segs[k - 1];
    const n = segs.length;
    rows.push({
      lineNo: i,
      kind: 'today',
      isContinuation: true,
      segIndex: k,
      splitCount: n || 1,
      status: task ? task.status : 'open',
      name: task ? task.name : null,
      fixed: seg ? seg.fixed : false,
      conflict: false,
      parseError: task ? task.parseError : null,
      hasTime: true,
      timeLabel: seg ? `${segLabel(seg)} (${k}/${n})` : '?',
      startMin: seg ? seg.startMin : null,
      endMin: seg ? seg.endMin : null,
      segments: seg ? [{ startMin: seg.startMin, endMin: seg.endMin }] : [],
      endDate: null,
    });
  }

  // Below rows.
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
          (s !== null && e !== null
            ? ` ${formatClock(s)}–${formatClock(e)}`
            : '')
        : 'unscheduled';
    rows.push({
      lineNo: t.lineNo,
      kind: 'below',
      isContinuation: false,
      segIndex: 1,
      splitCount: 1,
      status: t.status,
      name: t.name,
      fixed: r ? r.pinned : false,
      conflict: false,
      parseError: t.parseError,
      hasTime: hasTimeCondition(t),
      timeLabel,
      startMin: null,
      endMin: null,
      segments: [],
      endDate: r ? r.endDate : null,
    });
  }

  const boundaries = rows.map((r) => r.lineNo);
  if (doc.dividerLineNo !== null) boundaries.push(doc.dividerLineNo);
  boundaries.sort((a, b) => a - b);

  return {
    rows,
    gaps: today.gaps,
    boundaries,
    dividerLineNo: doc.dividerLineNo,
  };
}
