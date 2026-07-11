import {
  CapacityOverride,
  DEFAULT_DAY_START_MIN,
  DEFAULT_PARSE_OPTIONS,
  DEFAULT_WORKING_HOURS_MIN,
  Frontmatter,
  ParsedDocument,
  ParseOptions,
  TaskLine,
  TaskStatus,
} from './types';
import { parseClock, parseDuration } from './time';
import { isISODate } from './date';

const CHECKBOX_RE = /^[-+*]\s*\[(.)\]\s*/;
// Trailing Obsidian block id: whitespace + `^id` at the end of the line.
const BLOCK_ID_RE = /\s\^([A-Za-z0-9-]+)\s*$/;
const TAG_RE = /\s#([^\s!#$%&'()*+,./:;<=>?@[\\\]^`{|}~]+)/gu;
const WIKILINK_RE = /\[\[([^[\]]*\|)?([^[\]]+)\]\]/g;
const MDLINK_RE = /\[([^[\]]+)\]\(.+?\)/g;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// Frontmatter
// ---------------------------------------------------------------------------

/**
 * Split a document into its YAML frontmatter text (if any) and the body lines,
 * tracking the absolute line offset of the body for later file rewrites.
 */
export function splitFrontmatter(content: string): {
  frontmatterText: string | null;
  bodyLines: string[];
  bodyOffset: number;
} {
  const lines = content.split('\n');
  if (lines.length > 0 && lines[0].trim() === '---') {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === '---') {
        return {
          frontmatterText: lines.slice(1, i).join('\n'),
          bodyLines: lines.slice(i + 1),
          bodyOffset: i + 1,
        };
      }
    }
  }
  return { frontmatterText: null, bodyLines: lines, bodyOffset: 0 };
}

export function parseFrontmatter(text: string | null): Frontmatter {
  const fm: Frontmatter = {
    workingHoursMin: DEFAULT_WORKING_HOURS_MIN,
    dayStartMin: DEFAULT_DAY_START_MIN,
    capacityOverrides: [],
    error: null,
  };
  if (!text) {
    return fm;
  }

  const lines = text.split('\n');
  const errors: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const whMatch = line.match(/^working_hours:\s*(\S+)/);
    if (whMatch) {
      const min = parseDuration(whMatch[1]);
      if (min === null) {
        errors.push(`working_hours: "${whMatch[1]}" is not H:MM or minutes`);
      } else {
        fm.workingHoursMin = min;
      }
      continue;
    }

    const dsMatch = line.match(/^day_start:\s*(\S+)/);
    if (dsMatch) {
      const min = parseClock(dsMatch[1]);
      if (min === null) {
        errors.push(`day_start: "${dsMatch[1]}" is not a valid HH:MM time`);
      } else {
        fm.dayStartMin = min;
      }
      continue;
    }

    if (/^capacity_overrides:/.test(line)) {
      // Consume following indented list items ("  - YYYY-MM-DD +H:MM").
      for (let j = i + 1; j < lines.length; j++) {
        const item = lines[j].match(/^\s*-\s*(.+?)\s*$/);
        if (!item) {
          break;
        }
        const ov = parseCapacityOverride(item[1]);
        if (ov.error) {
          errors.push(ov.error);
        } else if (ov.override) {
          fm.capacityOverrides.push(ov.override);
        }
        i = j;
      }
    }
  }

  if (errors.length > 0) {
    fm.error = errors.join('; ');
  }
  return fm;
}

function parseCapacityOverride(raw: string): {
  override?: CapacityOverride;
  error?: string;
} {
  // Sign is required per spec: "YYYY-MM-DD +H:MM" or "... -H:MM".
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})\s+([+-])(\d+):(\d{2})$/);
  if (!m) {
    return {
      error: `capacity_overrides: "${raw}" must be "YYYY-MM-DD +/-H:MM"`,
    };
  }
  const sign = m[2] === '-' ? -1 : 1;
  const deltaMin = sign * (Number(m[3]) * 60 + Number(m[4]));
  return { override: { date: m[1], deltaMin } };
}

// ---------------------------------------------------------------------------
// Task lines
// ---------------------------------------------------------------------------

export function isTaskLine(line: string): boolean {
  return CHECKBOX_RE.test(line.trim());
}

export function hasTimeCondition(t: TaskLine): boolean {
  return (
    t.anchorMinutes !== null ||
    t.anchorDate !== null ||
    t.durationMin !== null ||
    t.parseError !== null
  );
}

export function isTimedTaskLine(
  line: string,
  opts: ParseOptions = DEFAULT_PARSE_OPTIONS
): boolean {
  const t = parseTaskLine(line, 0, opts);
  return t !== null && hasTimeCondition(t);
}

/**
 * Parse one `- [ ]` line into a TaskLine. Returns null if `line` is not a task
 * line. `lineNo` is the absolute line index in the document.
 */
