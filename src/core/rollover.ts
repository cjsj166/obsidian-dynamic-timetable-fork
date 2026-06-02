// Pure day-rollover transforms. The Obsidian glue (resolving / creating daily
// notes, persisting last_rollover) lives in src/DailyNotes.ts + src/Rollover.ts.

import { DEFAULT_PARSE_OPTIONS, ParseOptions } from './types';
import { parseDocument } from './document';

/** Raw lines of the incomplete (`- [ ]`) tasks in a note's today section. */
export function collectIncompleteToday(
  content: string,
  opts: ParseOptions = DEFAULT_PARSE_OPTIONS
): string[] {
  const doc = parseDocument(content, opts);
  return doc.today.filter((t) => t.status === 'open').map((t) => t.raw);
}

/**
 * Insert `lines` at the top of `content`'s below section, returning the new
 * content. When the note has no `---` divider one is created (so the carried
 * tasks land in a real below section rather than being read as today tasks).
 */
export function insertIntoBelowTop(
  content: string,
  lines: string[],
  opts: ParseOptions = DEFAULT_PARSE_OPTIONS
): string {
  if (lines.length === 0) {
    return content;
  }
  const doc = parseDocument(content, opts);
  if (doc.dividerLineNo != null) {
    const all = content.split('\n');
    all.splice(doc.dividerLineNo + 1, 0, ...lines);
    return all.join('\n');
  }
  const body = content.replace(/\s+$/, '');
  const block = `---\n${lines.join('\n')}`;
  return body.length > 0 ? `${body}\n${block}` : block;
}

/**
 * Roll incomplete today tasks from `yesterdayContent` into the top of
 * `todayContent`'s below section. Returns the (possibly unchanged) new today
 * content and the carried raw lines.
 */
export function rolloverInto(
  yesterdayContent: string,
  todayContent: string,
  opts: ParseOptions = DEFAULT_PARSE_OPTIONS
): { content: string; carried: string[] } {
  const carried = collectIncompleteToday(yesterdayContent, opts);
  return { content: insertIntoBelowTop(todayContent, carried, opts), carried };
}

/** Rollover guard: only run when we have not already rolled over for `today`. */
export function shouldRollover(
  lastRollover: string | null | undefined,
  today: string
): boolean {
  return !lastRollover || lastRollover < today;
}
