import { Plugin } from 'obsidian';
import { runRollover } from './Rollover';
import { timetableHeaderExtension } from './editor/headerExtension';
import { timeRulerExtension } from './editor/timeRuler';
import { autoLayoutExtension } from './editor/autoLayout';
import { taskMoveKeymap } from './editor/moveTask';
import { DynamicTimetableSettingTab } from './Settings';

export interface DynamicTimetableSettings {
  filePath: string | null;
  showEstimate: boolean;
  showStartTime: boolean;
  showEstimateInTaskName: boolean;
  showStartTimeInTaskName: boolean;
  showBufferTime: boolean;
  showProgressBar: boolean;
  intervalTime: number;
  taskEstimateDelimiter: string;
  startTimeDelimiter: string;
  headerNames: string[];
  dateDelimiter: string;
  enableOverdueNotice: boolean;
  showCompletedTasks: boolean;
  applyBackgroundColorByCategory: boolean;
  showCategoryNamesInTask: boolean;
  categoryColors: { category: string; color: string }[];
  categoryTransparency: number;
  showRemainingTime: boolean;
  showUntilRegex: string;
  /** ISO date of the last day rollover ran, for per-day idempotency. */
  lastRollover: string | null;
  [key: string]:
    | string
    | boolean
    | string[]
    | number
    | null
    | undefined
    | { category: string; color: string }[];
}

export default class DynamicTimetable extends Plugin {
  settings: DynamicTimetableSettings;

  static DEFAULT_SETTINGS: DynamicTimetableSettings = {
    filePath: null,
    showEstimate: false,
    showStartTime: false,
    showEstimateInTaskName: false,
    showStartTimeInTaskName: true,
    showBufferTime: true,
    showProgressBar: true,
    intervalTime: 1,
    taskEstimateDelimiter: ';',
    startTimeDelimiter: '@',
    dateDelimiter: '',
    enableOverdueNotice: true,
    headerNames: ['Tasks', 'Estimate', 'Start', 'End'],
    showCompletedTasks: true,
    applyBackgroundColorByCategory: true,
    showCategoryNamesInTask: false,
    categoryColors: [],
    categoryTransparency: 0.3,
    showRemainingTime: true,
    showUntilRegex: '',
    lastRollover: null,
  };

  async onload() {
    console.log('DynamicTimetable: onload');
    await this.initSettings();
    this.initCommands();
    this.registerEditorExtension([
      taskMoveKeymap(this),
      timetableHeaderExtension(this),
      timeRulerExtension(this),
      autoLayoutExtension(this),
    ]);
    this.app.workspace.onLayoutReady(() => {
      runRollover(this).catch((e) =>
        console.error('DynamicTimetable: rollover failed', e)
      );
    });
  }

  async initSettings() {
    this.settings = {
      ...DynamicTimetable.DEFAULT_SETTINGS,
      ...(await this.loadData()),
    };
    this.addSettingTab(new DynamicTimetableSettingTab(this.app, this));
  }

  initCommands(): void {
    this.addCommand({
      id: 'roll-over',
      name: 'Roll over incomplete tasks to today',
      callback: () => runRollover(this, true),
    });
  }

  async updateSetting<T extends keyof DynamicTimetableSettings>(
    settingName: T,
    newValue: DynamicTimetableSettings[T]
  ): Promise<void> {
    this.settings[settingName] = newValue;
    await this.saveData(this.settings);
  }
}
