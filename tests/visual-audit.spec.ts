import { test, expect } from "@playwright/test";
import type { ConsoleMessage, Request } from "@playwright/test";

test.use({ screenshot: "only-on-failure" });

const DESKTOP = { width: 1280, height: 900 };
const MOBILE = { width: 375, height: 812 };

test.describe("Visual regression audit — desktop", () => {
  test.use({ viewport: DESKTOP });

  test("own profile /profile", async ({ page }) => {
    const errors: string[] = [];
    const failedRequests: string[] = [];
    page.on("console", (msg: ConsoleMessage) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("requestfailed", (req: Request) => failedRequests.push(`${req.method()} ${req.url()} -> ${req.failure()?.errorText}`));
    await page.goto("/profile", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: "test-results/screenshots/profile-own-desktop.png", fullPage: true });
    // eslint-disable-next-line no-console
    console.log("DIAG::CONSOLE_ERRORS::" + JSON.stringify(errors));
    // eslint-disable-next-line no-console
    console.log("DIAG::FAILED_REQUESTS::" + JSON.stringify(failedRequests));
  });

  test("public profile /blueybarks", async ({ page }) => {
    const errors: string[] = [];
    const failedRequests: string[] = [];
    page.on("console", (msg: ConsoleMessage) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("requestfailed", (req: Request) => failedRequests.push(`${req.method()} ${req.url()} -> ${req.failure()?.errorText}`));
    await page.goto("/blueybarks", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: "test-results/screenshots/profile-public-desktop.png", fullPage: true });
    // eslint-disable-next-line no-console
    console.log("DIAG::CONSOLE_ERRORS::" + JSON.stringify(errors));
    // eslint-disable-next-line no-console
    console.log("DIAG::FAILED_REQUESTS::" + JSON.stringify(failedRequests));
  });

  test("home feed /", async ({ page }) => {
    const errors: string[] = [];
    const failedRequests: string[] = [];
    page.on("console", (msg: ConsoleMessage) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("requestfailed", (req: Request) => failedRequests.push(`${req.method()} ${req.url()} -> ${req.failure()?.errorText}`));
    await page.goto("/", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: "test-results/screenshots/home-desktop.png", fullPage: true });
    // eslint-disable-next-line no-console
    console.log("DIAG::CONSOLE_ERRORS::" + JSON.stringify(errors));
    // eslint-disable-next-line no-console
    console.log("DIAG::FAILED_REQUESTS::" + JSON.stringify(failedRequests));
  });

  test("settings /settings", async ({ page }) => {
    const errors: string[] = [];
    const failedRequests: string[] = [];
    page.on("console", (msg: ConsoleMessage) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("requestfailed", (req: Request) => failedRequests.push(`${req.method()} ${req.url()} -> ${req.failure()?.errorText}`));
    await page.goto("/settings", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: "test-results/screenshots/settings-desktop.png", fullPage: true });
    // eslint-disable-next-line no-console
    console.log("DIAG::CONSOLE_ERRORS::" + JSON.stringify(errors));
    // eslint-disable-next-line no-console
    console.log("DIAG::FAILED_REQUESTS::" + JSON.stringify(failedRequests));
  });

  test("edit-profile /edit-profile", async ({ page }) => {
    const errors: string[] = [];
    const failedRequests: string[] = [];
    page.on("console", (msg: ConsoleMessage) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("requestfailed", (req: Request) => failedRequests.push(`${req.method()} ${req.url()} -> ${req.failure()?.errorText}`));
    await page.goto("/edit-profile", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: "test-results/screenshots/edit-profile-desktop.png", fullPage: true });
    // eslint-disable-next-line no-console
    console.log("DIAG::CONSOLE_ERRORS::" + JSON.stringify(errors));
    // eslint-disable-next-line no-console
    console.log("DIAG::FAILED_REQUESTS::" + JSON.stringify(failedRequests));
  });
});

test.describe("Visual regression audit — mobile", () => {
  test.use({ viewport: MOBILE });

  test("own profile /profile mobile", async ({ page }) => {
    const errors: string[] = [];
    const failedRequests: string[] = [];
    page.on("console", (msg: ConsoleMessage) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("requestfailed", (req: Request) => failedRequests.push(`${req.method()} ${req.url()} -> ${req.failure()?.errorText}`));
    await page.goto("/profile", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: "test-results/screenshots/profile-own-mobile.png", fullPage: true });
    // eslint-disable-next-line no-console
    console.log("DIAG::CONSOLE_ERRORS::" + JSON.stringify(errors));
    // eslint-disable-next-line no-console
    console.log("DIAG::FAILED_REQUESTS::" + JSON.stringify(failedRequests));
  });

  test("public profile /blueybarks mobile", async ({ page }) => {
    const errors: string[] = [];
    const failedRequests: string[] = [];
    page.on("console", (msg: ConsoleMessage) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("requestfailed", (req: Request) => failedRequests.push(`${req.method()} ${req.url()} -> ${req.failure()?.errorText}`));
    await page.goto("/blueybarks", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: "test-results/screenshots/profile-public-mobile.png", fullPage: true });
    // eslint-disable-next-line no-console
    console.log("DIAG::CONSOLE_ERRORS::" + JSON.stringify(errors));
    // eslint-disable-next-line no-console
    console.log("DIAG::FAILED_REQUESTS::" + JSON.stringify(failedRequests));
  });

  test("home feed / mobile", async ({ page }) => {
    const errors: string[] = [];
    const failedRequests: string[] = [];
    page.on("console", (msg: ConsoleMessage) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("requestfailed", (req: Request) => failedRequests.push(`${req.method()} ${req.url()} -> ${req.failure()?.errorText}`));
    await page.goto("/", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: "test-results/screenshots/home-mobile.png", fullPage: true });
    // eslint-disable-next-line no-console
    console.log("DIAG::CONSOLE_ERRORS::" + JSON.stringify(errors));
    // eslint-disable-next-line no-console
    console.log("DIAG::FAILED_REQUESTS::" + JSON.stringify(failedRequests));
  });
});
