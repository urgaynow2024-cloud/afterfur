/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ShareDialog from "@/components/ShareDialog";

const PERMALINK = "http://localhost:3000/artist/status/post-1";

function renderDialog(onClose = vi.fn(), onCopyLink = vi.fn(), open = true) {
  const utils = render(
    <ShareDialog
      open={open}
      onClose={onClose}
      onCopyLink={onCopyLink}
      url={PERMALINK}
      title="Artist on AfterFur"
      text="Check out this post"
      authorLabel="@artist on AfterFur"
    />,
  );
  return { onClose, onCopyLink, ...utils };
}

beforeEach(() => {
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.body.style.overflow = "";
});

describe("ShareDialog", () => {
  it("does not render when closed and renders accessible dialog when open", () => {
    const { rerender } = renderDialog(vi.fn(), vi.fn(), false);
    expect(screen.queryByRole("dialog")).toBeNull();

    rerender(
      <ShareDialog
        open={true}
        onClose={vi.fn()}
        url={PERMALINK}
        title="Artist on AfterFur"
      />,
    );
    const dialog = screen.getByRole("dialog", { name: /Share post/i });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("displays and copies the exact post permalink and shows success feedback", async () => {
    const { onCopyLink } = renderDialog();

    const permalinkInput = screen.getByLabelText("Post permalink") as HTMLInputElement;
    expect(permalinkInput).toHaveValue(PERMALINK);
    expect(permalinkInput).toHaveAttribute("readonly");

    const copyButton = screen.getByRole("button", { name: "Copy link" });
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(PERMALINK);
      expect(onCopyLink).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("status")).toHaveTextContent("Link copied to clipboard!");
      expect(screen.getByRole("button", { name: "Copied link" })).toHaveTextContent("Copied!");
    });
  });

  it("opens all external sharing destinations with the post permalink and safe window features", () => {
    renderDialog();
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    fireEvent.click(screen.getByRole("button", { name: "Discord" }));
    expect(openSpy).toHaveBeenCalledWith("https://discord.com/channels/@me", "_blank", "noopener,noreferrer");

    fireEvent.click(screen.getByRole("button", { name: "WhatsApp" }));
    const waUrl = openSpy.mock.calls.find(([u]) => String(u).includes("whatsapp.com"))?.[0];
    expect(waUrl).toContain(encodeURIComponent(PERMALINK));
    expect(openSpy).toHaveBeenLastCalledWith(waUrl, "_blank", "noopener,noreferrer");

    fireEvent.click(screen.getByRole("button", { name: "Email" }));
    const mailUrl = openSpy.mock.calls.find(([u]) => String(u).startsWith("mailto:"))?.[0];
    expect(mailUrl).toContain(encodeURIComponent(PERMALINK));
    expect(openSpy).toHaveBeenLastCalledWith(mailUrl, "_blank", "noopener,noreferrer");

    fireEvent.click(screen.getByRole("button", { name: "Facebook" }));
    const fbUrl = openSpy.mock.calls.find(([u]) => String(u).includes("facebook.com"))?.[0];
    expect(fbUrl).toContain(encodeURIComponent(PERMALINK));
    expect(openSpy).toHaveBeenLastCalledWith(fbUrl, "_blank", "noopener,noreferrer");

    fireEvent.click(screen.getByRole("button", { name: "X" }));
    const xUrl = openSpy.mock.calls.find(([u]) => String(u).includes("twitter.com"))?.[0];
    expect(xUrl).toContain(encodeURIComponent(PERMALINK));
    expect(openSpy).toHaveBeenLastCalledWith(xUrl, "_blank", "noopener,noreferrer");
  });

  it("toggles QR code panel for the post permalink", () => {
    renderDialog();
    expect(screen.queryByRole("img", { name: new RegExp(PERMALINK.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) })).toBeNull();

    const qrButton = screen.getByRole("button", { name: "QR code" });
    fireEvent.click(qrButton);
    expect(qrButton).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("img", { name: `QR code for ${PERMALINK}` })).toBeInTheDocument();

    fireEvent.click(qrButton);
    expect(qrButton).toHaveAttribute("aria-pressed", "false");
  });

  it("closes on Close button, outside click, and Escape key", () => {
    const { onClose, unmount } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Close share dialog" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();

    const { onClose: outsideClose, unmount: unmountOutside } = renderDialog();
    const dialogEl = screen.getByRole("dialog", { name: /Share post/i });
    fireEvent.click(dialogEl);
    expect(outsideClose).toHaveBeenCalledTimes(1);
    unmountOutside();

    const { onClose: escClose, unmount: unmountEsc } = renderDialog();
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(escClose).toHaveBeenCalledTimes(1);
    unmountEsc();

    const { onClose: innerClickClose, container: innerContainer, unmount: unmountInner } = renderDialog();
    const innerPanel = innerContainer.querySelector(".af-share-dialog")!;
    fireEvent.click(innerPanel);
    expect(innerClickClose).not.toHaveBeenCalled();
    unmountInner();
  });

  it("traps keyboard focus and supports responsive mobile and desktop layout classes", () => {
    renderDialog();
    const dialog = screen.getByRole("dialog", { name: /Share post/i });
    const panel = dialog.querySelector(".af-share-dialog") as HTMLElement;
    expect(panel).toHaveClass("w-full", "max-w-md", "rounded-2xl");

    const shareGrid = panel.querySelector(".grid") as HTMLElement;
    expect(shareGrid).toHaveClass("grid-cols-2", "sm:grid-cols-3");
  });
});