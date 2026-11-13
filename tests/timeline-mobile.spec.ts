import { test, expect } from "@playwright/test";

test("compact timeline fits mobile without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.waitForSelector("article");
  await page.waitForTimeout(2000);

  const metrics = await page.evaluate(() => {
    const article = document.querySelector('article:has(img[src*="/storage/v1/object/public/media/"])') ?? document.querySelector("article")!;
    const cs = getComputedStyle(article);
    const action = article.querySelector(".af-post-action")!.getBoundingClientRect();
    const media = article.querySelector('img[src*="/storage/v1/object/public/media/"]');
    const mediaRect = media?.getBoundingClientRect();
    const frame = media?.closest("button")?.parentElement?.getBoundingClientRect();
    return {
      articleWidth: Math.round(article.getBoundingClientRect().width),
      padding: { top: cs.paddingTop, right: cs.paddingRight, bottom: cs.paddingBottom, left: cs.paddingLeft },
      action: { w: Math.round(action.width), h: Math.round(action.height) },
      media: mediaRect ? { w: Math.round(mediaRect.width), h: Math.round(mediaRect.height) } : null,
      frame: frame ? { w: Math.round(frame.width) } : null,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    };
  });
  console.log(JSON.stringify(metrics, null, 2));
  expect(metrics.padding.top).toBe("12px");
  expect(metrics.padding.right).toBe("14px");
  expect(metrics.action.w).toBe(36);
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth);
  if (metrics.media && metrics.frame) {
    expect(metrics.media.w).toBe(metrics.frame.w - 2);
  }
  await page.screenshot({ path: "test-results/timeline-mobile.png", fullPage: false });
});

test("compact timeline uses the intended desktop density", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page.waitForSelector("article");
  await page.waitForTimeout(2000);

  const metrics = await page.evaluate(() => {
    const article = document.querySelector('article:has(img[src*="/storage/v1/object/public/media/"])') ?? document.querySelector("article")!;
    const cs = getComputedStyle(article);
    const action = article.querySelector(".af-post-action")!.getBoundingClientRect();
    const media = article.querySelector('img[src*="/storage/v1/object/public/media/"]');
    const mediaRect = media?.getBoundingClientRect();
    const frame = media?.closest("button")?.parentElement?.getBoundingClientRect();
    return {
      article: Math.round(article.getBoundingClientRect().width),
      padding: { top: cs.paddingTop, right: cs.paddingRight, bottom: cs.paddingBottom, left: cs.paddingLeft },
      action: { w: Math.round(action.width), h: Math.round(action.height) },
      media: mediaRect ? { w: Math.round(mediaRect.width), h: Math.round(mediaRect.height) } : null,
      frame: frame ? { w: Math.round(frame.width) } : null,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    };
  });
  console.log(JSON.stringify(metrics, null, 2));
  expect(metrics.article).toBeLessThanOrEqual(600);
  expect(metrics.padding.top).toBe("12px");
  expect(metrics.padding.right).toBe("14px");
  expect(metrics.action.w).toBe(36);
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth);
  if (metrics.media && metrics.frame) {
    expect(metrics.media.w).toBe(metrics.frame.w - 2);
  }
  await page.screenshot({ path: "test-results/timeline-desktop.png", fullPage: false });
});