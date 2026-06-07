import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { editorInfoField } from 'obsidian';
import type DynamicTimetable from '../main';
import { ParseOptions } from '../core/types';
import { GapSpan } from '../core/projection';
import { TimelineRow, resolveTimeline } from '../core/timeline';
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

const activeMinOf = (row: TimelineRow): number =>
  row.segments.reduce((s, x) => s + (x.endMin - x.startMin), 0);

/** Per-today-task left time ruler, drawn in a non-intrusive overlay layer. */
class TimeRulerLayer {
  readonly dom: HTMLElement;
  private rows: TimelineRow[] = [];
  private boundaries: number[] = [];
  private gaps: GapSpan[] = [];
  private rafPending = false;
  private nowTimer: number | null = null;
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
    this.nowTimer = window.setInterval(() => this.position(), 60_000);
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
    if (this.nowTimer !== null) window.clearInterval(this.nowTimer);
    this.dom.remove();
  }

  private computeData(): void {
    const tl = resolveTimeline(
      this.view.state.doc.toString(),
      noteDateFor(this.view),
      this.opts()
    );
    this.rows = tl.rows.filter((r) => r.kind === 'today' && r.segments.length > 0);
    this.boundaries = tl.boundaries;
    this.gaps = tl.gaps;
  }

  private position(): void {
    const view = this.view;
    this.dom.replaceChildren();
    if (this.rows.length === 0) return;

    const layerRect = this.dom.getBoundingClientRect();
    const docTop = view.documentTop;
    const toLocalY = (contentY: number): number => docTop + contentY - layerRect.top;

    const cRect = view.contentDOM.getBoundingClientRect();
    const rulerX = Math.max(2, cRect.left - layerRect.left);

    for (const r of this.rows) {
      if (r.lineNo + 1 > view.state.doc.lines) continue;
      this.renderRow(r, rulerX, toLocalY);
    }
    this.renderNow(rulerX, toLocalY);
  }

  /** Content-coordinate band [top, bottom] from this task line to the next block. */
  private blockBand(lineNo: number): { top: number; bottom: number } {
    const view = this.view;
    const doc = view.state.doc;
    const top = view.lineBlockAt(doc.line(lineNo + 1).from).bottom; // below the line
    const next = this.boundaries.find((n) => n > lineNo);
    const bottom =
      next !== undefined
        ? view.lineBlockAt(doc.line(next + 1).from).top
        : view.lineBlockAt(doc.line(doc.lines).from).bottom;
    return { top, bottom };
  }

  private renderRow(
    r: TimelineRow,
    rulerX: number,
    toLocalY: (y: number) => number
  ): void {
    // Gap chip floated over the blank line above this task's line.
    const gap = this.gaps.find((g) => g.endMin === r.startMin);
    if (gap) {
      const markerTop = this.view.lineBlockAt(
        this.view.state.doc.line(r.lineNo + 1).from
      ).top;
      this.add('dt-ruler-gapchip', rulerX, toLocalY(markerTop), {
        text: `Idle ${formatClock(gap.startMin)}–${formatClock(gap.endMin)}`,
      });
    }

    const { top, bottom } = this.blockBand(r.lineNo);
    const height = bottom - top;
    if (height <= 2) return;

    const activeMin = activeMinOf(r);
    if (activeMin <= 0) return;
    const pxPerMin = height / activeMin;
    if (pxPerMin * 60 < MIN_HOUR_PX) return; // too cramped for the fine ruler

    const line = this.add('dt-ruler-line', rulerX - 1, toLocalY(top), {});
    line.style.height = `${height}px`;

    let acc = 0;
    r.segments.forEach((s, i) => {
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

  /**
   * A short red tick + "now" label at the current clock time, on today's note
   * only. When now falls in an idle gap (no segment), it snaps to the top of the
   * upcoming block (or the bottom of the last block when the day is over) so it
   * is always shown. Stays in the ruler margin — it does not cross the memo.
   */
  private renderNow(rulerX: number, toLocalY: (y: number) => number): void {
    if (noteDateFor(this.view) !== todayISO() || this.rows.length === 0) return;
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();

    const sorted = [...this.rows].sort((a, b) => (a.startMin ?? 0) - (b.startMin ?? 0));
    let y: number | null = null;

    for (const r of sorted) {
      const activeMin = activeMinOf(r);
      if (activeMin <= 0) continue;
      const { top, bottom } = this.blockBand(r.lineNo);
      let acc = 0;
      for (const s of r.segments) {
        if (nowMin >= s.startMin && nowMin < s.endMin) {
          y = toLocalY(top + ((acc + (nowMin - s.startMin)) / activeMin) * (bottom - top));
          break;
        }
        acc += s.endMin - s.startMin;
      }
      if (y !== null) break;
    }

    if (y === null) {
      const upcoming = sorted.find((r) => (r.startMin ?? Infinity) > nowMin);
      const target = upcoming ?? sorted[sorted.length - 1];
      const band = this.blockBand(target.lineNo);
      y = toLocalY(upcoming ? band.top : band.bottom);
    }

    const tick = this.add('dt-ruler-now', rulerX - (TICK_HOUR_LEN + 2), y, {});
    tick.style.width = `${TICK_HOUR_LEN + 2}px`;
    this.add('dt-ruler-nowlabel', rulerX - (TICK_HOUR_LEN + 4), y, { text: 'now' });
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
