#!/usr/bin/env node
/**
 * Verify FigColor and FigGradient open the PropertyPopover-based Figma-style color picker
 * (Custom/Libraries tabs, solid fill icon, RgbaColorPicker)
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

  const openAI = async () => {
    const aiBtn = page.locator('button[class*="rounded-[4px]"]').filter({ has: page.locator("svg") }).nth(3);
    await aiBtn.click();
    await page.waitForTimeout(1200);
  };

  const typeAndOpen = async (cmd) => {
    const input = page.getByPlaceholder(/Describe what to change|Describe changes for/i).first();
    await input.waitFor({ state: "visible", timeout: 8000 });
    await input.fill(cmd);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1500);
  };

  try {
    await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);

    await openAI();
    await typeAndOpen("/ui full");

    const fillColorRow = page.locator(".figui3-scope div.flex.items-center.gap-2").filter({ hasText: "Fill Color" }).first();
    const colorSwatch = fillColorRow.locator("button").first();
    await colorSwatch.click();
    await page.waitForTimeout(700);

    const popovers = page.locator('[data-property-popover="true"]');
    const count = await popovers.count();
    console.log("PropertyPopovers visible after Fill Color click:", count);

    const hasCustomTab = (await page.getByRole("tab", { name: "Custom" }).count()) > 0;
    const hasLibrariesTab = (await page.getByRole("tab", { name: "Libraries" }).count()) > 0;
    const hasRgbaPicker = (await page.locator(".react-colorful").count()) > 0;
    const hasHexInput = (await page.locator('input[placeholder="#FFFFFF"]').count()) > 0;
    const hasSolidFillIcon = (await page.locator('[class*="fill-solid"]').count()) > 0;

    console.log("\n--- Fill Color picker verification ---");
    console.log("Custom tab:", hasCustomTab);
    console.log("Libraries tab:", hasLibrariesTab);
    console.log("Solid fill icon:", hasSolidFillIcon);
    console.log("RgbaColorPicker (.react-colorful):", hasRgbaPicker);
    console.log("Hex input:", hasHexInput);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/36-fill-color-figma-picker.png` });
    console.log("\nSaved: 36-fill-color-figma-picker.png");

    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    await typeAndOpen("/ui gradient");

    const gradSwatch = page.locator('.figui3-scope button[style*="#"], .figui3-scope button[style*="rgb"]').first();
    await gradSwatch.click();
    await page.waitForTimeout(700);

    const hasCustomTab2 = (await page.getByRole("tab", { name: "Custom" }).count()) > 0;
    const hasLibrariesTab2 = (await page.getByRole("tab", { name: "Libraries" }).count()) > 0;
    const hasRgbaPicker2 = (await page.locator(".react-colorful").count()) > 0;
    const hasSolidFillIcon2 = (await page.locator('[class*="fill-solid"]').count()) > 0;

    console.log("\n--- Gradient stop picker verification ---");
    console.log("Custom tab:", hasCustomTab2);
    console.log("Libraries tab:", hasLibrariesTab2);
    console.log("Solid fill icon:", hasSolidFillIcon2);
    console.log("RgbaColorPicker:", hasRgbaPicker2);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/37-gradient-stop-figma-picker.png` });
    console.log("\nSaved: 37-gradient-stop-figma-picker.png");

    const verification = {
      fillColor: {
        separatePopover: count >= 2,
        customLibrariesTabs: hasCustomTab && hasLibrariesTab,
        solidFillIcon: hasSolidFillIcon,
        colorPickerArea: hasRgbaPicker,
        hexInput: hasHexInput,
      },
      gradientStop: {
        customLibrariesTabs: hasCustomTab2 && hasLibrariesTab2,
        solidFillIcon: hasSolidFillIcon2,
        colorPickerArea: hasRgbaPicker2,
      },
    };
    console.log("\nVerification summary:", JSON.stringify(verification, null, 2));
  } catch (err) {
    console.error("Error:", err.message);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/36-verify-error.png` }).catch(() => {});
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
