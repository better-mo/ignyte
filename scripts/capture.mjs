import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 1100 },
  reducedMotion: "reduce",
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(process.env.DEMO_URL || "http://127.0.0.1:4173");
await page.evaluate(() => document.fonts.ready);
await page.screenshot({
  path: "../ignyte-desktop.png",
  fullPage: true,
  animations: "disabled",
});
await page
  .getByRole("button", { name: "Someone at Shopify", exact: true })
  .click();
await page.screenshot({
  path: "../ignyte-warm-paths.png",
  fullPage: true,
  animations: "disabled",
});
await page
  .getByRole("button", { name: "Your people brain", exact: true })
  .click();
await page.getByRole("button", { name: "Connect Ignyte to ChatGPT" }).click();
await page.getByRole("button", { name: "Allow demo connection" }).click();
await page
  .getByRole("button", { name: "Who do I know at Shopify?", exact: true })
  .click();
await page.getByRole("status").waitFor({ state: "hidden" });
await page.screenshot({
  path: "../ignyte-people-brain.png",
  fullPage: true,
  animations: "disabled",
});
await page.getByRole("button", { name: "Start setup", exact: true }).click();
await page.screenshot({
  path: "../ignyte-setup.png",
  fullPage: false,
  animations: "disabled",
});
await page.getByRole("button", { name: "Close dialog" }).click();
await page.getByRole("button", { name: "Today", exact: true }).click();
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({
  path: "../ignyte-mobile.png",
  fullPage: true,
  animations: "disabled",
});
console.log(JSON.stringify({ runtimeErrors: errors }));
await browser.close();
