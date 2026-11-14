/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildShareTargetUrl,
  copyTextToClipboard,
  getAbsoluteShareUrl,
  openExternalShareWindow,
  resolvePostPath,
  resolveProfilePath,
} from "@/lib/share";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("share utilities", () => {
  const post = {
    id: "post-1",
    profiles: { username: "artist" },
  };
  const permalink = "http://localhost:3000/artist/status/post-1";

  it("resolves post and profile paths using existing follow utilities", () => {
    expect(resolvePostPath(post)).toBe("/artist/status/post-1");
    expect(resolvePostPath({ id: "42" })).toBe("/posts/42");
    expect(resolveProfilePath({ username: "artist" })).toBe("/artist");
  });

  it("resolves absolute post permalink URL", () => {
    expect(getAbsoluteShareUrl("/artist/status/post-1")).toBe(permalink);
  });

  it("copies the exact post permalink to clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const ok = await copyTextToClipboard(permalink);
    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledWith(permalink);
  });

  it("builds external sharing destination URLs containing the exact post permalink", () => {
    const discord = buildShareTargetUrl("discord", permalink, { title: "Artist on AfterFur", text: "Hello" });
    expect(discord).toContain("discord.com");

    const whatsapp = buildShareTargetUrl("whatsapp", permalink, { title: "Artist on AfterFur", text: "Hello" });
    expect(whatsapp).toContain("whatsapp.com");
    expect(whatsapp).toContain(encodeURIComponent(permalink));

    const email = buildShareTargetUrl("email", permalink, { title: "Artist on AfterFur", text: "Hello" });
    expect(email.startsWith("mailto:?")).toBe(true);
    expect(email).toContain(encodeURIComponent(permalink));

    const facebook = buildShareTargetUrl("facebook", permalink, { title: "Artist on AfterFur" });
    expect(facebook).toContain("facebook.com/sharer");
    expect(facebook).toContain(encodeURIComponent(permalink));

    const x = buildShareTargetUrl("x", permalink, { title: "Artist on AfterFur", text: "Hello" });
    expect(x).toContain("twitter.com/intent/tweet");
    expect(x).toContain(encodeURIComponent(permalink));
  });

  it("opens external sharing URLs safely with noopener and noreferrer", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    openExternalShareWindow("https://example.com");
    expect(openSpy).toHaveBeenCalledWith("https://example.com", "_blank", "noopener,noreferrer");
  });
});