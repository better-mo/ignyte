import { test, expect } from "@playwright/test";
test("the first-minute setup ends in a populated graph", async ({ page }) => {
  await page.goto("/app/");
  await page.getByRole("button", { name: "Start setup", exact: true }).click();
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await page
    .getByRole("button", { name: "Alex Morgan alex@example.com" })
    .click();
  await page.getByRole("button", { name: "Review what you share" }).click();
  await page.getByRole("button", { name: "Allow in demo & continue" }).click();
  await page.getByRole("button", { name: "Allow in demo & continue" }).click();
  await expect(
    page.getByText("Never email bodies, attachments, or message content."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Build my sample world" }).click();
  await expect(
    page.getByText("You’re one introduction from Shopify."),
  ).toBeVisible();
  await page.getByRole("button", { name: "See what’s possible" }).click();
  await page.getByRole("button", { name: "Step into my world" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".world-count strong")).toHaveText("50");
});
test("warm paths show evidence, editable drafts, and an honest empty state", async ({
  page,
}) => {
  await page.goto("/app/");
  await page
    .getByRole("button", { name: "Someone at Shopify", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your way into Shopify" }),
  ).toBeVisible();
  await expect(
    page.getByText("3 years at Shopify", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Ask Sara for an intro" }).click();
  await expect(page.getByLabel("Edit message draft")).toContainText(
    "Hey Sara!",
  );
  await page
    .getByLabel("Edit message draft")
    .fill("Hi Sara, can you reconnect me with Daniel?");
  await page.getByRole("button", { name: "Mark as done", exact: true }).click();
  await page.getByLabel("Search warm paths").fill("NoSuchCompany");
  await page.getByRole("button", { name: "Search paths", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "No warm path just yet." }),
  ).toBeVisible();
});
test("people filters, map, profiles and confirmed voice context", async ({
  page,
}) => {
  await page.goto("/app/");
  await page.getByRole("button", { name: "Your people", exact: true }).click();
  await expect(page.locator(".person-row")).toHaveCount(50);
  await page.getByLabel("City", { exact: true }).selectOption("Toronto");
  await expect(page.locator(".person-row")).toHaveCount(14);
  await page.getByRole("button", { name: "Map view" }).click();
  await expect(page.locator(".map-surface")).toBeVisible();
  await page
    .getByRole("button", { name: "View Priya Sharma", exact: true })
    .click();
  await page.getByRole("button", { name: "Connection", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Why you’re connected" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Capture a thought" }).click();
  await page.getByRole("button", { name: "Preview a voice note" }).click();
  await page.getByRole("button", { name: "Review the person match" }).click();
  await page.getByRole("button", { name: "Confirm & save thought" }).click();
  await page
    .getByRole("button", { name: "Your notes (1)", exact: true })
    .click();
  await expect(
    page.getByText("Met Priya for coffee.", { exact: false }),
  ).toBeVisible();
});
test("agent approval, grounded response, note confirmation, privacy, and revocation", async ({
  page,
}) => {
  await page.goto("/app/");
  await page
    .getByRole("button", { name: "Your people brain", exact: true })
    .click();
  await page.getByRole("button", { name: "Connect Ignyte to ChatGPT" }).click();
  await page.getByLabel("Allow adding notes, with my confirmation").check();
  await page.getByRole("button", { name: "Allow demo connection" }).click();
  await page
    .getByRole("button", { name: "Who do I know at Shopify?", exact: true })
    .click();
  await expect(
    page.getByText(
      "Sara and Daniel Kim, Shopify’s Design Director, worked together for three years.",
      { exact: false },
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Inspect the context shared" })
    .click();
  await expect(
    page.getByText("Personal notes excluded by your setting"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Try a confirmed note" }).click();
  await page.getByRole("button", { name: "Confirm & add to Priya" }).click();
  await expect(
    page.getByRole("button", { name: "Note confirmed" }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Permissions & activity", exact: true })
    .click();
  await expect(
    page.getByText("ChatGPT · Added one note with your confirmation"),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Revoke access", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Try a conversation", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Connect Ignyte to ChatGPT" }),
  ).toBeVisible();
});
test("source import recovery and privacy reset", async ({ page }) => {
  await page.goto("/app/");
  await page
    .getByRole("button", { name: "Connections & privacy", exact: true })
    .click();
  await page
    .locator(".source-row")
    .filter({ hasText: "Phone contacts" })
    .getByRole("button", { name: "Explore" })
    .click();
  await page
    .getByRole("button", { name: "Preview an unsupported file" })
    .click();
  await expect(page.locator(".form-error")).toContainText("couldn’t be read");
  await page.getByRole("button", { name: "Use sample import" }).click();
  await page.getByRole("button", { name: "Add sample connections" }).click();
  await expect(
    page.locator(".source-row").filter({ hasText: "Phone contacts" }),
  ).toContainText("Connected in demo");
  await page.getByRole("switch", { name: "Morning brief by email" }).click();
  await expect(
    page.getByRole("switch", { name: "Morning brief by email" }),
  ).toBeChecked();
  await page
    .getByRole("button", { name: "Delete demo data", exact: true })
    .click();
  await page.getByRole("button", { name: "Remove demo data" }).click();
  await expect(
    page.getByRole("heading", {
      name: "A fresh start, whenever you’re ready.",
    }),
  ).toBeVisible();
});
test("desktop visual and mobile navigation have no horizontal overflow", async ({
  page,
}) => {
  await page.goto("/app/");
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: "../ignyte-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "../ignyte-mobile.png", fullPage: true });
  for (const name of [
    "Your people",
    "Warm paths",
    "Possibilities",
    "Your people brain",
    "Connections & privacy",
  ]) {
    await page.getByRole("button", { name: "Open navigation" }).click();
    await page.getByRole("button", { name, exact: true }).click();
    const fits = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );
    expect(fits, `overflow on ${name}`).toBe(true);
  }
  await page.getByRole("button", { name: "Start setup", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeVisible();
  await page.screenshot({ path: "../ignyte-setup-mobile.png", fullPage: true });
});

test("agent access survives navigation and hidden people remain in your own graph", async ({
  page,
}) => {
  await page.goto("/app/");
  await page
    .getByRole("button", { name: "Your people brain", exact: true })
    .click();
  await page.getByRole("button", { name: "Connect Ignyte to ChatGPT" }).click();
  await page.getByRole("button", { name: "Allow demo connection" }).click();
  await page
    .getByRole("button", { name: "Who do I know at Shopify?", exact: true })
    .click();
  await page.getByRole("button", { name: "Your people", exact: true }).click();
  await page.locator(".person-row").filter({ hasText: "Sara Chen" }).click();
  await page
    .getByRole("button", { name: "Hide from your AI", exact: true })
    .click();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.locator(".person-row")).toHaveCount(50);
  await page
    .getByRole("button", { name: "Your people brain", exact: true })
    .click();
  await expect(
    page.getByText("People brain connected", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Sara’s profile is hidden by your privacy controls.", {
      exact: false,
    }),
  ).toBeVisible();
});
