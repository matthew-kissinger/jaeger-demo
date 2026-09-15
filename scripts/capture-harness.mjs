import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

await mkdir('evidence/browser', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-webgpu', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const results = [];
try {
  for (const backend of ['webgpu', 'webgl']) {
    for (const asset of ['canonical', 'optimized']) {
      const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(String(error)));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      const started = Date.now();
      await page.goto(`http://127.0.0.1:5186/jaeger-demo/?backend=${backend}&asset=${asset}`, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => window.jaegerQA?.ready || window.jaegerQA?.errors.length, { timeout: 60000 });
      const state = await page.evaluate(() => ({ ready: window.jaegerQA.ready, errors: window.jaegerQA.errors }));
      if (!state.ready) throw new Error(JSON.stringify(state));
      const readyMs = Date.now() - started;
      await page.evaluate(() => window.jaegerQA.resetStats());
      await page.waitForTimeout(5000);
      const stats = await page.evaluate(() => window.jaegerQA.stats());
      const adapter = await page.evaluate(async () => {
        const adapter = await navigator.gpu?.requestAdapter();
        return adapter ? { vendor: adapter.info.vendor, architecture: adapter.info.architecture, device: adapter.info.device, description: adapter.info.description, fallback: adapter.info.isFallbackAdapter } : null;
      });
      await page.screenshot({ path: `evidence/browser/${backend}-${asset}-idle.png` });
      await page.evaluate(() => window.jaegerQA.setPose('SlashCombo', 0.61));
      await page.waitForTimeout(200);
      await page.screenshot({ path: `evidence/browser/${backend}-${asset}-combo.png` });
      results.push({ backend, asset, readyMs, stats, adapter, errors, note: '1920x1080 headless Chrome dev harness; idle five-second sample, not full-scene or mobile acceptance.' });
      console.log(JSON.stringify(results.at(-1)));
      await context.close();
    }
  }
  await writeFile('evidence/browser/qualification.json', JSON.stringify(results, null, 2));
} finally { await browser.close(); }
