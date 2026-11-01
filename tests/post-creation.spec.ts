import { test, expect } from "@playwright/test";

test.describe("Post creation and media", () => {
  test("rejects empty posts and supports text-only posts", async ({ page }) => {
    await page.goto("/signin");
    await page.fill('input[type="email"]', "test@example.com");
    await page.fill('input[type="password"]', "password");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/");

    const composerButton = page.locator('button[aria-label="Create a post"]');
    await composerButton.click();

    const postButton = page.locator('button:has-text("Post")').first();
    await expect(postButton).toBeDisabled();

    const textarea = page.locator("textarea").first();
    await textarea.fill("Hello AfterFur, this is a real post from Stage 15.");

    await expect(postButton).not.toBeDisabled();
    await postButton.click();

    await expect(page.getByText("Hello AfterFur, this is a real post from Stage 15.")).toBeVisible({ timeout: 15000 });
  });

  test("shows upload progress and previews before publishing", async ({ page }) => {
    await page.goto("/signin");
    await page.fill('input[type="email"]', "test@example.com");
    await page.fill('input[type="password"]', "password");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/");

    await page.locator('button[aria-label="Create a post"]').click();
    await page.locator("textarea").first().fill("Post with media preview");

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: "stage15.png",
      mimeType: "image/png",
      buffer: Buffer.from("fake-image-bytes"),
    });

    await expect(page.getByText("Add more")).toBeVisible();
    await expect(page.getByText("Post with media preview")).toBeVisible();
  });
});