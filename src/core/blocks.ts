// Resolve each `%%task:<id>%%` note block to the schedule it represents.
//
// Under the per-segment model a split today task owns ONE block per timeline
// segment (duplicate `%%task:id%%` markers, chronological). The k-th block of a
// given id maps to that task's k-th projected segment (sorted by start). Below
// tasks own a single block; a marker with no task is an orphan.
//
// Both the header text and the left ruler are computed from this resolution.

import {
  DEFAULT_PARSE_OPTIONS,
  ParseOptions,
  TaskLine,
  TaskStatus,
} from './types';
import { analyzeNotes } from './notes';
import {
  GapSpan,
  TodayRow,
  capacityFor,
  projectBelow,
  projectToday,
} from './projection';

export interface ResolvedBlock {
  id: string;
  markerLineNo: number;
  kind: 'today' | 'below' | 'orphan';
  task: TaskLine | null;
  status: TaskStatus | null;
  name: string | null;
  parseError: string | null;
  /** True for a fixed `@`-time appointment (today) or a date-pinned below task. */
  fixed: boolean;
  // today only ----------------------------------------------------------------
  /** This block's segment start (minutes-of-day), or null when not today. */
  startMin: number | null;
  endMin: number | null;
  conflict: boolean;
  /** 0-based segment index this block represents. */
  segmentIndex: number;
  /** Total segments the today task is split into. */
  segmentCount: number;
  // below only ----------------------------------------------------------------
  endDate: string | null;
  endHoursIntoDayMin: number | null;
}

export interface ResolvedNotes {
  blocks: ResolvedBlock[];
  /** Idle today gaps (display-only), in time order. */
  gaps: GapSpan[];
}

/** Resolve every note block to its task/segment, in document order. */
export function resolveBlocks(
  content: string,
  noteDate: string,
  opts: ParseOptions = DEFAULT_PARSE_OPTIONS
): ResolvedNotes {
  const a = analyzeNotes(content, opts);
  const fm = a.doc.frontmatter;
  const today = projectToday(a.doc.today, fm.dayStartMin, capacityFor(fm, noteDate));
  const below = projectBelow(a.doc.below, fm, noteDate);

  // today rows grouped per task, ordered by segment start.
  const rowsByTask = new Map<TaskLine, TodayRow[]>();
  for (const r of today.rows) {
    const arr = rowsByTask.get(r.task) ?? [];
    arr.push(r);
    rowsByTask.set(r.task, arr);
  }
  for (const arr of rowsByTask.values()) {
    arr.sort((x, y) => x.startMin - y.startMin);
  }
  const belowByTask = new Map(below.rows.map((r) => [r.task, r]));
  const todayTasks = new Set(a.doc.today);

  const occ = new Map<string, number>();
  const blocks = a.segments.map((seg): ResolvedBlock => {
    const k = occ.get(seg.id) ?? 0;
    occ.set(seg.id, k + 1);
    const task = a.tasks.find((t) => t.id === seg.id) ?? null;

    const base = {
      id: seg.id,
      markerLineNo: seg.markerLineNo,
      task,
      status: task?.status ?? null,
      name: task?.name ?? null,
      parseError: task?.parseError ?? null,
      segmentIndex: k,
      segmentCount: 1,
      startMin: null as number | null,
      endMin: null as number | null,
      conflict: false,
      fixed: false,
      endDate: null as string | null,
      endHoursIntoDayMin: null as number | null,
    };

    if (!task) return { ...base, kind: 'orphan' };

    if (todayTasks.has(task)) {
      const rows = rowsByTask.get(task) ?? [];
      const row = rows.length ? rows[Math.min(k, rows.length - 1)] : undefined;
      return {
        ...base,
        kind: 'today',
        startMin: row ? row.startMin : null,
        endMin: row ? row.endMin : null,
        fixed: row ? row.fixed : false,
        conflict: row ? row.conflict : false,
        segmentCount: rows.length || 1,
      };
    }

    const r = belowByTask.get(task);
    return {
      ...base,
      kind: 'below',
      fixed: r ? r.pinned : false,
      endDate: r ? r.endDate : null,
      endHoursIntoDayMin: r ? r.endHoursIntoDayMin : null,
    };
  });

  return { blocks, gaps: today.gaps };
}
