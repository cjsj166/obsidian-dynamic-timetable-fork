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

export type TimetableViewComponentRef = {
  update: () => Promise<void>;
  scrollToFirstUncompletedTask: () => void;
};

const ISO_FILENAME_RE = /(\d{4}-\d{2}-\d{2})/;

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

  const update = async () => {
    const file = plugin.targetFile;
    if (!file) {
      setVm(null);
      return;
    }
    const content = await plugin.app.vault.cachedRead(file);
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const next = buildViewModel(
      content,
      noteDateFor(plugin),
      nowMin,
      parseOptionsFor(plugin)
    );
    setVm(next);
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
    return () => plugin.app.vault.off('modify', onFileModify);
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

          <section className="dt-section">
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
                  <React.Fragment key={`today-${i}`}>
                    {row.bufferMin !== null && row.bufferMin < 0 && (
                      <tr className="dt-buffer-row">
                        <td colSpan={3} className="late">
                          late {formatDuration(row.bufferMin)}
                        </td>
                      </tr>
                    )}
                    <tr
                      className={
                        'dt-task-row' +
                        (row.task.status === 'done' ? ' dt-completed' : '')
                      }
                      style={{ backgroundColor: rowBackground(row.task) }}>
                      <td className="dt-clock">{formatClock(row.startMin)}</td>
                      <td className="dt-name">{taskLabel(row.task)}</td>
                      <td className="dt-clock">{formatClock(row.endMin)}</td>
                    </tr>
                  </React.Fragment>
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

          <section className="dt-section">
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
                    className={
                      'dt-task-row' +
                      (row.task.status === 'done' ? ' dt-completed' : '')
                    }
                    style={{ backgroundColor: rowBackground(row.task) }}>
                    <td className="dt-name">
                      {row.pinned && <span className="dt-pin">📌 </span>}
                      {taskLabel(row.task)}
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
