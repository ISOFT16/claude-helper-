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
}
console.log('Built to', outDirs.join(', '));
