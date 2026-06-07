// Pure data for the left time ruler drawn beside each today note block.
//
// Each today task gets a *local* time axis: its memo's pixel height represents
// the task's active duration, with hour labels / 30-min ticks down the side.
// This module computes the per-task segment list + active minutes + any idle
// gap that immediately precedes the task; the CM6 layer maps it onto pixels.

import { DEFAULT_PARSE_OPTIONS, ParseOptions, TaskLine } from './types';
import { analyzeNotes } from './notes';
import { GapSpan, capacityFor, projectToday } from './projection';

export interface RulerSegment {
  startMin: number;
  endMin: number;
}

export interface RulerEntry {
  id: string;
  /** Absolute line index of this task's `%%task:<id>%%` marker. */
  markerLineNo: number;
  /** First segment start (minutes-of-day). */
  startMin: number;
  /** Last segment end (minutes-of-day). */
  endMin: number;
  /** Sum of segment durations — what the memo height is scaled to. */
  activeMin: number;
  /** Working spans, in time order (more than one when split). */
  segments: RulerSegment[];
  /** An idle gap ending exactly at this task's start, if any (display-only). */
  gapBefore: GapSpan | null;
}

/** Per-today-task ruler data, in marker (document) order. */
export function computeRuler(
  content: string,
  noteDate: string,
  opts: ParseOptions = DEFAULT_PARSE_OPTIONS
): RulerEntry[] {
  const a = analyzeNotes(content, opts);
  const fm = a.doc.frontmatter;
  const proj = projectToday(a.doc.today, fm.dayStartMin, capacityFor(fm, noteDate));

  const byTask = new Map<TaskLine, RulerSegment[]>();
  for (const r of proj.rows) {
    const segs = byTask.get(r.task) ?? [];
    segs.push({ startMin: r.startMin, endMin: r.endMin });
    byTask.set(r.task, segs);
  }
  for (const segs of byTask.values()) {
    segs.sort((x, y) => x.startMin - y.startMin);
  }

  const todaySet = new Set(a.doc.today);
  const entries: RulerEntry[] = [];
  for (const seg of a.segments) {
    const task = a.tasks.find((t) => t.id === seg.id) ?? null;
    if (!task || !todaySet.has(task)) continue;
    const segments = byTask.get(task);
    if (!segments || segments.length === 0) continue;

    const startMin = segments[0].startMin;
    const endMin = segments[segments.length - 1].endMin;
    const activeMin = segments.reduce((s, x) => s + (x.endMin - x.startMin), 0);
    const gapBefore = proj.gaps.find((g) => g.endMin === startMin) ?? null;

    entries.push({
      id: seg.id,
      markerLineNo: seg.markerLineNo,
      startMin,
      endMin,
      activeMin,
      segments,
      gapBefore,
    });
  }
  return entries;
}
