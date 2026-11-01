import { test, expect } from "@playwright/test";
import type { ConsoleMessage, Request } from "@playwright/test";

test.use({ screenshot: "only-on-failure" });

const DESKTOP = { width: 1280, height: 900 };

test.describe("Layout verification — desktop", () => {
  test.use({ viewport: DESKTOP });

  test("profile header: banner spans full width, avatar overlaps banner only", async ({ page }) => {
    await page.goto("/blueybarks", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);

    const banner = page.locator('img[alt*="banner"]').first();
    const avatar = page.locator("span.af-avatar img, span.af-avatar").first();
    const displayName = page.locator("span:has-text('Bluey Barks')").first();

    const bannerBox = await banner.boundingBox();
    const avatarBox = await avatar.boundingBox();
    const nameBox = await displayName.boundingBox();

    // Banner should exist and span full width of its container
    expect(bannerBox).not.toBeNull();
    if (bannerBox) {
      expect(bannerBox.width).toBeGreaterThan(500);
    }

    // Avatar should overlap the bottom edge of the banner
    if (avatarBox && bannerBox) {
      const overlap = bannerBox.y + bannerBox.height - avatarBox.y;
      // eslint-disable-next-line no-console
      console.log(`LAYOUT::banner_bottom=${bannerBox.y + bannerBox.height} avatar_top=${avatarBox.y} overlap=${overlap}`);
      expect(overlap).toBeGreaterThan(0);
    }

    // Display name should NOT overlap the banner
    if (nameBox && bannerBox) {
      const nameBelowBanner = nameBox.y - (bannerBox.y + bannerBox.height);
      // eslint-disable-next-line no-console
      console.log(`LAYOUT::name_below_banner=${nameBelowBanner}`);
      expect(nameBelowBanner).toBeGreaterThan(0);
    }

    // No horizontal overflow
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = page.viewportSize()!.width;
    // eslint-disable-next-line no-console
    console.log(`LAYOUT::body_scroll_width=${bodyWidth} viewport_width=${viewportWidth}`);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 2);
  });

  test("profile tabs: full-width row above feed", async ({ page }) => {
    await page.goto("/blueybarks", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);

    const tabs = page.locator('[role="tablist"]').first();
    const tabsBox = await tabs.boundingBox();
    // eslint-disable-next-line no-console
    console.log(`TABS::tabs_box=${JSON.stringify(tabsBox)}`);
    expect(tabsBox).not.toBeNull();
    if (tabsBox) {
      expect(tabsBox.width).toBeGreaterThan(500);
    }
  });

  test("no horizontal overflow on body", async ({ page }) => {
    await page.goto("/blueybarks", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    const overflow = await page.evaluate(() => {
      return document.body.scrollWidth > document.documentElement.clientWidth + 10;
    });
    expect(overflow).toBe(false);
  });
});

test.describe("Layout verification — mobile", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("profile header mobile: no overflow, elements stacked correctly", async ({ page }) => {
    await page.goto("/blueybarks", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);

    const overflow = await page.evaluate(() => {
      return document.body.scrollWidth > document.documentElement.clientWidth + 10;
    });
    expect(overflow).toBe(false);

    const banner = page.locator('img[alt*="banner"]').first();
    const bannerBox = await banner.boundingBox();
    expect(bannerBox).not.toBeNull();
    if (bannerBox) {
      expect(bannerBox.width).toBeGreaterThan(300);
    }
  });
});
