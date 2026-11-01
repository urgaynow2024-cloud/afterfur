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

  test("share copies the post URL", async ({ page }) => {
    await page.goto("/signin");
    await page.fill('input[type="email"]', "test@example.com");
    await page.fill('input[type="password"]', "password");
    await page.click('button[type="submit"]');
    await page.waitForURL("**/");

    await page.locator('button[aria-label="Create a post"]').click();
    await page.locator("textarea").first().fill("Share test post");
    await page.locator('button:has-text("Post")').first().click();

    const post = page.locator("article").filter({ hasText: "Share test post" }).first();
    await expect(post).toBeVisible({ timeout: 15000 });

    const shareButton = post.locator('button:has-text("Share")');
    await shareButton.click();
    await expect(shareButton).toHaveText("Copied!");
  });
});