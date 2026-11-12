/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PostMedia } from "@/components/post/post-media";

vi.mock("@/lib/media-url-state", () => ({
  useResolvedMediaUrls: (urls: string[]) => ({
    loading: false,
    items: urls.map((url: string) => ({ original: url, resolved: url, loading: false, error: false })),
  }),
}));

afterEach(cleanup);

describe("PostMedia sizing", () => {
  it("renders a single image with intrinsic sizing and no fixed-height container", () => {
    const { container } = render(<PostMedia urls={["/post/portrait.png"]} />);
    const image = container.querySelector("img");
    expect(image).not.toBeNull();
    expect(image).toHaveClass("w-full");
    expect(image).toHaveClass("h-auto");
    expect(image).not.toHaveClass("w-auto");
    expect(image?.className).not.toContain("max-h-");
  });

  it("renders multiple images in a grid with cover thumbnails", () => {
    const { container } = render(<PostMedia urls={["/post/a.jpg", "/post/b.jpg"]} />);
    const images = Array.from(container.querySelectorAll("img"));
    expect(images).toHaveLength(2);
    for (const image of images) {
      expect(image).toHaveClass("object-cover");
    }
  });

  it("keeps native controls on a single video", () => {
    const { container } = render(<PostMedia urls={["/post/clip.mp4"]} />);
    const video = container.querySelector("video");
    expect(video).not.toBeNull();
    expect(video).toHaveAttribute("controls");
  });
});