import puppeteer from 'puppeteer';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'public');
const URL = 'https://www.smarttradingclub.io';

const delay = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: { width: 1920, height: 1080 },
    args: ['--no-sandbox'],
  });

  const page = await browser.newPage();

  // 1. Homepage / Copy Trading tab (default)
  console.log('1. Homepage (Copy Trading)...');
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await delay(3000);
  await page.screenshot({ path: join(outDir, 'ss-copytrade.png') });
  console.log('✓ ss-copytrade.png');

  // 2. Dashboard tab
  console.log('2. Dashboard tab...');
  await page.click('button:has-text("Dashboard"), .nav-link:has-text("Dashboard")').catch(() => {});
  // Fallback: click via evaluate
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button, .nav-link')];
    const dash = btns.find(b => b.textContent.trim() === 'Dashboard');
    if (dash) dash.click();
  });
  await delay(2000);
  await page.screenshot({ path: join(outDir, 'ss-dashboard.png') });
  console.log('✓ ss-dashboard.png');

  // Scroll dashboard down to see auto-copy section
  await page.evaluate(() => window.scrollBy(0, 400));
  await delay(1000);
  await page.screenshot({ path: join(outDir, 'ss-dashboard-scrolled.png') });
  console.log('✓ ss-dashboard-scrolled.png');

  // 3. Results tab
  console.log('3. Results tab...');
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button, .nav-link')];
    const res = btns.find(b => b.textContent.trim() === 'Results');
    if (res) res.click();
  });
  await delay(2000);
  await page.screenshot({ path: join(outDir, 'ss-results.png') });
  console.log('✓ ss-results.png');

  // Scroll results to show trade history
  await page.evaluate(() => window.scrollBy(0, 500));
  await delay(1000);
  await page.screenshot({ path: join(outDir, 'ss-results-trades.png') });
  console.log('✓ ss-results-trades.png');

  // 4. Bridge section (button in copy trading tab)
  console.log('4. Bridge section...');
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button, .nav-link')];
    const cp = btns.find(b => b.textContent.trim() === 'Copy Trading');
    if (cp) cp.click();
  });
  await delay(1500);
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const bridge = btns.find(b => b.textContent.trim() === 'Bridge');
    if (bridge) bridge.click();
  });
  await delay(2000);
  await page.screenshot({ path: join(outDir, 'ss-bridge.png') });
  console.log('✓ ss-bridge.png');

  // 5. Referral tab
  console.log('5. Referral tab...');
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button, .nav-link')];
    const ref = btns.find(b => b.textContent.trim() === 'Referral');
    if (ref) ref.click();
  });
  await delay(2000);
  await page.screenshot({ path: join(outDir, 'ss-referral.png') });
  console.log('✓ ss-referral.png');

  // 6. Connect Wallet button highlighted (back to copy trading)
  console.log('6. Connect Wallet highlight...');
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button, .nav-link')];
    const cp = btns.find(b => b.textContent.trim() === 'Copy Trading');
    if (cp) cp.click();
  });
  await delay(1500);
  // Add a glow effect to the connect wallet button for the screenshot
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Connect Wallet'));
    if (btn) {
      btn.style.boxShadow = '0 0 30px rgba(212,168,67,0.6), 0 0 60px rgba(212,168,67,0.3)';
      btn.style.border = '2px solid #D4A843';
    }
  });
  await delay(500);
  await page.screenshot({ path: join(outDir, 'ss-connect-highlight.png') });
  console.log('✓ ss-connect-highlight.png');

  // 7. My Positions tab (in dashboard)
  console.log('7. My Positions...');
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button, .nav-link')];
    const dash = btns.find(b => b.textContent.trim() === 'Dashboard');
    if (dash) dash.click();
  });
  await delay(1500);
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const pos = btns.find(b => b.textContent.trim() === 'My Positions');
    if (pos) pos.click();
  });
  await delay(1500);
  await page.screenshot({ path: join(outDir, 'ss-positions.png') });
  console.log('✓ ss-positions.png');

  // 8. Journal tab
  console.log('8. Journal...');
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const j = btns.find(b => b.textContent.trim() === 'Journal');
    if (j) j.click();
  });
  await delay(1500);
  await page.screenshot({ path: join(outDir, 'ss-journal.png') });
  console.log('✓ ss-journal.png');

  await browser.close();
  console.log('\nAll screenshots taken!');
})();
