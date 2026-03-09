import { NextRequest, NextResponse } from "next/server";

// ─── Types ──────────────────────────────────────────────────────────

interface NavStep {
  action: "click" | "type" | "select" | "focus" | "clear" | "wait_for";
  text?: string;
  selector?: string;
  value?: string;
  count?: number;
}

interface ViewDef {
  name: string;
  steps: NavStep[];
}

interface RequestBody {
  srcdocHtml: string;
  views: ViewDef[];
  viewport: { width: number; height: number };
}

interface ViewSnapshot {
  name: string;
  html: string;
  cssRules: string[];
  success: boolean;
  error?: string;
}

// ─── Playwright step execution ──────────────────────────────────────

async function executeStepWithPlaywright(
  page: any,
  step: NavStep,
): Promise<boolean> {
  try {
    switch (step.action) {
      case "click": {
        if (step.selector) {
          const el = page.locator(step.selector).first();
          if (await el.count() > 0) {
            await el.click({ timeout: 3000 });
            return true;
          }
        }
        if (step.text) {
          const byRole = page.getByRole("button", { name: step.text }).or(
            page.getByRole("link", { name: step.text }),
          ).or(
            page.getByRole("tab", { name: step.text }),
          ).or(
            page.getByRole("menuitem", { name: step.text }),
          ).or(
            page.getByRole("option", { name: step.text }),
          );
          if (await byRole.count() > 0) {
            await byRole.first().click({ timeout: 3000 });
            return true;
          }
          const byText = page.getByText(step.text, { exact: false }).first();
          if (await byText.count() > 0) {
            await byText.click({ timeout: 3000 });
            return true;
          }
        }
        return false;
      }

      case "type": {
        let input: any = null;
        if (step.selector) {
          const sel = page.locator(step.selector).first();
          if (await sel.count() > 0) input = sel;
        }
        if (!input && step.text) {
          const byPlaceholder = page.getByPlaceholder(step.text).first();
          if (await byPlaceholder.count() > 0) {
            input = byPlaceholder;
          } else {
            const byLabel = page.getByLabel(step.text).first();
            if (await byLabel.count() > 0) input = byLabel;
          }
        }
        if (input) {
          await input.click({ timeout: 3000 });
          await input.fill(step.value ?? "", { timeout: 3000 });
          return true;
        }
        return false;
      }

      case "select": {
        let select: any = null;
        if (step.selector) {
          const sel = page.locator(step.selector).first();
          if (await sel.count() > 0) select = sel;
        }
        if (!select && step.text) {
          const byLabel = page.getByLabel(step.text).first();
          if (await byLabel.count() > 0) select = byLabel;
        }
        if (select) {
          await select.selectOption(step.value ?? "", { timeout: 3000 });
          return true;
        }
        return false;
      }

      case "focus": {
        if (step.selector) {
          const el = page.locator(step.selector).first();
          if (await el.count() > 0) {
            await el.focus({ timeout: 3000 });
            await el.click({ timeout: 3000 });
            return true;
          }
        }
        if (step.text) {
          const byText = page.getByText(step.text, { exact: false }).first();
          if (await byText.count() > 0) {
            await byText.focus({ timeout: 3000 });
            return true;
          }
        }
        return false;
      }

      case "clear": {
        let input: any = null;
        if (step.selector) {
          const sel = page.locator(step.selector).first();
          if (await sel.count() > 0) input = sel;
        }
        if (!input && step.text) {
          const byPlaceholder = page.getByPlaceholder(step.text).first();
          if (await byPlaceholder.count() > 0) input = byPlaceholder;
        }
        if (input) {
          await input.clear({ timeout: 3000 });
          return true;
        }
        return false;
      }

      case "wait_for": {
        if (step.text) {
          await page.getByText(step.text, { exact: false }).first()
            .waitFor({ state: "visible", timeout: 5000 });
          return true;
        }
        return false;
      }
    }
    return false;
  } catch {
    return false;
  }
}

// ─── DOM snapshot capture ───────────────────────────────────────────

async function captureSnapshot(page: any): Promise<{ html: string; cssRules: string[] }> {
  const html = await page.content();

  const cssRules: string[] = await page.evaluate(() => {
    const rules: string[] = [];
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          rules.push(rule.cssText);
        }
      } catch {
        // Cross-origin stylesheet — skip
      }
    }
    return rules;
  });

  return { html, cssRules };
}

