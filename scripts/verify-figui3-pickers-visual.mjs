#!/usr/bin/env node
/**
 * Visually verify FigUI3 color picker and fill picker
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
    await page.goto("http://localhost:3000", { waitUntil: "networkidle", timeout: 15000 });
    await page.waitForTimeout(4000);

    const navButtons = page.locator('button[class*="rounded-[4px]"]').filter({ has: page.locator("svg") });
    await navButtons.nth(3).click();
    await page.waitForTimeout(1500);

    const input = page.getByPlaceholder(/Describe what to change|Describe changes for/i).first();
    await input.waitFor({ state: "visible", timeout: 6000 });
    await input.click();
    await input.pressSequentially("/ui full", { delay: 80 });
    await page.keyboard.press("Enter");
    await page.waitForTimeout(2500);

    const popover = page.locator('[data-property-popover="true"]');
    if (!(await popover.isVisible())) {
      console.log("Demo popover did not appear");
      await page.screenshot({ path: `${SCREENSHOT_DIR}/50-no-popover.png` });
      return;
    }

    await page.evaluate(() => {
      const figColor = document.querySelector("fig-input-color");
      const chit = figColor?.querySelector("fig-chit");
      if (chit) chit.click();
    });
    await page.waitForTimeout(800);

    const fontCheck = await page.evaluate(() => {
      const dialog = document.querySelector(".fig-fill-picker-dialog");
      if (!dialog) return "No dialog";
      const cs = getComputedStyle(dialog);
      return JSON.stringify(
        {
          fontSize: cs.fontSize,
          width: cs.width,
          height: cs.height,
          bg: cs.backgroundColor,
          color: cs.color,
        },
        null,
        2
      );
    });

    console.log("\n--- Color picker font check ---\n", fontCheck);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/50-color-picker-dialog.png` });
    console.log("Saved: 50-color-picker-dialog.png");

    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      const scope = document.querySelector(".figui3-scope");
      if (scope) scope.scrollTop = scope.scrollHeight;
    });
    await page.waitForTimeout(400);

    await page.evaluate(() => {
      const figFill = document.querySelector("fig-input-fill");
      const chit = figFill?.querySelector("fig-chit");
      if (chit) {
        chit.click();
      } else {
        const fillPicker = figFill?.querySelector("fig-fill-picker");
        const anyChit = fillPicker?.querySelector("fig-chit");
        if (anyChit) anyChit.click();
        else if (figFill) figFill.click();
      }
    });
    await page.waitForTimeout(1000);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/51-gradient-picker-dialog.png` });
    console.log("Saved: 51-gradient-picker-dialog.png");

    const gradientCheck = await page.evaluate(() => {
      const dialog = document.querySelector(".fig-fill-picker-dialog");
      if (!dialog) return { found: false };
      const cs = getComputedStyle(dialog);
      return {
        found: true,
        fontSize: cs.fontSize,
        width: cs.width,
        height: cs.height,
      };
    });
    console.log("\n--- Gradient picker check ---\n", JSON.stringify(gradientCheck, null, 2));
  } catch (err) {
    console.error("Error:", err.message);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/50-error.png` }).catch(() => {});
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
