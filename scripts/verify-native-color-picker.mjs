#!/usr/bin/env node
/**
 * Verify native color picker is used in FigUI3 demo controls
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

    openAI();

    // === /ui full: test Fill Color control ===
    await typeAndOpen("/ui full");

    const popover = page.locator('[data-property-popover="true"]');
    if (!(await popover.isVisible())) {
      console.log("ERROR: Demo popover did not appear for /ui full");
    }

    await page.screenshot({ path: `${SCREENSHOT_DIR}/32-ui-full-popover.png` });
    console.log("Saved: 32-ui-full-popover.png");

    const fillColorRow = page.locator(".figui3-scope div.flex.items-center").filter({ hasText: "Fill Color" }).first();
    const colorSwatch = fillColorRow.locator('button').first();

    const hasSwatch = (await colorSwatch.count()) > 0;
    const hasFigInputColor = (await page.locator("fig-input-color").count()) > 0;

    console.log("\n--- /ui full ---");
    console.log("Fill Color has swatch button:", hasSwatch);
    console.log("Uses fig-input-color:", hasFigInputColor);

    if (hasSwatch) {
      await colorSwatch.click();
      await page.waitForTimeout(600);

      const nativePicker = page.locator('[data-color-popover="true"]');
      const figPicker = page.locator(".fig-fill-picker-dialog");

      const nativeOpen = await nativePicker.isVisible();
      const figOpen = await figPicker.isVisible();

      console.log("Native color picker (data-color-popover) visible:", nativeOpen);
      console.log("FigUI3 fill picker visible:", figOpen);

      if (nativeOpen) {
        await page.screenshot({ path: `${SCREENSHOT_DIR}/33-native-color-picker-open.png` });
        console.log("Saved: 33-native-color-picker-open.png");
      } else if (figOpen) {
        await page.screenshot({ path: `${SCREENSHOT_DIR}/33-figui3-picker-opened-instead.png` });
        console.log("Saved: 33-figui3-picker-opened-instead.png (Fill Color opened FigUI3 picker!)");
      }
    }

    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);

    const input2 = page.getByPlaceholder(/Describe what to change|Describe changes for/i).first();
    await input2.fill("/ui gradient");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1500);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/34-ui-gradient-popover.png` });
    console.log("\nSaved: 34-ui-gradient-popover.png");

    console.log("\n--- /ui gradient ---");
    const stopsLabel = page.locator(".figui3-scope").getByText("Stops", { exact: true });
    const hasStops = (await stopsLabel.count()) > 0;
    console.log("Gradient has Stops label:", hasStops);

    const swatchByStyle = page.locator('.figui3-scope button[style*="#"], .figui3-scope button[style*="rgb"]').first();
    const hasStopSwatch = (await swatchByStyle.count()) > 0;
    console.log("Gradient stop swatch found:", hasStopSwatch);

    if (hasStopSwatch) {
      await swatchByStyle.click();
      await page.waitForTimeout(600);

      const nativePicker2 = page.locator('[data-color-popover="true"]');
      const nativeOpen2 = await nativePicker2.isVisible();
      console.log("Stop swatch click: Native color picker opened:", nativeOpen2);

      if (nativeOpen2) {
        await page.screenshot({ path: `${SCREENSHOT_DIR}/35-gradient-stop-native-picker.png` });
        console.log("Saved: 35-gradient-stop-native-picker.png");
      } else {
        await page.screenshot({ path: `${SCREENSHOT_DIR}/35-gradient-after-stop-click.png` });
        console.log("Saved: 35-gradient-after-stop-click.png");
      }
    }

    const pickerType = await page.evaluate(() => {
      const native = document.querySelector('[data-color-popover="true"]');
      const fig = document.querySelector(".fig-fill-picker-dialog");
      const reactColorful = document.querySelector(".react-colorful");
      return {
        nativePopover: !!native,
        figFillPicker: !!fig,
        hasRgbaColorPicker: !!reactColorful,
      };
    });
    console.log("\nPicker detection:", JSON.stringify(pickerType, null, 2));
  } catch (err) {
    console.error("Error:", err.message);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/32-verify-error.png` }).catch(() => {});
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