// ─── API Route ──────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const t0 = performance.now();

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { srcdocHtml, views, viewport } = body;
  if (!srcdocHtml || !views || !viewport) {
    return NextResponse.json(
      { error: "Missing srcdocHtml, views, or viewport" },
      { status: 400 },
    );
  }

  let browser: any;
  let page: any;

  try {
    const path = await import("path");
    const fs = await import("fs");

    // Set browser path BEFORE importing playwright (it reads env at import time)
    const localBrowsers = path.resolve(
      process.cwd(),
      "node_modules/playwright-core/.local-browsers",
    );
    if (fs.existsSync(localBrowsers)) {
      process.env.PLAYWRIGHT_BROWSERS_PATH = localBrowsers;
    }

    const pw = await import("playwright");

    // Resolve the headless shell executable explicitly as a fallback
    let executablePath: string | undefined;
    const defaultExec = pw.chromium.executablePath();
    if (!fs.existsSync(defaultExec)) {
      const candidates = [
        path.join(localBrowsers, "chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell"),
        path.join(localBrowsers, "chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"),
      ];
      executablePath = candidates.find((p) => fs.existsSync(p));
      if (executablePath) {
        console.log("[extract-pw] Using explicit executablePath:", executablePath);
      }
    }

    browser = await pw.chromium.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {}),
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
    });
    page = await context.newPage();
  } catch (initErr: any) {
    console.error("[extract-pw] Playwright init failed:", initErr);
    return NextResponse.json(
      { error: `Playwright init failed: ${initErr?.message || String(initErr)}` },
      { status: 500 },
    );
  }

  const snapshots: ViewSnapshot[] = [];

  try {
    for (const view of views) {
      const vt0 = performance.now();
      console.log(`[extract-pw] Processing view: "${view.name}"`);

      // Load the Make's HTML fresh for each view (clean state)
      await page.setContent(srcdocHtml, { waitUntil: "networkidle" });

      // Wait for React to mount (#root should have children)
      try {
        await page.waitForFunction(
          () => {
            const root = document.getElementById("root");
            return root && root.children.length > 0;
          },
          { timeout: 10000 },
        );
        // Extra settling time for Tailwind and async effects
        await page.waitForTimeout(500);
      } catch {
        console.warn(`[extract-pw] "${view.name}": React mount timeout`);
      }

      // Execute navigation steps
      const steps = view.steps || [];
      let navFailed = false;

      for (let s = 0; s < steps.length; s++) {
        const step = steps[s];
        const repeatCount = Math.max(1, step.count || 1);

        for (let rep = 0; rep < repeatCount; rep++) {
          // Try Playwright native first (fast)
          let success = await executeStepWithPlaywright(page, step);

          // Log native failure (Stagehand AI fallback is a future enhancement)
          if (!success) {
            console.warn(
              `[extract-pw] "${view.name}" step ${s + 1}: Playwright native locator failed`,
            );
          }

          if (!success) {
            const desc = step.text
              ? `${step.action} "${step.text}"`
              : step.selector
                ? `${step.action} ${step.selector}`
                : JSON.stringify(step);
            console.warn(
              `[extract-pw] "${view.name}" step ${s + 1} FAILED: ${desc}`,
            );
            navFailed = true;
            break;
          }

          // Wait for DOM to settle after action
          await page.waitForTimeout(300);

          const repLabel = repeatCount > 1 ? ` (rep ${rep + 1}/${repeatCount})` : "";
          console.log(
            `[extract-pw] "${view.name}" step ${s + 1}/${steps.length}${repLabel}: ${step.action} ✓`,
          );
        }

        if (navFailed) break;
      }

      if (navFailed) {
        snapshots.push({
          name: view.name,
          html: "",
          cssRules: [],
          success: false,
          error: "Navigation step failed",
        });
        continue;
      }

      // Final settle before capture
      await page.waitForTimeout(500);

      // Capture the DOM snapshot
      const snapshot = await captureSnapshot(page);
      snapshots.push({
        name: view.name,
        ...snapshot,
        success: true,
      });

      console.log(
        `[extract-pw] "${view.name}" captured in ${((performance.now() - vt0) / 1000).toFixed(1)}s`,
      );
    }
  } catch (err: any) {
    console.error("[extract-pw] Extraction error:", err);
    try { await browser?.close(); } catch {}
    return NextResponse.json(
      { error: `Extraction error: ${err?.message || String(err)}`, snapshots },
      { status: 500 },
    );
  }

  try { await browser.close(); } catch {}

  const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
  console.log(
    `[extract-pw] Done in ${elapsed}s: ${snapshots.filter((s) => s.success).length}/${views.length} views`,
  );

  return NextResponse.json({ snapshots });
}
