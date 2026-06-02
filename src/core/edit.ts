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

/** Width of the leading indentation (spaces/tabs) of a line. */
function leadingWidth(line: string): number {
  const m = line.match(/^[ \t]*/);
  return m ? m[0].length : 0;
}

/**
 * Exclusive end index of the "block" owned by the task line at `startIndex`:
 * the task line itself plus the following lines that are more indented than it
 * (its children / notes). Blank lines are absorbed only when a still-deeper
 * line follows them; the `---` divider and same/shallower lines end the block.
 */
export function taskBlockEnd(lines: string[], startIndex: number): number {
  if (startIndex < 0 || startIndex >= lines.length) return startIndex + 1;
  const indent = leadingWidth(lines[startIndex]);
  let end = startIndex + 1;
  let i = startIndex + 1;
  while (i < lines.length) {
    if (lines[i].trim() === '') {
      let k = i + 1;
      while (k < lines.length && lines[k].trim() === '') k++;
      if (k < lines.length && leadingWidth(lines[k]) > indent) {
        i = k + 1;
        end = i;
        continue;
      }
      break;
    }
    if (leadingWidth(lines[i]) > indent) {
      i++;
      end = i;
      continue;
    }
    break;
  }
  return end;
}

/**
 * Move the block `[startIndex, endIndex)` so it sits at `toIndex` in the
 * resulting document (interpreted against the original numbering). The shift
 * from removing the block is handled internally. No-op when `toIndex` lands
 * inside the block being moved.
 */
export function moveBlock(
  content: string,
  startIndex: number,
  endIndex: number,
  toIndex: number
): string {
  const lines = content.split('\n');
  if (startIndex < 0 || startIndex >= lines.length || endIndex <= startIndex) {
    return content;
  }
  if (toIndex >= startIndex && toIndex <= endIndex) {
    return content; // dropping within the moved block
  }
  const block = lines.slice(startIndex, endIndex);
  const rest = [...lines.slice(0, startIndex), ...lines.slice(endIndex)];
  const dest =
    toIndex > endIndex ? toIndex - block.length : Math.min(toIndex, startIndex);
  const clamped = Math.max(0, Math.min(rest.length, dest));
  rest.splice(clamped, 0, ...block);
  return rest.join('\n');
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
