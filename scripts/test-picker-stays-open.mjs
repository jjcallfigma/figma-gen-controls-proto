#!/usr/bin/env node
/**
 * Test that FigUI3 color/fill picker dialog stays open during interactions
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

  const isPickerOpen = () =>
    page.evaluate(() => {
      const dialog = document.querySelector(".fig-fill-picker-dialog");
      return {
        exists: !!dialog,
        open: dialog?.open ?? false,
        display: dialog ? getComputedStyle(dialog).display : null,
      };
    });

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

    await page.evaluate(() => {
      const chit = document.querySelector("fig-input-color")?.querySelector("fig-chit");
      if (chit) chit.click();
    });
    await page.waitForTimeout(800);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/52-picker-open-initial.png` });
    console.log("Saved: 52-picker-open-initial.png");

    const results = [];
    let stillOpen = true;

    const interactions = await page.evaluate(() => {
      const dialog = document.querySelector(".fig-fill-picker-dialog");
      if (!dialog) return { error: "No dialog" };

      const hexInput = dialog.querySelector('input[type="text"], input[placeholder*="#"]');
      const hueSlider = dialog.querySelector('[class*="hue"], [class*="Hue"]') || dialog.querySelector('input[type="range"]');
      const saturationArea = dialog.querySelector('[class*="saturation"], [class*="color-area"], .fig-fill-picker-color-area');
      const opacitySlider = dialog.querySelectorAll('input[type="range"]')[1];

      return {
        hasHexInput: !!hexInput,
        hasHueSlider: !!hueSlider,
        hasSaturationArea: !!saturationArea,
        hasOpacitySlider: !!opacitySlider,
        inputCount: dialog.querySelectorAll("input").length,
        rangeCount: dialog.querySelectorAll('input[type="range"]').length,
      };
    });
    console.log("Picker structure:", JSON.stringify(interactions, null, 2));

    const hexInput = page.locator(".fig-fill-picker-dialog input[type='text']").first();
    if (await hexInput.count() > 0) {
      await hexInput.click();
      await page.waitForTimeout(300);
      const afterHex = await isPickerOpen();
      results.push({ action: "click hex input", ...afterHex });
      stillOpen = stillOpen && afterHex.exists && afterHex.open;
    }

    const sliders = page.locator(".fig-fill-picker-dialog input[type='range']");
    const sliderCount = await sliders.count();
    if (sliderCount > 0) {
      const firstSlider = sliders.first();
      await firstSlider.click({ position: { x: 50, y: 5 } });
      await page.waitForTimeout(300);
      const afterHue = await isPickerOpen();
      results.push({ action: "click hue slider", ...afterHue });
      stillOpen = stillOpen && afterHue.exists && afterHue.open;
    }

    const colorArea = page.locator(".fig-fill-picker-dialog .fig-fill-picker-color-area, .fig-fill-picker-dialog [class*='color-area']").first();
    if (await colorArea.count() > 0) {
      const box = await colorArea.boundingBox();
      if (box) {
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        await page.waitForTimeout(300);
      }
      const afterSat = await isPickerOpen();
      results.push({ action: "click saturation area", ...afterSat });
      stillOpen = stillOpen && afterSat.exists && afterSat.open;
    }

    if (sliderCount > 1) {
      const opacitySlider = sliders.nth(1);
      await opacitySlider.click({ position: { x: 80, y: 5 } });
      await page.waitForTimeout(300);
      const afterOpacity = await isPickerOpen();
      results.push({ action: "click opacity slider", ...afterOpacity });
      stillOpen = stillOpen && afterOpacity.exists && afterOpacity.open;
    }

    console.log("\n--- Color picker interaction results ---");
    results.forEach((r) => console.log(JSON.stringify(r)));

    const finalCheck = await page.evaluate(() => {
      const dialog = document.querySelector(".fig-fill-picker-dialog");
      return JSON.stringify(
        {
          dialogExists: !!dialog,
          dialogOpen: dialog?.open,
          dialogVisible: dialog ? getComputedStyle(dialog).display !== "none" : false,
        },
        null,
        2
      );
    });
    console.log("\n--- Final color picker check ---\n", finalCheck);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/53-picker-after-interactions.png` });
    console.log("Saved: 53-picker-after-interactions.png");

    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    const input2 = page.getByPlaceholder(/Describe what to change|Describe changes for/i).first();
    await input2.click();
    await input2.pressSequentially("/ui gradient", { delay: 80 });
    await page.keyboard.press("Enter");
    await page.waitForTimeout(2500);

    await page.evaluate(() => {
      const scope = document.querySelector(".figui3-scope");
      if (scope) scope.scrollTop = scope.scrollHeight;
    });
    await page.waitForTimeout(400);

    await page.evaluate(() => {
      const chit = document.querySelector("fig-input-fill")?.querySelector("fig-chit");
      if (chit) chit.click();
      else document.querySelector("fig-input-fill")?.querySelector("fig-fill-picker fig-chit")?.click();
    });
    await page.waitForTimeout(1000);

    const gradResults = [];
    let gradStillOpen = true;

    const plusBtn = page.locator(".fig-fill-picker-dialog").locator('button').filter({ hasText: "+" }).first();
    if ((await plusBtn.count()) > 0) {
      await plusBtn.click();
      await page.waitForTimeout(300);
      const afterPlus = await isPickerOpen();
      gradResults.push({ action: "click + button", ...afterPlus });
      gradStillOpen = gradStillOpen && afterPlus.exists && afterPlus.open;
    }

    const stopSwatch = page.locator(".fig-fill-picker-dialog fig-chit").first();
    if ((await stopSwatch.count()) > 0) {
      await stopSwatch.click();
      await page.waitForTimeout(500);
      const afterSwatch = await isPickerOpen();
      gradResults.push({ action: "click stop swatch", ...afterSwatch });
      gradStillOpen = gradStillOpen && afterSwatch.exists && afterSwatch.open;
    }

    const typeDropdown = page.locator(".fig-fill-picker-dialog").locator('button, [role="button"]').filter({ hasText: /Linear|Radial|Angular/i }).first();
    if ((await typeDropdown.count()) > 0) {
      await typeDropdown.click();
      await page.waitForTimeout(400);
      const afterDropdown = await isPickerOpen();
      gradResults.push({ action: "click gradient type", ...afterDropdown });
      gradStillOpen = gradStillOpen && afterDropdown.exists && afterDropdown.open;
    }

    console.log("\n--- Gradient picker interaction results ---");
    gradResults.forEach((r) => console.log(JSON.stringify(r)));

    const gradFinalCheck = await page.evaluate(() => {
      const dialog = document.querySelector(".fig-fill-picker-dialog");
      return JSON.stringify(
        {
          dialogExists: !!dialog,
          dialogOpen: dialog?.open,
          dialogVisible: dialog ? getComputedStyle(dialog).display !== "none" : false,
        },
        null,
        2
      );
    });
    console.log("\n--- Final gradient picker check ---\n", gradFinalCheck);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/54-gradient-picker-after-interactions.png` });
    console.log("Saved: 54-gradient-picker-after-interactions.png");

    console.log("\n--- SUMMARY ---");
    console.log("Color picker stayed open during all interactions:", stillOpen);
    console.log("Gradient picker stayed open during all interactions:", gradStillOpen);
  } catch (err) {
    console.error("Error:", err.message);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/52-error.png` }).catch(() => {});
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
