import { test, expect } from "@playwright/test";

test("two clicks reveal a sample graph and a grounded opportunity", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Someone you know",
  );
  await page
    .getByRole("button", { name: "See my hidden connections", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "No sign-in, permissions, or real data.",
  );
  await page
    .getByRole("button", { name: "Connect sample Google account" })
    .click();
  await expect(page.getByRole("dialog")).toContainText("You had a way in.");
  await expect(page.locator(".l-reveal-map")).toBeVisible();
  await expect(page.locator(".l-first-discovery")).toContainText(
    "You know someone",
  );
  await expect(page.locator(".l-reveal-map")).toContainText("Your calendar");
  await expect(page.locator(".l-reveal-map")).not.toContainText(
    "Product Manager Community",
  );
  await page
    .getByRole("link", { name: "Explore this introduction", exact: true })
    .click();
  await expect(page).toHaveURL(/\/app\/\?q=Shopify/);
  await expect(
    page.getByRole("heading", { name: "Your way into Shopify" }),
  ).toBeVisible();
});

test("three agent stories show concrete answers and inspectable evidence", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Your first five customers" }).click();
  await expect(page.getByLabel("Preview assistant")).toHaveValue("Claude");
  await expect(page.locator(".l-answer")).toContainText(
    "Jordan leads CX at Gather",
  );
  await page.getByRole("button", { name: "Why this connection?" }).click();
  await expect(page.locator(".l-evidence")).toContainText(
    "Shared membership does not establish a personal relationship",
  );
  await page.getByRole("tab", { name: "A trip, with familiar faces" }).click();
  await expect(page.locator(".l-answer")).toContainText("Maya lives there now");
  await expect(page.getByLabel("Preview assistant")).toHaveValue("ChatGPT");
  await expect(page.locator(".l-evidence")).toHaveCount(0);
  await page.getByLabel("Preview assistant").selectOption("Claude");
  await expect(page.getByLabel("Preview assistant")).toHaveValue("Claude");
  await page.getByRole("tab", { name: "A trip, with familiar faces" }).focus();
  await page.keyboard.press("Home");
  await expect(
    page.getByRole("tab", { name: "The next chapter" }),
  ).toBeFocused();
  await expect(page.locator(".l-answer")).toContainText("talk to Sara");
  await page
    .getByRole("link", { name: "See the introduction", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your way into Shopify" }),
  ).toBeVisible();
});

test("daily moments and communities respond with meaningful state changes", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Save this little possibility" })
    .click();
  await expect(
    page.getByRole("button", { name: "Saved for this visit" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Saved for this visit" }).click();
  await expect(
    page.getByRole("button", { name: "Save this little possibility" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "One good question to ask" }).click();
  await expect(page.locator(".l-brief-expanded")).toContainText(
    "What kind of PM",
  );
  await page
    .getByRole("group", { name: "Explore shared communities" })
    .getByRole("button", { name: "Product Manager Community" })
    .click();
  await expect(page.locator(".l-world-leo")).toContainText("Sara");
  await expect(page.locator(".l-world-evidence")).toContainText(
    "calendar history",
  );
  await page
    .getByRole("group", { name: "Explore shared communities" })
    .getByRole("button", { name: "Design Collective" })
    .click();
  await expect(page.locator(".l-world-leo")).toContainText("Oliver");
  await expect(page.locator(".l-world-evidence")).toContainText(
    "not a promise",
  );
  await page
    .getByRole("button", { name: "Your first customer might be a friend." })
    .click();
  await expect(page.locator(".l-opportunity")).toContainText("Jordan");
  await expect(page.locator(".l-map-sara")).toContainText("Jordan");
});

test("privacy is concise and the full prototype remains reachable", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "A little more on privacy" }).click();
  await expect(page.getByRole("dialog")).toContainText("fictional data");
  await page
    .getByRole("link", { name: "Explore the privacy controls" })
    .click();
  await expect(
    page.getByRole("heading", { name: /More context.*Never less control/ }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Back to Ignyte", exact: false })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Someone you know",
  );
});

test("responsive design preserves the stories and two-click reveal", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const width of [360, 390, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    const overflow = await page.evaluate(() => ({
      width: innerWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    expect(overflow.scroll, `${width}px page overflow`).toBeLessThanOrEqual(
      width,
    );
    for (const sel of [
      ".l-hero h1",
      ".l-chat-frame",
      ".l-daily-grid",
      ".l-world-copy",
      ".l-footer-top",
    ]) {
      const bounds = await page.locator(sel).boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x, `${sel} left at ${width}`).toBeGreaterThanOrEqual(-1);
      expect(
        bounds!.x + bounds!.width,
        `${sel} right at ${width}`,
      ).toBeLessThanOrEqual(width + 1);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Open website menu" }).click();
  await page
    .getByRole("navigation", { name: "Website navigation" })
    .getByRole("link", { name: "For your AI" })
    .click();
  await expect(
    page.getByRole("button", { name: "Open website menu" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Find your people", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Connect sample Google account" })
    .click();
  await expect(page.locator(".l-reveal-map")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(errors).toEqual([]);
});
