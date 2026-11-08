// Общие функции автотестов: запуск собранной игры в Chromium (Playwright) без сети.
// three.js и PeerJS берутся из tests/node_modules (см. tests/package.json), рендер — программный.
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..'), NM = path.join(__dirname, 'node_modules');
async function launch() { return chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info'] }); }
async function openGame(browser, { viewport = { width: 400, height: 225 }, settings, profile, locale = 'ru-RU', touch = false } = {}) {
  const ctx = await browser.newContext({ viewport, locale, hasTouch: touch, isMobile: touch });
  if (settings) await ctx.addInitScript(s => localStorage.setItem('perehvat-settings', JSON.stringify(s)), settings);
  if (profile) await ctx.addInitScript(p => localStorage.setItem('perehvat-profile', JSON.stringify(p)), profile);
  const pg = await ctx.newPage(); pg.errs = [];
  pg.on('pageerror', e => pg.errs.push(e.message));
  await pg.route('https://unpkg.com/**', r => { const u = r.request().url(); r.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(u.includes('peerjs@') ? path.join(NM, 'peerjs/dist/peerjs.min.js') : path.join(NM, 'three', u.split('three@0.160.0/')[1])) }); });
  await pg.goto('file://' + path.join(ROOT, 'index.html'));
  await pg.waitForFunction(() => window.__game, null, { timeout: 60000 });
  await pg.waitForTimeout(800);
  return { ctx, pg };
}
// начать одиночную игру и пропустить подготовку
async function startMatch(pg) {
  await pg.evaluate(() => { document.querySelector('.nb[data-screen="sp"]').click(); document.getElementById('play').click(); });
  await pg.waitForTimeout(400);
  await pg.evaluate(() => { const g = window.__game; g.G.paused = false; for (let i = 0; i < 60 * 20 && g.G.state === 'freeze'; i++) g.step(1); });
}
let failed = 0;
function check(name, ok, info = '') { console.log((ok ? '  ✓ ' : '  ✗ ') + name + (info ? ' — ' + info : '')); if (!ok) failed++; }
const result = () => failed;
module.exports = { launch, openGame, startMatch, check, result };
