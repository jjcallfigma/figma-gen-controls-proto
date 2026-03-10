#!/usr/bin/env node
/**
 * Test /ui slash command: AI assistant tab, type /ui, check demo controls popover
 */
import { chromium } from "@playwright/test";
import { mkdir } from "fs/promises";

const SCREENSHOT_DIR = "./properties-panel-screenshots";

async function main() {
  await mkdir(SCREENSHOT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  // Collect console messages
  const consoleLogs = [];
  page.on("console", (msg) => {
    const text = msg.text();
    const type = msg.type();
    consoleLogs.push({ type, text });
  });

  try {
    await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    console.log("Page loaded");

    // 1. Find AI assistant tab (sparkles icon) - 4th button in left nav
    const navBar = page.locator('div[style*="var(--color-bg-elevated)"]').first();
    const navButtons = page.locator('button[class*="rounded-[4px]"]').filter({ has: page.locator("svg") });
    const aiButton = navButtons.nth(3); // 0=page, 1=insert, 2=search, 3=ai-assistant

    if (!(await aiButton.isVisible())) {
      console.log("AI button not visible, trying by role/label");
      const byAria = page.getByRole("button", { name: /ai|assistant/i });
      if (await byAria.isVisible()) {
        await byAria.click();
      } else {
        throw new Error("AI assistant button not found");
      }
    } else {
      await aiButton.click();
    }
    await page.waitForTimeout(1000);

    // 2. Find textarea at bottom of AI sidebar (placeholder: Describe what to change...)
    const input = page.getByPlaceholder(/Describe what to change|Describe changes for/i).first();
    await input.waitFor({ state: "visible", timeout: 5000 });
    await input.click();
    await input.fill("/ui");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1500);

    // 3. Look for demo controls popover
    const popover = page.locator('[data-property-popover="true"]');
    const popoverVisible = await popover.isVisible().catch(() => false);

    if (popoverVisible) {
      await page.screenshot({ path: `${SCREENSHOT_DIR}/10-ui-demo-popover.png` });
      console.log("Saved: 10-ui-demo-popover.png");

      const title = await popover.locator('.popover-header, [class*="font-medium"]').first().textContent().catch(() => "");
      const controls = await popover.locator('[style*="flexDirection"]').count();
      const sliderCount = await popover.locator('[role="slider"], [data-radix-slider]').count();
      const toggleCount = await popover.locator('button[role="switch"], [data-state]').count();
      console.log("Popover title:", title?.trim());
      console.log("Field rows:", controls);
      console.log("Sliders:", sliderCount);
      console.log("Toggles:", toggleCount);
    } else {
      await page.screenshot({ path: `${SCREENSHOT_DIR}/10-ui-no-popover.png` });
      console.log("No popover appeared. Saved: 10-ui-no-popover.png");
      console.log("Console logs:", consoleLogs.slice(-20));
    }
  } catch (err) {
    console.error("Error:", err.message);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/10-ui-error.png` }).catch(() => {});
    console.log("Console:", consoleLogs.slice(-15));
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
