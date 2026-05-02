import { ipcMain, dialog, BrowserWindow } from 'electron';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface CapturePngResult {
  saved: boolean;
  path?: string;
}

export function registerExportsIpc(): void {
  ipcMain.handle(
    'exports.capturePng',
    async (event, filename: string, dataUrl: string): Promise<CapturePngResult> => {
      const win = BrowserWindow.fromWebContents(event.sender) ?? undefined;
      const result = await dialog.showSaveDialog(win!, {
        title: 'Export PNG',
        defaultPath: filename,
        filters: [{ name: 'PNG image', extensions: ['png'] }]
      });
      if (result.canceled || !result.filePath) return { saved: false };

      const filePath = path.extname(result.filePath).toLowerCase() === '.png'
        ? result.filePath
        : result.filePath + '.png';

      const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
      await writeFile(filePath, Buffer.from(base64, 'base64'));
      return { saved: true, path: filePath };
    }
  );
}
