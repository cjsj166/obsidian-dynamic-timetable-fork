import { Plugin } from 'obsidian';
import { runRollover } from './Rollover';
import { timetableHeaderExtension } from './editor/headerExtension';
import { timeRulerExtension } from './editor/timeRuler';
import { autoLayoutExtension } from './editor/autoLayout';
import { taskMoveKeymap } from './editor/moveTask';
import { DynamicTimetableSettingTab } from './Settings';

export interface DynamicTimetableSettings {
  /** Delimiter that marks a task start time (default `@`). */
  startTimeDelimiter: string;
  /** Delimiter that marks a task duration (default `;`). */
  taskEstimateDelimiter: string;
  /** ISO date of the last day rollover ran, for per-day idempotency. */
  lastRollover: string | null;
}

export default class DynamicTimetable extends Plugin {
  settings: DynamicTimetableSettings;

  static DEFAULT_SETTINGS: DynamicTimetableSettings = {
    startTimeDelimiter: '@',
    taskEstimateDelimiter: ';',
    lastRollover: null,
  };

  async onload() {
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
        console.error('Task Time Cascade: rollover failed', e)
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
