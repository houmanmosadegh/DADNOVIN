import { chromium } from 'playwright';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
const shots = [
  ['/', 'hero-new', 2200],
  ['/about', 'page-about', 900],
  ['/services', 'page-services', 1800],
  ['/consultation', 'page-consult', 900],
  ['/contact', 'page-contact', 900],
];
for (const [url, name, wait] of shots) {
  await p.goto('http://localhost:5174' + url);
  await p.waitForTimeout(wait);
  await p.screenshot({ path: `/tmp/${name}-top.png` });
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.5));
  await p.waitForTimeout(1300);
  await p.screenshot({ path: `/tmp/${name}-mid.png` });
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await p.waitForTimeout(1300);
  await p.screenshot({ path: `/tmp/${name}-bot.png` });
}
await b.close();
