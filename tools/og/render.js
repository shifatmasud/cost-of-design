// Renders tools/og/og.html to og.png (1200x630) with headless Chromium.
// Usage: serve the repo root on :8791, then: node tools/og/render.js [out.png]
const { chromium } = require(process.env.PW || 'playwright-core');
(async () => {
  const out = process.argv[2] || 'og.png';
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 });
  page.on('console', (m) => console.log('page:', m.text()));
  page.on('pageerror', (e) => console.log('error:', e.message));
  await page.goto('http://localhost:8791/tools/og/og.html');
  await page.waitForFunction(() => window.__ready, null, { timeout: 30000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: out });
  await browser.close();
})();
