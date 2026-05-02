import { contextBridge, ipcRenderer } from 'electron';
import type { EveSovApi } from '@shared/index';

const api: EveSovApi = {
  ping: () => ipcRenderer.invoke('ping'),
  prefs: {
    get: (key) => ipcRenderer.invoke('prefs.get', key),
    set: (key, value) => ipcRenderer.invoke('prefs.set', key, value)
  },
  data: {
    tree: () => ipcRenderer.invoke('data.tree'),
    region: (id) => ipcRenderer.invoke('data.region', id),
    constellation: (id) => ipcRenderer.invoke('data.constellation', id),
    system: (id) => ipcRenderer.invoke('data.system', id),
    upgrades: () => ipcRenderer.invoke('data.upgrades'),
    upgrade: (name) => ipcRenderer.invoke('data.upgrade', name),
    refreshSov: (args) => ipcRenderer.invoke('data.refreshSov', args),
    exportTemplates: (dir) => ipcRenderer.invoke('data.exportTemplates', dir)
  },
  plans: {
    list: () => ipcRenderer.invoke('plans.list'),
    get: (id) => ipcRenderer.invoke('plans.get', id),
    create: (name) => ipcRenderer.invoke('plans.create', name),
    rename: (id, name) => ipcRenderer.invoke('plans.rename', id, name),
    duplicate: (id, newName) => ipcRenderer.invoke('plans.duplicate', id, newName),
    delete: (id) => ipcRenderer.invoke('plans.delete', id),
    setScopes: (planId, scopes) => ipcRenderer.invoke('plans.setScopes', planId, scopes),
    explodeScope: (planId, scopeType, scopeId) =>
      ipcRenderer.invoke('plans.explodeScope', planId, scopeType, scopeId),
    assignUpgrade: (planId, systemId, upgradeName) =>
      ipcRenderer.invoke('plans.assignUpgrade', planId, systemId, upgradeName),
    removeUpgrade: (planId, systemId, upgradeName) =>
      ipcRenderer.invoke('plans.removeUpgrade', planId, systemId, upgradeName),
    removeSystem: (planId, systemId) =>
      ipcRenderer.invoke('plans.removeSystem', planId, systemId),
    setCapital: (planId, systemId, isCapital) =>
      ipcRenderer.invoke('plans.setCapital', planId, systemId, isCapital),
    setSystemStatus: (planId, systemId, status) =>
      ipcRenderer.invoke('plans.setSystemStatus', planId, systemId, status),
    setUpgradeInstalled: (planId, systemId, upgradeName, installed) =>
      ipcRenderer.invoke('plans.setUpgradeInstalled', planId, systemId, upgradeName, installed),
    clearUpgrades: (planId, scope) => ipcRenderer.invoke('plans.clearUpgrades', planId, scope),
    systemBalance: (planId, systemId) =>
      ipcRenderer.invoke('plans.systemBalance', planId, systemId),
    summary: (planId) => ipcRenderer.invoke('plans.summary', planId),
    matrix: (planId) => ipcRenderer.invoke('plans.matrix', planId),
    setWorkforceTransfer: (planId, sourceSystemId, destSystemId, amount, exportAllUnused) =>
      ipcRenderer.invoke('plans.setWorkforceTransfer', planId, sourceSystemId, destSystemId, amount, exportAllUnused),
    removeWorkforceTransfer: (planId, sourceSystemId) =>
      ipcRenderer.invoke('plans.removeWorkforceTransfer', planId, sourceSystemId),
    getWorkforceTransfers: (planId) =>
      ipcRenderer.invoke('plans.getWorkforceTransfers', planId),
    getReachableImportSystems: (planId, sourceSystemId) =>
      ipcRenderer.invoke('plans.getReachableImportSystems', planId, sourceSystemId),
    getAlnTargets: (planId, systemId) =>
      ipcRenderer.invoke('plans.getAlnTargets', planId, systemId),
    setAlnLink: (planId, systemId, linkedSystemId, linkedSystemName) =>
      ipcRenderer.invoke('plans.setAlnLink', planId, systemId, linkedSystemId, linkedSystemName),
    removeAlnLink: (planId, systemId) =>
      ipcRenderer.invoke('plans.removeAlnLink', planId, systemId),
    searchSystems: (query) =>
      ipcRenderer.invoke('plans.searchSystems', query)
  },
  windows: {
    openPanel: (panelId, params) => ipcRenderer.invoke('windows.openPanel', panelId, params),
    dockBack: (windowId) => ipcRenderer.invoke('windows.dockBack', windowId)
  },
  exports: {
    capturePng: (filename, dataUrl) => ipcRenderer.invoke('exports.capturePng', filename, dataUrl)
  },
  structures: {
    list: (planId, systemId?) => ipcRenderer.invoke('structures.list', planId, systemId),
    add: (planId, systemId, structure) => ipcRenderer.invoke('structures.add', planId, systemId, structure),
    remove: (planId, structureId) => ipcRenderer.invoke('structures.remove', planId, structureId),
    importClipboard: (planId, systemId, text) => ipcRenderer.invoke('structures.importClipboard', planId, systemId, text),
  },
  events: {
    on: (channel, listener) => {
      const wrapped = (_: unknown, payload: unknown) => listener(payload);
      ipcRenderer.on(channel, wrapped);
      return () => ipcRenderer.off(channel, wrapped);
    }
  }
};

contextBridge.exposeInMainWorld('evesov', api);
