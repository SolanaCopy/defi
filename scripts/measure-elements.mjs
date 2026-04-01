import puppeteer from 'puppeteer';

const URL = 'https://www.smarttradingclub.io';
const delay = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: { width: 1920, height: 1080 },
    args: ['--no-sandbox'],
  });

  const page = await browser.newPage();

  // ===== COPY TRADING TAB (homepage) =====
  console.log('=== COPY TRADING TAB (homepage) ===');
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await delay(3000);

  // Measure all interactive elements
  const elements = await page.evaluate(() => {
    const results = {};
    const all = document.querySelectorAll('button, a, [role="tab"], .nav-link, input, select');

    for (const el of all) {
      const text = el.textContent?.trim().slice(0, 40);
      if (!text) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;

      const key = `${el.tagName}_${text}`.replace(/\s+/g, '_');
      results[key] = {
        text,
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
        cx: Math.round(rect.x + rect.width / 2),
        cy: Math.round(rect.y + rect.height / 2),
      };
    }
    return results;
  });

  console.log('\nAll elements on Copy Trading tab:');
  for (const [key, val] of Object.entries(elements)) {
    console.log(`  ${val.text.padEnd(35)} x:${String(val.x).padStart(5)} y:${String(val.y).padStart(5)}  size:${val.w}x${val.h}  center:(${val.cx}, ${val.cy})`);
  }

  // ===== DASHBOARD TAB =====
  console.log('\n=== DASHBOARD TAB ===');
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button, .nav-link')];
    const dash = btns.find(b => b.textContent.trim() === 'Dashboard');
    if (dash) dash.click();
  });
  await delay(2000);

  const dashElements = await page.evaluate(() => {
    const results = {};
    const all = document.querySelectorAll('button, a, [role="tab"], .nav-link, input, select');

    for (const el of all) {
      const text = el.textContent?.trim().slice(0, 40);
      if (!text) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;

      const key = `${el.tagName}_${text}`.replace(/\s+/g, '_');
      results[key] = {
        text,
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
        cx: Math.round(rect.x + rect.width / 2),
        cy: Math.round(rect.y + rect.height / 2),
      };
    }
    return results;
  });

  console.log('\nAll elements on Dashboard tab:');
  for (const [key, val] of Object.entries(dashElements)) {
    console.log(`  ${val.text.padEnd(35)} x:${String(val.x).padStart(5)} y:${String(val.y).padStart(5)}  size:${val.w}x${val.h}  center:(${val.cx}, ${val.cy})`);
  }

  // ===== RESULTS TAB =====
  console.log('\n=== RESULTS TAB ===');
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button, .nav-link')];
    const res = btns.find(b => b.textContent.trim() === 'Results');
    if (res) res.click();
  });
  await delay(2000);

  const resElements = await page.evaluate(() => {
    const results = {};
    const all = document.querySelectorAll('button, a, [role="tab"], .nav-link, input, select, th, td, h2, h3, [class*="stat"], [class*="card"], [class*="perf"]');

    for (const el of all) {
      const text = el.textContent?.trim().slice(0, 40);
      if (!text) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;

      const key = `${el.tagName}_${text}`.replace(/\s+/g, '_');
      results[key] = {
        text,
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
        cx: Math.round(rect.x + rect.width / 2),
        cy: Math.round(rect.y + rect.height / 2),
      };
    }
    return results;
  });

  console.log('\nKey elements on Results tab:');
  for (const [key, val] of Object.entries(resElements)) {
    if (val.text.length < 3) continue;
    console.log(`  ${val.text.padEnd(35)} x:${String(val.x).padStart(5)} y:${String(val.y).padStart(5)}  size:${val.w}x${val.h}  center:(${val.cx}, ${val.cy})`);
  }

  await browser.close();
  console.log('\nDone! Use these coordinates for cursor movements in Remotion.');
})();
