import { expect, test } from "@playwright/test";

test.describe("Figma Clone Canvas", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:3000");
  });

  test("should render the main application", async ({ page }) => {
    // Check page title
    await expect(page).toHaveTitle(/Figma Clone/);

    // Check main elements are present
    await expect(page.getByText("Figma Clone")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Add Rectangle" })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Add Text" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Undo" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Redo" })).toBeVisible();
  });

  test("should create a rectangle and show it on canvas", async ({ page }) => {
    // Click the Add Rectangle button
    await page.getByRole("button", { name: "Add Rectangle" }).click();

    // Should see debug info showing objects
    await expect(page.getByText(/Selected: 0/)).toBeVisible();

    // The canvas should be present
    const canvas = page.locator(".bg-gray-100").first();
    await expect(canvas).toBeVisible();
  });

  test("should create multiple objects and test undo/redo", async ({
    page,
  }) => {
    // Initially undo should be disabled
    await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Redo" })).toBeDisabled();

    // Create first rectangle
    await page.getByRole("button", { name: "Add Rectangle" }).click();

    // Undo should now be enabled
    await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Redo" })).toBeDisabled();

    // Create second rectangle
    await page.getByRole("button", { name: "Add Rectangle" }).click();

    // Create a text object
    await page.getByRole("button", { name: "Add Text" }).click();

    // Now undo once
    await page.getByRole("button", { name: "Undo" }).click();

    // Redo should now be enabled
    await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Redo" })).toBeEnabled();

    // Redo the action
    await page.getByRole("button", { name: "Redo" }).click();

    // Redo should be disabled again
    await expect(page.getByRole("button", { name: "Redo" })).toBeDisabled();
  });

  test("should handle zoom controls", async ({ page }) => {
    // Initial zoom should be 1.00x
    await expect(page.getByText("Zoom: 1.00x")).toBeVisible();

    // Zoom in
    await page.getByRole("button", { name: "Zoom In" }).click();

    // Should see increased zoom
    await expect(page.getByText(/Zoom: 1\.2/)).toBeVisible();

    // Zoom out
    await page.getByRole("button", { name: "Zoom Out" }).click();

    // Should be back to 1.00x
    await expect(page.getByText("Zoom: 1.00x")).toBeVisible();

    // Zoom in then reset
    await page.getByRole("button", { name: "Zoom In" }).click();
    await page.getByRole("button", { name: "Reset" }).click();

    // Should be back to 1.00x with pan reset
    await expect(page.getByText("Zoom: 1.00x")).toBeVisible();
    await expect(page.getByText("Pan: (0, 0)")).toBeVisible();
  });

  test("should show debug information", async ({ page }) => {
    // Debug panel should be visible
    await expect(page.getByText(/Zoom:/)).toBeVisible();
    await expect(page.getByText(/Pan:/)).toBeVisible();
    await expect(page.getByText(/Tool:/)).toBeVisible();
    await expect(page.getByText(/Selected:/)).toBeVisible();

    // Initial values
    await expect(page.getByText("Tool: select")).toBeVisible();
    await expect(page.getByText("Selected: 0")).toBeVisible();
  });

  test("should handle responsive layout", async ({ page }) => {
    // Test different viewport sizes
    await page.setViewportSize({ width: 1920, height: 1080 });
    await expect(page.getByText("Figma Clone")).toBeVisible();

    await page.setViewportSize({ width: 1024, height: 768 });
    await expect(page.getByText("Figma Clone")).toBeVisible();

    // The canvas should still be functional
    await page.getByRole("button", { name: "Add Rectangle" }).click();
    await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();
  });

  test("should maintain state during interactions", async ({ page }) => {
    // Create some objects
    await page.getByRole("button", { name: "Add Rectangle" }).click();
    await page.getByRole("button", { name: "Add Text" }).click();

    // Zoom in
    await page.getByRole("button", { name: "Zoom In" }).click();

    // Create another object
    await page.getByRole("button", { name: "Add Rectangle" }).click();

    // Undo the last object creation
    await page.getByRole("button", { name: "Undo" }).click();

    // Zoom should still be changed
    await expect(page.getByText(/Zoom: 1\.2/)).toBeVisible();

    // Should still be able to undo previous actions
    await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();
  });
});
