#!/usr/bin/env node
/**
 * Test FigUI3 control styling with theme
 * 1. Check current theme
 * 2. Open AI assistant, type /ui, capture popover
 * 3. Scroll and capture lower controls
 * 4. Toggle theme, re-open /ui, verify theme switch
 */
import { chromium } from "@playwright/test";
import { mkdir } from "fs/promises";

const SCREENSHOT_DIR = "./properties-panel-screenshots";

async function openUiPopover(page) {
  // Nav bar buttons with rounded-[4px]: 0=Page, 1=Insert, 2=Search, 3=AI assistant
  const aiBtn = page.locator('button[class*="rounded-[4px]"]').filter({ has: page.locator("svg") }).nth(3);
  await aiBtn.click();
  await page.waitForTimeout(1500);

  const input = page.getByPlaceholder(/Describe what to change|Describe changes for/i).first();
  await input.waitFor({ state: "visible", timeout: 8000 });
  await input.fill("/ui");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1500);
}

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

    // 1. Check current theme
    const theme = await page.evaluate(() => {
      const root = document.documentElement;
      const dataTheme = root.getAttribute("data-theme");
      const stored = localStorage.getItem("figma-theme");
      const navBg = getComputedStyle(document.querySelector('[style*="var(--color-bg-elevated)"]') || document.body).backgroundColor;
      return { dataTheme, stored, navBgSample: navBg };
    });
    console.log("Initial theme:", theme.dataTheme || theme.stored || "light (default)");
    await page.screenshot({ path: `${SCREENSHOT_DIR}/11-initial-theme.png` });
    console.log("Saved: 11-initial-theme.png");

    // 2. Open AI, type /ui
    await openUiPopover(page);

    const popover = page.locator('[data-property-popover="true"]');
    const hasPopover = await popover.isVisible().catch(() => false);
    if (!hasPopover) {
      await page.screenshot({ path: `${SCREENSHOT_DIR}/11-ui-no-popover.png` });
      console.log("ERROR: Popover did not appear");
      return;
    }

    // 3. Screenshot full popover (top controls)
    await page.screenshot({ path: `${SCREENSHOT_DIR}/12-figui3-popover-top.png` });
    console.log("Saved: 12-figui3-popover-top.png");

    // Inspect input styles
    const inputStyles = await popover.evaluate(() => {
      const inputs = document.querySelectorAll('input[type="text"], input[type="number"]');
      return Array.from(inputs).slice(0, 5).map((el) => {
        const s = getComputedStyle(el);
        return { bg: s.backgroundColor, color: s.color, fontSize: s.fontSize };
      });
    });
    console.log("Input styles (first 5):", JSON.stringify(inputStyles, null, 2));

    // 4. Scroll down in popover
    const scrollArea = popover.locator('.overflow-y-auto');
    if (await scrollArea.isVisible()) {
      await scrollArea.evaluate((el) => { el.scrollTop = el.scrollHeight * 0.6; });
      await page.waitForTimeout(500);
    }
    await page.screenshot({ path: `${SCREENSHOT_DIR}/13-figui3-popover-mid.png` });
    console.log("Saved: 13-figui3-popover-mid.png");

    await scrollArea.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/14-figui3-popover-bottom.png` });
    console.log("Saved: 14-figui3-popover-bottom.png");

    // 5. Close popover (click outside or X)
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    // 6. Toggle theme via Preferences menu
    const figmaLogo = page.locator('button').filter({ has: page.locator('svg') }).first();
    await figmaLogo.click();
    await page.waitForTimeout(600);

    const prefs = page.getByText("Preferences", { exact: true });
    await prefs.click();
    await page.waitForTimeout(400);

    const themeSub = page.getByText("Theme", { exact: true });
    await themeSub.click();
    await page.waitForTimeout(300);

    const currentTheme = theme.dataTheme || theme.stored || "light";
    if (currentTheme === "light") {
      await page.getByRole("menuitemcheckbox", { name: "Dark" }).click();
    } else {
      await page.getByRole("menuitemcheckbox", { name: "Light" }).click();
    }
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/15-after-theme-toggle.png` });
    console.log("Saved: 15-after-theme-toggle.png");

    // 7. Re-open /ui and verify controls in new theme
    await openUiPopover(page);

    const popover2 = page.locator('[data-property-popover="true"]');
    if (await popover2.isVisible()) {
      await page.screenshot({ path: `${SCREENSHOT_DIR}/16-figui3-popover-toggled-theme.png` });
      console.log("Saved: 16-figui3-popover-toggled-theme.png");

      const inputStyles2 = await popover2.evaluate(() => {
        const inputs = document.querySelectorAll('input[type="text"], input[type="number"]');
        return Array.from(inputs).slice(0, 3).map((el) => {
          const s = getComputedStyle(el);
          return { bg: s.backgroundColor, color: s.color };
        });
      });
      console.log("Input styles after theme toggle:", JSON.stringify(inputStyles2, null, 2));
    }
  } catch (err) {
    console.error("Error:", err.message);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/11-figui3-error.png` }).catch(() => {});
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
