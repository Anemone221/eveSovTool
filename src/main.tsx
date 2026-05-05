import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { PanelWindow } from './shell/PanelWindow';
import './styles.css';

const params = new URLSearchParams(window.location.search);
const panelId = params.get('panel');

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');

createRoot(root).render(
  <React.StrictMode>
    {panelId ? <PanelWindow panelId={panelId} /> : <App />}
  </React.StrictMode>
);
