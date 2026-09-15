import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const backend = process.argv[2] ?? 'webgpu';
await mkdir(`evidence/scene-${backend}`, { recursive: true });
await mkdir('evidence/scene', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-webgpu','--disable-background-timer-throttling','--disable-renderer-backgrounding','--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = []; page.on('pageerror', error => errors.push(String(error))); page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
await page.goto(`http://127.0.0.1:5186/jaeger-demo/?backend=${backend}`, { waitUntil: 'networkidle' });
try { await page.waitForFunction(() => window.jaegerQA?.ready, { timeout: 30000 }); } catch {}
await page.screenshot({ path: 'evidence/scene/welcome.png' });
const initial = await page.evaluate(() => ({ ready: window.jaegerQA?.ready, errors: window.jaegerQA?.errors }));
if (initial.ready) {
  await page.getByRole('button', { name: 'Deploy Jaeger', exact: true }).click();
  await page.waitForTimeout(2100); await page.screenshot({ path: 'evidence/scene/intro-low.png' });
  await page.waitForTimeout(10200); await page.screenshot({ path: 'evidence/scene/pilot.png' });
  await page.keyboard.down('KeyW'); await page.waitForTimeout(2000); await page.keyboard.up('KeyW');
  await page.waitForTimeout(900); await page.screenshot({ path: 'evidence/scene/walk-stop.png' });
  await page.keyboard.down('Space'); await page.waitForTimeout(3200); await page.keyboard.down('KeyW'); await page.waitForTimeout(1200); await page.keyboard.up('KeyW');
  await page.screenshot({ path: 'evidence/scene/flight.png' }); await page.keyboard.up('Space'); await page.waitForTimeout(4700);
}
const result = await page.evaluate(() => ({ ready: window.jaegerQA?.ready, phase: window.jaegerQA?.phase, state: window.jaegerQA?.snapshot(), stats: window.jaegerQA?.stats() }));
await writeFile('evidence/scene/first-integration.json', JSON.stringify({ ...result, errors }, null, 2));
await writeFile(`evidence/scene-${backend}/integration.json`, JSON.stringify({ ...result, errors }, null, 2)); console.log(JSON.stringify({ ...result, errors }, null, 2)); await browser.close();
