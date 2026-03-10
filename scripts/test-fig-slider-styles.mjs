#!/usr/bin/env node
/**
 * Test fig-slider styling: run JS commands and report results
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
    await input.fill("/ui slider");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1500);

    const popover = page.locator('[data-property-popover="true"]');
    if (!(await popover.isVisible())) {
      console.log("ERROR: Sliders popover did not appear");
      await page.screenshot({ path: `${SCREENSHOT_DIR}/18-slider-fail.png` });
      return;
    }

    await page.screenshot({ path: `${SCREENSHOT_DIR}/18-fig-slider-popover.png` });
    console.log("Saved: 18-fig-slider-popover.png\n");

    // 1. fig-slider height
    const height = await page.evaluate(() => {
      const slider = document.querySelector("fig-slider");
      return slider ? getComputedStyle(slider).height : "fig-slider not found";
    });
    console.log("1. fig-slider computed height:");
    console.log("   ", height);

    // 2. Internal input styles
    const inputStyles = await page.evaluate(() => {
      const slider = document.querySelector("fig-slider");
      const shadow = slider?.shadowRoot;
      const input = shadow?.querySelector("input");
      if (input) {
        const cs = getComputedStyle(input);
        return {
          height: cs.height,
          padding: cs.padding,
          paddingTop: cs.paddingTop,
          paddingBottom: cs.paddingBottom,
          fontSize: cs.fontSize,
          lineHeight: cs.lineHeight,
          boxSizing: cs.boxSizing,
          borderRadius: cs.borderRadius,
        };
      }
      return "no input found";
    });
    console.log("\n2. fig-slider shadow input styles:");
    console.log("   ", JSON.stringify(inputStyles, null, 2));

    // 3. Native properties panel input for comparison
    const nativeStyles = await page.evaluate(() => {
      const nativeInputs = document.querySelectorAll(
        '.properties-panel input[type="text"], .properties-panel input[type="number"], [class*="property"] input'
      );
      if (nativeInputs.length > 0) {
        const cs = getComputedStyle(nativeInputs[0]);
        return {
          height: cs.height,
          padding: cs.padding,
          paddingTop: cs.paddingTop,
          paddingBottom: cs.paddingBottom,
          fontSize: cs.fontSize,
          lineHeight: cs.lineHeight,
          boxSizing: cs.boxSizing,
          borderRadius: cs.borderRadius,
        };
      }
      return "no native input found";
    });
    console.log("\n3. Native properties panel input (comparison):");
    console.log("   ", JSON.stringify(nativeStyles, null, 2));

    // 4. --control-height variable
    const controlHeight = await page.evaluate(() => {
      const slider = document.querySelector("fig-slider");
      return slider ? getComputedStyle(slider).getPropertyValue("--control-height") : "fig-slider not found";
    });
    console.log("\n4. fig-slider --control-height:");
    console.log("   ", JSON.stringify(controlHeight) || "(empty)");

    // 5a. Inspect shadow root structure
    const shadowStructure = await page.evaluate(() => {
      const slider = document.querySelector("fig-slider");
      const shadow = slider?.shadowRoot;
      if (!shadow) return "no shadowRoot";
      return {
        childCount: shadow.childNodes.length,
        innerHTML: shadow.innerHTML?.slice(0, 500),
        children: Array.from(shadow.children).map((c) => ({ tag: c.tagName, class: c.className })),
      };
    });
    console.log("\n5a. Shadow root structure:");
    console.log("   ", JSON.stringify(shadowStructure, null, 2));

    // 5b. Full shadow DOM structure and all element styles
    const shadowEls = await page.evaluate(() => {
      const slider = document.querySelector("fig-slider");
      const shadow = slider?.shadowRoot;
      const allEls = shadow?.querySelectorAll("*");
      const result = [];
      for (const el of allEls || []) {
        const cs = getComputedStyle(el);
        result.push({
          tag: el.tagName,
          class: el.className || "(none)",
          height: cs.height,
          padding: cs.padding,
          fontSize: cs.fontSize,
          type: el.getAttribute?.("type") || null,
        });
      }
      return result;
    });
    console.log("\n5. Shadow DOM elements (all):");
    console.log("   ", JSON.stringify(shadowEls, null, 2));

    // 6. Try input[type="number"] or input[type="text"] in shadow
    const shadowInputAlt = await page.evaluate(() => {
      const slider = document.querySelector("fig-slider");
      const shadow = slider?.shadowRoot;
      const numInput = shadow?.querySelector('input[type="number"]');
      const textInput = shadow?.querySelector('input[type="text"]');
      const anyInput = shadow?.querySelector("input");
      const el = numInput || textInput || anyInput;
      if (el) {
        const cs = getComputedStyle(el);
        return {
          type: el.type,
          height: cs.height,
          padding: cs.padding,
          fontSize: cs.fontSize,
          lineHeight: cs.lineHeight,
          boxSizing: cs.boxSizing,
          borderRadius: cs.borderRadius,
        };
      }
      return "no input in shadow";
    });
    console.log("\n6. Shadow input (type=number/text/any):");
    console.log("   ", JSON.stringify(shadowInputAlt, null, 2));

    // 7. Any visible input in the popover (for comparison - could be from a sibling of fig-slider)
    const popoverInputs = await page.evaluate(() => {
      const popover = document.querySelector('[data-property-popover="true"]');
      const inputs = popover?.querySelectorAll('input[type="text"], input[type="number"]') || [];
      const result = [];
      for (let i = 0; i < Math.min(3, inputs.length); i++) {
        const cs = getComputedStyle(inputs[i]);
        result.push({
          height: cs.height,
          padding: cs.padding,
          fontSize: cs.fontSize,
          borderRadius: cs.borderRadius,
          value: inputs[i].value?.slice(0, 5),
        });
      }
      return result.length ? result : "no inputs in popover";
    });
    console.log("\n7. Inputs in popover (for comparison):");
    console.log("   ", JSON.stringify(popoverInputs, null, 2));

    // 8. fig-slider full computed style snapshot
    const sliderFullStyle = await page.evaluate(() => {
      const slider = document.querySelector("fig-slider");
      if (!slider) return "not found";
      const cs = getComputedStyle(slider);
      return {
        height: cs.height,
        minHeight: cs.minHeight,
        padding: cs.padding,
        fontSize: cs.fontSize,
        lineHeight: cs.lineHeight,
        boxSizing: cs.boxSizing,
        borderRadius: cs.borderRadius,
        display: cs.display,
        flexDirection: cs.flexDirection,
      };
    });
    console.log("\n8. fig-slider full style snapshot:");
    console.log("   ", JSON.stringify(sliderFullStyle, null, 2));
  } catch (err) {
    console.error("Error:", err.message);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/18-slider-error.png` }).catch(() => {});
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
