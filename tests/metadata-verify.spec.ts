import { test, expect } from "@playwright/test";
import type { ConsoleMessage, Page } from "@playwright/test";

test.use({ screenshot: "only-on-failure" });

async function captureDiagnostics(page: Page) {
  const errors: string[] = [];
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  return errors;
}

test.describe("Profile metadata generation", () => {
  test("existing profile /blueybarks has dynamic title and description", async ({ page }) => {
    const errors = await captureDiagnostics(page);
    await page.goto("/blueybarks", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);

    const title = await page.title();
    // eslint-disable-next-line no-console
    console.log("METADATA::blueybarks title=" + title);
    expect(title).toContain("AfterFur");
    expect(title).not.toBe("Profile not found | AfterFur");

    const metaDesc = page.locator('meta[name="description"]');
    const content = await metaDesc.getAttribute("content");
    // eslint-disable-next-line no-console
    console.log("METADATA::blueybarks description=" + content);
    expect(content).toBeTruthy();

    // eslint-disable-next-line no-console
    console.log("DIAG::CONSOLE_ERRORS::" + JSON.stringify(errors));
    expect(errors.filter((e) => e.includes("generateMetadata") || e.includes("URL data"))).toHaveLength(0);
  });

  test("own profile /profile route has no metadata errors", async ({ page }) => {
    const errors = await captureDiagnostics(page);
    await page.goto("/profile", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);

    const title = await page.title();
    // eslint-disable-next-line no-console
    console.log("METADATA::profile title=" + title);

    // eslint-disable-next-line no-console
    console.log("DIAG::CONSOLE_ERRORS::" + JSON.stringify(errors));
    expect(errors.filter((e) => e.includes("generateMetadata") || e.includes("URL data"))).toHaveLength(0);
  });

  test("nonexistent username returns not-found metadata", async ({ page }) => {
    const errors = await captureDiagnostics(page);
    await page.goto("/nonexistentuser12345", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);

    const title = await page.title();
    // eslint-disable-next-line no-console
    console.log("METADATA::nonexistent title=" + title);
    expect(title).toContain("not found");

    // eslint-disable-next-line no-console
    console.log("DIAG::CONSOLE_ERRORS::" + JSON.stringify(errors));
    expect(errors.filter((e) => e.includes("generateMetadata") || e.includes("URL data"))).toHaveLength(0);
  });

  test("no hydration or metadata warnings on profile pages", async ({ page }) => {
    const errors = await captureDiagnostics(page);
    await page.goto("/blueybarks", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);

    const hydrationErrors = errors.filter((e) =>
      e.includes("hydration") || e.includes("Hydration") || e.includes("Text content does not match")
    );
    // eslint-disable-next-line no-console
    console.log("DIAG::HYDRATION_ERRORS::" + JSON.stringify(hydrationErrors));
    expect(hydrationErrors).toHaveLength(0);
  });
});
