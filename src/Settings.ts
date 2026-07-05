import { App, PluginSettingTab, Setting } from 'obsidian';
import DynamicTimetable from './main';

export class DynamicTimetableSettingTab extends PluginSettingTab {
  plugin: DynamicTimetable;

  constructor(app: App, plugin: DynamicTimetable) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Start-time delimiter')
      .setDesc('Marks a task start time, e.g. "@ 9:00".')
      .addText((text) =>
        text
          .setPlaceholder('@')
          .setValue(this.plugin.settings.startTimeDelimiter)
          .onChange(async (value) => {
            await this.plugin.updateSetting('startTimeDelimiter', value || '@');
          })
      );

    new Setting(containerEl)
      .setName('Duration delimiter')
      .setDesc('Marks a task duration, e.g. "; 1:30".')
      .addText((text) =>
        text
          .setPlaceholder(';')
          .setValue(this.plugin.settings.taskEstimateDelimiter)
          .onChange(async (value) => {
            await this.plugin.updateSetting(
              'taskEstimateDelimiter',
              value || ';'
            );
          })
      );
  }
}
