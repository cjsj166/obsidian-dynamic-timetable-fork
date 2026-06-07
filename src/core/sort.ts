// Sort the today region's task blocks by projected start time. A "block" is a
// `- [ ]` line plus the memo lines under it (until the next task line or the
// divider), so a task's memo travels with it. Pure; the editor uses the plan to
// apply the move as one cursor-safe change.

import { DEFAULT_PARSE_OPTIONS, ParseOptions, TaskLine } from './types';
import { parseDocument } from './document';
import { capacityFor, projectToday } from './projection';

export interface TodaySortPlan {
  changed: boolean;
  /** 0-based line index of the first today task line (region start). */
  regionFromLine: number;
  /** 0-based exclusive line index where the today region ends (divider/EOF). */
  regionToLine: number;
  /** Per original block (document order): [fromLine, toLine) 0-based. */
  blockLines: [number, number][];
  /** Permutation: original block index in its new position. */
  newOrder: number[];
}

/** Plan the today-region reorder (no string building — see sortTodayBlocks). */
export function planTodaySort(
  content: string,
  noteDate: string,
  opts: ParseOptions = DEFAULT_PARSE_OPTIONS
): TodaySortPlan {
  const empty: TodaySortPlan = {
    changed: false,
    regionFromLine: 0,
    regionToLine: 0,
    blockLines: [],
    newOrder: [],
  };

  const lines = content.split('\n');
  const doc = parseDocument(content, opts);
  if (doc.today.length < 2) return empty;

  const fm = doc.frontmatter;
  const proj = projectToday(doc.today, fm.dayStartMin, capacityFor(fm, noteDate));
  const startByTask = new Map<TaskLine, number>();
  for (const r of proj.rows) {
    const cur = startByTask.get(r.task);
    startByTask.set(r.task, cur === undefined ? r.startMin : Math.min(cur, r.startMin));
  }

  const taskLineNos = doc.today.map((t) => t.lineNo); // ascending (document order)
  const regionFromLine = taskLineNos[0];
  const regionToLine = doc.dividerLineNo !== null ? doc.dividerLineNo : lines.length;
  const blockLines: [number, number][] = taskLineNos.map((ln, i) => [
    ln,
    i + 1 < taskLineNos.length ? taskLineNos[i + 1] : regionToLine,
  ]);

  const startOf = (i: number): number => startByTask.get(doc.today[i]) ?? 0;
  const newOrder = doc.today
    .map((_, i) => i)
    .sort((a, b) => startOf(a) - startOf(b) || a - b);
  const changed = newOrder.some((bi, idx) => bi !== idx);

  return { changed, regionFromLine, regionToLine, blockLines, newOrder };
}

/** Reorder the today blocks and return the new content (string form, for tests). */
export function sortTodayBlocks(
  content: string,
  noteDate: string,
  opts: ParseOptions = DEFAULT_PARSE_OPTIONS
): { content: string; changed: boolean } {
  const plan = planTodaySort(content, noteDate, opts);
  if (!plan.changed) return { content, changed: false };

  const lines = content.split('\n');
  const before = lines.slice(0, plan.regionFromLine);
  const after = lines.slice(plan.regionToLine);
  const blocks = plan.blockLines.map(([f, t]) => lines.slice(f, t));
  const region = plan.newOrder.flatMap((bi) => blocks[bi]);
  return { content: [...before, ...region, ...after].join('\n'), changed: true };
}
