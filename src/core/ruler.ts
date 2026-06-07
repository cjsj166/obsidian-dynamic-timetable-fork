// Pure data for the left time ruler drawn beside each today note block.
//
// Under the per-segment model each today block is a single contiguous segment,
// so its axis is a plain linear map from the segment's minutes to the memo's
// pixel height (hour labels / 30-min ticks). An idle gap that ends exactly at a
// block's start is attached for display.

import { DEFAULT_PARSE_OPTIONS, ParseOptions } from './types';
import { GapSpan } from './projection';
import { resolveBlocks } from './blocks';

export interface RulerSegment {
  startMin: number;
  endMin: number;
}

export interface RulerEntry {
  id: string;
  /** Absolute line index of this block's `%%task:<id>%%` marker. */
  markerLineNo: number;
  startMin: number;
  endMin: number;
  /** Minutes this block represents — what the memo height is scaled to. */
  activeMin: number;
  /** Always a single span under the per-segment model (kept as a list). */
  segments: RulerSegment[];
  /** An idle gap ending exactly at this block's start, if any (display-only). */
  gapBefore: GapSpan | null;
}

/** Per-today-block ruler data, in document order. */
export function computeRuler(
  content: string,
  noteDate: string,
  opts: ParseOptions = DEFAULT_PARSE_OPTIONS
): RulerEntry[] {
  const { blocks, gaps } = resolveBlocks(content, noteDate, opts);
  const entries: RulerEntry[] = [];

  for (const b of blocks) {
    if (b.kind !== 'today' || b.startMin === null || b.endMin === null) continue;
    entries.push({
      id: b.id,
      markerLineNo: b.markerLineNo,
      startMin: b.startMin,
      endMin: b.endMin,
      activeMin: b.endMin - b.startMin,
      segments: [{ startMin: b.startMin, endMin: b.endMin }],
      gapBefore: gaps.find((g) => g.endMin === b.startMin) ?? null,
    });
  }
  return entries;
}
