import { test, expect } from "@playwright/test";

async function seedSyntheticSession(page: import("@playwright/test").Page) {
  await page.goto("/signin");
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 86_400;
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const accessToken = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    sub: "synthetic-user",
    email: "synthetic@example.com",
    exp,
    user_metadata: { username: "synthetic" },
    app_metadata: {},
  })}.synthetic-signature`;
  const session = {
    access_token: accessToken,
    refresh_token: "synthetic-refresh-token",
    token_type: "bearer",
    expires_in: 86_400,
    expires_at: exp,
    user: {
      id: "synthetic-user",
      email: "synthetic@example.com",
      aud: "authenticated",
      created_at: new Date().toISOString(),
      app_metadata: {},
      user_metadata: { username: "synthetic" },
    },
  };
  await page.evaluate(({ session }) => {
    window.localStorage.setItem("afterfur:active-account:v1", "synthetic-user");
    window.localStorage.setItem(
      "afterfur:saved-accounts:v2",
      JSON.stringify([
        {
          userId: "synthetic-user",
          email: "synthetic@example.com",
          username: "synthetic",
          displayName: "Synthetic",
          avatarUrl: null,
          storageKey: "afterfur.auth.session.synthetic-user",
          lastSelectedAt: Date.now(),
          sessionStatus: "active",
        },
      ]),
    );
    window.localStorage.setItem("afterfur.auth.session.synthetic-user", JSON.stringify(session));
  }, { session });
}

test("account switcher overlays within the viewport and closes on outside click/navigation", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 768, "Account menu is desktop-only");
  await seedSyntheticSession(page);
  await page.goto("/");
  const accountButton = page.locator('button[aria-label="Account menu"]');
  await expect(accountButton).toBeVisible({ timeout: 30000 });

  await accountButton.click();
  const menu = page.locator('[role="menu"][aria-label="Switch account"]');
  await expect(menu).toBeVisible();

  const box = await menu.boundingBox();
  expect(box).not.toBeNull();
  const viewport = page.viewportSize()!;
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
  await page.screenshot({ path: "test-results/account-switcher.png" });

  await page.locator("main").click({ position: { x: 20, y: 20 } });
  await expect(menu).toBeHidden();

  await accountButton.click();
  await expect(menu).toBeVisible();
  await page.getByRole("link", { name: "Explore" }).first().click();
  await expect(menu).toBeHidden();
  await expect(page).toHaveURL(/\/explore/);
});