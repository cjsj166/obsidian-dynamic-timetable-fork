import React, {
  useEffect,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from 'react';
import DynamicTimetable from './main';
import { ButtonContainer } from './Button';
import { CommandsManager } from './Commands';
import {
  convertHexToHSLA,
  getHSLAColorForCategory,
  getRandomHSLAColor,
} from './ColorUtils.ts';
import { buildViewModel, ViewModel, allTaskLines } from './core/viewmodel';
import { ParseOptions, TaskLine } from './core/types';
import { formatClock, formatDuration } from './core/time';
import { formatShort, todayISO } from './core/date';
import {
  appendDivider,
  dropIndex,
  moveBlock,
  taskBlockEnd,
} from './core/edit';

export type TimetableViewComponentRef = {
  update: () => Promise<void>;
  scrollToFirstUncompletedTask: () => void;
};

const ISO_FILENAME_RE = /(\d{4}-\d{2}-\d{2})/;
const WRITE_DEBOUNCE_MS = 200;

/** Resolve the date a note represents from its filename, else fall back to today. */
function noteDateFor(plugin: DynamicTimetable): string {
  const base = plugin.targetFile?.basename ?? '';
  const m = base.match(ISO_FILENAME_RE);
  return m ? m[1] : todayISO();
}

function parseOptionsFor(plugin: DynamicTimetable): ParseOptions {
  return {
    estimateDelimiter: plugin.settings.taskEstimateDelimiter,
    startTimeDelimiter: plugin.settings.startTimeDelimiter,
  };
}

const TimetableViewComponent = forwardRef<
  TimetableViewComponentRef,
  {
    plugin: DynamicTimetable;
    commandsManager: CommandsManager;
  }
>(({ plugin, commandsManager }, ref) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [vm, setVm] = useState<ViewModel | null>(null);
  const [categoryBackgroundColors, setCategoryBackgroundColors] = useState<
    Record<string, string>
  >({});

  // Authoritative in-memory note content, kept in sync with the file except
  // while a drag write is in flight (optimistic, written out after a debounce).
  const workingContentRef = useRef<string | null>(null);
  const draggedLineNoRef = useRef<number | null>(null);
  const draggedRawRef = useRef<string | null>(null);
  const flushTimerRef = useRef<number | null>(null);
  // Number of self-emitted vault.modify events still expected back, so the
  // resulting `modify` callbacks don't clobber our optimistic state.
  const pendingSelfWritesRef = useRef(0);

  const buildFrom = (content: string): ViewModel =>
    buildViewModel(content, noteDateFor(plugin), parseOptionsFor(plugin));

  const update = async () => {
    // Swallow the re-read triggered by our own write — local state is already
    // correct, and re-reading could race the optimistic content.
    if (pendingSelfWritesRef.current > 0) {
      pendingSelfWritesRef.current -= 1;
      return;
    }
    const file = plugin.targetFile;
    if (!file) {
      workingContentRef.current = null;
      setVm(null);
      return;
    }
    const content = await plugin.app.vault.cachedRead(file);
    // An external edit wins over any pending drag: drop the queued write.
    if (flushTimerRef.current !== null) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    workingContentRef.current = content;
    setVm(buildFrom(content));
  };

  const scheduleFlush = () => {
    if (flushTimerRef.current !== null) {
      window.clearTimeout(flushTimerRef.current);
    }
    flushTimerRef.current = window.setTimeout(async () => {
      flushTimerRef.current = null;
      const file = plugin.targetFile;
      const content = workingContentRef.current;
      if (!file || content == null) return;
      pendingSelfWritesRef.current += 1;
      await plugin.app.vault.modify(file, content);
    }, WRITE_DEBOUNCE_MS);
  };

  /**
   * Move the dragged task's block (the task line + its indented children) to an
   * absolute insert index, optimistically. Aborts on a stale (externally
   * edited) source line.
   */
  const applyMove = (fromLineNo: number, toIndex: number, draggedRaw: string) => {
    const base = workingContentRef.current;
    if (base == null) return;
    const lines = base.split('\n');
    // External-edit guard: the line we believe we're dragging must still match.
    if (lines[fromLineNo]?.trim() !== draggedRaw.trim()) {
      update();
      return;
    }
    const blockEnd = taskBlockEnd(lines, fromLineNo);
    const next = moveBlock(base, fromLineNo, blockEnd, toIndex);
    if (next === base) return;
    workingContentRef.current = next;
    setVm(buildFrom(next));
    scheduleFlush();
  };

  /** Absolute insert index for dropping next to a target task's block. */
  const targetDropIndex = (targetLineNo: number, after: boolean): number => {
    const base = workingContentRef.current;
    if (!after || base == null) {
      return dropIndex(targetLineNo, false);
    }
    // "After" means after the target's whole block, so it becomes a sibling.
    return taskBlockEnd(base.split('\n'), targetLineNo);
  };

  const endDrag = () => {
    draggedLineNoRef.current = null;
    draggedRawRef.current = null;
  };

  const onRowDragStart = (
    e: React.DragEvent,
    lineNo: number,
    raw: string
  ) => {
    draggedLineNoRef.current = lineNo;
    draggedRawRef.current = raw;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(lineNo));
  };

  const onRowDrop = (e: React.DragEvent, targetLineNo: number) => {
    e.preventDefault();
    e.stopPropagation();
    const from = draggedLineNoRef.current;
    const raw = draggedRawRef.current;
    if (from == null || raw == null) return endDrag();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2;
    applyMove(from, targetDropIndex(targetLineNo, after), raw);
    endDrag();
  };

  /** Drop onto a section's empty space / end — places at the section boundary. */
  const onSectionDrop = (e: React.DragEvent, section: 'today' | 'below') => {
    e.preventDefault();
    const from = draggedLineNoRef.current;
    const raw = draggedRawRef.current;
    if (from == null || raw == null || !vm) return endDrag();

    if (section === 'today') {
      // End of today = just before the divider, or end of doc when none.
      applyMove(from, vm.dividerLineNo ?? Number.MAX_SAFE_INTEGER, raw);
    } else if (vm.dividerLineNo != null) {
      // Top of below = just after the divider.
      applyMove(from, vm.dividerLineNo + 1, raw);
    } else {
      // No divider yet — create one, then move the task after it.
      const base = workingContentRef.current;
      if (base == null) return endDrag();
      const lines = base.split('\n');
      if (lines[from]?.trim() !== raw.trim()) {
        update();
        return endDrag();
      }
      const withDivider = appendDivider(base);
      const dividerLines = withDivider.split('\n');
      const blockEnd = taskBlockEnd(dividerLines, from);
      const next = moveBlock(
        withDivider,
        from,
        blockEnd,
        dividerLines.length
      );
      workingContentRef.current = next;
      setVm(buildFrom(next));
      scheduleFlush();
    }
    endDrag();
  };

  const allowDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const updateBackgroundColors = (tasks: TaskLine[]) => {
    const newBackgroundColors = { ...categoryBackgroundColors };

    Object.keys(newBackgroundColors).forEach((category) => {
      if (!tasks.some((task) => task.categories.includes(category))) {
        delete newBackgroundColors[category];
      }
    });
    const existingHues: number[] = [];

    tasks.forEach((task) => {
      task.categories.forEach((category) => {
        const className = `dt-category-${category}`;
        let color;
        const alpha = plugin.settings.categoryTransparency;
        const configuredColor = plugin.settings.categoryColors?.find(
          (c) => c.category === category
        )?.color;

        if (configuredColor) {
          color = convertHexToHSLA(configuredColor, alpha);
        } else if (!newBackgroundColors[category]) {
          color = getRandomHSLAColor(alpha, existingHues);
        } else {
          color = getHSLAColorForCategory(category, alpha, newBackgroundColors);
        }

        const hueMatch = color.match(/hsla\((\d+),/);
        if (hueMatch && hueMatch[1]) {
          existingHues.push(parseInt(hueMatch[1]));
        }
        newBackgroundColors[category] = color;
        document.documentElement.style.setProperty(`--${className}-bg`, color);
      });
    });

    setCategoryBackgroundColors(newBackgroundColors);
    plugin.categoryBackgroundColors = newBackgroundColors;
  };

  useEffect(() => {
    const onFileModify = async (file: any) => {
      if (file === plugin.targetFile) {
        await update();
      }
    };
    const unregisterEvent = plugin.app.vault.on('modify', onFileModify);
    plugin.registerEvent(unregisterEvent);
    update();
    return () => {
      plugin.app.vault.off('modify', onFileModify);
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current);
      }
    };
  }, [plugin, plugin.targetFile]);

  useEffect(() => {
    if (vm) {
      updateBackgroundColors(allTaskLines(vm));
    }
  }, [
    vm,
    JSON.stringify(plugin.settings.categoryColors),
    plugin.settings.categoryTransparency,
  ]);

  useImperativeHandle(ref, () => ({
    update,
    scrollToFirstUncompletedTask: () => {},
  }));

  const rowClass = (task: TaskLine): string =>
    'dt-task-row' +
    (task.status === 'done' ? ' dt-completed' : '') +
    (task.parseError ? ' dt-parse-error' : '');

  const rowBackground = (task: TaskLine): string | undefined => {
    if (!plugin.settings.applyBackgroundColorByCategory) return undefined;
    const category = task.categories[0];
    return category ? categoryBackgroundColors[category] : undefined;
  };

  const taskLabel = (task: TaskLine): string => {
    if (
      plugin.settings.showCategoryNamesInTask &&
      task.categories.length > 0
    ) {
      return `${task.name} ${task.categories.map((c) => `#${c}`).join(' ')}`;
    }
    return task.name;
  };

  return (
    <div
      ref={containerRef}
      className="Timetable dt-content"
      style={{ overflow: 'auto', maxHeight: '100%' }}>
      <ButtonContainer commandsManager={commandsManager} />
      {!vm && <div className="dt-empty">No active daily note.</div>}
      {vm && (
        <>
          {vm.frontmatter.error && (
            <div className="dt-banner dt-banner-error">
              ⚠ frontmatter: {vm.frontmatter.error}
            </div>
          )}

          <section
            className="dt-section"
            onDragOver={allowDrop}
            onDrop={(e) => onSectionDrop(e, 'today')}>
            <div className="dt-section-header">
              <span className="dt-section-title">TODAY</span>
              <span
                className={
                  'dt-section-summary' +
                  (vm.today.overBudget ? ' dt-over-budget' : '')
                }>
                {formatDuration(vm.today.workTotalMin)} /{' '}
                {formatDuration(vm.capacityMin)} · ends{' '}
                {formatClock(vm.today.clockEndMin)}
              </span>
            </div>
            <table className="dt-table">
              <tbody>
                {vm.today.rows.map((row, i) => (
                  <tr
                    key={`today-${i}`}
                    className={
                      rowClass(row.task) + (row.conflict ? ' dt-conflict' : '')
                    }
                    title={
                      row.conflict
                        ? '시각이 다른 고정 일정과 겹칩니다'
                        : row.task.parseError ?? undefined
                    }
                    draggable
                    onDragStart={(e) =>
                      onRowDragStart(e, row.task.lineNo, row.task.raw)
                    }
                    onDragOver={allowDrop}
                    onDrop={(e) => onRowDrop(e, row.task.lineNo)}
                    style={{ backgroundColor: rowBackground(row.task) }}>
                    <td className="dt-clock">{formatClock(row.startMin)}</td>
                    <td className="dt-name">
                      {row.fixed && <span className="dt-pin">📌 </span>}
                      {taskLabel(row.task)}
                      {row.segmentCount > 1 && (
                        <span className="dt-segment">
                          {' '}
                          ({row.segmentIndex + 1}/{row.segmentCount})
                        </span>
                      )}
                      {row.task.parseError && (
                        <span className="dt-error-mark"> ⚠</span>
                      )}
                      {row.conflict && <span className="dt-error-mark"> ⚠</span>}
                    </td>
                    <td className="dt-clock">{formatClock(row.endMin)}</td>
                  </tr>
                ))}
                {vm.today.rows.length === 0 && (
                  <tr>
                    <td colSpan={3} className="dt-empty">
                      No tasks today.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>

          <section
            className="dt-section"
            onDragOver={allowDrop}
            onDrop={(e) => onSectionDrop(e, 'below')}>
            <div className="dt-section-header">
              <span className="dt-section-title">BELOW</span>
              {vm.below.overBookedDates.length > 0 && (
                <span className="dt-section-summary dt-over-budget">
                  over-booked: {vm.below.overBookedDates.join(', ')}
                </span>
              )}
            </div>
            <table className="dt-table">
              <tbody>
                {vm.below.rows.map((row, i) => (
                  <tr
                    key={`below-${i}`}
                    className={rowClass(row.task)}
                    title={row.task.parseError ?? undefined}
                    draggable
                    onDragStart={(e) =>
                      onRowDragStart(e, row.task.lineNo, row.task.raw)
                    }
                    onDragOver={allowDrop}
                    onDrop={(e) => onRowDrop(e, row.task.lineNo)}
                    style={{ backgroundColor: rowBackground(row.task) }}>
                    <td className="dt-name">
                      {row.pinned && <span className="dt-pin">📌 </span>}
                      {taskLabel(row.task)}
                      {row.task.parseError && (
                        <span className="dt-error-mark"> ⚠</span>
                      )}
                    </td>
                    <td className="dt-projection">
                      {row.endDate ? (
                        <>
                          → {formatShort(row.endDate)}
                          {row.endHoursIntoDayMin !== null && (
                            <span className="dt-into-day">
                              {' '}
                              ({formatDuration(row.endHoursIntoDayMin)} in)
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="dt-unscheduled">unscheduled</span>
                      )}
                    </td>
                  </tr>
                ))}
                {vm.below.rows.length === 0 && (
                  <tr>
                    <td colSpan={2} className="dt-empty">
                      Nothing queued.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
});

export default TimetableViewComponent;
