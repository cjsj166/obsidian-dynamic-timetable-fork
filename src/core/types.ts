// Pure data types for the document model and projection.
// IMPORTANT: nothing in src/core may import from 'obsidian' or from main.ts —
// these modules must stay unit-testable in plain Node.

export type TaskStatus = 'open' | 'done';

/** A single `- [ ]` task line parsed from the note body. */
export interface TaskLine {
  /** Original raw line text (without trailing newline). */
  raw: string;
  /** 0-based line index within the whole document (for file rewrites). */
  lineNo: number;
  status: TaskStatus;
  /** Display name with delimiters/tags stripped. */
  name: string;
  /** Minutes-of-day for an `@ HH:MM` anchor, else null. */
  anchorMinutes: number | null;
  /** `YYYY-MM-DD` for a date-pinned `@` anchor (below section), else null. */
  anchorDate: string | null;
  /** Estimated duration in minutes, or null when no `; duration` was given. */
  durationMin: number | null;
  /** `#tag` categories, in order of appearance. */
  categories: string[];
  /** Non-null when the line looked like a task but could not be fully parsed. */
  parseError: string | null;
}

export interface CapacityOverride {
  date: string; // YYYY-MM-DD
  deltaMin: number; // signed delta relative to working_hours
}

export interface Frontmatter {
  /** Available working time for a normal day, in minutes. Default 420 (7:00). */
  workingHoursMin: number;
  /** Minutes-of-day the today schedule starts from. Default 540 (9:00). */
  dayStartMin: number;
  capacityOverrides: CapacityOverride[];
  /** Non-null when frontmatter could not be parsed cleanly. */
  error: string | null;
}

export interface ParsedDocument {
  frontmatter: Frontmatter;
  today: TaskLine[];
  below: TaskLine[];
  /** True when the body contained a `---` divider separating today / below. */
  hasDivider: boolean;
  /** Absolute line index of the `---` divider, or null when there is none. */
  dividerLineNo: number | null;
}

export interface ParseOptions {
  /** Delimiter before the duration token. Default ';'. */
  estimateDelimiter: string;
  /** Delimiter before the start-time anchor. Default '@'. */
  startTimeDelimiter: string;
}

export const DEFAULT_PARSE_OPTIONS: ParseOptions = {
  estimateDelimiter: ';',
  startTimeDelimiter: '@',
};

/** Default working hours when frontmatter omits `working_hours`: 7:00. */
export const DEFAULT_WORKING_HOURS_MIN = 7 * 60;

/** Default day start when frontmatter omits `day_start`: 9:00. */
export const DEFAULT_DAY_START_MIN = 9 * 60;
