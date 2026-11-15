import { test, expect } from "@playwright/test";

async function getLegacyKey(page: import("@playwright/test").Page): Promise<string> {
  const supabaseUrl = await page.evaluate(() => {
    const meta = document.querySelector('meta[name="supabase-url"]');
    return meta?.getAttribute("content") || "";
  });
  if (!supabaseUrl) return "sb-kunwfddahxkpvsivmmkm-auth-token";
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  return `sb-${projectRef}-auth-token`;
}

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
  const legacyKey = await getLegacyKey(page);
  await page.evaluate(({ session, legacyKey }) => {
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
    window.localStorage.setItem(legacyKey, JSON.stringify({ currentSession: session }));
  }, { session, legacyKey });
}

test("logout clears legacy storage key and per-account session", async ({ page }) => {
  await seedSyntheticSession(page);
  await page.goto("/");
  
  const accountButton = page.locator('button[aria-label="Account menu"]');
  await expect(accountButton).toBeVisible({ timeout: 30000 });
  
  await accountButton.click();
  const menu = page.locator('[role="menu"][aria-label="Switch account"]');
  await expect(menu).toBeVisible();
  
  // Click "Log out"
  await page.getByRole("button", { name: "Log out" }).click();
  
  // Wait for redirect to signin page
  await page.waitForURL(/\/signin/, { timeout: 10000 });
  
  // Verify legacy storage key was cleared
  const legacyKey = await getLegacyKey(page);
  const legacySession = await page.evaluate((key) => window.localStorage.getItem(key), legacyKey);
  expect(legacySession).toBeNull();
  
  // Verify per-account storage key was cleared
  const perAccountKey = "afterfur.auth.session.synthetic-user";
  const perAccountSession = await page.evaluate((key) => window.localStorage.getItem(key), perAccountKey);
  expect(perAccountSession).toBeNull();
  
  // Verify active account was cleared
  const activeAccount = await page.evaluate(() => window.localStorage.getItem("afterfur:active-account:v1"));
  expect(activeAccount).toBeNull();
});

test("remove account clears that account's session and legacy storage key", async ({ page }) => {
  await seedSyntheticSession(page);
  
  // Add a second account
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 86_400;
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const accessToken2 = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    sub: "synthetic-user-2",
    email: "synthetic2@example.com",
    exp,
    user_metadata: { username: "synthetic2" },
    app_metadata: {},
  })}.synthetic-signature`;
  const session2 = {
    access_token: accessToken2,
    refresh_token: "synthetic-refresh-token-2",
    token_type: "bearer",
    expires_in: 86_400,
    expires_at: exp,
    user: {
      id: "synthetic-user-2",
      email: "synthetic2@example.com",
      aud: "authenticated",
      created_at: new Date().toISOString(),
      app_metadata: {},
      user_metadata: { username: "synthetic2" },
    },
  };
  
  await page.evaluate(({ session2 }) => {
    const accounts = JSON.parse(window.localStorage.getItem("afterfur:saved-accounts:v2") || "[]");
    accounts.push({
      userId: "synthetic-user-2",
      email: "synthetic2@example.com",
      username: "synthetic2",
      displayName: "Synthetic 2",
      avatarUrl: null,
      storageKey: "afterfur.auth.session.synthetic-user-2",
      lastSelectedAt: Date.now(),
      sessionStatus: "active",
    });
    window.localStorage.setItem("afterfur:saved-accounts:v2", JSON.stringify(accounts));
    window.localStorage.setItem("afterfur.auth.session.synthetic-user-2", JSON.stringify(session2));
  }, { session2 });
  
  await page.goto("/");
  const accountButton = page.locator('button[aria-label="Account menu"]');
  await expect(accountButton).toBeVisible({ timeout: 30000 });
  
  await accountButton.click();
  const menu = page.locator('[role="menu"][aria-label="Switch account"]');
  await expect(menu).toBeVisible();
  
  // Click "Manage accounts"
  await page.getByRole("button", { name: "Manage accounts" }).click();
  
  // Click "Remove" for the second account
  await page.getByRole("button", { name: "Remove Synthetic 2" }).click();
  
  // Wait for the remove operation to complete
  await page.waitForTimeout(1000);
  
  // Verify the second account's storage was cleared
  const perAccountKey2 = "afterfur.auth.session.synthetic-user-2";
  const perAccountSession2 = await page.evaluate((key) => window.localStorage.getItem(key), perAccountKey2);
  expect(perAccountSession2).toBeNull();
  
  // Verify the first account's storage still exists
  const perAccountKey1 = "afterfur.auth.session.synthetic-user";
  const perAccountSession1 = await page.evaluate((key) => window.localStorage.getItem(key), perAccountKey1);
  expect(perAccountSession1).not.toBeNull();
  
  // Verify legacy storage key was cleared
  const legacyKey = await getLegacyKey(page);
  const legacySession = await page.evaluate((key) => window.localStorage.getItem(key), legacyKey);
  expect(legacySession).toBeNull();
  
  // Click "Done managing accounts"
  await page.getByRole("button", { name: "Done managing accounts" }).click();
});