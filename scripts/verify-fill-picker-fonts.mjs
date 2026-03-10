#!/usr/bin/env node
/**
 * Verify FigUI3 fill picker dialog font-size is 11px after CSS fix
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

    const fillInput = page.locator("fig-input-fill").first();
    await fillInput.click();
    await page.waitForTimeout(800);

    const result = await page.evaluate(() => {
      const dialog = document.querySelector(".fig-fill-picker-dialog");
      if (!dialog) return "No .fig-fill-picker-dialog found";
      const cs = getComputedStyle(dialog);
      const header = dialog.querySelector("fig-header");
      const inputs = dialog.querySelectorAll("input");

      const result = {
        dialogFontSize: cs.fontSize,
        dialogFontWeight: cs.fontWeight,
        headerFontSize: header ? getComputedStyle(header).fontSize : "no header",
        firstFewInputFontSizes: Array.from(inputs)
          .slice(0, 5)
          .map((inp, i) => ({
            fontSize: getComputedStyle(inp).fontSize,
            height: getComputedStyle(inp).height,
          })),
      };

      return JSON.stringify(result, null, 2);
    });

    console.log("Font size check result:\n", result);

    const dialog = page.locator(".fig-fill-picker-dialog");
    if (await dialog.isVisible()) {
      await dialog.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await dialog.screenshot({ path: `${SCREENSHOT_DIR}/31-fill-picker-fonts.png` });
      console.log("Saved: 31-fill-picker-fonts.png");
    }
  } catch (err) {
    console.error("Error:", err.message);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/31-fill-picker-error.png` }).catch(() => {});
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
