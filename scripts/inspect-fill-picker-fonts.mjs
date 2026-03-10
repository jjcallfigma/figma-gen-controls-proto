#!/usr/bin/env node
/**
 * Inspect FigUI3 fill picker dialog font-size and related computed styles
 */
import { chromium } from "@playwright/test";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);

    const aiBtn = page.locator('button[class*="rounded-[4px]"]').filter({ has: page.locator("svg") }).nth(3);
    await aiBtn.click();
    await page.waitForTimeout(1200);

    const input = page.getByPlaceholder(/Describe what to change|Describe changes for/i).first();
    await input.waitFor({ state: "visible", timeout: 8000 });
    await input.fill("/ui gradient");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1500);

    const fillInput = page.locator("fig-input-fill").first();
    await fillInput.click();
    await page.waitForTimeout(800);

    const result = await page.evaluate(() => {
      const dialog = document.querySelector(".fig-fill-picker-dialog");
      if (!dialog) return "No .fig-fill-picker-dialog found";
      const cs = getComputedStyle(dialog);
      const header = dialog.querySelector("fig-header");
      const inputs = dialog.querySelectorAll("input");
      const labels = dialog.querySelectorAll(".fig-fill-picker-type-label, .fig-fill-picker-gradient-stops-header");

      const out = {
        dialogFontSize: cs.fontSize,
        dialogFontWeight: cs.fontWeight,
        dialogWidth: cs.width,
        dialogParent: dialog.parentElement ? dialog.parentElement.tagName + "." + (dialog.parentElement.className || "").split(" ").filter(Boolean).join(".") : null,
        isInsideFigui3Scope: !!dialog.closest(".figui3-scope"),
        headerFontSize: header ? getComputedStyle(header).fontSize : "no header",
      };

      inputs.forEach((inp, i) => {
        const ics = getComputedStyle(inp);
        out[`input${i}FontSize`] = ics.fontSize;
        out[`input${i}Height`] = ics.height;
      });

      labels.forEach((lbl, i) => {
        const lcs = getComputedStyle(lbl);
        out[`label${i}FontSize`] = lcs.fontSize;
        out[`label${i}Text`] = lbl.textContent?.trim().substring(0, 20);
      });

      return JSON.stringify(out, null, 2);
    });

    console.log(result);
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