export function parseTaskLine(
  line: string,
  lineNo: number,
  opts: ParseOptions = DEFAULT_PARSE_OPTIONS
): TaskLine | null {
  const trimmed = line.trim();
  const cb = trimmed.match(CHECKBOX_RE);
  if (!cb) {
    return null;
  }

  const statusChar = cb[1].toLowerCase();
  const status: TaskStatus = statusChar === 'x' ? 'done' : 'open';
  const body = trimmed.slice(cb[0].length);

  const sep = escapeRegex(opts.estimateDelimiter);
  const st = escapeRegex(opts.startTimeDelimiter);

  const dateTimeRe = new RegExp(
    `${st}\\s*(\\d{4}-\\d{2}-\\d{2})[ T](\\d{1,2}:?\\d{2})`
  );
  const timeRe = new RegExp(`${st}\\s*(\\d{1,2}:?\\d{2})`);
  // The full token immediately after each delimiter, for validation/stripping.
  const durTokenRe = new RegExp(`${sep}\\s*(\\S+)`);
  const stTokenRe = new RegExp(`${st}\\s*(\\S+)`);

  const errors: string[] = [];

  let anchorDate: string | null = null;
  let anchorMinutes: number | null = null;
  const dtMatch = body.match(dateTimeRe);
  if (dtMatch) {
    anchorDate = isISODate(dtMatch[1]) ? dtMatch[1] : null;
    anchorMinutes = parseClock(dtMatch[2]);
  } else {
    const tMatch = body.match(timeRe);
    if (tMatch) {
      anchorMinutes = parseClock(tMatch[1]);
    }
  }

  // An `@` followed by a digit-led token that didn't parse is malformed.
  const stTok = body.match(stTokenRe);
  if (
    stTok &&
    anchorMinutes === null &&
    anchorDate === null &&
    /^\d/.test(stTok[1])
  ) {
    errors.push(`invalid time "${stTok[1]}" after ${opts.startTimeDelimiter}`);
  }

  // Duration: the token after `;` must be H:MM or an integer minute count.
  let durationMin: number | null = null;
  const durTok = body.match(durTokenRe);
  if (durTok) {
    const parsed = parseDuration(durTok[1]);
    if (parsed === null) {
      errors.push(`invalid duration "${durTok[1]}" (use H:MM or minutes)`);
    } else {
      durationMin = parsed;
    }
  }

  const categories: string[] = [];
  let tagMatch: RegExpExecArray | null;
  TAG_RE.lastIndex = 0;
  while ((tagMatch = TAG_RE.exec(body)) !== null) {
    categories.push(tagMatch[1]);
  }

  // Trailing Obsidian block id (`^id`), used to match a notes marker.
  const idMatch = body.match(BLOCK_ID_RE);
  const id = idMatch ? idMatch[1] : null;

  // Build the display name: strip anchor + duration tokens, tags, links, and id.
  let name = body;
  if (dtMatch) {
    name = name.replace(dtMatch[0], '');
  } else if (stTok && /^\d/.test(stTok[1])) {
    name = name.replace(stTok[0], '');
  }
  if (durTok) {
    name = name.replace(durTok[0], '');
  }
  name = name
    .replace(BLOCK_ID_RE, '')
    .replace(TAG_RE, '')
    .replace(WIKILINK_RE, '$2')
    .replace(MDLINK_RE, '$1')
    .trim();

  return {
    raw: line,
    lineNo,
    status,
    name,
    anchorMinutes,
    anchorDate,
    durationMin,
    categories,
    id,
    parseError: errors.length > 0 ? errors.join('; ') : null,
  };
}

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

/**
 * Parse a full daily-note into frontmatter + today/below task lists.
 *
 * The body is split at the first standalone `---` line (the divider). Lines
 * above it are "today", below it are "below". When there is no divider the
 * whole body is treated as today.
 */
export function parseDocument(
  content: string,
  opts: ParseOptions = DEFAULT_PARSE_OPTIONS
): ParsedDocument {
  const { frontmatterText, bodyLines, bodyOffset } = splitFrontmatter(content);
  const frontmatter = parseFrontmatter(frontmatterText);

  // Catch the common mistake of frontmatter keys without the opening `---`
  // fence: they'd otherwise be silently read as body text (defaults applied).
  if (frontmatterText === null) {
    const looksLikeFrontmatter = bodyLines
      .slice(0, 8)
      .some((l) =>
        /^\s*(working_hours|day_start|capacity_overrides)\s*:/.test(l)
      );
    if (looksLikeFrontmatter) {
      frontmatter.error =
        'frontmatter "---" 펜스가 없습니다 — 설정이 무시되고 기본값이 적용됩니다';
    }
  }

  let dividerIndex = -1;
  for (let i = 0; i < bodyLines.length; i++) {
    if (bodyLines[i].trim() === '---') {
      dividerIndex = i;
      break;
    }
  }

  const today: TaskLine[] = [];
  const below: TaskLine[] = [];
  const hasDivider = dividerIndex >= 0;
  const todayEnd = hasDivider ? dividerIndex : bodyLines.length;

  for (let i = 0; i < bodyLines.length; i++) {
    if (i === dividerIndex) {
      continue;
    }
    const task = parseTaskLine(bodyLines[i], bodyOffset + i, opts);
    if (!task) {
      continue;
    }
    if (!hasTimeCondition(task)) {
      continue;
    }
    if (i < todayEnd) {
      today.push(task);
    } else {
      below.push(task);
    }
  }

  return {
    frontmatter,
    today,
    below,
    hasDivider,
    dividerLineNo: hasDivider ? bodyOffset + dividerIndex : null,
  };
}
