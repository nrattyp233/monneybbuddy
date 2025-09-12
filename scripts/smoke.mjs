#!/usr/bin/env node
import puppeteer from 'puppeteer';

const baseUrl = process.env.BASE_URL || 'http://localhost:4173';

const waitForText = async (page, text, timeout = 10000) => {
  await page.waitForFunction((t) => !!document.body && document.body.innerText.includes(t), { timeout }, text);
};

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox','--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  page.setDefaultTimeout(15000);

  const results = [];
  const step = async (name, fn) => {
    try {
      await fn();
      results.push({ name, ok: true });
    } catch (e) {
      results.push({ name, ok: false, error: String(e) });
    }
  };

  await step('Open home', async () => {
    await page.goto(baseUrl, { waitUntil: 'networkidle2' });
    // Expect Auth screen content
    await waitForText(page, 'Money Buddy - Geo Safe');
  });

  await step('Auth toggle', async () => {
    // Toggle between Sign In and Sign Up link text
    const toggleSelector = 'button:has-text("Sign Up"), button:has-text("Sign In")';
    // Puppeteer doesn't support :has-text natively; use XPath
    const [btn] = await page.$x("//button[contains(., 'Sign Up') or contains(., 'Sign In')]");
    if (!btn) throw new Error('Toggle button not found');
    await btn.click();
    await page.waitForTimeout(400);
  });

  await step('Mascot canvas present', async () => {
    // Check canvas exists (3D mascot)
    const hasCanvas = await page.$('canvas') !== null;
    if (!hasCanvas) throw new Error('Canvas not found');
  });

  // Summarize
  const failed = results.filter(r => !r.ok);
  const passed = results.filter(r => r.ok);
  console.log('\nSMOKE TEST RESULTS');
  passed.forEach(r => console.log(`✔ ${r.name}`));
  failed.forEach(r => console.error(`✖ ${r.name}: ${r.error}`));

  await browser.close();
  if (failed.length) process.exit(1);
  process.exit(0);
})();
