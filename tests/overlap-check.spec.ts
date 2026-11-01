import { test, expect } from "@playwright/test";
import type { ConsoleMessage, Request } from "@playwright/test";

test.use({ screenshot: "only-on-failure" });

const DESKTOP = { width: 1280, height: 900 };

test.describe("Profile layout — desktop", () => {
  test.use({ viewport: DESKTOP });

  test("no unintended element overlaps (excluding intentional avatar-banner)", async ({ page }) => {
    await page.goto("/blueybarks", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    const overlapInfo = await page.evaluate(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
      const els: Element[] = [];
      let node: Node | null = walker.currentNode;
      while (node) {
        els.push(node as Element);
        node = walker.nextNode();
      }

      const overlaps: string[] = [];
      for (let i = 0; i < els.length; i++) {
        const r1 = els[i].getBoundingClientRect();
        if (r1.width === 0 || r1.height === 0) continue;
        for (let j = i + 1; j < els.length; j++) {
          const r2 = els[j].getBoundingClientRect();
          if (r2.width === 0 || r2.height === 0) continue;
          if (els[i].contains(els[j]) || els[j].contains(els[i])) continue;

          const overlapX = Math.max(0, Math.min(r1.right, r2.right) - Math.max(r1.x, r2.x));
          const overlapY = Math.max(0, Math.min(r1.bottom, r2.bottom) - Math.max(r1.y, r2.y));
          if (overlapX > 5 && overlapY > 5) {
            const c1 = els[i].className || "";
            const c2 = els[j].className || "";
            const isAvatarLike = (r: DOMRect, cls: string) => cls.includes("mt-[-2.5rem]") || cls.includes("af-avatar") || (cls.trim() === "" && r.width <= 120 && r.height <= 120 && r.y > 250);
            const isBannerLike = (r: DOMRect, cls: string) => r.width > 500 && r.height > 100 && r.y < 400 && (cls.includes("h-48") || cls.includes("border-af-border/60"));
            const isAvatarBanner = (isAvatarLike(r1, c1) && isBannerLike(r2, c2)) || (isBannerLike(r1, c1) && isAvatarLike(r2, c2));
            if (!isAvatarBanner) {
              overlaps.push(
                `${els[i].tagName}.${els[i].className?.slice(0,40)} overlaps ${els[j].tagName}.${els[j].className?.slice(0,40)}: ${Math.round(overlapX)}x${Math.round(overlapY)}`,
              );
            }
          }
        }
      }
      return overlaps;
    });

    // eslint-disable-next-line no-console
    console.log("UNINTENDED_OVERLAPS::" + JSON.stringify(overlapInfo));
    expect(overlapInfo.length).toBe(0);
  });

  test("no horizontal overflow", async ({ page }) => {
    await page.goto("/blueybarks", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    const overflow = await page.evaluate(() => {
      return {
        bodyScrollWidth: document.body.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
        overflowing: document.body.scrollWidth > document.documentElement.clientWidth + 2,
      };
    });
    // eslint-disable-next-line no-console
    console.log("OVERFLOW_CHECK::" + JSON.stringify(overflow));
    expect(overflow.overflowing).toBe(false);
  });
});
