// Pure model for the notes region of a daily note.
//
// A daily note is split into a TASK region (the `- [ ]` lines, with the
// today/below `---` divider among them) and a NOTES region that begins at the
// first `%%task:<id>%%` marker line. Each marker delimits a freeform note
// segment that is matched to a task by the task's Obsidian block id (`^id`).
//
// Everything here is pure (no `obsidian` import) and unit-testable.

import {
  DEFAULT_PARSE_OPTIONS,
  ParsedDocument,
  ParseOptions,
  TaskLine,
} from './types';
import { isTaskLine, parseDocument, parseTaskLine } from './document';
import { projectToday } from './projection';

/** A `%%task:<id>%%` marker line. id chars match the task block-id charset. */
export const MARKER_RE = /^%%task:([A-Za-z0-9-]+)%%\s*$/;

/** Build a marker line for a given id. */
export function markerLine(id: string): string {
  return `%%task:${id}%%`;
}

export interface NoteSegment {
  id: string;
  /** Absolute line index of the `%%task:<id>%%` marker line. */
  markerLineNo: number;
  /** Absolute line index where the note body begins (marker + 1). */
  bodyStart: number;
  /** Absolute line index just past the note body (exclusive). */
  bodyEnd: number;
  /** The note body text (between this marker and the next, trimmed of trailing blanks). */
  text: string;
}

export interface NoteMatch {
  /** One entry per task, in document order; `segment` is null when unmatched. */
  pairs: { task: TaskLine; segment: NoteSegment | null }[];
  /** Tasks with no id, or whose id has no marker (need an id/marker created). */
  unassignedTasks: TaskLine[];
  /** Markers whose id matches no task (e.g. the task was deleted). */
  orphanSegments: NoteSegment[];
}

export interface NoteAnalysis extends NoteMatch {
  /** Frontmatter + today/below tasks parsed from the task region only. */
  doc: ParsedDocument;
  /** All tasks in document order (today, then below). */
  tasks: TaskLine[];
  segments: NoteSegment[];
  /** Absolute line index of the first marker, or null when there is none. */
  firstMarkerLineNo: number | null;
}

/** Index of the first `%%task:<id>%%` marker line, or null. */
export function findFirstMarkerLine(lines: string[]): number | null {
  for (let i = 0; i < lines.length; i++) {
    if (MARKER_RE.test(lines[i])) {
      return i;
    }
  }
  return null;
}

/**
 * Parse the note segments from `lines`. Each `%%task:<id>%%` marker starts a
 * segment that runs until the next marker (or end of document).
 */
export function parseNoteSegments(lines: string[]): NoteSegment[] {
  const markers: { id: string; lineNo: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(MARKER_RE);
    if (m) {
      markers.push({ id: m[1], lineNo: i });
    }
  }

  return markers.map((mk, idx) => {
    const bodyStart = mk.lineNo + 1;
    const bodyEnd = idx + 1 < markers.length ? markers[idx + 1].lineNo : lines.length;
    return {
      id: mk.id,
      markerLineNo: mk.lineNo,
      bodyStart,
      bodyEnd,
      text: lines.slice(bodyStart, bodyEnd).join('\n').replace(/\s+$/, ''),
    };
  });
}

/**
 * Parse the task region (everything before the first marker) into a document.
 * Truncating at the first marker keeps a `---` written inside a note from being
 * mistaken for the today/below divider. Line numbers stay absolute because the
 * prefix is preserved.
 */
export function parseTaskRegion(
  content: string,
  opts: ParseOptions = DEFAULT_PARSE_OPTIONS
): ParsedDocument {
  const lines = content.split('\n');
  const first = findFirstMarkerLine(lines);
  const taskContent = first === null ? content : lines.slice(0, first).join('\n');
  return parseDocument(taskContent, opts);
}

/** Match tasks to note segments by id (first marker wins on duplicate ids). */
export function matchTaskNotes(
  tasks: TaskLine[],
  segments: NoteSegment[]
): NoteMatch {
  const byId = new Map<string, NoteSegment>();
  for (const s of segments) {
    if (!byId.has(s.id)) {
      byId.set(s.id, s);
    }
  }

  const pairs = tasks.map((task) => ({
    task,
    segment: task.id ? byId.get(task.id) ?? null : null,
  }));
  const unassignedTasks = pairs
    .filter((p) => p.segment === null)
    .map((p) => p.task);

  const taskIds = new Set(tasks.map((t) => t.id).filter(Boolean));
  const orphanSegments = segments.filter((s) => !taskIds.has(s.id));

  return { pairs, unassignedTasks, orphanSegments };
}

/** Full analysis: parse task region + note segments and match them by id. */
export function analyzeNotes(
  content: string,
  opts: ParseOptions = DEFAULT_PARSE_OPTIONS
): NoteAnalysis {
  const lines = content.split('\n');
  const doc = parseTaskRegion(content, opts);
  const tasks = [...doc.today, ...doc.below];
  const segments = parseNoteSegments(lines);
  return {
    doc,
    tasks,
    segments,
    firstMarkerLineNo: findFirstMarkerLine(lines),
    ...matchTaskNotes(tasks, segments),
  };
}

// ---------------------------------------------------------------------------
// Mutations: assign ids, create markers, reorder. All pure (content -> content).
// ---------------------------------------------------------------------------

