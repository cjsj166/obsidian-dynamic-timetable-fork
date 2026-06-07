import { EditorView, ViewUpdate } from '@codemirror/view';
import { editorInfoField } from 'obsidian';
import type DynamicTimetable from '../main';
import { ParseOptions } from '../core/types';
import { parseDocument } from '../core/document';
import { planTodaySort } from '../core/sort';
import { todayISO } from '../core/date';

const ISO_RE = /(\d{4}-\d{2}-\d{2})/;
const DAILY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEBOUNCE_MS = 450;

function noteDateFor(view: EditorView): string {
  const info = view.state.field(editorInfoField, false) as
    | { file?: { basename?: string } | null }
    | undefined;
  const base = info?.file?.basename ?? '';
  const m = base.match(ISO_RE);
  return m ? m[1] : todayISO();
}

function isManaged(basename: string, content: string): boolean {
  return DAILY_RE.test(basename) || /^\s*(working_hours|day_start)\s*:/m.test(content);
}

/**
 * The name of the today task whose block the cursor is in, used as a stable key
 * for "the cursor left this task" — editing the `@`/`;` time tokens does not
 * change it, so we don't reorder mid-edit.
 */
function cursorBlockKey(view: EditorView, opts: ParseOptions): string | null {
  const doc = view.state.doc;
  const cursorLine0 = doc.lineAt(view.state.selection.main.head).number - 1;
  const parsed = parseDocument(doc.toString(), opts);
  const end = parsed.dividerLineNo ?? doc.lines;
  if (cursorLine0 >= end) return null; // below region
  let key: string | null = null;
  for (const t of parsed.today) {
    if (t.lineNo <= cursorLine0) key = `${t.lineNo}:${t.name}`;
  }
  return key;
}

/** Reorder the today blocks by start time as one change, keeping the cursor. */
function applySort(view: EditorView, opts: ParseOptions): void {
  const plan = planTodaySort(view.state.doc.toString(), noteDateFor(view), opts);
  if (!plan.changed) return;

  const doc = view.state.doc;
  const lineStart = (ln0: number): number =>
    ln0 < doc.lines ? doc.line(ln0 + 1).from : doc.length;

  const regionFrom = lineStart(plan.regionFromLine);
  const regionTo = lineStart(plan.regionToLine);
  const ranges = plan.blockLines.map(([f, t]) => ({
    from: lineStart(f),
    to: lineStart(t),
  }));

  const insert = plan.newOrder
    .map((bi) => doc.sliceString(ranges[bi].from, ranges[bi].to))
    .join('');

  // Map the cursor: find the block it sits in, then its new offset.
  const head = view.state.selection.main.head;
  let anchor: number | null = null;
  if (head >= regionFrom && head <= regionTo) {
    const oi = ranges.findIndex((r) => head >= r.from && head < r.to);
    if (oi >= 0) {
      const within = head - ranges[oi].from;
      const newIdx = plan.newOrder.indexOf(oi);
      let acc = 0;
      for (let k = 0; k < newIdx; k++) {
        const bi = plan.newOrder[k];
        acc += ranges[bi].to - ranges[bi].from;
      }
      anchor = regionFrom + acc + within;
    }
  }

  view.dispatch({
    changes: { from: regionFrom, to: regionTo, insert },
    selection: anchor !== null ? { anchor } : undefined,
  });
}

/**
 * Auto-sort the today region by start time when the cursor leaves a task block.
 * Reordering while the cursor stays in one block (typing, editing its time) is
 * suppressed so the block never jumps mid-edit.
 */
export function autoSortExtension(plugin: DynamicTimetable) {
  let timer: number | null = null;
  let lastKey: string | null = null;
  const opts = (): ParseOptions => ({
    estimateDelimiter: plugin.settings.taskEstimateDelimiter,
    startTimeDelimiter: plugin.settings.startTimeDelimiter,
  });

  return EditorView.updateListener.of((u: ViewUpdate) => {
    if (!u.docChanged && !u.selectionSet) return;
    const view = u.view;
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = null;
      const info = view.state.field(editorInfoField, false) as
        | { file?: { basename?: string } | null }
        | undefined;
      const content = view.state.doc.toString();
      if (!isManaged(info?.file?.basename ?? '', content)) return;

      const o = opts();
      const key = cursorBlockKey(view, o);
      if (key !== null && key === lastKey) return; // still in the same block
      applySort(view, o);
      lastKey = cursorBlockKey(view, o);
    }, DEBOUNCE_MS);
  });
}
