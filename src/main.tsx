import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { STANDALONE } from './env.ts';
import './styles.css';

if (!STANDALONE && !location.hash) location.hash = '/home';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Service worker делает из сайта приложение (PWA): его можно установить на телефон.
if (!STANDALONE && 'serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(console.error);
  });
}
