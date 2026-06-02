import { App, TFile, normalizePath, moment } from 'obsidian';

// Thin wrapper over Obsidian's core "Daily notes" plugin. We read its folder /
// format / template settings directly rather than depend on the external
// obsidian-daily-notes-interface package.

interface DailyNotesSettings {
  folder: string;
  format: string;
  template: string;
}

const DEFAULT_DAILY_FORMAT = 'YYYY-MM-DD';

function dailyNotesSettings(app: App): DailyNotesSettings {
  const internal = (app as any).internalPlugins?.getPluginById?.('daily-notes');
  const opts = internal?.instance?.options ?? {};
  return {
    folder: (opts.folder ?? '').trim(),
    format: (opts.format ?? '').trim() || DEFAULT_DAILY_FORMAT,
    template: (opts.template ?? '').trim(),
  };
}

/** Vault-relative path of the daily note for an ISO date (`YYYY-MM-DD`). */
export function dailyNotePath(app: App, dateISO: string): string {
  const { folder, format } = dailyNotesSettings(app);
  const name = moment(dateISO, 'YYYY-MM-DD').format(format);
  return normalizePath(folder ? `${folder}/${name}.md` : `${name}.md`);
}

/** The existing daily-note file for a date, or null when it does not exist. */
export function getDailyNote(app: App, dateISO: string): TFile | null {
  const file = app.vault.getAbstractFileByPath(dailyNotePath(app, dateISO));
  return file instanceof TFile ? file : null;
}

async function readTemplate(app: App, templatePath: string): Promise<string> {
  if (!templatePath) return '';
  const normalized = normalizePath(
    templatePath.endsWith('.md') ? templatePath : `${templatePath}.md`
  );
  const tpl = app.vault.getAbstractFileByPath(normalized);
  if (tpl instanceof TFile) {
    const raw = await app.vault.cachedRead(tpl);
    // Resolve the common Daily-Notes template tokens for the target date.
    return raw;
  }
  return '';
}

/**
 * Create (or return the existing) daily note for a date. New notes are seeded
 * from the Daily Notes template when one is configured.
 */
export async function createDailyNote(
  app: App,
  dateISO: string
): Promise<TFile> {
  const existing = getDailyNote(app, dateISO);
  if (existing) return existing;

  const path = dailyNotePath(app, dateISO);
  const { template } = dailyNotesSettings(app);
  const seed = await readTemplate(app, template);

  // Ensure the parent folder exists.
  const slash = path.lastIndexOf('/');
  if (slash > 0) {
    const dir = path.slice(0, slash);
    if (!app.vault.getAbstractFileByPath(dir)) {
      await app.vault.createFolder(dir).catch(() => {});
    }
  }
  return app.vault.create(path, seed);
}
