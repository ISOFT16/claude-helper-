import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Во время разработки сайт работает на порту 5173,
// а запросы /api пересылаются серверу на порт 8787.
export default defineConfig({
  plugins: [react()],
  server: { host: true, proxy: { '/api': 'http://localhost:8787' } },
});
