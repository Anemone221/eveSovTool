import { BrowserWindow, ipcMain } from 'electron';
import { getDb } from '../db/userDb.js';

const ACTIVE_PLAN_KEY = 'plan.active.v1';

export function registerPrefsIpc(): void {
  ipcMain.handle('prefs.get', (_, key: string): string | null => {
    const row = getDb()
      .prepare('SELECT value FROM preferences WHERE key = ?')
      .get(key) as { value: string } | undefined;
    return row ? row.value : null;
  });

  ipcMain.handle('prefs.set', (_, key: string, value: string): void => {
    getDb()
      .prepare(
        `INSERT INTO preferences (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      )
      .run(key, value);

    if (key === ACTIVE_PLAN_KEY) {
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('plan-active-changed', { value });
      }
    }
  });

  ipcMain.handle('prefs.deletePrefix', (_, prefix: string): number => {
    const result = getDb()
      .prepare('DELETE FROM preferences WHERE key LIKE ?')
      .run(`${prefix}%`);
    return result.changes;
  });
}
