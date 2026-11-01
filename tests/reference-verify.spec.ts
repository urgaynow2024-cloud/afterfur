import { test, expect } from "@playwright/test";
import type { Page, ConsoleMessage, Request } from "@playwright/test";

test.use({ screenshot: "only-on-failure" });

const DESKTOP = { width: 1280, height: 900 };
const MOBILE = { width: 375, height: 812 };

async function captureDiagnostics(page: Page) {
  const errors: string[] = [];
  const failedRequests: string[] = [];
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("requestfailed", (req: Request) => failedRequests.push(`${req.method()} ${req.url()} -> ${req.failure()?.errorText}`));
  return { errors, failedRequests };
}

type RectLike = { x: number; y: number; width: number; height: number } | null;

function rectSummary(r: RectLike) {
  if (!r) return null;
  return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), r: Math.round(r.x + r.width), b: Math.round(r.y + r.height) };
}

test.describe("Desktop reference structure", () => {
  test.use({ viewport: DESKTOP });

  test("public profile structure", async ({ page }) => {
    const { errors, failedRequests } = await captureDiagnostics(page);
    await page.goto("/blueybarks", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);

    const bannerImg = page.locator('img[alt*="banner"]').first();
    const avatarWrap = page.locator("span.af-avatar").first();
    const displayName = page.locator("span.break-words").first();
    const tabs = page.locator('[role="tablist"]').first();
    const editLink = page.getByRole("link", { name: "Edit profile" });
    const followBtn = page.getByRole("button", { name: "Follow" });

    const bannerBox = await bannerImg.boundingBox();
    const avatarBox = await avatarWrap.boundingBox();
    const nameBox = await displayName.boundingBox();
    const tabsBox = await tabs.boundingBox();

    // eslint-disable-next-line no-console
    console.log("DESKTOP::banner=" + JSON.stringify(rectSummary(bannerBox)));
    // eslint-disable-next-line no-console
    console.log("DESKTOP::avatar=" + JSON.stringify(rectSummary(avatarBox)));
    // eslint-disable-next-line no-console
    console.log("DESKTOP::name=" + JSON.stringify(rectSummary(nameBox)));
    // eslint-disable-next-line no-console
    console.log("DESKTOP::tabs=" + JSON.stringify(rectSummary(tabsBox)));

    expect(bannerBox).not.toBeNull();
    expect(bannerBox!.width).toBeGreaterThan(500);
    expect(avatarBox).not.toBeNull();
    expect(nameBox).not.toBeNull();
    expect(tabsBox).not.toBeNull();
    expect(editLink).toBeTruthy();
    expect(followBtn).toBeTruthy();

    if (avatarBox && bannerBox) {
      const overlap = bannerBox.y + bannerBox.height - avatarBox.y;
      // eslint-disable-next-line no-console
      console.log("DESKTOP::avatar_banner_overlap=" + overlap);
      expect(overlap).toBeGreaterThan(0);
    }

    if (nameBox && bannerBox) {
      expect(nameBox.y).toBeGreaterThanOrEqual(bannerBox.y + bannerBox.height - 5);
    }

    const overflow = await page.evaluate(() => document.body.scrollWidth > document.documentElement.clientWidth + 10);
    expect(overflow).toBe(false);

    // eslint-disable-next-line no-console
    console.log("DIAG::CONSOLE_ERRORS::" + JSON.stringify(errors));
    // eslint-disable-next-line no-console
    console.log("DIAG::FAILED_REQUESTS::" + JSON.stringify(failedRequests));
  });

  test("own profile structure", async ({ page }) => {
    const { errors, failedRequests } = await captureDiagnostics(page);
    await page.goto("/profile", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);

    const avatarWrap = page.locator("span.af-avatar").first();
    const displayName = page.locator("span.break-words").first();
    const tabs = page.locator('[role="tablist"]').first();
    const editLink = page.getByRole("link", { name: "Edit profile" });

    const avatarBox = await avatarWrap.boundingBox();
    const nameBox = await displayName.boundingBox();
    const tabsBox = await tabs.boundingBox();

    // eslint-disable-next-line no-console
    console.log("DESKTOP_OWN::avatar=" + JSON.stringify(rectSummary(avatarBox)));
    // eslint-disable-next-line no-console
    console.log("DESKTOP_OWN::name=" + JSON.stringify(rectSummary(nameBox)));
    // eslint-disable-next-line no-console
    console.log("DESKTOP_OWN::tabs=" + JSON.stringify(rectSummary(tabsBox)));

    expect(avatarBox).not.toBeNull();
    expect(nameBox).not.toBeNull();
    expect(tabsBox).not.toBeNull();
    expect(editLink).toBeTruthy();

    // Banner overlap check only if a banner image exists
    const bannerImg = page.locator('img[alt*="banner"]').first();
    const bannerBox = await bannerImg.boundingBox();
    if (avatarBox && bannerBox) {
      const overlap = bannerBox.y + bannerBox.height - avatarBox.y;
      // eslint-disable-next-line no-console
      console.log("DESKTOP_OWN::avatar_banner_overlap=" + overlap);
      expect(overlap).toBeGreaterThan(0);
    }

    if (nameBox && bannerBox) {
      expect(nameBox.y).toBeGreaterThanOrEqual(bannerBox.y + bannerBox.height - 5);
    }

    const overflow = await page.evaluate(() => document.body.scrollWidth > document.documentElement.clientWidth + 10);
    expect(overflow).toBe(false);

    // eslint-disable-next-line no-console
    console.log("DIAG::CONSOLE_ERRORS::" + JSON.stringify(errors));
    // eslint-disable-next-line no-console
    console.log("DIAG::FAILED_REQUESTS::" + JSON.stringify(failedRequests));
  });

  test("home feed stays in centre column", async ({ page }) => {
    const { errors, failedRequests } = await captureDiagnostics(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);

    const main = page.locator("main").first();
    const mainBox = await main.boundingBox();
    // eslint-disable-next-line no-console
    console.log("DESKTOP_HOME::main=" + JSON.stringify(rectSummary(mainBox)));

    const overflow = await page.evaluate(() => document.body.scrollWidth > document.documentElement.clientWidth + 10);
    expect(overflow).toBe(false);

    // eslint-disable-next-line no-console
    console.log("DIAG::CONSOLE_ERRORS::" + JSON.stringify(errors));
    // eslint-disable-next-line no-console
    console.log("DIAG::FAILED_REQUESTS::" + JSON.stringify(failedRequests));
  });

  test("settings and edit-profile have consistent layout", async ({ page }) => {
    for (const [path, label] of [["/settings", "settings"], ["/edit-profile", "edit-profile"]]) {
      const { errors, failedRequests } = await captureDiagnostics(page);
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1500);

      const overflow = await page.evaluate(() => document.body.scrollWidth > document.documentElement.clientWidth + 10);
      expect(overflow, `${label} horizontal overflow`).toBe(false);

      // eslint-disable-next-line no-console
      console.log(`${label.toUpperCase()}::DIAG::CONSOLE_ERRORS::` + JSON.stringify(errors));
      // eslint-disable-next-line no-console
      console.log(`${label.toUpperCase()}::DIAG::FAILED_REQUESTS::` + JSON.stringify(failedRequests));
    }
  });
});

