#!/usr/bin/env node
/**
 * Test FigUI3 color picker and fill picker after read-only property fix
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
    const hasError = await errorOverlay.isVisible().catch(() => false);
    if (hasError) {
      console.log("Page still has error overlay");
      await page.screenshot({ path: `${SCREENSHOT_DIR}/44-page-has-error.png` });
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
    await page.waitForTimeout(2000);

    const popover = page.locator('[data-property-popover="true"]');
    const popoverVisible = await popover.isVisible();
    if (!popoverVisible) {
      await page.screenshot({ path: `${SCREENSHOT_DIR}/44-no-popover.png` });
      console.log("ERROR: Demo popover did not appear");
      return;
    }

    const figInputColor = page.locator("fig-input-color").first();
    const hasColor = (await figInputColor.count()) > 0;
    console.log("fig-input-color found:", hasColor);

    if (hasColor) {
      const box = await figInputColor.boundingBox();
      if (box) {
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      } else {
        await figInputColor.evaluate((el) => {
          const rect = el.getBoundingClientRect();
          ["mousedown", "mouseup", "click"].forEach((type) =>
            el.dispatchEvent(
              new MouseEvent(type, {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX: rect.left + rect.width / 2,
                clientY: rect.top + rect.height / 2,
              })
            )
          );
        });
      }
      await page.waitForTimeout(1200);

      let dialogAppeared = false;
      try {
        await page.locator(".fig-fill-picker-dialog, dialog[open]").waitFor({ state: "visible", timeout: 3000 });
        dialogAppeared = true;
      } catch (e) {
        dialogAppeared = false;
      }
      if (!dialogAppeared) {
        const debug = await page.evaluate(() => ({
          figColorRect: (() => {
            const el = document.querySelector("fig-input-color");
            return el ? el.getBoundingClientRect().toJSON() : null;
          })(),
          hasNextIssue: !!document.querySelector("[data-nextjs-dialog]"),
          bodyClasses: document.body?.className,
        }));
        console.log("Dialog did not appear. Debug:", JSON.stringify(debug, null, 2));
      }

      const check = await page.evaluate(() => {
        const dialog = document.querySelector(".fig-fill-picker-dialog") || document.querySelector("dialog[open]");
        if (dialog) {
          const cs = getComputedStyle(dialog);
          return JSON.stringify(
            {
              fontSize: cs.fontSize,
              width: cs.width,
              bg: cs.backgroundColor,
              parent: dialog.parentElement?.tagName,
              visible: dialog.open,
            },
            null,
            2
          );
        }
        const allDialogs = document.querySelectorAll("dialog");
        const figInputColors = document.querySelectorAll("fig-input-color");
        return "Dialogs: " + allDialogs.length + ", fig-input-color: " + figInputColors.length;
      });

      console.log("\n--- Color picker check ---\n", check);

      await page.screenshot({ path: `${SCREENSHOT_DIR}/44-fig-input-color-picker.png` });
      console.log("Saved: 44-fig-input-color-picker.png");
    }

    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    const input2 = page.getByPlaceholder(/Describe what to change|Describe changes for/i).first();
    await input2.click();
    await input2.pressSequentially("/ui gradient", { delay: 80 });
    await page.keyboard.press("Enter");
    await page.waitForTimeout(2000);

    const figInputFill = page.locator("fig-input-fill").first();
    const hasFill = (await figInputFill.count()) > 0;
    console.log("\nfig-input-fill found:", hasFill);

    if (hasFill) {
      await figInputFill.evaluate((el) => {
        el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      });
      await page.waitForTimeout(800);

      await page.screenshot({ path: `${SCREENSHOT_DIR}/45-fig-input-fill-picker.png` });
      console.log("Saved: 45-fig-input-fill-picker.png");

      const fillCheck = await page.evaluate(() => {
        const dialog = document.querySelector(".fig-fill-picker-dialog") || document.querySelector("dialog[open]");
        if (dialog) {
          const cs = getComputedStyle(dialog);
          const inputs = dialog.querySelectorAll("input");
          return JSON.stringify(
            {
              fontSize: cs.fontSize,
              width: cs.width,
              inputCount: inputs.length,
              firstInputFontSize: inputs[0] ? getComputedStyle(inputs[0]).fontSize : null,
            },
            null,
            2
          );
        }
        return "No dialog found";
      });
      console.log("\n--- Fill picker check ---\n", fillCheck);
    }
  } catch (err) {
    console.error("Error:", err.message);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/44-error.png` }).catch(() => {});
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
