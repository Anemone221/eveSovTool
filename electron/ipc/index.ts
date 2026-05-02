import { ipcMain } from 'electron';
import { registerDataIpc } from './data.js';
import { registerPrefsIpc } from './prefs.js';
import { registerPlansIpc } from './plans.js';
import { registerExportsIpc } from './exports.js';
import { registerStructuresIpc } from './structures.js';
import { registerMapIpc } from './map.js';

export function registerIpc(): void {
  ipcMain.handle('ping', () => 'pong');
  registerDataIpc();
  registerPrefsIpc();
  registerPlansIpc();
  registerExportsIpc();
  registerStructuresIpc();
  registerMapIpc();
}
