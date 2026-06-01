import { TaskParser, Task as ImportedTask } from './TaskParser';
import DynamicTimetable from './main';

export type Task = ImportedTask & {
  previousTaskEndTime?: Date | null;
};

export const taskFunctions = (plugin: DynamicTimetable) => {
  const initializeTasks = async () => {
    if (!plugin.targetFile) {
      return [];
    }
    const content = await plugin.app.vault.cachedRead(plugin.targetFile);
    const taskParser = TaskParser.fromSettings(plugin.settings);
    let tasks: Task[] = taskParser.filterAndParseTasks(content);

    let previousTaskEndTime = null;
    for (let task of tasks) {
      task.previousTaskEndTime = previousTaskEndTime;
      previousTaskEndTime = task.endTime;
    }

    if (tasks.length > 0 && tasks[0].startTime === null) {
      tasks[0].startTime = new Date(plugin.targetFile.stat.mtime);
      tasks[0].endTime = new Date(tasks[0].startTime);
      tasks[0].endTime.setMinutes(
        tasks[0].endTime.getMinutes() + Number(tasks[0].estimate)
      );
    }
    return tasks;
  };

  return {
    initializeTasks,
  };
};
