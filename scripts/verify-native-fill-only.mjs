#!/usr/bin/env node
/** Quick script to capture native Fill row when object selected */
import { chromium } from "@playwright/test";
import { mkdir } from "fs/promises";

async function main() {
  await mkdir("./properties-panel-screenshots", { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  try {
    await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    await page.keyboard.press("R");
    await page.waitForTimeout(300);
    await page.mouse.click(350, 300);
    await page.mouse.move(450, 400);
    await page.mouse.down();
    await page.mouse.move(500, 450);
    await page.mouse.up();
    await page.waitForTimeout(500);
    await page.keyboard.press("V");
    await page.waitForTimeout(200);
    await page.mouse.click(425, 375);
    await page.waitForTimeout(800);
    await page.screenshot({ path: "./properties-panel-screenshots/40-native-fill-row.png" });
    console.log("Saved 40-native-fill-row.png");
  } finally {
    await browser.close();
  }
}

main();
