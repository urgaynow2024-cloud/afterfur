import { test, expect } from "@playwright/test";

function imageData(width: number, height: number, color: string) {
  return { width, height, color };
}

test("single and grid media render at their natural aspect ratios", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async ({ images }) => {
    const makeSrc = (w: number, h: number, color: string) => {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#ffffff";
      ctx.font = "48px sans-serif";
      ctx.fillText(`${w}x${h}`, 24, 64);
      return canvas.toDataURL("image/png");
    };
    const single = (w: number, h: number, color: string, label: string) => `
      <div data-label="${label}" style="width:100%;margin:0 0 16px;background:#09090F">
        <div class="relative mt-3">
          <div class="relative flex justify-center overflow-hidden rounded-2xl border border-af-border bg-af-surface-2">
            <button type="button" class="flex w-full cursor-zoom-in justify-center">
              <img src="${makeSrc(w, h, color)}" class="block h-auto w-full object-contain" />
            </button>
          </div>
        </div>
      </div>`;
    const grid = `
      <div data-label="grid" style="width:100%;margin:0 0 16px;background:#09090F">
        <div class="relative mt-3">
          <div class="grid grid-cols-2 gap-1 overflow-hidden rounded-2xl">
            ${[
              [800, 600, "#a855f7"],
              [600, 800, "#22c55e"],
              [800, 800, "#3b82f6"],
              [1200, 600, "#f59e0b"],
            ]
              .map(
                ([w, h, c]) => `
              <button type="button" class="group relative overflow-hidden bg-af-surface-2 aspect-square">
                <img src="${makeSrc(w as number, h as number, c as string)}" class="h-full w-full object-cover" />
              </button>`,
              )
              .join("")}
          </div>
        </div>
      </div>`;
    const host = document.createElement("div");
    host.id = "media-visual";
    host.style.cssText = "width:min(544px, calc(100vw - 32px));margin:0 auto;padding:16px;background:#09090F;";
    host.innerHTML = single(images[0].width, images[0].height, images[0].color, "portrait") + single(images[1].width, images[1].height, images[1].color, "landscape") + single(images[2].width, images[2].height, images[2].color, "square") + grid;
    document.body.innerHTML = "";
    document.body.appendChild(host);
    const all = Array.from(host.querySelectorAll("img"));
    await Promise.all(
      all.map((img) =>
        new Promise<void>((resolve) => {
          if (img.complete && img.naturalWidth > 0) return resolve();
          img.onload = () => resolve();
          img.onerror = () => resolve();
        }),
      ),
    );
    const boxes = all.map((img) => {
      const r = img.getBoundingClientRect();
      return { label: img.closest("[data-label]")?.getAttribute("data-label"), w: Math.round(r.width), h: Math.round(r.height), naturalW: img.naturalWidth, naturalH: img.naturalHeight };
    });
    const firstFrame = host.querySelector('[data-label="portrait"] button') as HTMLElement;
    const firstGridCell = host.querySelector('[data-label="grid"] button') as HTMLElement;
    return {
      boxes,
      singleWidth: firstFrame.clientWidth,
      gridWidth: firstGridCell.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    };
  }, {
    images: [
      imageData(800, 1200, "#a855f7"),
      imageData(1200, 800, "#22c55e"),
      imageData(800, 800, "#3b82f6"),
    ],
  });

  console.log(JSON.stringify(result, null, 2));
  for (const box of result.boxes) {
    if (box.label === "portrait" || box.label === "landscape" || box.label === "square") {
      expect(box.w).toBe(result.singleWidth);
      expect(box.h).toBe(Math.round((result.singleWidth * box.naturalH) / box.naturalW));
    } else {
      expect(box.w).toBe(result.gridWidth);
      expect(box.h).toBe(result.gridWidth);
    }
  }
  expect(result.scrollWidth).toBeLessThanOrEqual(result.innerWidth);
  await page.screenshot({ path: "test-results/media-visual.png", fullPage: true });
});