import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { editorInfoField } from 'obsidian';
import type DynamicTimetable from '../main';
import { MarkerHeader, computeMarkerHeaders } from '../core/headers';
import { ParseOptions } from '../core/types';
import { todayISO } from '../core/date';

const ISO_RE = /(\d{4}-\d{2}-\d{2})/;

/** Render the task header at a `%%task:<id>%%` marker line. */
class HeaderWidget extends WidgetType {
  constructor(readonly h: MarkerHeader) {
    super();
  }

  eq(other: HeaderWidget): boolean {
    const a = this.h;
    const b = other.h;
    return (
      a.id === b.id &&
      a.name === b.name &&
      a.timeLabel === b.timeLabel &&
      a.status === b.status &&
      a.fixed === b.fixed &&
      a.splitCount === b.splitCount &&
      a.orphan === b.orphan &&
      a.parseError === b.parseError
    );
  }

  toDOM(): HTMLElement {
    const el = document.createElement('span');
    el.className =
      'dt-hdr' +
      (this.h.orphan ? ' dt-hdr-orphan' : '') +
      (this.h.status === 'done' ? ' dt-completed' : '') +
      (this.h.parseError ? ' dt-parse-error' : '');

    if (this.h.orphan) {
      el.title = '매칭되는 태스크가 없는 메모입니다 (태스크가 삭제됐을 수 있음)';
      el.createSpan({ cls: 'dt-hdr-time', text: '?' });
      el.createSpan({ cls: 'dt-hdr-name', text: ' (orphan)' });
      return el;
    }

    el.createSpan({ cls: 'dt-hdr-time', text: this.h.timeLabel });
    if (this.h.fixed) {
      el.createSpan({ cls: 'dt-pin', text: ' 📌' });
    }
    el.createSpan({ cls: 'dt-hdr-name', text: ` ${this.h.name ?? ''}` });
    if (this.h.splitCount > 1) {
      el.createSpan({ cls: 'dt-segment', text: ` (${this.h.splitCount}분할)` });
    }
    if (this.h.parseError) {
      el.createSpan({ cls: 'dt-error-mark', text: ' ⚠' });
      el.title = this.h.parseError;
    }
    return el;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

function noteDateFor(view: EditorView): string {
  const info = view.state.field(editorInfoField, false) as
    | { file?: { basename?: string } | null }
    | undefined;
  const base = info?.file?.basename ?? '';
  const m = base.match(ISO_RE);
  return m ? m[1] : todayISO();
}

function buildDecorations(
  view: EditorView,
  opts: ParseOptions
): DecorationSet {
  const content = view.state.doc.toString();
  const headers = computeMarkerHeaders(content, noteDateFor(view), opts);
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  const sel = view.state.selection;

  for (const h of headers) {
    const lineNo = h.markerLineNo + 1; // core is 0-based, CM is 1-based
    if (lineNo < 1 || lineNo > doc.lines) continue;
    const line = doc.line(lineNo);
    // Reveal the raw marker for editing when the cursor is on its line.
    const cursorOnLine = sel.ranges.some(
      (r) => r.from <= line.to && r.to >= line.from
    );
    if (cursorOnLine) continue;
    builder.add(
      line.from,
      line.to,
      Decoration.replace({ widget: new HeaderWidget(h) })
    );
  }
  return builder.finish();
}

/** Editor extension that renders a task header over each `%%task:<id>%%` line. */
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
