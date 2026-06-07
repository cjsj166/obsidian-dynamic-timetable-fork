// Pure computation of the header shown at each `%%task:<id>%%` marker:
// the matched segment's name + projected time. One block = one timeline segment.

import { DEFAULT_PARSE_OPTIONS, ParseOptions, TaskStatus } from './types';
import { resolveBlocks } from './blocks';
import { formatClock, formatDuration } from './time';
import { formatShort } from './date';

export interface MarkerHeader {
  id: string;
  markerLineNo: number;
  /** Marker whose id matches no task (e.g. the task was deleted). */
  orphan: boolean;
  section: 'today' | 'below' | null;
  status: TaskStatus | null;
  name: string | null;
  /** e.g. "09:00–12:00" (today) · "→ Wed 6/3 (6:00)" (below) · "?" (orphan). */
  timeLabel: string;
  /** Fixed `@`-time appointment (today) or date-pinned (below). */
  fixed: boolean;
  /** Number of timeline segments the today task was split into (1 = not split). */
  splitCount: number;
  parseError: string | null;
}

/** Header data for every `%%task:<id>%%` marker, in document order. */
export function computeMarkerHeaders(
  content: string,
  noteDate: string,
  opts: ParseOptions = DEFAULT_PARSE_OPTIONS
): MarkerHeader[] {
  const { blocks } = resolveBlocks(content, noteDate, opts);

  return blocks.map((b): MarkerHeader => {
    const base = {
      id: b.id,
      markerLineNo: b.markerLineNo,
      status: b.status,
      name: b.name,
      parseError: b.parseError,
    };

    if (b.kind === 'orphan') {
      return {
        ...base,
        orphan: true,
        section: null,
        timeLabel: '?',
        fixed: false,
        splitCount: 0,
      };
    }

    if (b.kind === 'today') {
      const timeLabel =
        b.startMin !== null && b.endMin !== null
          ? `${formatClock(b.startMin)}–${formatClock(b.endMin)}`
          : '';
      return {
        ...base,
        orphan: false,
        section: 'today',
        timeLabel,
        fixed: b.fixed,
        splitCount: b.segmentCount,
      };
    }

    // below
    const label = b.endDate
      ? `→ ${formatShort(b.endDate)}` +
        (b.endHoursIntoDayMin !== null
          ? ` (${formatDuration(b.endHoursIntoDayMin)})`
          : '')
      : 'unscheduled';
    return {
      ...base,
      orphan: false,
      section: 'below',
      timeLabel: label,
      fixed: b.fixed,
      splitCount: 1,
    };
  });
}
