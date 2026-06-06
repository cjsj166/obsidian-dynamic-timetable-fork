import { EditorView } from '@codemirror/view';

/**
 * Compute the single minimal replacement range turning `cur` into `next`
 * (common prefix/suffix trimmed). Returns null when they are equal.
 *
 * A single range is fine when the change is contiguous; for scattered edits
 * (e.g. an id stamped up top AND a marker appended at the end) dispatch
 * targeted point changes instead, so a cursor between them is not swallowed.
 */
export function diffRange(
  cur: string,
  next: string
): { from: number; to: number; insert: string } | null {
  if (cur === next) return null;
  const min = Math.min(cur.length, next.length);
  let p = 0;
  while (p < min && cur.charCodeAt(p) === next.charCodeAt(p)) p++;
  let s = 0;
  while (
    s < min - p &&
    cur.charCodeAt(cur.length - 1 - s) === next.charCodeAt(next.length - 1 - s)
  ) {
    s++;
  }
  return { from: p, to: cur.length - s, insert: next.slice(p, next.length - s) };
}

/** Apply `next` to the editor as a minimal change; returns false if unchanged. */
export function applyMinimalChange(view: EditorView, next: string): boolean {
  const d = diffRange(view.state.doc.toString(), next);
  if (!d) return false;
  view.dispatch({ changes: d });
  return true;
}
