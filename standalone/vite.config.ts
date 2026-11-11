// Сборка версии «одна ссылка» для claude.ai: один JS-файл, React берётся с cdnjs.
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';

const root = path.resolve(import.meta.dirname, '..');

export default defineConfig({
  root,
  plugins: [react()],
  define: { 'import.meta.env.VITE_STANDALONE': JSON.stringify('1') },
  resolve: {
    alias: [{ find: /^react\/jsx-(dev-)?runtime$/, replacement: path.join(root, 'standalone/jsx-runtime.ts') }],
  },
  build: {
    outDir: path.join(root, 'standalone/dist'),
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: {
      entry: path.join(root, 'src/main.tsx'),
      formats: ['iife'],
      name: 'UmnyUrok',
      fileName: () => 'app.js',
      cssFileName: 'app',
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react-dom/client'],
      output: { globals: { react: 'React', 'react-dom': 'ReactDOM', 'react-dom/client': 'ReactDOM' } },
    },
  },
});
