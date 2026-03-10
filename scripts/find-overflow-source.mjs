#!/usr/bin/env node
/**
 * Find which control causes horizontal overflow in /ui All Controls popover
 */
import { chromium } from "@playwright/test";
import { mkdir } from "fs/promises";

const SCREENSHOT_DIR = "./properties-panel-screenshots";

async function openUi(page, cmd) {
  const aiBtn = page.locator('button[class*="rounded-[4px]"]').filter({ has: page.locator("svg") }).nth(3);
  await aiBtn.click();
  await page.waitForTimeout(1200);

  const input = page.getByPlaceholder(/Describe what to change|Describe changes for/i).first();
  await input.waitFor({ state: "visible", timeout: 8000 });
  await input.fill(cmd);
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

    await openUi(page, "/ui");
    const popover = page.locator('[data-property-popover="true"]');
    if (!(await popover.isVisible())) {
      console.log("ERROR: All Controls popover did not appear");
      return;
    }

    // 1. Rows with scrollWidth > 240
    const overflowRows = await page.evaluate(() => {
      const container = document.querySelector(".figui3-scope");
      const rows = container?.querySelectorAll(":scope > div > div");
      const results = [];
      for (const row of rows || []) {
        if (row.scrollWidth > 240) {
          results.push({
            text: row.textContent?.slice(0, 40),
            scrollWidth: row.scrollWidth,
            clientWidth: row.clientWidth,
            overflow: row.scrollWidth - row.clientWidth,
          });
        }
      }
      return results;
    });
    console.log("=== Rows with scrollWidth > 240 ===");
    console.log(JSON.stringify(overflowRows, null, 2));

    // 2. All elements wider than 220px
    const wideElements = await page.evaluate(() => {
      const scope = document.querySelector(".figui3-scope");
      const all = scope?.querySelectorAll("*");
      const wide = [];
      for (const el of all || []) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 220) {
          wide.push({
            tag: el.tagName.toLowerCase(),
            class: (el.className || "").toString().slice(0, 50),
            text: el.textContent?.slice(0, 30),
            width: Math.round(rect.width),
          });
        }
      }
      return wide.slice(0, 20);
    });
    console.log("\n=== Elements wider than 220px ===");
    console.log(JSON.stringify(wideElements, null, 2));

    await page.screenshot({ path: `${SCREENSHOT_DIR}/26-overflow-debug.png` });
    console.log("\nSaved: 26-overflow-debug.png");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