/** Every id already in use, across task lines and note markers. */
function collectIds(content: string): Set<string> {
  const lines = content.split('\n');
  const ids = new Set<string>();
  const limit = findFirstMarkerLine(lines) ?? lines.length;
  for (let i = 0; i < limit; i++) {
    if (isTaskLine(lines[i])) {
      const t = parseTaskLine(lines[i], i);
      if (t?.id) ids.add(t.id);
    }
  }
  for (const m of parseNoteSegments(lines)) {
    ids.add(m.id);
  }
  return ids;
}

/**
 * Stamp a fresh `^id` on every task line (in the task region) that lacks one.
 * `idgen` supplies candidate ids; collisions with existing ids are skipped so
 * the result is always unique. Returns the (possibly unchanged) content.
 */
export function assignIds(
  content: string,
  idgen: () => string,
  opts: ParseOptions = DEFAULT_PARSE_OPTIONS
): string {
  const lines = content.split('\n');
  const limit = findFirstMarkerLine(lines) ?? lines.length;
  const used = collectIds(content);

  let changed = false;
  for (let i = 0; i < limit; i++) {
    if (!isTaskLine(lines[i])) continue;
    const t = parseTaskLine(lines[i], i, opts);
    if (!t || t.id) continue;

    let id = idgen();
    let guard = 0;
    while (used.has(id) && guard++ < 10000) id = idgen();
    used.add(id);
    lines[i] = lines[i].replace(/\s*$/, '') + ` ^${id}`;
    changed = true;
  }
  return changed ? lines.join('\n') : content;
}

/**
 * Rebuild the notes region to the per-segment model: one `%%task:<id>%%` block
 * per today timeline segment (a split task owns several blocks with duplicate
 * markers), then one block per below task, then orphan markers. Blocks are
 * ordered by projected start time so the notes read chronologically.
 *
 * Bodies are preserved and *reconciled* to the segment count: when a task gains
 * a segment an empty block is appended; when it loses one the surplus block
 * bodies are merged into the last kept block (no memo is dropped). Orphan
 * markers (id with no task) are kept, reported, never deleted. Idempotent.
 */
export function reconcileNotes(
  content: string,
  opts: ParseOptions = DEFAULT_PARSE_OPTIONS
): { content: string; orphans: NoteSegment[] } {
  const lines = content.split('\n');
  const first = findFirstMarkerLine(lines);
  const a = analyzeNotes(content, opts);
  const fm = a.doc.frontmatter;
  // Segment structure is capacity-independent, so any capacity works here.
  const proj = projectToday(a.doc.today, fm.dayStartMin, fm.workingHoursMin);

  // Existing block bodies per id, in document order.
  const bodiesById = new Map<string, string[]>();
  for (const s of a.segments) {
    const arr = bodiesById.get(s.id) ?? [];
    arr.push(s.text);
    bodiesById.set(s.id, arr);
  }

  // Desired block count per id: today = segment count, below = 1.
  const desired = new Map<string, number>();
  for (const r of proj.rows) {
    if (r.task.id) desired.set(r.task.id, (desired.get(r.task.id) ?? 0) + 1);
  }
  for (const t of a.doc.below) {
    if (t.id) desired.set(t.id, 1);
  }

  const fitted = new Map<string, string[]>();
  for (const [id, n] of desired) {
    fitted.set(id, fitBodies(bodiesById.get(id) ?? [], n));
  }

  const out: { id: string; text: string }[] = [];
  const ptr = new Map<string, number>();
  const pop = (id: string): string => {
    const i = ptr.get(id) ?? 0;
    ptr.set(id, i + 1);
    return fitted.get(id)?.[i] ?? '';
  };
  for (const r of proj.rows) {
    if (r.task.id) out.push({ id: r.task.id, text: pop(r.task.id) });
  }
  for (const t of a.doc.below) {
    if (t.id) out.push({ id: t.id, text: pop(t.id) });
  }

  const taskIds = new Set(
    [...a.doc.today, ...a.doc.below].map((t) => t.id).filter(Boolean) as string[]
  );
  const orphans = a.segments.filter((s) => !taskIds.has(s.id));
  for (const s of orphans) out.push({ id: s.id, text: s.text });

  if (out.length === 0) return { content, orphans };

  const prefix = (
    first === null ? content : lines.slice(0, first).join('\n')
  ).replace(/\s+$/, '');
  const blocks = out.map((b) => `${markerLine(b.id)}\n${b.text}`.replace(/\s+$/, ''));
  return { content: `${prefix}\n\n${blocks.join('\n\n')}\n`, orphans };
}

/** Reconcile existing bodies to exactly `n` blocks (see reconcileNotes). */
function fitBodies(bodies: string[], n: number): string[] {
  if (n <= 0) return [];
  if (bodies.length === n) return bodies.slice();
  if (bodies.length < n) {
    const out = bodies.slice();
    while (out.length < n) out.push('');
    return out;
  }
  const kept = bodies.slice(0, n);
  const merged = [kept[n - 1], ...bodies.slice(n)].filter((s) => s.trim() !== '');
  kept[n - 1] = merged.join('\n\n');
  return kept;
}

/** Convenience: assign ids, then reconcile blocks to the timeline. */
export function tidyNotes(
  content: string,
  idgen: () => string,
  opts: ParseOptions = DEFAULT_PARSE_OPTIONS
): { content: string; orphans: NoteSegment[] } {
  return reconcileNotes(assignIds(content, idgen, opts), opts);
}
