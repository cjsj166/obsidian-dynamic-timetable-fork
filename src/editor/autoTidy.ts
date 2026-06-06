import { EditorView, ViewUpdate } from '@codemirror/view';
import { editorInfoField } from 'obsidian';
import type DynamicTimetable from '../main';
import { ParseOptions } from '../core/types';
import {
  analyzeNotes,
  findFirstMarkerLine,
  markerLine,
  reorderMarkersToTasks,
} from '../core/notes';
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
 * Stamp `^id` on tasks lacking one and append a `%%task:<id>%%` marker for each
 * task without one — as TARGETED point inserts so the cursor never jumps.
 * Returns true if it dispatched a change.
 */
function ensureIdsAndMarkers(view: EditorView, opts: ParseOptions): boolean {
  const content = view.state.doc.toString();
  const a = analyzeNotes(content, opts);

  const used = new Set<string>();
  for (const t of a.tasks) if (t.id) used.add(t.id);
  for (const s of a.segments) used.add(s.id);

  const changes: { from: number; to: number; insert: string }[] = [];
  const newIds: string[] = [];

  for (const t of a.tasks) {
    if (t.id) continue;
    let id = genBlockId();
    let guard = 0;
    while (used.has(id) && guard++ < 10000) id = genBlockId();
    used.add(id);
    newIds.push(id);
    const line = view.state.doc.line(t.lineNo + 1);
    changes.push({ from: line.to, to: line.to, insert: ` ^${id}` });
  }

  const have = new Set(a.segments.map((s) => s.id));
  const taskIds = [...a.tasks.map((t) => t.id).filter(Boolean), ...newIds] as string[];
  const missing = taskIds.filter((id) => !have.has(id));
  if (missing.length > 0) {
    const append = '\n\n' + missing.map((id) => `${markerLine(id)}\n`).join('\n');
    const end = view.state.doc.length;
    changes.push({ from: end, to: end, insert: append });
  }

  if (changes.length === 0) return false;
  view.dispatch({ changes });
  return true;
}

/**
 * Auto-manage task ids / note markers while editing a managed note.
 *
 * On a debounced pause it (1) stamps ids + creates missing markers (cursor-safe
 * point inserts), and (2) when the cursor is in the TASK region, reorders the
 * note markers to match task order — the notes-region rewrite stays below the
 * cursor, so it never disrupts memo editing.
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
      // 1) ids + markers first (a follow-up pass handles ordering).
      if (ensureIdsAndMarkers(view, o)) return;

      // 2) reorder only while editing the task region (rewrite stays below cursor).
      const lines = content.split('\n');
      const first = findFirstMarkerLine(lines);
      if (first === null) return;
      const firstMarkerFrom = view.state.doc.line(first + 1).from;
      if (view.state.selection.main.head >= firstMarkerFrom) return;

      const reordered = reorderMarkersToTasks(content, o);
      if (reordered !== content) applyMinimalChange(view, reordered);
    }, DEBOUNCE_MS);
  });
}
