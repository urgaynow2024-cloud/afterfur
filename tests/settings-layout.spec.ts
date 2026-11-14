import { test, expect } from "@playwright/test";

async function seedSyntheticSession(
  page: import("@playwright/test").Page,
  session: { user: { id: string; email: string }; profile: { id: string; username: string; display_name?: string } },
) {
  await page.addInitScript((syntheticSession) => {
    window.localStorage.setItem(
      "afterfur-active-account",
      JSON.stringify({
        id: syntheticSession.user.id,
        email: syntheticSession.user.email,
        display_name: syntheticSession.profile.display_name ?? syntheticSession.profile.username,
        username: syntheticSession.profile.username,
        avatar_url: null,
      }),
    );
    window.localStorage.setItem(
      `afterfur-session-${syntheticSession.user.id}`,
      JSON.stringify({
        access_token: "synthetic_session_token",
        token_type: "bearer",
        expires_in: 3600,
        refresh_token: "synthetic_refresh",
        user: { id: syntheticSession.user.id, email: syntheticSession.user.email },
      }),
    );
  }, session);
}

test.describe("Settings three-column layout and category navigation", () => {
  const viewports = [
    { name: "1440px desktop", width: 1440, height: 900, isDesktop: true },
    { name: "1024px desktop/tablet", width: 1024, height: 768, isDesktop: true },
    { name: "768px tablet", width: 768, height: 1024, isDesktop: true },
    { name: "390px mobile", width: 390, height: 844, isDesktop: false },
  ];

  for (const vp of viewports) {
    test(`verifies three-column layout, category switching, search, and zero overflow at ${vp.name}`, async ({ page }) => {
      await seedSyntheticSession(page, {
        user: { id: "00000000-0000-4000-8000-000000000001", email: "layout@test.local" },
        profile: { id: "00000000-0000-4000-8000-000000000001", username: "layoutuser", display_name: "Alex McFurry" },
      });
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/settings");

      const mainNav = page.getByRole("navigation", { name: "Primary navigation" });
      const settingsNav = page.getByRole("navigation", { name: /Settings sections/i });
      const searchInput = page.getByRole("searchbox", { name: /Search Settings/i });
      await expect(searchInput).toBeVisible();

      if (vp.isDesktop) {
        await expect(mainNav).toBeVisible();
        await expect(settingsNav).toBeVisible();
        await expect(page.getByRole("heading", { level: 2, name: "Account", exact: true })).toBeVisible();
      } else {
        // On mobile, category list is shown first
        await expect(settingsNav).toBeVisible();
        await expect(page.getByRole("heading", { level: 2, name: "Account", exact: true })).toBeHidden();

        // Select PawPass on mobile -> opens PawPass detail view with back button
        const pawpassBtn = settingsNav.getByRole("button", { name: "PawPass" });
        await pawpassBtn.click();
        await expect(page.getByRole("heading", { level: 2, name: "PawPass", exact: true })).toBeVisible();
        const backBtn = page.getByRole("button", { name: /Back to settings categories/i });
        await expect(backBtn).toBeVisible();
        await backBtn.click();
        await expect(settingsNav).toBeVisible();
      }

      // Switch to Appearance
      const appearanceBtn = settingsNav.getByRole("button", { name: "Appearance" });
      await appearanceBtn.click();
      await expect(page.getByRole("heading", { level: 2, name: "Appearance", exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: /Public Profile Customisation/i })).toBeVisible();

      // Verify no horizontal page overflow
      const metrics = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);

      // Test search filtering
      await searchInput.fill("Notifications");
      const notifBtn = settingsNav.getByRole("button", { name: "Notifications" });
      await expect(notifBtn).toBeVisible();
      await notifBtn.click();
      await expect(page.getByRole("heading", { level: 2, name: "Notifications", exact: true })).toBeVisible();
    });
  }
});