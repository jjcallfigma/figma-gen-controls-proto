#!/usr/bin/env node
/**
 * Test FigUI3 font sizes in /ui demo popover
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
    await input.fill("/ui");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1500);

    const popover = page.locator('[data-property-popover="true"]');
    if (!(await popover.isVisible())) {
      console.log("ERROR: Popover did not appear");
      await page.screenshot({ path: `${SCREENSHOT_DIR}/17-font-check-fail.png` });
      return;
    }

    await page.screenshot({ path: `${SCREENSHOT_DIR}/17-figui3-font-check.png` });
    console.log("Saved: 17-figui3-font-check.png");

    // Check font sizes via page.evaluate
    const fontInfo = await page.evaluate(() => {
      const result = { labels: [], inputs: [], figSlider: null, figSliderInput: null };

      // Label font sizes (span with label text in FieldRow)
      const labels = document.querySelectorAll('[data-property-popover="true"] span[style*="fontSize"], [data-property-popover="true"] span[style*="font-size"]');
      labels.forEach((el, i) => {
        const s = getComputedStyle(el);
        result.labels.push({ index: i, fontSize: s.fontSize, text: el.textContent?.slice(0, 20) });
      });

      // Generic label spans (fontWeight 500, color text-secondary)
      const labelSpans = document.querySelectorAll('[data-property-popover="true"] span');
      labelSpans.forEach((el, i) => {
        const s = getComputedStyle(el);
        const txt = el.textContent?.trim();
        if (txt && txt.length < 25 && !txt.includes("%") && !/^\d+$/.test(txt)) {
          result.labels.push({ index: i, fontSize: s.fontSize, text: txt.slice(0, 20) });
        }
      });

      // Input font sizes
      const inputs = document.querySelectorAll('[data-property-popover="true"] input');
      inputs.forEach((el, i) => {
        const s = getComputedStyle(el);
        result.inputs.push({ index: i, fontSize: s.fontSize, value: el.value?.slice(0, 10) });
      });

      // fig-slider web component
      const figSlider = document.querySelector("fig-slider");
      if (figSlider) {
        result.figSlider = { fontSize: getComputedStyle(figSlider).fontSize };
        const shadowInput = figSlider.shadowRoot?.querySelector("input");
        if (shadowInput) {
          const cs = getComputedStyle(shadowInput);
          result.figSliderInput = { fontSize: cs.fontSize };
        }
        try {
          const csMap = shadowInput?.computedStyleMap?.();
          if (csMap) {
            const fs = csMap.get("font-size");
            result.figSliderInputComputedMap = fs ? fs.toString() : "n/a";
          }
        } catch (e) {
          result.figSliderInputComputedMap = "error: " + e.message;
        }
      } else {
        result.figSlider = "not found";
      }

      return result;
    });

    console.log("\n=== Font size report ===");
    console.log("Labels (sample):", JSON.stringify(fontInfo.labels.slice(0, 8), null, 2));
    console.log("Inputs (sample):", JSON.stringify(fontInfo.inputs.slice(0, 6), null, 2));
    console.log("fig-slider:", JSON.stringify(fontInfo.figSlider, null, 2));
    if (fontInfo.figSliderInput) {
      console.log("fig-slider shadow input:", JSON.stringify(fontInfo.figSliderInput, null, 2));
    }
    if (fontInfo.figSliderInputComputedMap) {
      console.log("fig-slider computedStyleMap font-size:", fontInfo.figSliderInputComputedMap);
    }
  } catch (err) {
    console.error("Error:", err.message);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/17-font-error.png` }).catch(() => {});
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
