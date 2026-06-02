// Pure, content-preserving document edits keyed by absolute line index.
// Everything else in the note (prose, blank lines, headings, the divider) is
// left untouched — only the dragged line moves.

/**
 * Move the line at `fromIndex` so it sits at `toIndex` in the resulting
 * document, preserving every other line verbatim.
 *
 * `toIndex` is interpreted against the ORIGINAL line numbering (the insertion
 * point "before the line currently at toIndex"); the shift caused by removing
 * the source line is handled internally. Crossing the `---` divider is just a
 * move past that line — no special-casing needed.
 *
 * Returns the content unchanged when the indices are out of range or a no-op.
 */
export function moveLine(
  content: string,
  fromIndex: number,
  toIndex: number
): string {
  const lines = content.split('\n');
  if (fromIndex < 0 || fromIndex >= lines.length) {
    return content;
  }
  // Clamp the destination into the original range.
  const target = Math.max(0, Math.min(lines.length, toIndex));
  // Moving to its own slot (or the slot right after itself) is a no-op.
  if (target === fromIndex || target === fromIndex + 1) {
    return content;
  }

  const [moved] = lines.splice(fromIndex, 1);
  // Removing an earlier line shifts every later index down by one.
  const dest = fromIndex < target ? target - 1 : target;
  lines.splice(dest, 0, moved);
  return lines.join('\n');
}

/**
 * Compute the absolute insertion index for dropping next to a target line.
 * `after` true → insert just below the target; false → just above it.
 */
export function dropIndex(targetLineNo: number, after: boolean): number {
  return after ? targetLineNo + 1 : targetLineNo;
}

/** Append a `---` divider line at the end of the document. */
export function appendDivider(content: string): string {
  return content + '\n---';
}
