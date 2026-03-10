#!/usr/bin/env node
/**
 * Test FigUI3 input styling: /ui slider and /ui (all controls)
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

async function getInputStyles(page) {
  return page.evaluate(() => {
    const inputs = document.querySelectorAll(
      ".figui3-scope input[type='number'], .figui3-scope input[type='text']"
    );
    const results = [];
    for (const inp of inputs) {
      const cs = getComputedStyle(inp);
      results.push({
        value: inp.value,
        height: cs.height,
        padding: cs.padding,
        paddingTop: cs.paddingTop,
        paddingBottom: cs.paddingBottom,
        fontSize: cs.fontSize,
        lineHeight: cs.lineHeight,
        boxSizing: cs.boxSizing,
        borderRadius: cs.borderRadius,
        backgroundColor: cs.backgroundColor,
      });
    }
    return results;
  });
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

    // --- /ui slider ---
    await openUi(page, "/ui slider");
    const popover1 = page.locator('[data-property-popover="true"]');
    if (!(await popover1.isVisible())) {
      console.log("ERROR: Sliders popover did not appear");
    } else {
      await page.screenshot({ path: `${SCREENSHOT_DIR}/19-ui-slider.png` });
      console.log("Saved: 19-ui-slider.png\n");

      const sliderInputStyles = await getInputStyles(page);
      console.log("=== /ui slider — .figui3-scope inputs ===");
      console.log(JSON.stringify(sliderInputStyles, null, 2));
    }

    await page.keyboard.press("Escape");
    await page.waitForTimeout(800);

    // --- /ui (all controls) ---
    await openUi(page, "/ui");
    const popover2 = page.locator('[data-property-popover="true"]');
    if (!(await popover2.isVisible())) {
      console.log("\nERROR: All Controls popover did not appear");
    } else {
      await page.screenshot({ path: `${SCREENSHOT_DIR}/20-ui-all-controls.png` });
      console.log("\nSaved: 20-ui-all-controls.png\n");

      const allInputStyles = await getInputStyles(page);
      console.log("=== /ui (all) — .figui3-scope inputs (first 8) ===");
      console.log(JSON.stringify(allInputStyles.slice(0, 8), null, 2));
    }
  } catch (err) {
    console.error("Error:", err.message);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/19-error.png` }).catch(() => {});
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
