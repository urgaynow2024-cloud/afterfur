import { test, expect } from "@playwright/test";

/**
 * Client-side session persistence across navigation and reload.
 *
 * The project has no disposable authenticated test account in this environment,
 * so this test seeds a synthetic, non-expired local Supabase session. It
 * verifies the AuthProvider restoration/navigation path (the reported failure
 * mode) without creating, modifying, or deleting any real account or content.
 */
test("authenticated session survives every main route and a reload", async ({ page }) => {
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

  const accountMenu = page.locator('button[aria-label="Account menu"]');

  await page.goto("/");
  await expect(accountMenu).toBeVisible({ timeout: 30000 });

  for (const route of ["/explore", "/notifications", "/messages", "/bookmarks"]) {
    await page.goto(route);
    await expect(page).not.toHaveURL(/\/signin/);
    await expect(accountMenu).toBeVisible({ timeout: 30000 });
  }

  await page.goto("/");
  await page.getByRole("tab", { name: "Following" }).click();
  await page.getByRole("tab", { name: "For You" }).click();
  await expect(accountMenu).toBeVisible();

  await page.reload();
  await expect(accountMenu).toBeVisible({ timeout: 30000 });
});