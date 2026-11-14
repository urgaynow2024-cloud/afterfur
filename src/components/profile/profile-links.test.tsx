/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { LinkChip, LinkPreview, detectPlatform, linkTitle } from "@/components/profile/profile-links";

afterEach(() => {
  cleanup();
});

describe("detectPlatform", () => {
  it("recognises Discord", () => {
    expect(detectPlatform("https://discord.gg/abc")).toEqual({ id: "discord", name: "Discord", icon: "💬" });
  });
  it("recognises X", () => {
    expect(detectPlatform("https://x.com/user")).toEqual({ id: "x", name: "X", icon: "X" });
    expect(detectPlatform("https://twitter.com/user")).toEqual({ id: "x", name: "X", icon: "X" });
  });
  it("recognises Bluesky", () => {
    expect(detectPlatform("https://bsky.social/user")).toEqual({ id: "bluesky", name: "Bluesky", icon: "🦋" });
  });
  it("recognises Jinxxy", () => {
    expect(detectPlatform("https://jinxxy.com/user")).toEqual({ id: "jinxxy", name: "Jinxxy", icon: "🐾" });
  });
  it("recognises Patreon", () => {
    expect(detectPlatform("https://patreon.com/user")).toEqual({ id: "patreon", name: "Patreon", icon: "🅿" });
  });
  it("recognises Ko-fi", () => {
    expect(detectPlatform("https://ko-fi.com/user")).toEqual({ id: "ko-fi", name: "Ko-fi", icon: "☕" });
  });
  it("recognises YouTube", () => {
    expect(detectPlatform("https://youtube.com/@user")).toEqual({ id: "youtube", name: "YouTube", icon: "▶" });
    expect(detectPlatform("https://youtu.be/abc")).toEqual({ id: "youtube", name: "YouTube", icon: "▶" });
  });
  it("recognises Twitch", () => {
    expect(detectPlatform("https://twitch.tv/user")).toEqual({ id: "twitch", name: "Twitch", icon: "🟣" });
  });
  it("recognises TikTok", () => {
    expect(detectPlatform("https://tiktok.com/@user")).toEqual({ id: "tiktok", name: "TikTok", icon: "♬" });
  });
  it("recognises Instagram", () => {
    expect(detectPlatform("https://instagram.com/user")).toEqual({ id: "instagram", name: "Instagram", icon: "📷" });
  });
  it("recognises GitHub", () => {
    expect(detectPlatform("https://github.com/user")).toEqual({ id: "github", name: "GitHub", icon: "🐙" });
  });
  it("returns null for unknown sites", () => {
    expect(detectPlatform("https://example.com")).toBeNull();
  });
});

describe("linkTitle", () => {
  it("uses custom label when provided", () => {
    expect(linkTitle("https://example.com", "My Site")).toBe("My Site");
  });
  it("falls back to platform name", () => {
    expect(linkTitle("https://github.com/user", null)).toBe("GitHub");
  });
  it("falls back to Website for unknown", () => {
    expect(linkTitle("https://example.com", null)).toBe("Website");
  });
});

describe("LinkChip", () => {
  it("renders platform icon and label", () => {
    render(<LinkChip link={{ id: "l1", url: "https://github.com/user", label: "My GitHub", display_order: 0 }} />);
    expect(screen.getByText("My GitHub")).toBeInTheDocument();
    expect(screen.getByText("🐙")).toBeInTheDocument();
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "https://github.com/user");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders generic icon and label for unknown site", () => {
    render(<LinkChip link={{ id: "l1", url: "https://example.com", label: null, display_order: 0 }} />);
    expect(screen.getByText("Website")).toBeInTheDocument();
    expect(screen.getByText("🔗")).toBeInTheDocument();
  });

  it("prevents long titles from breaking layout via truncate class", () => {
    render(<LinkChip link={{ id: "l1", url: "https://example.com", label: "A very long custom link title that should wrap", display_order: 0 }} />);
    const titleEl = screen.getByText("A very long custom link title that should wrap");
    expect(titleEl).toHaveClass("truncate");
  });
});

describe("LinkPreview", () => {
  it("renders preview with title and platform name", () => {
    render(<LinkPreview link={{ id: "l1", url: "https://patreon.com/user", label: "Support me", display_order: 0 }} />);
    expect(screen.getByText("Support me")).toBeInTheDocument();
    expect(screen.getByText("Patreon")).toBeInTheDocument();
    expect(screen.getByText("🅿")).toBeInTheDocument();
  });
});
