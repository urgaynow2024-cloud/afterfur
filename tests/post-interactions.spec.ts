import { test, expect } from "@playwright/test";

test.describe("Post interactions", () => {
  test("like, unlike, bookmark and repost toggle correctly", async ({ page }) => {
    await page.goto("/signin");
    await page.fill('input[type="email"]', "test@example.com");
    await page.fill('input[type="password"]', "password");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/");

    await page.locator('button[aria-label="Create a post"]').click();
    await page.locator("textarea").first().fill("Interaction test post");
    await page.locator('button:has-text("Post")').first().click();

    const post = page.locator("article").filter({ hasText: "Interaction test post" }).first();
    await expect(post).toBeVisible({ timeout: 15000 });

    const likeButton = post.locator('button[aria-label*="Like"]');
    await likeButton.click();
    await expect(likeButton).toHaveClass(/is-active/);

    await likeButton.click();
    await expect(likeButton).not.toHaveClass(/is-active/);

    const bookmarkButton = post.locator('button[aria-label*="Bookmark"]');
    await bookmarkButton.click();
    await expect(bookmarkButton).toHaveClass(/is-active/);

    const repostButton = post.locator('button[aria-label*="Repost"]');
    await repostButton.click();
    await expect(repostButton).toHaveClass(/is-active/);

    await repostButton.click();
    await expect(repostButton).not.toHaveClass(/is-active/);
  });

  test("share opens custom dialog with exact permalink, copy-link feedback, external destinations, keyboard close and mobile layout", async ({ page }) => {
    await page.goto("/signin");
    await page.fill('input[type="email"]', "test@example.com");
    await page.fill('input[type="password"]', "password");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/");

    await page.locator('button[aria-label="Create a post"]').click();
    await page.locator("textarea").first().fill("Share dialog test post");
    await page.locator('button:has-text("Post")').first().click();

    const post = page.locator("article").filter({ hasText: "Share dialog test post" }).first();
    await expect(post).toBeVisible({ timeout: 15000 });

    const shareButton = post.locator('button[aria-label*="Share"]').first();
    await shareButton.click();

    const dialog = page.getByRole("dialog", { name: /Share post/i });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("aria-modal", "true");

    const permalinkInput = page.getByLabel("Post permalink");
    const permalinkValue = await permalinkInput.inputValue();
    expect(permalinkValue).toContain("/status/");

    const copyButton = dialog.getByRole("button", { name: /^Copy link$/i });
    await copyButton.click();
    await expect(dialog.getByRole("status")).toContainText("Link copied to clipboard!");

    for (const label of ["Discord", "WhatsApp", "Email", "Facebook", "X", "QR code"]) {
      await expect(dialog.getByRole("button", { name: new RegExp(label, "i") })).toBeVisible();
    }

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: /Share post/i })).toBeHidden();

    await shareButton.click();
    await expect(page.getByRole("dialog", { name: /Share post/i })).toBeVisible();
    await page.locator(".af-share-overlay").click({ position: { x: 10, y: 10 } });
    await expect(page.getByRole("dialog", { name: /Share post/i })).toBeHidden();

    await page.setViewportSize({ width: 375, height: 812 });
    await shareButton.click();
    const mobileDialog = page.getByRole("dialog", { name: /Share post/i });
    await expect(mobileDialog).toBeVisible();
    const metrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth);
  });
});