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
  const { rows } = resolveTimeline(view.state.doc.toString(), noteDateFor(view), opts);
  const doc = view.state.doc;
  const ranges: Range<Decoration>[] = [];

  for (const r of rows) {
    if (!r.timeLabel) continue;
    const lineNo = r.lineNo + 1; // core is 0-based, CM is 1-based
    if (lineNo < 1 || lineNo > doc.lines) continue;
    const line = doc.line(lineNo);
    ranges.push(
      Decoration.widget({ widget: new TimeWidget(r), side: -1 }).range(line.from)
    );
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
        if (u.docChanged || u.viewportChanged) {
          this.decorations = buildDecorations(u.view, opts());
        }
      }
    },
    { decorations: (v) => v.decorations }
  );
}
