#!/usr/bin/env node
/**
 * Evaluate FigUI3 demo popover layout vs Figma reference
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

    // --- /ui (All Controls) ---
    await openUi(page, "/ui");
    const popover = page.locator('[data-property-popover="true"]');
    if (!(await popover.isVisible())) {
      console.log("ERROR: All Controls popover did not appear");
    } else {
      await page.screenshot({ path: `${SCREENSHOT_DIR}/21-all-controls-top.png` });
      console.log("Saved: 21-all-controls-top.png\n");

      const layoutInfo = await page.evaluate(() => {
        const pop = document.querySelector('[data-property-popover="true"]');
        if (!pop) return null;
        const rows = pop.querySelectorAll('.flex.items-center.gap-2, .flex.flex-col.gap-1');
        const rowData = [];
        for (let i = 0; i < Math.min(12, rows.length); i++) {
          const r = rows[i];
          const cs = getComputedStyle(r);
          const isFullWidth = r.classList.contains('flex-col');
          const label = r.querySelector('span')?.textContent?.trim();
          rowData.push({
            index: i,
            label,
            isFullWidth,
            padding: cs.padding,
            paddingLeft: cs.paddingLeft,
            paddingRight: cs.paddingRight,
            paddingTop: cs.paddingTop,
            paddingBottom: cs.paddingBottom,
            flexDirection: cs.flexDirection,
            alignItems: cs.alignItems,
            minHeight: cs.minHeight,
          });
        }
        return {
          popoverWidth: getComputedStyle(pop).width,
          rowCount: rows.length,
          rows: rowData,
        };
      });
      console.log("=== Layout info (All Controls) ===");
      console.log(JSON.stringify(layoutInfo, null, 2));

      // Scroll down
      const scrollArea = popover.locator('.overflow-y-auto');
      await scrollArea.evaluate((el) => { el.scrollTop = el.scrollHeight * 0.7; });
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${SCREENSHOT_DIR}/22-all-controls-bottom.png` });
      console.log("\nSaved: 22-all-controls-bottom.png");
    }

    await page.keyboard.press("Escape");
    await page.waitForTimeout(800);

    // --- /ui slider ---
    await openUi(page, "/ui slider");
    const sliderPopover = page.locator('[data-property-popover="true"]');
    if (await sliderPopover.isVisible()) {
      await page.screenshot({ path: `${SCREENSHOT_DIR}/23-ui-slider-layout.png` });
      console.log("\nSaved: 23-ui-slider-layout.png");

      const sliderLayout = await page.evaluate(() => {
        const pop = document.querySelector('[data-property-popover="true"]');
        if (!pop) return null;
        const rows = pop.querySelectorAll('[class*="flex"]');
        const info = [];
        rows.forEach((r, i) => {
          const cs = getComputedStyle(r);
          const label = r.querySelector('span')?.textContent?.trim();
          if (label || r.children.length > 0) {
            info.push({
              i,
              label,
              flexDirection: cs.flexDirection,
              padding: cs.padding,
              alignItems: cs.alignItems,
            });
          }
        });
        return { popoverWidth: getComputedStyle(pop).width, rows: info };
      });
      console.log("\n=== Layout info (/ui slider) ===");
      console.log(JSON.stringify(sliderLayout, null, 2));
    }
  } catch (err) {
    console.error("Error:", err.message);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/21-layout-error.png` }).catch(() => {});
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
