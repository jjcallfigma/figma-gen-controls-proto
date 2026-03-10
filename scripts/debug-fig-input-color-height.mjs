#!/usr/bin/env node
/**
 * Debug why fig-input-color has height 0
 */
import { chromium } from "@playwright/test";

async function main() {
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
    await page.waitForTimeout(2000);

    const result = await page.evaluate(() => {
      const figColor = document.querySelector("fig-input-color");
      if (!figColor) return "No fig-input-color found";

      const cs = getComputedStyle(figColor);
      const shadow = figColor.shadowRoot;
      const children = figColor.children;
      const result = {
        tagName: figColor.tagName,
        display: cs.display,
        height: cs.height,
        width: cs.width,
        overflow: cs.overflow,
        visibility: cs.visibility,
        opacity: cs.opacity,
        position: cs.position,
        fontSize: cs.fontSize,
        hasShadowRoot: !!shadow,
        childCount: children.length,
        childTags: Array.from(children).map((c) => c.tagName + "." + (c.className || "")),
        innerHTML: figColor.innerHTML.substring(0, 500),
        outerHTML: figColor.outerHTML.substring(0, 500),
        attributes: Array.from(figColor.attributes).map((a) => a.name + "=" + a.value),
        boundingRect: JSON.parse(JSON.stringify(figColor.getBoundingClientRect())),
        isCustomElementDefined: customElements.get("fig-input-color") !== undefined,
      };

      const parent = figColor.closest(".figui3-scope") || figColor.parentElement;
      if (parent) {
        const pcs = getComputedStyle(parent);
        result.parentDisplay = pcs.display;
        result.parentHeight = pcs.height;
        result.parentWidth = pcs.width;
        result.parentOverflow = pcs.overflow;
        result.parentTagName = parent.tagName;
        result.parentClassName = parent.className || "";
      }

      return JSON.stringify(result, null, 2);
    });

    console.log(result);
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
