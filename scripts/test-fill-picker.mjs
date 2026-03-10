#!/usr/bin/env node
/**
 * Verify FigUI3 fill picker styling when clicking gradient in /ui gradient
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

  try {
    await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);

    const aiBtn = page.locator('button[class*="rounded-[4px]"]').filter({ has: page.locator("svg") }).nth(3);
    await aiBtn.click();
    await page.waitForTimeout(1200);

    const input = page.getByPlaceholder(/Describe what to change|Describe changes for/i).first();
    await input.waitFor({ state: "visible", timeout: 8000 });
    await input.fill("/ui gradient");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1500);

    const popover = page.locator('[data-property-popover="true"]');
    if (!(await popover.isVisible())) {
      console.log("ERROR: Gradient popover did not appear");
      await page.screenshot({ path: `${SCREENSHOT_DIR}/29-gradient-fail.png` });
      return;
    }

    await page.screenshot({ path: `${SCREENSHOT_DIR}/29-gradient-popover-before-click.png` });
    console.log("Saved: 29-gradient-popover-before-click.png");

    const fillInput = page.locator("fig-input-fill").first();
    await fillInput.click();
    await page.waitForTimeout(800);

    const fillPicker = page.locator(".fig-fill-picker-dialog, fig-fill-picker, [class*='fill-picker']").first();
    const pickerVisible = await fillPicker.isVisible().catch(() => false);
    if (!pickerVisible) {
      const anyDialog = page.locator('[role="dialog"], [class*="dialog"], [class*="picker"]').first();
      if (await anyDialog.isVisible()) {
        await page.screenshot({ path: `${SCREENSHOT_DIR}/30-fill-picker-dialog.png` });
        console.log("Saved: 30-fill-picker-dialog.png (alternate selector)");
      } else {
        await page.screenshot({ path: `${SCREENSHOT_DIR}/30-fill-picker-not-found.png` });
        console.log("Fill picker dialog may not have opened. Saved: 30-fill-picker-not-found.png");
      }
    } else {
      await page.screenshot({ path: `${SCREENSHOT_DIR}/30-fill-picker-dialog.png` });
      console.log("Saved: 30-fill-picker-dialog.png");

      const pickerInfo = await page.evaluate(() => {
        const dialog = document.querySelector(".fig-fill-picker-dialog") || document.querySelector("fig-fill-picker");
        if (!dialog) return null;
        const rect = dialog.getBoundingClientRect();
        const cs = getComputedStyle(dialog);
        return {
          width: rect.width,
          height: rect.height,
          computedWidth: cs.width,
          tagName: dialog.tagName?.toLowerCase(),
        };
      });
      console.log("Picker dimensions:", JSON.stringify(pickerInfo, null, 2));
    }
  } catch (err) {
    console.error("Error:", err.message);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/29-fill-picker-error.png` }).catch(() => {});
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
