#!/usr/bin/env node
/**
 * Check for horizontal scrollbar/overflow in /ui All Controls popover
 */
import { chromium } from "@playwright/test";
import { mkdir } from "fs/promises";

const SCREENSHOT_DIR = "./properties-panel-screenshots";

async function openUi(page) {
  const aiBtn = page.locator('button[class*="rounded-[4px]"]').filter({ has: page.locator("svg") }).nth(3);
  await aiBtn.click();
  await page.waitForTimeout(1200);

  const input = page.getByPlaceholder(/Describe what to change|Describe changes for/i).first();
  await input.waitFor({ state: "visible", timeout: 8000 });
  await input.fill("/ui");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1500);
}

async function main() {
  await mkdir(SCREENSHOT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  try {
    await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);

    await openUi(page);
    const popover = page.locator('[data-property-popover="true"]');
    if (!(await popover.isVisible())) {
      console.log("ERROR: All Controls popover did not appear");
      return;
    }

    // 3. Check horizontal overflow
    const overflowInfo = await page.evaluate(() => {
      const scope = document.querySelector(".figui3-scope");
      return {
        scrollWidth: scope?.scrollWidth,
        clientWidth: scope?.clientWidth,
        hasHorizontalOverflow: (scope?.scrollWidth || 0) > (scope?.clientWidth || 0),
      };
    });
    console.log("=== Horizontal overflow check ===");
    console.log(JSON.stringify(overflowInfo, null, 2));

    // 4. Screenshot at top
    await page.screenshot({ path: `${SCREENSHOT_DIR}/27-popover-top.png` });
    console.log("\nSaved: 27-popover-top.png");

    // 5. Scroll to bottom
    const scrollArea = popover.locator(".overflow-y-auto");
    await scrollArea.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await page.waitForTimeout(500);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/28-popover-bottom.png` });
    console.log("Saved: 28-popover-bottom.png");

    // Check overflow again after scroll (in case it changes)
    const overflowAfterScroll = await page.evaluate(() => {
      const scope = document.querySelector(".figui3-scope");
      const scrollEl = scope?.closest?.(".overflow-y-auto") || scope?.parentElement;
      return {
        scopeScrollWidth: scope?.scrollWidth,
        scopeClientWidth: scope?.clientWidth,
        hasHOverflow: (scope?.scrollWidth || 0) > (scope?.clientWidth || 0),
        scrollElScrollWidth: scrollEl?.scrollWidth,
        scrollElClientWidth: scrollEl?.clientWidth,
        scrollElScrollLeft: scrollEl?.scrollLeft,
        scrollElScrollLeftMax: scrollEl ? scrollEl.scrollWidth - scrollEl.clientWidth : null,
      };
    });
    console.log("\n=== After scroll to bottom ===");
    console.log(JSON.stringify(overflowAfterScroll, null, 2));
  } catch (err) {
    console.error("Error:", err.message);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/27-error.png` }).catch(() => {});
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
