import { test, expect } from "@playwright/test";
import type { ConsoleMessage, Request } from "@playwright/test";

test.use({ screenshot: "only-on-failure" });

test.describe("Overflow source detection", () => {
  test("desktop: find elements wider than viewport", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/blueybarks", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    const overflowInfo = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
      const offenders: string[] = [];
      let node: Node | null = walker.currentNode;
      while (node) {
        const el = node as Element;
        const rect = el.getBoundingClientRect();
        if (rect.width > vw + 2) {
          offenders.push(`${el.tagName} ${el.className || ""} width=${Math.round(rect.width)} x=${Math.round(rect.x)} right=${Math.round(rect.right)}`);
        }
        node = walker.nextNode();
      }
      return { viewportWidth: vw, offenders };
    });
    // eslint-disable-next-line no-console
    console.log("OVERFLOW::" + JSON.stringify(overflowInfo, null, 2));
    expect(overflowInfo.offenders.length).toBe(0);
  });

  test("mobile: find elements wider than viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/blueybarks", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    const overflowInfo = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
      const offenders: string[] = [];
      let node: Node | null = walker.currentNode;
      while (node) {
        const el = node as Element;
        const rect = el.getBoundingClientRect();
        if (rect.width > vw + 2) {
          offenders.push(`${el.tagName} ${el.className || ""} width=${Math.round(rect.width)} x=${Math.round(rect.x)} right=${Math.round(rect.right)}`);
        }
        node = walker.nextNode();
      }
      return { viewportWidth: vw, offenders };
    });
    // eslint-disable-next-line no-console
    console.log("MOBILE_OVERFLOW::" + JSON.stringify(overflowInfo, null, 2));
    expect(overflowInfo.offenders.length).toBe(0);
  });
});
