import { BrowserWindow, ipcMain } from 'electron';
import { is } from '@electron-toolkit/utils';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// windowId → panelId for pop-out windows
const popouts = new Map<number, string>();

function getMainWindow(): BrowserWindow | undefined {
  return BrowserWindow.getAllWindows().find((w) => !popouts.has(w.id));
}

export function registerWindowsIpc(): void {
  ipcMain.handle('windows.openPanel', (_event, panelId: string) => {
    const win = new BrowserWindow({
      width: 900,
      height: 700,
      show: false,
      autoHideMenuBar: true,
      webPreferences: {
        preload: join(__dirname, '../preload/preload.mjs'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    win.on('ready-to-show', () => win.show());
    win.on('closed', () => popouts.delete(win.id));

    const param = `panel=${encodeURIComponent(panelId)}`;

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      const base = process.env['ELECTRON_RENDERER_URL'];
      const sep = base.includes('?') ? '&' : '?';
      win.loadURL(`${base}${sep}${param}`);
    } else {
      win.loadFile(join(__dirname, '../renderer/index.html'), {
        query: { panel: panelId },
      });
    }

    popouts.set(win.id, panelId);
    return win.id;
  });

  ipcMain.handle('windows.dockBack', (event) => {
    const sender = BrowserWindow.fromWebContents(event.sender);
    if (sender && !sender.isDestroyed()) {
      popouts.delete(sender.id);
      sender.close();
    }
    getMainWindow()?.focus();
  });

  // Called when the map double-clicks a system. Finds or opens the system panel
  // and broadcasts the selected system to all windows.
  ipcMain.handle('windows.selectAndFocusSystem', (_event, systemId: number) => {
    // Broadcast the new selection to every window so their zustand stores sync.
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('selected-system-changed', { systemId });
    }

    // Is the system panel already open as a pop-out?
    const popoutEntry = [...popouts.entries()].find(([, pid]) => pid === 'system');
    if (popoutEntry) {
      const popoutWin = BrowserWindow.fromId(popoutEntry[0]);
      if (popoutWin && !popoutWin.isDestroyed()) {
        popoutWin.focus();
        return;
      }
    }

    // Otherwise tell the main window to focus/open the system panel.
    const main = getMainWindow();
    if (main) {
      main.focus();
      main.webContents.send('focus-panel-requested', { panelId: 'system' });
    }
  });
}
