#!/usr/bin/env node
/**
 * Verify range slider layout: Min/Max stacked vertically, no horizontal overflow
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

    // --- /ui range ---
    await openUi(page, "/ui range");
    const popover = page.locator('[data-property-popover="true"]');
    if (!(await popover.isVisible())) {
      console.log("ERROR: Range popover did not appear");
    } else {
      await page.screenshot({ path: `${SCREENSHOT_DIR}/24-ui-range.png` });
      console.log("Saved: 24-ui-range.png\n");

      const rangeInfo = await page.evaluate(() => {
        const pop = document.querySelector('[data-property-popover="true"]');
        if (!pop) return null;
        const scrollArea = pop.querySelector('.overflow-y-auto, .overflow-x-auto');
        const hasHScroll = scrollArea ? scrollArea.scrollWidth > scrollArea.clientWidth : false;
        const overflowX = scrollArea ? getComputedStyle(scrollArea).overflowX : "n/a";
        const minRow = Array.from(pop.querySelectorAll('*')).find(el => el.textContent?.trim() === 'Min');
        const maxRow = Array.from(pop.querySelectorAll('*')).find(el => el.textContent?.trim() === 'Max');
        const rangeRows = Array.from(pop.querySelectorAll('[style*="flexDirection"]')).filter(r => {
          const txt = r.textContent || '';
          return txt.includes('Min') || txt.includes('Max');
        });
        return {
          popoverWidth: getComputedStyle(pop).width,
          hasHorizontalScrollbar: hasHScroll,
          overflowX,
          scrollWidth: scrollArea?.scrollWidth,
          clientWidth: scrollArea?.clientWidth,
          foundMin: !!minRow,
          foundMax: !!maxRow,
          rangeRowCount: rangeRows.length,
          rangeRowLayout: rangeRows.slice(0, 4).map(r => ({
            flexDirection: getComputedStyle(r).flexDirection,
            text: r.textContent?.slice(0, 30),
          })),
        };
      });
      console.log("=== /ui range layout ===");
      console.log(JSON.stringify(rangeInfo, null, 2));
    }

    await page.keyboard.press("Escape");
    await page.waitForTimeout(800);

    // --- /ui (all) - scroll to Size Range ---
    await openUi(page, "/ui");
    const popover2 = page.locator('[data-property-popover="true"]');
    if (await popover2.isVisible()) {
      const scrollArea = popover2.locator('.overflow-y-auto');
      await scrollArea.evaluate((el) => { el.scrollTop = 180; });
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${SCREENSHOT_DIR}/25-ui-all-size-range.png` });
      console.log("\nSaved: 25-ui-all-size-range.png");

      const sizeRangeInfo = await page.evaluate(() => {
        const pop = document.querySelector('[data-property-popover="true"]');
        const scrollArea = pop?.querySelector('.overflow-y-auto');
        return {
          hasHScroll: scrollArea ? scrollArea.scrollWidth > scrollArea.clientWidth : null,
          scrollWidth: scrollArea?.scrollWidth,
          clientWidth: scrollArea?.clientWidth,
          popoverWidth: pop ? getComputedStyle(pop).width : null,
        };
      });
      console.log("\n=== Size Range in /ui all ===");
      console.log(JSON.stringify(sizeRangeInfo, null, 2));
    }
  } catch (err) {
    console.error("Error:", err.message);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/24-range-error.png` }).catch(() => {});
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
