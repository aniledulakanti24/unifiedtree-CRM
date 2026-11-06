import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import './styles.css';
import App from './App';
import { StoreProvider } from './store';

createRoot(document.getElementById('root')).render(<StoreProvider><App /></StoreProvider>);

// Installable, and opens without a connection, once hosted. Not available when dist/index.html is opened as a file.
if (import.meta.env.PROD && 'serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
