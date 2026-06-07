import { EditorView, keymap } from '@codemirror/view';
import { Prec } from '@codemirror/state';
import { editorInfoField } from 'obsidian';
import type DynamicTimetable from '../main';
import { ParseOptions } from '../core/types';
import { isTaskLine, parseDocument, splitFrontmatter } from '../core/document';
import { CONT_RE, layoutToday } from '../core/layout';
import { todayISO } from '../core/date';

const ISO_RE = /(\d{4}-\d{2}-\d{2})/;
const DAILY_RE = /^\d{4}-\d{2}-\d{2}$/;

const genBlockId = (): string => Math.random().toString(36).slice(2, 8);

function noteDateFor(view: EditorView): string {
  const base =
    (
      view.state.field(editorInfoField, false) as
        | { file?: { basename?: string } | null }
        | undefined
    )?.file?.basename ?? '';
  const m = base.match(ISO_RE);
  return m ? m[1] : todayISO();
}

function isManaged(basename: string, content: string): boolean {
  return DAILY_RE.test(basename) || /^\s*(working_hours|day_start)\s*:/m.test(content);
}

/** First block-start line (task or continuation) at or after `from`, else `regionTo`. */
function nextBlockStart(lines: string[], from: number, regionTo: number): number {
  for (let i = from; i < regionTo && i < lines.length; i++) {
    if (isTaskLine(lines[i]) || CONT_RE.test(lines[i])) return i;
  }
  return regionTo;
}

/**
 * Move the cursor's today task block (its `- [ ]` line + memo) up/down one
 * priority. We swap it with the adjacent today task in document order, then run
 * the layout so the schedule (and any split continuations) re-settles. A fixed
 * `@`-time task snaps back to its slot, which is correct.
 */
function move(view: EditorView, dir: 'up' | 'down', opts: ParseOptions): boolean {
  const doc = view.state.doc;
  const content = doc.toString();
  const info = view.state.field(editorInfoField, false) as
    | { file?: { basename?: string } | null }
    | undefined;
  if (!isManaged(info?.file?.basename ?? '', content)) return false;

  const parsed = parseDocument(content, opts);
  const today = parsed.today;
  if (today.length < 2) return false;

  const { bodyOffset } = splitFrontmatter(content);
  const regionTo = parsed.dividerLineNo ?? doc.lines;
  const lines = content.split('\n');
  const head = view.state.selection.main.head;
  const cur = doc.lineAt(head).number - 1;
  if (cur < bodyOffset || cur >= regionTo) return false;

  let ci = -1;
  for (let k = 0; k < today.length; k++) if (today[k].lineNo <= cur) ci = k;
  if (ci < 0) return false;
  // Cursor must be in the task's own primary block, not a continuation below it.
  if (cur >= nextBlockStart(lines, today[ci].lineNo + 1, regionTo)) return false;

  // Only flexible tasks can be reprioritized — a fixed `@`-time task is anchored,
  // and swapping past a fixed task changes nothing. So step to the adjacent
  // FLEXIBLE task, skipping fixed ones.
  if (today[ci].anchorMinutes !== null) return true;
  let target = -1;
  if (dir === 'up') {
    for (let k = ci - 1; k >= 0; k--)
      if (today[k].anchorMinutes === null) {
        target = k;
        break;
      }
  } else {
    for (let k = ci + 1; k < today.length; k++)
      if (today[k].anchorMinutes === null) {
        target = k;
        break;
      }
  }
  if (target < 0) return true;

  const range = (k: number) => {
    const start = today[k].lineNo;
    return { start, end: nextBlockStart(lines, start + 1, regionTo) };
  };
  const a = range(ci);
  const b = range(target);
  const [lo, hi] = a.start < b.start ? [a, b] : [b, a];
  const swapped = [
    ...lines.slice(0, lo.start),
    ...lines.slice(hi.start, hi.end),
    ...lines.slice(lo.end, hi.start),
    ...lines.slice(lo.start, lo.end),
    ...lines.slice(hi.end),
  ];

  const layout = layoutToday(swapped.join('\n'), genBlockId, noteDateFor(view), opts);

  const from = doc.line(bodyOffset + 1).from;
  const to = regionTo < doc.lines ? doc.line(regionTo + 1).from : doc.length;
  const tail = regionTo < doc.lines ? '\n' : '';
  const insert = layout.blocks.flatMap((bl) => bl.lines).join('\n') + tail;
  const currentRegion = lines.slice(bodyOffset, regionTo).join('\n') + tail;
  if (insert === currentRegion) return true; // no net change (e.g. fixed task)

  // Map the cursor to the moved task's new block (it ends up at doc index `target`).
  const within = Math.max(0, head - doc.line(today[ci].lineNo + 1).from);
  let anchor = from;
  let offset = from;
  for (const bl of layout.blocks) {
    const text = bl.lines.join('\n');
    if (bl.key === `p:${target}`) {
      anchor = offset + Math.min(within, text.length);
      break;
    }
    offset += text.length + 1;
  }

  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor },
    scrollIntoView: true,
  });
  return true;
}

/**
 * Alt+T then ↑/↓ (a key chord) moves the whole today task block (line + memo)
 * by one priority. Using a chord avoids clashing with Alt+↑/↓ line-move.
 */
export function taskMoveKeymap(plugin: DynamicTimetable) {
  const opts = (): ParseOptions => ({
    estimateDelimiter: plugin.settings.taskEstimateDelimiter,
    startTimeDelimiter: plugin.settings.startTimeDelimiter,
  });
  return Prec.high(
    keymap.of([
      { key: 'Alt-t ArrowUp', run: (view) => move(view, 'up', opts()) },
      { key: 'Alt-t ArrowDown', run: (view) => move(view, 'down', opts()) },
    ])
  );
}
