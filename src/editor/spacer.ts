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
import { MARKER_RE } from '../core/notes';
import { computeRuler } from '../core/ruler';
import { todayISO } from '../core/date';
import { MIN_HOUR_PX } from './rulerConfig';

const ISO_RE = /(\d{4}-\d{2}-\d{2})/;
const TOL = 1; // px tolerance — avoids re-layout churn around the threshold

function noteDateFor(view: EditorView): string {
  const info = view.state.field(editorInfoField, false) as
    | { file?: { basename?: string } | null }
    | undefined;
  const base = info?.file?.basename ?? '';
  const m = base.match(ISO_RE);
  return m ? m[1] : todayISO();
}

/** An empty block that pads a short memo so its hour ticks stay visible. */
class SpacerWidget extends WidgetType {
  constructor(readonly px: number) {
    super();
  }

  eq(other: SpacerWidget): boolean {
    return Math.abs(other.px - this.px) < TOL;
  }

  toDOM(): HTMLElement {
    const d = document.createElement('div');
    d.className = 'dt-ruler-spacer';
    d.style.height = `${Math.round(this.px)}px`;
    return d;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

/**
 * Reserve a minimum height per today block so the segment's hour ticks always
 * fit. We measure the natural block height (excluding any spacer we already
 * added) and, when it is shorter than the required height, append an empty
 * spacer below the memo. Because the natural height is measured net of the
 * current spacer, the computation is stable and settles in one extra layout.
 */
class Spacers {
  decorations: DecorationSet = Decoration.none;
  private heights = new Map<number, number>();

  constructor(
    private view: EditorView,
    private readonly opts: () => ParseOptions
  ) {
    this.measure(view);
  }

  update(u: ViewUpdate): void {
    if (u.docChanged || u.geometryChanged || u.viewportChanged) {
      this.measure(u.view);
    }
  }

  private measure(view: EditorView): void {
    const doc = view.state.doc;
    const entries = computeRuler(doc.toString(), noteDateFor(view), this.opts());

    const markerLines: number[] = [];
    for (let i = 1; i <= doc.lines; i++) {
      if (MARKER_RE.test(doc.line(i).text)) markerLines.push(i - 1);
    }

    const next = new Map<number, number>();
    for (const e of entries) {
      if (e.activeMin <= 0 || e.markerLineNo + 1 > doc.lines) continue;
      const requiredPx = (e.activeMin / 60) * MIN_HOUR_PX;

      const headerBottom = view.lineBlockAt(doc.line(e.markerLineNo + 1).from).bottom;
      const nextMarker = markerLines.find((n) => n > e.markerLineNo);
      const bandBottom =
        nextMarker !== undefined
          ? view.lineBlockAt(doc.line(nextMarker + 1).from).top
          : view.lineBlockAt(doc.line(doc.lines).from).bottom;

      const current = this.heights.get(e.markerLineNo) ?? 0;
      const natural = bandBottom - headerBottom - current;
      const spacer = Math.max(0, requiredPx - natural);
      if (spacer > 0.5) next.set(e.markerLineNo, spacer);
    }

    if (!this.changed(next)) return;
    this.heights = next;

    const ranges: Range<Decoration>[] = [];
    for (const [markerLineNo, px] of next) {
      const nextMarker = markerLines.find((n) => n > markerLineNo);
      const lastLine0 = nextMarker !== undefined ? nextMarker - 1 : doc.lines - 1;
      const pos = doc.line(lastLine0 + 1).to;
      ranges.push(
        Decoration.widget({ widget: new SpacerWidget(px), block: true, side: 1 }).range(pos)
      );
    }
    this.decorations = Decoration.set(ranges, true);
  }

  private changed(next: Map<number, number>): boolean {
    if (next.size !== this.heights.size) return true;
    for (const [k, v] of next) {
      const old = this.heights.get(k);
      if (old === undefined || Math.abs(old - v) > TOL) return true;
    }
    return false;
  }
}

/** Editor extension reserving minimum memo height so hour ticks stay visible. */
export function spacerExtension(plugin: DynamicTimetable) {
  const opts = (): ParseOptions => ({
    estimateDelimiter: plugin.settings.taskEstimateDelimiter,
    startTimeDelimiter: plugin.settings.startTimeDelimiter,
  });
  return ViewPlugin.define((view) => new Spacers(view, opts), {
    decorations: (v) => v.decorations,
  });
}
