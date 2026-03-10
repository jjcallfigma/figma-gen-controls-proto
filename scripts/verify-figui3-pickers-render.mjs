#!/usr/bin/env node
/**
 * Verify FigUI3 color and fill pickers render and work correctly
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

    const errorOverlay = page.locator('[data-nextjs-dialog]');
    if (await errorOverlay.isVisible().catch(() => false)) {
      console.log("Page has error overlay");
      await page.screenshot({ path: `${SCREENSHOT_DIR}/46-error-overlay.png` });
      return;
    }

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
      await page.screenshot({ path: `${SCREENSHOT_DIR}/46-no-popover.png` });
      return;
    }

    const figColorCheck = await page.evaluate(() => {
      const figColor = document.querySelector("fig-input-color");
      if (!figColor)
        return "No fig-input-color found";
      return JSON.stringify(
        {
          height: getComputedStyle(figColor).height,
          childCount: figColor.children.length,
          innerHTML: figColor.innerHTML.substring(0, 300),
          hasInputCombo: !!figColor.querySelector(".input-combo"),
          hasFillPicker: !!figColor.querySelector("fig-fill-picker"),
          hasChit: !!figColor.querySelector("fig-chit"),
          shadowChildren: figColor.shadowRoot ? figColor.shadowRoot.children.length : "no shadow",
        },
        null,
        2
      );
    });

    console.log("\n--- fig-input-color check ---\n", figColorCheck);

    const figInputColor = page.locator("fig-input-color").first();
    const hasColor = (await figInputColor.count()) > 0;
    if (hasColor) {
      const box = await figInputColor.boundingBox();
      if (box && box.height > 0) {
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      } else {
        await figInputColor.evaluate((el) => {
          const rect = el.getBoundingClientRect();
          el.dispatchEvent(
            new MouseEvent("click", {
              bubbles: true,
              cancelable: true,
              view: window,
              clientX: rect.left + rect.width / 2,
              clientY: rect.top + rect.height / 2,
            })
          );
        });
      }
      await page.waitForTimeout(1000);

      const dialogVisible = await page.locator(".fig-fill-picker-dialog, dialog[open]").isVisible().catch(() => false);
      console.log("Picker dialog visible after click:", dialogVisible);
    }

    await page.screenshot({ path: `${SCREENSHOT_DIR}/46-fig-input-color-after-click.png` });
    console.log("Saved: 46-fig-input-color-after-click.png");

    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    const input2 = page.getByPlaceholder(/Describe what to change|Describe changes for/i).first();
    await input2.click();
    await input2.pressSequentially("/ui gradient", { delay: 80 });
    await page.keyboard.press("Enter");
    await page.waitForTimeout(2500);

    const figInputFill = page.locator("fig-input-fill").first();
    const hasFill = (await figInputFill.count()) > 0;
    console.log("\nfig-input-fill found:", hasFill);

    const figFillCheck = await page.evaluate(() => {
      const el = document.querySelector("fig-input-fill");
      if (!el) return "No fig-input-fill found";
      return JSON.stringify(
        {
          height: getComputedStyle(el).height,
          childCount: el.children.length,
          hasShadow: !!el.shadowRoot,
          shadowChildren: el.shadowRoot ? el.shadowRoot.children.length : null,
          innerHTML: el.innerHTML.substring(0, 200),
        },
        null,
        2
      );
    });
    console.log("\n--- fig-input-fill check ---\n", figFillCheck);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/47-fig-input-fill.png` });
    console.log("Saved: 47-fig-input-fill.png");

    if (hasFill) {
      await figInputFill.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        el.dispatchEvent(
          new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2,
          })
        );
      });
      await page.waitForTimeout(1000);
      await page.screenshot({ path: `${SCREENSHOT_DIR}/48-fig-input-fill-picker-opened.png` });
      console.log("Saved: 48-fig-input-fill-picker-opened.png");

      const fillPickerFontCheck = await page.evaluate(() => {
        const dialog = document.querySelector(".fig-fill-picker-dialog");
        if (!dialog) return { found: false };
        const cs = getComputedStyle(dialog);
        const inputs = dialog.querySelectorAll("input");
        return {
          found: true,
          dialogFontSize: cs.fontSize,
          dialogWidth: cs.width,
          inputCount: inputs.length,
          firstInputFontSize: inputs[0] ? getComputedStyle(inputs[0]).fontSize : null,
        };
      });
      console.log("\n--- Fill picker font check ---\n", JSON.stringify(fillPickerFontCheck, null, 2));
    }
  } catch (err) {
    console.error("Error:", err.message);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/46-error.png` }).catch(() => {});
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
