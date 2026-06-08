import { EditorView, ViewUpdate } from '@codemirror/view';
import { editorInfoField } from 'obsidian';
import type DynamicTimetable from '../main';
import { ParseOptions } from '../core/types';
import { isTaskLine, parseDocument, splitFrontmatter } from '../core/document';
import { CONT_RE, layoutToday } from '../core/layout';
import { todayISO } from '../core/date';

const ISO_RE = /(\d{4}-\d{2}-\d{2})/;
const DAILY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEBOUNCE_MS = 450;

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

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Manage daily notes, notes with our frontmatter, or any note that already has
 *  a task carrying a time condition (`@`/`;`). */
function isManaged(basename: string, content: string, opts: ParseOptions): boolean {
  if (DAILY_RE.test(basename)) return true;
  if (/^\s*(working_hours|day_start)\s*:/m.test(content)) return true;
  const d = `${escapeRegex(opts.startTimeDelimiter)}|${escapeRegex(opts.estimateDelimiter)}`;
  return new RegExp(`^\\s*[-+*]\\s*\\[.\\][^\\n]*(?:${d})`, 'm').test(content);
}

/** The today block the cursor sits in: its layout key + start line, or null. */
function cursorBlock(
  view: EditorView,
  opts: ParseOptions
): { key: string; startLine: number } | null {
  const doc = view.state.doc;
  const content = doc.toString();
  const lines = content.split('\n');
  const parsed = parseDocument(content, opts);
  const { bodyOffset } = splitFrontmatter(content);
  const regionTo = parsed.dividerLineNo ?? lines.length;
  const cur = doc.lineAt(view.state.selection.main.head).number - 1;
  if (cur < bodyOffset || cur >= regionTo) return null; // outside today region

  let bs = -1;
  for (let i = bodyOffset; i <= cur && i < lines.length; i++) {
    if (isTaskLine(lines[i]) || CONT_RE.test(lines[i])) bs = i;
  }
  if (bs < 0) return { key: '__pre__', startLine: bodyOffset };
  if (isTaskLine(lines[bs])) {
    const ti = parsed.today.findIndex((t) => t.lineNo === bs);
    return { key: `p:${ti}`, startLine: bs };
  }
  const m = lines[bs].match(CONT_RE);
  return { key: `c:${m![1]}:${Number(m![2])}`, startLine: bs };
}

/** Lay out the today region (split continuations + start-time order), keeping cursor. */
function applyLayout(view: EditorView, opts: ParseOptions): void {
  const doc = view.state.doc;
  const layout = layoutToday(doc.toString(), genBlockId, noteDateFor(view), opts);
  if (!layout.changed) return;

  const from = doc.line(layout.regionFromLine + 1).from;
  const to =
    layout.regionToLine < doc.lines ? doc.line(layout.regionToLine + 1).from : doc.length;
  const insert =
    layout.blocks.flatMap((b) => b.lines).join('\n') +
    (layout.regionToLine < doc.lines ? '\n' : '');

  let anchor: number | null = null;
  const head = view.state.selection.main.head;
  if (head >= from && head < to) {
    const cb = cursorBlock(view, opts);
    if (cb) {
      const within = head - doc.line(cb.startLine + 1).from;
      let offset = from;
      for (const b of layout.blocks) {
        const text = b.lines.join('\n');
        if (b.key === cb.key) {
          anchor = offset + Math.min(within, text.length);
          break;
        }
        offset += text.length + 1;
      }
    }
  }

  view.dispatch({
    changes: { from, to, insert },
    selection: anchor !== null ? { anchor } : undefined,
  });
}

/**
 * Auto-lay-out the today region when the cursor leaves a task block: order
 * blocks by start time and create/merge `%%task:<id> k/n%%` continuation blocks
 * for split tasks. Suppressed while the cursor stays in one block, so nothing
 * moves mid-edit. The reorder is applied as one change with cursor remapping.
 */
export function autoLayoutExtension(plugin: DynamicTimetable) {
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
      const o = opts();
      if (!isManaged(info?.file?.basename ?? '', content, o)) return;
      const key = cursorBlock(view, o)?.key ?? null;
      if (key !== null && key === lastKey) return; // still in the same block
      applyLayout(view, o);
      lastKey = cursorBlock(view, o)?.key ?? null;
    }, DEBOUNCE_MS);
  });
}
