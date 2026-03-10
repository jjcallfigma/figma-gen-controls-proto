#!/usr/bin/env node
/**
 * Debug why FigUI3 fill picker dialog doesn't open when clicking the swatch
 */
import { chromium } from "@playwright/test";
import { mkdir } from "fs/promises";

const SCREENSHOT_DIR = "./properties-panel-screenshots";

async function main() {
  await mkdir(SCREENSHOT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
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
    await input.pressSequentially("/ui color", { delay: 80 });
    await page.keyboard.press("Enter");
    await page.waitForTimeout(2500);

    const diagnostic1 = await page.evaluate(() => {
      const figColor = document.querySelector("fig-input-color");
      if (!figColor) return JSON.stringify({ error: "no fig-input-color" });

      const fillPicker = figColor.querySelector("fig-fill-picker");
      const chit = figColor.querySelector("fig-chit");
      const trigger = fillPicker?.querySelector("fig-chit") || chit;

      const result = {
        hasFigColor: !!figColor,
        figColorHeight: figColor ? getComputedStyle(figColor).height : null,
        hasFillPicker: !!fillPicker,
        fillPickerDisplay: fillPicker ? getComputedStyle(fillPicker).display : null,
        hasChit: !!chit,
        hasTrigger: !!trigger,
        triggerTag: trigger?.tagName,
        triggerWidth: trigger ? trigger.getBoundingClientRect().width : null,
        triggerHeight: trigger ? trigger.getBoundingClientRect().height : null,
        triggerPointerEvents: trigger ? getComputedStyle(trigger).pointerEvents : null,
        chitBg: chit?.getAttribute("background"),
        dialogsInDOM: document.querySelectorAll(".fig-fill-picker-dialog").length,
        allDialogs: document.querySelectorAll("dialog").length,
      };

      return JSON.stringify(result, null, 2);
    });

    console.log("\n--- Diagnostic 1 ---\n", diagnostic1);

    const diagnostic2 = await page.evaluate(async () => {
      const figColor = document.querySelector("fig-input-color");
      const fillPicker = figColor?.querySelector("fig-fill-picker");
      const chit = fillPicker?.querySelector("fig-chit") || figColor?.querySelector("fig-chit");

      if (!chit) {
        return JSON.stringify({ error: "No chit to click" });
      }

      chit.click();
      await new Promise((r) => setTimeout(r, 500));

      const dialog = document.querySelector(".fig-fill-picker-dialog");
      return JSON.stringify(
        {
          clickedChit: true,
          dialogFound: !!dialog,
          dialogOpen: dialog?.open,
          dialogDisplay: dialog ? getComputedStyle(dialog).display : null,
          dialogWidth: dialog ? getComputedStyle(dialog).width : null,
          dialogHeight: dialog ? getComputedStyle(dialog).height : null,
          dialogsInDOMNow: document.querySelectorAll(".fig-fill-picker-dialog").length,
          dialogElements: Array.from(document.querySelectorAll("dialog")).map((d) => ({
            open: d.open,
            className: d.className,
            id: d.id,
          })),
        },
        null,
        2
      );
    });

    console.log("\n--- Diagnostic 2 (after programmatic click) ---\n", diagnostic2);

    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/49-after-programmatic-click.png` });
    console.log("\nSaved: 49-after-programmatic-click.png");
  } catch (err) {
    console.error("Error:", err.message);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/49-error.png` }).catch(() => {});
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
