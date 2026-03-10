#!/usr/bin/env node
/**
 * Verify FigColor control matches native fill row layout
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
    await input.fill("/ui full");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1500);

    const fillColorRow = page.locator(".figui3-scope").filter({ hasText: "Fill Color" }).first();
    const fillRow = fillColorRow.locator('div.flex.w-full.items-center.rounded-\\[5px\\]').first();
    const hasFillRow = (await fillRow.count()) > 0;

    const fillRowBox = hasFillRow ? fillRow : fillColorRow.locator('div[class*="rounded"]').first();
    await fillRowBox.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/38-figcolor-fill-row.png` });
    console.log("Saved: 38-figcolor-fill-row.png");

    const figColorInfo = await page.evaluate(() => {
      const scope = document.querySelector(".figui3-scope");
      if (!scope) return null;
      const row = scope.querySelector('[class*="rounded-[5px]"][class*="bg-secondary"]');
      if (!row) return { found: false };
      const swatch = row.querySelector("button[style*='background']");
      const inputs = row.querySelectorAll("input");
      const cs = getComputedStyle(row);
      const swatchRect = swatch?.getBoundingClientRect();
      return {
        found: true,
        height: cs.height,
        bg: cs.backgroundColor,
        borderRadius: cs.borderRadius,
        swatchSize: swatchRect ? { w: swatchRect.width, h: swatchRect.height } : null,
        inputCount: inputs.length,
        hasPercentSuffix: row.textContent?.includes("%") ?? false,
      };
    });
    console.log("\nFigColor row structure:", JSON.stringify(figColorInfo, null, 2));

    const swatchBtn = fillColorRow.locator("button").first();
    await swatchBtn.click();
    await page.waitForTimeout(600);
    const pickerOpen = (await page.locator('[data-property-popover="true"]').count()) >= 2;
    console.log("Color picker opened:", pickerOpen);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/39-figcolor-picker-opened.png` }).catch(() => {});
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);

    const canvas = page.locator('[data-canvas="true"]');
    await canvas.click({ position: { x: 300, y: 300 } });
    await page.waitForTimeout(500);

    await page.keyboard.press("R");
    await page.waitForTimeout(200);
    await canvas.click({ position: { x: 400, y: 350 } });
    await page.mouse.move(500, 450);
    await page.mouse.down();
    await page.mouse.move(550, 500);
    await page.mouse.up();
    await page.waitForTimeout(400);

    await page.keyboard.press("V");
    await page.waitForTimeout(200);
    await canvas.click({ position: { x: 475, y: 425 } });
    await page.waitForTimeout(600);

    const propsPanel = page.locator('[class*="properties-panel"], [data-panel="properties"]').first();
    const fillSection = page.locator('text="Fill"').first();
    await fillSection.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(400);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/40-native-fill-row.png` });
    console.log("\nSaved: 40-native-fill-row.png");

    const nativeInfo = await page.evaluate(() => {
      const fillSection = Array.from(document.querySelectorAll("*")).find(
        (el) => el.textContent?.trim() === "Fill" && el.querySelector('[class*="bg-secondary"]')
      );
      if (!fillSection) return { found: false };
      const row = fillSection.querySelector('[class*="rounded-[5px]"][class*="bg-secondary"]');
      if (!row) return { found: false };
      const swatch = row.querySelector("button");
      const inputs = row.querySelectorAll("input");
      const cs = getComputedStyle(row);
      const swatchRect = swatch?.getBoundingClientRect();
      return {
        found: true,
        height: cs.height,
        bg: cs.backgroundColor,
        borderRadius: cs.borderRadius,
        swatchSize: swatchRect ? { w: swatchRect.width, h: swatchRect.height } : null,
        inputCount: inputs.length,
        hasPercentSuffix: row.textContent?.includes("%") ?? false,
      };
    });
    console.log("Native fill row structure:", JSON.stringify(nativeInfo, null, 2));

    const rightPanel = page.locator('[class*="w-72"], [class*="properties"]').first();
    await rightPanel.screenshot({ path: `${SCREENSHOT_DIR}/41-native-panel-full.png` }).catch(() => {});
    console.log("Saved: 41-native-panel-full.png");
  } catch (err) {
    console.error("Error:", err.message);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/38-verify-error.png` }).catch(() => {});
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
