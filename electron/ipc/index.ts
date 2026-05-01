import { ipcMain } from 'electron';
import { registerDataIpc } from './data.js';
import { registerPrefsIpc } from './prefs.js';
import { registerPlansIpc } from './plans.js';

export function registerIpc(): void {
  ipcMain.handle('ping', () => 'pong');
  registerDataIpc();
  registerPrefsIpc();
  registerPlansIpc();
}
