import React from 'react';
import { createRoot } from 'react-dom/client';
import { AppProviders } from './bootstrap/AppProviders';
import { AssistantPwaScreen } from './screens/assistant/AssistantPwaScreen';
import './styles/globals.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

createRoot(root).render(
  <React.StrictMode>
    <AppProviders>
      <AssistantPwaScreen />
    </AppProviders>
  </React.StrictMode>,
);
