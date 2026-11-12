/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { RevealableMedia } from "@/components/RevealableMedia";

const onReveal = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  onReveal.mockClear();
});

afterEach(() => {
  cleanup();
});

function queryByTag(tag: string, container: HTMLElement) {
  return container.querySelector(tag);
}

describe("RevealableMedia — NSFW blur by default", () => {
  it("blurs NSFW media by default", () => {
    render(<RevealableMedia url="/media/nsfw-image.jpg" isNsfw={true} alt="NSFW image" />);
    const img = screen.getByAltText("NSFW image");
    expect(img).toHaveClass("blur-[12px]");
    expect(img).toHaveClass("grayscale");
  });

  it("does not blur SFW media", () => {
    render(<RevealableMedia url="/media/sfw-image.jpg" isNsfw={false} alt="SFW image" />);
    const img = screen.getByAltText("SFW image");
    expect(img).not.toHaveClass("blur-[12px]");
    expect(img).not.toHaveClass("grayscale");
  });

  it("shows a Reveal button over blurred NSFW media", () => {
    render(<RevealableMedia url="/media/nsfw-image.jpg" isNsfw={true} alt="NSFW image" />);
    expect(screen.getByRole("button", { name: /Reveal/ })).toBeInTheDocument();
  });

  it("does not show reveal controls for SFW media", () => {
    render(<RevealableMedia url="/media/sfw-image.jpg" isNsfw={false} alt="SFW image" />);
    expect(screen.queryByRole("button", { name: /Reveal/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Reblur/ })).not.toBeInTheDocument();
  });

  it("reveals blurred media when Reveal is clicked", () => {
    const { container } = render(<RevealableMedia url="/media/nsfw-video.mp4" isNsfw={true} onReveal={onReveal} />);
    fireEvent.click(screen.getByRole("button", { name: /Reveal/ }));
    const video = queryByTag("video", container);
    expect(video).not.toBeNull();
    expect(video).not.toHaveClass("blur-[12px]");
    expect(video).not.toHaveClass("grayscale");
    expect(onReveal).toHaveBeenCalledWith("/media/nsfw-video.mp4");
  });

  it("rehblurs revealed media when Reblur is clicked", () => {
    render(<RevealableMedia url="/media/nsfw-image.jpg" isNsfw={true} alt="NSFW image" onReveal={onReveal} />);
    fireEvent.click(screen.getByRole("button", { name: /Reveal/ }));
    const img = screen.getByAltText("NSFW image");
    expect(img).not.toHaveClass("blur-[12px]");

    fireEvent.click(screen.getByRole("button", { name: /Reblur/ }));
    expect(screen.getByAltText("NSFW image")).toHaveClass("blur-[12px]");
  });

  it("renders video element for video URLs", () => {
    const { container } = render(<RevealableMedia url="/media/nsfw-video.mp4" isNsfw={true} />);
    expect(screen.getByRole("button", { name: /Reveal/ })).toBeInTheDocument();
    const video = queryByTag("video", container);
    expect(video).not.toBeNull();
    expect(video).toBeInstanceOf(HTMLVideoElement);
  });

  it("renders gif as image with blur", () => {
    render(<RevealableMedia url="/media/nsfw-animation.gif" isNsfw={true} alt="NSFW gif" />);
    const img = screen.getByAltText("NSFW gif");
    expect(img).toHaveClass("blur-[12px]");
    expect(img).toHaveClass("grayscale");
    expect(screen.getByRole("button", { name: /Reveal/ })).toBeInTheDocument();
  });
});
