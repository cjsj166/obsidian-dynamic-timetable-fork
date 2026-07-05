import {
  DEFAULT_PARSE_OPTIONS,
  Frontmatter,
  ParseOptions,
  TaskLine,
} from './types';
import { parseDocument } from './document';
import {
  BelowProjection,
  TodayProjection,
  capacityFor,
  projectBelow,
  projectToday,
} from './projection';

/**
 * Everything the sidebar view needs to render, derived purely from the note
 * content. No Obsidian / DOM dependency — unit-testable in plain Node.
 */
export interface ViewModel {
  frontmatter: Frontmatter;
  today: TodayProjection;
  below: BelowProjection;
  /** True when the body had a `---` divider separating today / below. */
  hasDivider: boolean;
  /** Absolute line index of the `---` divider, or null when there is none. */
  dividerLineNo: number | null;
  /** The date the note represents (`YYYY-MM-DD`). */
  noteDate: string;
  /** Capacity (minutes) for `noteDate`: working_hours + that day's override. */
  capacityMin: number;
}

/**
 * Parse a daily-note and project both sections. Everything is derived from the
 * note (its `day_start` / `working_hours` / overrides and its title date) — the
 * real wall-clock is never consulted, so the view is identical regardless of
 * when it is opened.
 *
 * @param content  raw note text (including frontmatter)
 * @param noteDate `YYYY-MM-DD` the note represents (drives capacity + below queue)
 */
export function buildViewModel(
  content: string,
  noteDate: string,
  opts: ParseOptions = DEFAULT_PARSE_OPTIONS
): ViewModel {
  const doc = parseDocument(content, opts);
  const capacityMin = capacityFor(doc.frontmatter, noteDate);
  const today = projectToday(
    doc.today,
    doc.frontmatter.dayStartMin,
    capacityMin
  );
  const below = projectBelow(doc.below, doc.frontmatter, noteDate);
  return {
    frontmatter: doc.frontmatter,
    today,
    below,
    hasDivider: doc.hasDivider,
    dividerLineNo: doc.dividerLineNo,
    noteDate,
    capacityMin,
  };
}

/** All task lines referenced by a view model, in display order. */
export function allTaskLines(vm: ViewModel): TaskLine[] {
  return [
    ...vm.today.rows.map((r) => r.task),
    ...vm.below.rows.map((r) => r.task),
  ];
}
