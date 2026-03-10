#!/usr/bin/env node
/**
 * Test FigUI3 color picker (fig-input-color) and fill picker (fig-input-fill)
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
    const goto = await page.goto("http://localhost:3000", { waitUntil: "networkidle", timeout: 15000 });
    if (goto && !goto.ok()) {
      console.log("Page load failed:", goto.status());
      await page.screenshot({ path: `${SCREENSHOT_DIR}/42-page-fail.png` });
      return;
    }
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    const navButtons = page.locator('button[class*="rounded-[4px]"]').filter({ has: page.locator("svg") });
    const aiButton = navButtons.nth(3);
    await aiButton.click();
    await page.waitForTimeout(1500);

    const input = page.getByPlaceholder(/Describe what to change|Describe changes for/i).first();
    await input.waitFor({ state: "visible", timeout: 6000 });
    await input.click();
    await input.pressSequentially("/ui full", { delay: 80 });
    await page.keyboard.press("Enter");
    await page.waitForTimeout(2000);

    let popover = page.locator('[data-property-popover="true"]');
    let popoverVisible = await popover.isVisible().catch(() => false);
    if (!popoverVisible) {
      await page.screenshot({ path: `${SCREENSHOT_DIR}/42-debug-before-dispatch.png` });
      console.log("Popover not visible after /ui full. Dispatching event directly...");
      await page.evaluate(() => {
        const MOCK = {
          full: {
            label: "All Controls",
            spec: {
              mode: "live",
              controls: [
                { id: "color-fill", type: "color", label: "Fill Color", props: { defaultValue: "#3B82F6" } },
              ],
            },
          },
        };
        const entry = MOCK.full;
        window.dispatchEvent(new CustomEvent("demo-controls-open", { detail: { spec: entry.spec, label: entry.label } }));
      });
      await page.waitForTimeout(1500);
    }
    popover = page.locator('[data-property-popover="true"]');
    popoverVisible = await popover.isVisible().catch(() => false);
    if (!popoverVisible) {
      await page.screenshot({ path: `${SCREENSHOT_DIR}/42-no-popover.png` });
      console.log("ERROR: Popover never appeared");
      return;
    }
    await page.waitForTimeout(500);

    const figInputColor = page.locator("fig-input-color").first();
    const hasFigInputColor = (await figInputColor.count()) > 0;
    if (!hasFigInputColor) {
      const debug = await page.evaluate(() => {
        const fig = document.querySelectorAll("fig-input-color");
        const fill = document.querySelectorAll("fig-input-fill");
        const popover = document.querySelector('[data-property-popover="true"]');
        const fillColorText = popover?.textContent?.includes("Fill Color");
        return { figColorCount: fig.length, figFillCount: fill.length, hasFillColorLabel: !!fillColorText };
      });
      console.log("Debug:", debug);
    }
    console.log("fig-input-color found:", hasFigInputColor);

    if (hasFigInputColor) {
      await figInputColor.click();
      await page.waitForTimeout(800);

      const result = await page.evaluate(() => {
        const dialog = document.querySelector(".fig-fill-picker-dialog") || document.querySelector("dialog[open]");
        if (!dialog) {
          const allDialogs = document.querySelectorAll("dialog");
          return { error: "No open dialog found. Total dialogs: " + allDialogs.length };
        }
        const cs = getComputedStyle(dialog);
        const inputs = dialog.querySelectorAll("input");
        return {
          dialogFontSize: cs.fontSize,
          dialogWidth: cs.width,
          dialogBg: cs.backgroundColor,
          dialogParent: dialog.parentElement?.tagName,
          inputCount: inputs.length,
          firstInputFontSize: inputs[0] ? getComputedStyle(inputs[0]).fontSize : "none",
          firstInputHeight: inputs[0] ? getComputedStyle(inputs[0]).height : "none",
        };
      });

      console.log("\n--- Color picker (fig-input-color) ---\n", JSON.stringify(result, null, 2));

      await page.screenshot({ path: `${SCREENSHOT_DIR}/42-fig-input-color-picker.png` });
      console.log("Saved: 42-fig-input-color-picker.png");
    }

    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    const input2 = page.getByPlaceholder(/Describe what to change|Describe changes for/i).first();
    await input2.click();
    await input2.type("/ui gradient", { delay: 50 });
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1500);

    const figInputFill = page.locator("fig-input-fill").first();
    const hasFigInputFill = (await figInputFill.count()) > 0;
    console.log("\nfig-input-fill found:", hasFigInputFill);

    if (hasFigInputFill) {
      await figInputFill.click();
      await page.waitForTimeout(800);

      const fillResult = await page.evaluate(() => {
        const dialog = document.querySelector(".fig-fill-picker-dialog") || document.querySelector("dialog[open]");
        if (!dialog) {
          const allDialogs = document.querySelectorAll("dialog");
          return { error: "No open dialog found. Total dialogs: " + allDialogs.length };
        }
        const cs = getComputedStyle(dialog);
        const inputs = dialog.querySelectorAll("input");
        return {
          dialogFontSize: cs.fontSize,
          dialogWidth: cs.width,
          dialogBg: cs.backgroundColor,
          inputCount: inputs.length,
          firstInputFontSize: inputs[0] ? getComputedStyle(inputs[0]).fontSize : "none",
          firstInputHeight: inputs[0] ? getComputedStyle(inputs[0]).height : "none",
        };
      });

      console.log("\n--- Fill picker (fig-input-fill) ---\n", JSON.stringify(fillResult, null, 2));

      await page.screenshot({ path: `${SCREENSHOT_DIR}/43-fig-input-fill-picker.png` });
      console.log("Saved: 43-fig-input-fill-picker.png");
    }
  } catch (err) {
    console.error("Error:", err.message);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/42-error.png` }).catch(() => {});
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
