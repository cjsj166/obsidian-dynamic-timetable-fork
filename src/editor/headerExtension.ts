import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from '@codemirror/view';
import { Range } from '@codemirror/state';
import { editorInfoField } from 'obsidian';
import type DynamicTimetable from '../main';
import { ParseOptions } from '../core/types';
import { TimelineRow, resolveTimeline } from '../core/timeline';
import { todayISO } from '../core/date';

const ISO_RE = /(\d{4}-\d{2}-\d{2})/;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Character ranges of the `@…` and `;…` time tokens within a task line, so the
 * editor can collapse them (the rendered chip already shows the time). Leading
 * whitespace is included so no stray gap is left behind.
 */
function timeTokenRanges(
  text: string,
  base: number,
  opts: ParseOptions
): [number, number][] {
  const st = escapeRegex(opts.startTimeDelimiter);
  const sep = escapeRegex(opts.estimateDelimiter);
  const atRe = new RegExp(
    `\\s*${st}\\s*(?:\\d{4}-\\d{2}-\\d{2}[ T]\\d{1,2}:?\\d{2}|\\d{1,2}:?\\d{2})`,
    'g'
  );
  const durRe = new RegExp(`\\s*${sep}\\s*\\S+`, 'g');
  const idRe = /\s\^[A-Za-z0-9-]+\s*$/g; // trailing block id
  const out: [number, number][] = [];
  for (const re of [atRe, durRe, idRe]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      out.push([base + m.index, base + m.index + m[0].length]);
    }
  }
  return out;
}

function noteDateFor(view: EditorView): string {
  const info = view.state.field(editorInfoField, false) as
    | { file?: { basename?: string } | null }
    | undefined;
  const base = info?.file?.basename ?? '';
  const m = base.match(ISO_RE);
  return m ? m[1] : todayISO();
}

/** Inline time chip prepended to a `- [ ]` task line (does not replace text). */
class TimeWidget extends WidgetType {
  constructor(readonly row: TimelineRow) {
    super();
  }

  eq(other: TimeWidget): boolean {
    const a = this.row;
    const b = other.row;
    return (
      a.timeLabel === b.timeLabel &&
      a.kind === b.kind &&
      a.fixed === b.fixed &&
      a.conflict === b.conflict &&
      a.status === b.status &&
      a.parseError === b.parseError
    );
  }

  toDOM(): HTMLElement {
    const el = document.createElement('span');
    el.className =
      'dt-hdr' +
      (this.row.kind === 'below' ? ' dt-hdr-below' : '') +
      (this.row.conflict ? ' dt-conflict' : '') +
      (this.row.status === 'done' ? ' dt-completed' : '') +
      (this.row.parseError ? ' dt-parse-error' : '');
    el.createSpan({ cls: 'dt-hdr-time', text: this.row.timeLabel });
    if (this.row.fixed) {
      el.createSpan({ cls: 'dt-pin', text: ' 📌' });
    }
    // A continuation line is fully replaced by this widget, so it must also
    // carry the task name (a primary line keeps its own text).
    if (this.row.isContinuation && this.row.name) {
      el.createSpan({ cls: 'dt-hdr-name', text: ` ${this.row.name}` });
    }
    if (this.row.parseError) {
      el.createSpan({ cls: 'dt-error-mark', text: ' ⚠' });
      el.title = this.row.parseError;
    }
    return el;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

function buildDecorations(view: EditorView, opts: ParseOptions): DecorationSet {
  const { rows } = resolveTimeline(
    view.state.doc.toString(),
    noteDateFor(view),
    opts
  );
  const doc = view.state.doc;
  const sel = view.state.selection;
  const ranges: Range<Decoration>[] = [];

  for (const r of rows) {
    if (!r.hasTime || !r.timeLabel) continue; // only tasks with a time condition
    const lineNo = r.lineNo + 1; // core is 0-based, CM is 1-based
    if (lineNo < 1 || lineNo > doc.lines) continue;
    const line = doc.line(lineNo);
    const cursorOnLine = sel.ranges.some(
      (rg) => rg.from <= line.to && rg.to >= line.from
    );

    if (r.isContinuation) {
      // Replace the whole `%%task:id k/n%%` marker line with a header; reveal
      // the raw marker when the cursor is on it.
      if (!cursorOnLine && line.to > line.from) {
        ranges.push(
          Decoration.replace({ widget: new TimeWidget(r) }).range(
            line.from,
            line.to
          )
        );
      }
      continue;
    }

    // Primary line: prepend a time chip and hide the raw `@…`/`;…`/`^id`
    // tokens, revealing them when the cursor is on this line.
    ranges.push(
      Decoration.widget({ widget: new TimeWidget(r), side: -1 }).range(
        line.from
      )
    );
    if (!cursorOnLine) {
      for (const [from, to] of timeTokenRanges(line.text, line.from, opts)) {
        if (to > from) ranges.push(Decoration.replace({}).range(from, to));
      }
    }
  }
  return Decoration.set(ranges, true);
}

/** Editor extension that prepends a projected-time chip to each task line. */
export function timetableHeaderExtension(plugin: DynamicTimetable) {
  const opts = (): ParseOptions => ({
    estimateDelimiter: plugin.settings.taskEstimateDelimiter,
    startTimeDelimiter: plugin.settings.startTimeDelimiter,
  });

  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view, opts());
      }

      update(u: ViewUpdate) {
        if (u.docChanged || u.selectionSet || u.viewportChanged) {
          this.decorations = buildDecorations(u.view, opts());
        }
      }
    },
    { decorations: (v) => v.decorations }
  );
}
