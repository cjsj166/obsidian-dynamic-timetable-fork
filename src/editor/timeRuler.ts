import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { editorInfoField } from 'obsidian';
import type DynamicTimetable from '../main';
import { ParseOptions } from '../core/types';
import { MARKER_RE } from '../core/notes';
import { RulerEntry, computeRuler } from '../core/ruler';
import { formatClock } from '../core/time';
import { todayISO } from '../core/date';
import { MIN_HOUR_PX } from './rulerConfig';

const ISO_RE = /(\d{4}-\d{2}-\d{2})/;

const TICK_30_LEN = 4;
const TICK_HOUR_LEN = 8;

function noteDateFor(view: EditorView): string {
  const info = view.state.field(editorInfoField, false) as
    | { file?: { basename?: string } | null }
    | undefined;
  const base = info?.file?.basename ?? '';
  const m = base.match(ISO_RE);
  return m ? m[1] : todayISO();
}

class TimeRulerLayer {
  readonly dom: HTMLElement;
  private entries: RulerEntry[] = [];
  private markerLines: number[] = [];
  private rafPending = false;
  private readonly onScroll = () => {
    if (this.rafPending) return;
    this.rafPending = true;
    requestAnimationFrame(() => {
      this.rafPending = false;
      this.position();
    });
  };

  constructor(
    private view: EditorView,
    private readonly opts: () => ParseOptions
  ) {
    this.dom = document.createElement('div');
    this.dom.className = 'dt-ruler-layer';
    view.scrollDOM.appendChild(this.dom);
    view.scrollDOM.addEventListener('scroll', this.onScroll, { passive: true });
    this.computeData();
    this.position();
  }

  update(u: ViewUpdate): void {
    this.view = u.view;
    if (u.docChanged) {
      this.computeData();
      this.position();
    } else if (u.geometryChanged || u.viewportChanged) {
      this.position();
    }
  }

  destroy(): void {
    this.view.scrollDOM.removeEventListener('scroll', this.onScroll);
    this.dom.remove();
  }

  /** Parse + project (cheap, but only needed when the document text changes). */
  private computeData(): void {
    const content = this.view.state.doc.toString();
    this.entries = computeRuler(content, noteDateFor(this.view), this.opts());

    const doc = this.view.state.doc;
    const lines: number[] = [];
    for (let i = 1; i <= doc.lines; i++) {
      if (MARKER_RE.test(doc.line(i).text)) lines.push(i - 1);
    }
    this.markerLines = lines;
  }

  /** Redraw the ruler from cached data using current editor geometry. */
  private position(): void {
    const view = this.view;
    this.dom.replaceChildren();
    if (this.entries.length === 0) return;

    // Position everything relative to the layer's own box, converting CM's
    // content coordinates (relative to documentTop) into layer-local pixels.
    // This is correct whether or not .cm-scroller is a positioned ancestor.
    const layerRect = this.dom.getBoundingClientRect();
    const docTop = view.documentTop;
    const toLocalY = (contentY: number): number => docTop + contentY - layerRect.top;

    const cRect = view.contentDOM.getBoundingClientRect();
    const rulerX = Math.max(2, cRect.left - layerRect.left);

    for (const e of this.entries) {
      if (e.markerLineNo + 1 > view.state.doc.lines) continue;
      this.renderEntry(e, rulerX, toLocalY);
    }
  }

  /** Content-coordinate band [top, bottom] from this marker to the next. */
  private blockBand(markerLineNo: number): { top: number; bottom: number } {
    const view = this.view;
    const doc = view.state.doc;
    const markerLine = doc.line(markerLineNo + 1);
    const top = view.lineBlockAt(markerLine.from).bottom; // axis starts below header

    const next = this.markerLines.find((n) => n > markerLineNo);
    const bottom =
      next !== undefined
        ? view.lineBlockAt(doc.line(next + 1).from).top
        : view.lineBlockAt(doc.line(doc.lines).from).bottom;
    return { top, bottom };
  }

  private renderEntry(
    e: RulerEntry,
    rulerX: number,
    toLocalY: (y: number) => number
  ): void {
    // Display-only gap chip, floated over the blank line above this block's
    // header — styled like a task header but living in the overlay, so it never
    // touches the document or the cursor.
    if (e.gapBefore) {
      const markerTop = this.view.lineBlockAt(
        this.view.state.doc.line(e.markerLineNo + 1).from
      ).top;
      this.add('dt-ruler-gapchip', rulerX, toLocalY(markerTop), {
        text: `공백시간 ${formatClock(e.gapBefore.startMin)}–${formatClock(
          e.gapBefore.endMin
        )}`,
      });
    }

    const { top, bottom } = this.blockBand(e.markerLineNo);
    const height = bottom - top;
    if (height <= 2) return;

    if (e.activeMin <= 0) return;
    const pxPerMin = height / e.activeMin;

    // Start label anchors the axis top to the task's start time.
    this.add('dt-ruler-label', rulerX - TICK_HOUR_LEN - 2, toLocalY(top), {
      text: formatClock(e.startMin),
    });

    if (pxPerMin * 60 < MIN_HOUR_PX) return; // too cramped for the fine ruler

    // Vertical guide line spanning the block.
    const line = this.add('dt-ruler-line', rulerX - 1, toLocalY(top), {});
    line.style.height = `${height}px`;

    // Walk segments, mapping active minutes to pixels. The gap between segments
    // (a fixed appointment) consumes no pixels, so labels jump.
    let acc = 0;
    e.segments.forEach((s, i) => {
      if (i > 0 && s.startMin % 60 === 0) {
        this.tick(toLocalY(top + acc * pxPerMin), rulerX, true, formatClock(s.startMin));
      }
      let b = Math.ceil((s.startMin + 1) / 30) * 30;
      for (; b <= s.endMin; b += 30) {
        const y = toLocalY(top + (acc + (b - s.startMin)) * pxPerMin);
        const hour = b % 60 === 0;
        this.tick(y, rulerX, hour, hour ? formatClock(b) : null);
      }
      acc += s.endMin - s.startMin;
    });
  }

  private tick(y: number, rulerX: number, hour: boolean, label: string | null): void {
    const len = hour ? TICK_HOUR_LEN : TICK_30_LEN;
    const t = this.add(
      'dt-ruler-tick' + (hour ? ' dt-ruler-tick-hour' : ''),
      rulerX - len,
      y,
      {}
    );
    t.style.width = `${len}px`;
    if (label) {
      this.add('dt-ruler-label', rulerX - TICK_HOUR_LEN - 2, y, { text: label });
    }
  }

  private add(
    cls: string,
    left: number,
    top: number,
    opts: { text?: string }
  ): HTMLElement {
    const el = document.createElement('div');
    el.className = cls;
    if (opts.text !== undefined) el.textContent = opts.text;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    this.dom.appendChild(el);
    return el;
  }
}

/** Editor extension drawing the per-today-task left time ruler. */
export function timeRulerExtension(plugin: DynamicTimetable) {
  const opts = (): ParseOptions => ({
    estimateDelimiter: plugin.settings.taskEstimateDelimiter,
    startTimeDelimiter: plugin.settings.startTimeDelimiter,
  });

  return ViewPlugin.define((view) => new TimeRulerLayer(view, opts));
}
