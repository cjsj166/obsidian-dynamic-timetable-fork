import { Plugin } from 'obsidian';
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
}

export default class DynamicTimetable extends Plugin {
  settings: DynamicTimetableSettings;

  static DEFAULT_SETTINGS: DynamicTimetableSettings = {
    startTimeDelimiter: '@',
    taskEstimateDelimiter: ';',
  };

  async onload() {
    await this.initSettings();
    this.registerEditorExtension([
      taskMoveKeymap(this),
      timetableHeaderExtension(this),
      timeRulerExtension(this),
      autoLayoutExtension(this),
    ]);
  }

  async initSettings() {
    this.settings = {
      ...DynamicTimetable.DEFAULT_SETTINGS,
      ...(await this.loadData()),
    };
    this.addSettingTab(new DynamicTimetableSettingTab(this.app, this));
  }

  async updateSetting<T extends keyof DynamicTimetableSettings>(
    settingName: T,
    newValue: DynamicTimetableSettings[T]
  ): Promise<void> {
    this.settings[settingName] = newValue;
    await this.saveData(this.settings);
  }
}
