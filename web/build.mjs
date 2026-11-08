// Bundles the game into ../android/app/src/main/assets/www (and web/dist for browser testing).
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

// Files in addons/ are embedded as plain text (they are executed by the addon loader at runtime)
const addonText = {
  name: 'addon-text',
  setup(build) {
    build.onLoad({ filter: /[\\/]addons[\\/][^\\/]+\.js$/ }, async (args) => ({
      contents: fs.readFileSync(args.path, 'utf8'),
      loader: 'text',
    }));
  },
};

const outDirs = ['dist', '../android/app/src/main/assets/www'];
for (const dir of outDirs) {
  fs.mkdirSync(dir, { recursive: true });
  await esbuild.build({
    entryPoints: ['src/main.js'],
    bundle: true,
    minify: true,
    format: 'iife',
    target: ['chrome80'],
    outfile: path.join(dir, 'game.js'),
    plugins: [addonText],
    logLevel: 'warning',
  });
  fs.copyFileSync('index.html', path.join(dir, 'index.html'));
  fs.copyFileSync('style.css', path.join(dir, 'style.css'));
  // Google Font "Exo 2" (SIL Open Font License), bundled so it works offline
  const fontDir = path.join(dir, 'fonts');
  fs.mkdirSync(fontDir, { recursive: true });
  for (const sub of ['latin', 'cyrillic']) for (const w of [400, 600, 800]) {
    const f = `exo-2-${sub}-${w}-normal.woff2`;
    fs.copyFileSync(path.join('node_modules/@fontsource/exo-2/files', f), path.join(fontDir, f));
  }
}
console.log('Built to', outDirs.join(', '));
