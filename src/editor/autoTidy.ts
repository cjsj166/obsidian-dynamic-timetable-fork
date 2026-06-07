import { EditorView, ViewUpdate } from '@codemirror/view';
import { editorInfoField } from 'obsidian';
import type DynamicTimetable from '../main';
import { ParseOptions } from '../core/types';
import { analyzeNotes, findFirstMarkerLine, reconcileNotes } from '../core/notes';
import { applyMinimalChange } from './writeback';

const DAILY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEBOUNCE_MS = 700;

/** A short random id (Obsidian block-id style). */
export const genBlockId = (): string => Math.random().toString(36).slice(2, 8);

/** Only manage daily notes, or notes that already use task markers. */
function isManaged(basename: string, content: string): boolean {
  return DAILY_RE.test(basename) || /^%%task:/m.test(content);
}

/**
 * Stamp a fresh `^id` on every task lacking one — as TARGETED point inserts at
 * each task line's end, so the cursor never jumps. Returns true if it
 * dispatched a change. Marker blocks are created/merged separately by
 * reconcileNotes (which rewrites the notes region).
 */
function ensureIds(view: EditorView, opts: ParseOptions): boolean {
  const a = analyzeNotes(view.state.doc.toString(), opts);

  const used = new Set<string>();
  for (const t of a.tasks) if (t.id) used.add(t.id);
  for (const s of a.segments) used.add(s.id);

  const changes: { from: number; to: number; insert: string }[] = [];
  for (const t of a.tasks) {
    if (t.id) continue;
    let id = genBlockId();
    let guard = 0;
    while (used.has(id) && guard++ < 10000) id = genBlockId();
    used.add(id);
    const line = view.state.doc.line(t.lineNo + 1);
    changes.push({ from: line.to, to: line.to, insert: ` ^${id}` });
  }

  if (changes.length === 0) return false;
  view.dispatch({ changes });
  return true;
}

/**
 * Auto-manage task ids / note blocks while editing a managed note.
 *
 * On a debounced pause it (1) stamps missing ids (cursor-safe point inserts),
 * and (2) when the cursor is in the TASK region, reconciles the note blocks to
 * the timeline (create per-segment blocks, merge collapsed splits, reorder by
 * start). The notes-region rewrite stays below the cursor, so memo editing is
 * never disrupted — block changes settle once the cursor leaves the memos.
 */
export function autoTidyExtension(plugin: DynamicTimetable) {
  let timer: number | null = null;
  const opts = (): ParseOptions => ({
    estimateDelimiter: plugin.settings.taskEstimateDelimiter,
    startTimeDelimiter: plugin.settings.startTimeDelimiter,
  });

  return EditorView.updateListener.of((u: ViewUpdate) => {
    if (!u.docChanged) return;
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
      // 1) ids first (a follow-up pass reconciles blocks).
      if (ensureIds(view, o)) return;

      // 2) reconcile only while editing the task region (rewrite stays below).
      const lines = content.split('\n');
      const first = findFirstMarkerLine(lines);
      const head = view.state.selection.main.head;
      const inTaskRegion =
        first === null || head < view.state.doc.line(first + 1).from;
      if (!inTaskRegion) return;

      const next = reconcileNotes(content, o).content;
      if (next !== content) applyMinimalChange(view, next);
    }, DEBOUNCE_MS);
  });
}
