import { Notice } from 'obsidian';
import DynamicTimetable from './main';

export class CommandsManager {
  private plugin: DynamicTimetable;

  constructor(plugin: DynamicTimetable) {
    this.plugin = plugin;
  }

  toggleTimetable(): void {
    const leaves = this.plugin.app.workspace.getLeavesOfType('Timetable');
    if (leaves.length == 0) {
      this.plugin.openTimetable();
    } else {
      this.plugin.app.workspace.detachLeavesOfType('Timetable');
    }
  }

  initializeTimetableView(): void {
    this.plugin.initTimetableView();
    this.plugin.timetableViewComponentRef.current?.scrollToFirstUncompletedTask();
    new Notice('Timetable initialized!', 1000);
  }
}
