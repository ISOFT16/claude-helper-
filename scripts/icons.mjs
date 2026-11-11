// Делает PNG-иконки приложения из public/icon.svg (нужны для установки на телефон).
import fs from 'node:fs';
import { createRequire } from 'node:module';

// Playwright может быть установлен глобально, поэтому ищем его и там.
const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), process.env.NODE_PATH ?? ''] }));

const svg = fs.readFileSync('public/icon.svg', 'utf8');
const browser = await chromium.launch();
for (const size of [192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await page.screenshot({ path: `public/icon-${size}.png` });
  await page.close();
}
await browser.close();
