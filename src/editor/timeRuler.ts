import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { editorInfoField } from 'obsidian';
import type DynamicTimetable from '../main';
import { ParseOptions } from '../core/types';
import { MARKER_RE } from '../core/notes';
import { RulerEntry, computeRuler } from '../core/ruler';
import { formatClock } from '../core/time';
import { todayISO } from '../core/date';

const ISO_RE = /(\d{4}-\d{2}-\d{2})/;

// Drop the fine ruler when one hour would render shorter than this — then only
// the header start time (rendered separately) conveys the schedule.
const MIN_HOUR_PX = 22;
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

/** 0-based line indices of every `%%task:<id>%%` marker, ascending. */
function allMarkerLines(doc: { lines: number; line: (n: number) => { text: string } }): number[] {
  const out: number[] = [];
  for (let i = 1; i <= doc.lines; i++) {
    if (MARKER_RE.test(doc.line(i).text)) out.push(i - 1);
  }
  return out;
}

/**
 * The vertical pixel band a task block occupies in content coordinates: from
 * just below its marker line to the top of the next marker (or document end).
 */
function blockBand(
  view: EditorView,
  markerLineNo: number,
  markerLines: number[]
): { top: number; bottom: number } {
  const doc = view.state.doc;
  const markerLine = doc.line(markerLineNo + 1);
  const headBottom = view.lineBlockAt(markerLine.from).bottom;

  const next = markerLines.find((n) => n > markerLineNo);
  let bottom: number;
  if (next !== undefined) {
    bottom = view.lineBlockAt(doc.line(next + 1).from).top;
  } else {
    bottom = view.lineBlockAt(doc.line(doc.lines).from).bottom;
  }
  return { top: headBottom, bottom };
}

class TimeRulerLayer {
  readonly dom: HTMLElement;

  constructor(
    private view: EditorView,
    private readonly opts: () => ParseOptions
  ) {
    this.dom = document.createElement('div');
    this.dom.className = 'dt-ruler-layer';
    view.scrollDOM.appendChild(this.dom);
    this.render();
  }

  update(u: ViewUpdate): void {
    if (u.docChanged || u.geometryChanged || u.viewportChanged) {
      this.view = u.view;
      this.render();
    }
  }

  destroy(): void {
    this.dom.remove();
  }

  private render(): void {
    const view = this.view;
    this.dom.replaceChildren();

    const content = view.state.doc.toString();
    const entries = computeRuler(content, noteDateFor(view), this.opts());
    if (entries.length === 0) return;

    const markerLines = allMarkerLines(view.state.doc);

    // Text left edge in scroller coordinates — the ruler lives just left of it.
    const sRect = view.scrollDOM.getBoundingClientRect();
    const cRect = view.contentDOM.getBoundingClientRect();
    const rulerX = Math.max(2, cRect.left - sRect.left + view.scrollDOM.scrollLeft);

    for (const e of entries) {
      if (e.markerLineNo + 1 > view.state.doc.lines) continue;
      this.renderEntry(e, markerLines, rulerX);
    }
  }

  private renderEntry(e: RulerEntry, markerLines: number[], rulerX: number): void {
    const { top, bottom } = blockBand(this.view, e.markerLineNo, markerLines);
    const height = bottom - top;
    if (height <= 2) return;

    // Gap label sits at the very top of the block (where idle time precedes it).
    if (e.gapBefore) {
      const g = this.gapLabel(
        `공백 ${formatClock(e.gapBefore.startMin)}–${formatClock(e.gapBefore.endMin)}`,
        top,
        rulerX
      );
      this.dom.appendChild(g);
    }

    if (e.activeMin <= 0) return;
    const pxPerMin = height / e.activeMin;
    if (pxPerMin * 60 < MIN_HOUR_PX) return; // too cramped — header start only

    // Vertical guide line spanning the block.
    const line = document.createElement('div');
    line.className = 'dt-ruler-line';
    line.style.left = `${rulerX - 1}px`;
    line.style.top = `${top}px`;
    line.style.height = `${height}px`;
    this.dom.appendChild(line);

    // Walk the segments, mapping active minutes to pixels. The gap between
    // segments (a fixed appointment) consumes no pixels, so labels jump.
    let acc = 0;
    e.segments.forEach((s, i) => {
      // A resumed segment (not the first) whose start is an hour: label it.
      if (i > 0 && s.startMin % 60 === 0) {
        this.tick(top + acc * pxPerMin, rulerX, true, formatClock(s.startMin));
      }
      let b = Math.ceil((s.startMin + 1) / 30) * 30;
      for (; b <= s.endMin; b += 30) {
        const y = top + (acc + (b - s.startMin)) * pxPerMin;
        const hour = b % 60 === 0;
        this.tick(y, rulerX, hour, hour ? formatClock(b) : null);
      }
      acc += s.endMin - s.startMin;
    });
  }

  private tick(y: number, rulerX: number, hour: boolean, label: string | null): void {
    const len = hour ? TICK_HOUR_LEN : TICK_30_LEN;
    const t = document.createElement('div');
    t.className = 'dt-ruler-tick' + (hour ? ' dt-ruler-tick-hour' : '');
    t.style.left = `${rulerX - len}px`;
    t.style.top = `${y}px`;
    t.style.width = `${len}px`;
    this.dom.appendChild(t);

    if (label) {
      const l = document.createElement('div');
      l.className = 'dt-ruler-label';
      l.textContent = label;
      l.style.left = `${rulerX - TICK_HOUR_LEN - 2}px`;
      l.style.top = `${y}px`;
      this.dom.appendChild(l);
    }
  }

  private gapLabel(text: string, y: number, rulerX: number): HTMLElement {
    const l = document.createElement('div');
    l.className = 'dt-ruler-gap';
    l.textContent = text;
    l.style.left = `${rulerX - TICK_HOUR_LEN - 2}px`;
    l.style.top = `${y}px`;
    return l;
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
