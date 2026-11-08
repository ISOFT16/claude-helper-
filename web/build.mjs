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

// Rust physics core (physics/ folder) compiled to WebAssembly; build it first with:
//   cargo build --release --target wasm32-unknown-unknown   (inside physics/)
const wasmSrc = '../physics/target/wasm32-unknown-unknown/release/sandforge_physics.wasm';
if (!fs.existsSync(wasmSrc)) {
  console.error('Не найден ' + wasmSrc + ' — сначала соберите Rust-ядро: cd physics && cargo build --release --target wasm32-unknown-unknown');
  process.exit(1);
}
fs.copyFileSync(wasmSrc, 'src/physics.wasm');

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
    loader: { '.wasm': 'binary' },
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
