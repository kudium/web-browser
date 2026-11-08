import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { safeErrorFrames } from '../browser/telemetry';

// Only error classifications cross IPC; never send the message, URL or stack.
window.addEventListener('error', (event) => {
  if (event.error instanceof Error)
    window.electron?.telemetry?.error(
      event.error.name,
      safeErrorFrames(event.error.stack)
    );
});
window.addEventListener('unhandledrejection', (event) => {
  if (event.reason instanceof Error)
    window.electron?.telemetry?.error(
      event.reason.name,
      safeErrorFrames(event.reason.stack)
    );
});

// Create App container
const container = document.getElementById('root')!;
const root = createRoot(container);
root.render(<App />);
