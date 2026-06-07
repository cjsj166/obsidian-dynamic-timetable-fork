// Lay out the today region for split tasks: a task with N timeline segments
// keeps its `- [ ]` line for segment 1 and gets N-1 `%%task:<id> k/n%%`
// continuation blocks for the later segments, each holding its own memo. All
// blocks (primaries + continuations) are ordered by segment start time, so the
// continuation lands at its real chronological position. This subsumes the
// plain today-sort. Pure; the editor applies it as one cursor-safe change.

import { DEFAULT_PARSE_OPTIONS, ParseOptions, TaskLine } from './types';
import { isTaskLine, parseDocument, splitFrontmatter } from './document';
import { capacityFor, projectToday } from './projection';

/** A `%%task:<id> k/n%%` continuation marker (segment k of n, k >= 2). */
export const CONT_RE = /^%%task:([A-Za-z0-9-]+)\s+(\d+)\/(\d+)%%\s*$/;

export function contMarker(id: string, k: number, n: number): string {
  return `%%task:${id} ${k}/${n}%%`;
}

export interface LayoutBlock {
  /** `__pre__` (preamble), `p:<taskIndex>` (primary), or `c:<id>:<k>` (continuation). */
  key: string;
  lines: string[];
}

export interface TodayLayout {
  changed: boolean;
  /** 0-based region line range [from, to) covering preamble + all today blocks. */
  regionFromLine: number;
  regionToLine: number;
  /** Preamble first, then blocks in start-time order. */
  blocks: LayoutBlock[];
}

/** Plan the today-region layout. `idgen` supplies ids for newly-split tasks. */
export function layoutToday(
  content: string,
  idgen: () => string,
  noteDate: string,
  opts: ParseOptions = DEFAULT_PARSE_OPTIONS
): TodayLayout {
  const lines = content.split('\n');
  const { bodyOffset } = splitFrontmatter(content);
  const doc = parseDocument(content, opts);
  const today = doc.today;
  const regionToLine = doc.dividerLineNo ?? lines.length;

  const empty: TodayLayout = {
    changed: false,
    regionFromLine: bodyOffset,
    regionToLine,
    blocks: [],
  };
  if (today.length === 0) return empty;

  // Block-start lines in the region: `- [ ]` tasks and continuation markers.
  const starts: number[] = [];
  for (let i = bodyOffset; i < regionToLine && i < lines.length; i++) {
    if (isTaskLine(lines[i]) || CONT_RE.test(lines[i])) starts.push(i);
  }
  if (starts.length === 0) return empty;

  // Existing memos: primaries keyed by task line, continuations by `id:k`.
  const primaryMemo = new Map<number, string[]>();
  const contMemo = new Map<string, string[]>();
  for (let j = 0; j < starts.length; j++) {
    const s = starts[j];
    const e = j + 1 < starts.length ? starts[j + 1] : regionToLine;
    const memo = lines.slice(s + 1, e);
    const cont = lines[s].match(CONT_RE);
    if (cont) contMemo.set(`${cont[1]}:${Number(cont[2])}`, memo);
    else primaryMemo.set(s, memo);
  }

  // Segment starts per task.
  const proj = projectToday(
    today,
    doc.frontmatter.dayStartMin,
    capacityFor(doc.frontmatter, noteDate)
  );
  const segStarts = new Map<TaskLine, number[]>();
  for (const r of proj.rows) {
    const arr = segStarts.get(r.task) ?? [];
    arr.push(r.startMin);
    segStarts.set(r.task, arr);
  }
  for (const arr of segStarts.values()) arr.sort((a, b) => a - b);

  const used = new Set<string>();
  for (const t of today) if (t.id) used.add(t.id);
  for (const key of contMemo.keys()) used.add(key.split(':')[0]);
  const genId = (): string => {
    let id = idgen();
    let guard = 0;
    while (used.has(id) && guard++ < 10000) id = idgen();
    used.add(id);
    return id;
  };

  type Built = { key: string; lines: string[]; startMin: number; ti: number; k: number };
  const built: Built[] = [];

  today.forEach((t, ti) => {
    const starts2 = segStarts.get(t) ?? [];
    const n = Math.max(1, starts2.length);
    let id = t.id;
    if (n >= 2 && !id) id = genId();

    let header = t.raw;
    if (id && !t.id) header = t.raw.replace(/\s*$/, '') + ` ^${id}`;
    built.push({
      key: `p:${ti}`,
      lines: [header, ...(primaryMemo.get(t.lineNo) ?? [])],
      startMin: starts2[0] ?? 0,
      ti,
      k: 1,
    });

    for (let k = 2; k <= n; k++) {
      built.push({
        key: `c:${id}:${k}`,
        lines: [contMarker(id as string, k, n), ...(contMemo.get(`${id}:${k}`) ?? [])],
        startMin: starts2[k - 1],
        ti,
        k,
      });
    }

    // Surplus continuations (a collapsed split) merge into the last kept block.
    if (id) {
      const surplus: string[] = [];
      for (const [mk, memo] of contMemo) {
        const [mid, mks] = mk.split(':');
        if (mid === id && Number(mks) > n) {
          surplus.push(...memo.filter((l) => l.trim() !== ''));
        }
      }
      if (surplus.length) built[built.length - 1].lines.push(...surplus);
    }
  });

  built.sort((a, b) => a.startMin - b.startMin || a.ti - b.ti || a.k - b.k);

  const preamble = lines.slice(bodyOffset, starts[0]);
  const blocks: LayoutBlock[] = [
    { key: '__pre__', lines: preamble },
    ...built.map((b) => ({ key: b.key, lines: b.lines })),
  ];

  const newRegion = blocks.flatMap((b) => b.lines);
  const changed = newRegion.join('\n') !== lines.slice(bodyOffset, regionToLine).join('\n');

  return { changed, regionFromLine: bodyOffset, regionToLine, blocks };
}

/** Apply the layout and return new content (string form, for tests). */
export function applyLayoutString(
  content: string,
  idgen: () => string,
  noteDate: string,
  opts: ParseOptions = DEFAULT_PARSE_OPTIONS
): { content: string; changed: boolean } {
  const layout = layoutToday(content, idgen, noteDate, opts);
  if (!layout.changed) return { content, changed: false };
  const lines = content.split('\n');
  const before = lines.slice(0, layout.regionFromLine);
  const after = lines.slice(layout.regionToLine);
  const region = layout.blocks.flatMap((b) => b.lines);
  return { content: [...before, ...region, ...after].join('\n'), changed: true };
}
