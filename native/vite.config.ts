// Сборка для Android-приложения (Capacitor): обычный сайт, но с распознаванием речи
// телефона и Claude по ключу из настроек.
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';

const root = path.resolve(import.meta.dirname, '..');

export default defineConfig({
  root,
  plugins: [react()],
  define: { 'import.meta.env.VITE_NATIVE': JSON.stringify('1') },
  build: { outDir: path.join(root, 'dist-native'), emptyOutDir: true },
});
