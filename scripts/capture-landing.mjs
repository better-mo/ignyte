import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 1080 },
  reducedMotion: "reduce",
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(process.env.DEMO_URL || "http://127.0.0.1:4173");
await page.evaluate(() => document.fonts.ready);
await page.screenshot({
  path: "../landing-desktop.png",
  fullPage: true,
  animations: "disabled",
});
await page.screenshot({ path: "../landing-hero.png", animations: "disabled" });
await page
  .locator("#your-ai")
  .screenshot({ path: "../landing-conversations.png", animations: "disabled" });
await page
  .locator("#inside-ignyte")
  .screenshot({ path: "../landing-daily.png", animations: "disabled" });
await page.getByRole("tab", { name: "Your first five customers" }).click();
await page
  .locator("#your-ai")
  .screenshot({ path: "../landing-customers.png", animations: "disabled" });
await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(() => window.scrollTo(0, 0));
await page.screenshot({
  path: "../landing-mobile.png",
  fullPage: true,
  animations: "disabled",
});
await page.screenshot({
  path: "../landing-mobile-hero.png",
  animations: "disabled",
});
console.log(
  JSON.stringify({
    runtimeErrors: errors,
    overflow: await page.evaluate(() => ({
      width: window.innerWidth,
      scroll: document.documentElement.scrollWidth,
    })),
  }),
);
await browser.close();