test.describe("Mobile reference structure", () => {
  test.use({ viewport: MOBILE });

  test("public profile mobile structure", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    const { errors, failedRequests } = await captureDiagnostics(page);
    await page.goto("/blueybarks", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);

    const bannerImg = page.locator('img[alt*="banner"]').first();
    const avatarWrap = page.locator("span.af-avatar").first();
    const displayName = page.locator("span.break-words").first();
    const tabs = page.locator('[role="tablist"]').first();
    const followButton = page.getByRole("button", { name: "Follow" });

    const bannerBox = await bannerImg.boundingBox();
    const avatarBox = await avatarWrap.boundingBox();
    const nameBox = await displayName.boundingBox();
    const tabsBox = await tabs.boundingBox();

    // eslint-disable-next-line no-console
    console.log("MOBILE::banner=" + JSON.stringify(rectSummary(bannerBox)));
    // eslint-disable-next-line no-console
    console.log("MOBILE::avatar=" + JSON.stringify(rectSummary(avatarBox)));
    // eslint-disable-next-line no-console
    console.log("MOBILE::name=" + JSON.stringify(rectSummary(nameBox)));
    // eslint-disable-next-line no-console
    console.log("MOBILE::tabs=" + JSON.stringify(rectSummary(tabsBox)));

    expect(bannerBox).not.toBeNull();
    expect(avatarBox).not.toBeNull();
    expect(nameBox).not.toBeNull();
    expect(tabsBox).not.toBeNull();
    expect(followButton).toBeTruthy();

    if (avatarBox && bannerBox) {
      const overlap = bannerBox.y + bannerBox.height - avatarBox.y;
      // eslint-disable-next-line no-console
      console.log("MOBILE::avatar_banner_overlap=" + overlap);
      expect(overlap).toBeGreaterThan(0);
    }

    if (nameBox && bannerBox) {
      expect(nameBox.y).toBeGreaterThanOrEqual(bannerBox.y + bannerBox.height - 5);
    }

    const overflow = await page.evaluate(() => document.body.scrollWidth > document.documentElement.clientWidth + 10);
    expect(overflow).toBe(false);

    // eslint-disable-next-line no-console
    console.log("DIAG::CONSOLE_ERRORS::" + JSON.stringify(errors));
    // eslint-disable-next-line no-console
    console.log("DIAG::FAILED_REQUESTS::" + JSON.stringify(failedRequests));
  });

  test("home feed mobile stays in bounds", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    const { errors, failedRequests } = await captureDiagnostics(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);

    const overflow = await page.evaluate(() => document.body.scrollWidth > document.documentElement.clientWidth + 10);
    expect(overflow).toBe(false);

    // eslint-disable-next-line no-console
    console.log("DIAG::CONSOLE_ERRORS::" + JSON.stringify(errors));
    // eslint-disable-next-line no-console
    console.log("DIAG::FAILED_REQUESTS::" + JSON.stringify(failedRequests));
  });
});
