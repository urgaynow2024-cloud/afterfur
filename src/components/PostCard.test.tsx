/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PostCard from "@/components/PostCard";

const interactions = vi.hoisted(() => ({
  userId: "user-1",
  ready: true,
  available: true,
  liked: vi.fn(() => false),
  bookmarked: vi.fn(() => false),
  reposted: vi.fn(() => false),
  pending: vi.fn(() => false),
  toggle: vi.fn(async () => ({ active: true, error: null })),
  errorFor: vi.fn(() => null),
  likeCount: vi.fn(() => 2),
  repostCount: vi.fn(() => 0),
  replyCount: vi.fn(() => 0),
  requestLikeCount: vi.fn(),
  requestRepostCount: vi.fn(),
  requestReplyCount: vi.fn(),
}));

vi.mock("@/components/PostInteractionProvider", () => ({ usePostInteractions: () => interactions }));
vi.mock("@/lib/media-url-state", () => ({
  useResolvedMediaUrls: (urls: string[] | null) => ({
    items: (urls ?? []).map((url) => ({ original: url, resolved: url, loading: false, error: false })),
    loading: false,
  }),
}));
vi.mock("next/link", () => ({ default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => <a href={href} {...props}>{children}</a> }));

const post = {
  id: "post-1",
  content: "A real post",
  created_at: "2026-10-29T12:00:00Z",
  author_id: "author-1",
  profiles: { username: "artist", display_name: "Artist", avatar_url: null },
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("shared post action counts", () => {
  it("renders accurate zero and nonzero reply, like, and repost counts", () => {
    render(<PostCard post={post} />);
    expect(screen.getByRole("link", { name: /0 replies/ })).toBeTruthy();
    const likeButton = screen.getByRole("button", { name: /2 likes/ });
    expect(within(likeButton).getByText("2")).toBeTruthy();
    const repostButton = screen.getByRole("button", { name: /0 reposts/ });
    expect(within(repostButton).getByText("0")).toBeTruthy();
    expect(interactions.requestRepostCount).toHaveBeenCalledWith("post-1");
    expect(interactions.requestReplyCount).toHaveBeenCalledWith("post-1");
  });

  it("dispatches repost through the shared persisted-interaction handler", () => {
    render(<PostCard post={post} />);
    fireEvent.click(screen.getByRole("button", { name: /Repost Artist's post/ }));
    expect(interactions.toggle).toHaveBeenCalledWith("reposts", "post-1", "author-1");
  });

  it("renders the returned reply aggregate for the same shared card on every route", () => {
    interactions.replyCount.mockReturnValue(6);
    render(<PostCard post={post} />);
    expect(screen.getByRole("link", { name: /6 replies/ })).toBeTruthy();
  });

  it("opens the AfterFur ShareDialog with the exact post permalink, copies link, shares externally, and closes cleanly without navigator.share", async () => {
    interactions.userId = "user-1";
    interactions.available = true;
    const { container: base } = render(<PostCard post={post} />);
    const shareSpy = vi.fn();
    Object.assign(navigator, {
      share: shareSpy,
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    expect(screen.queryByRole("dialog", { name: /Share post/i })).toBeNull();

    const shareButton = within(base).getByRole("button", { name: /Share Artist's post/i });
    fireEvent.click(shareButton);

    const dialog = screen.getByRole("dialog", { name: /Share post/i });
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-modal", "true");

    const permalinkInput = within(dialog).getByLabelText("Post permalink") as HTMLInputElement;
    expect(permalinkInput.value).toContain("/artist/status/post-1");
    expect(permalinkInput.value).not.toBe("http://localhost:3000/");

    fireEvent.click(within(dialog).getByRole("button", { name: "Copy link" }));
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(permalinkInput.value);
      expect(within(dialog).getByRole("status")).toHaveTextContent("Link copied to clipboard!");
    });

    fireEvent.click(within(dialog).getByRole("button", { name: "Facebook" }));
    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining(encodeURIComponent(permalinkInput.value)),
      "_blank",
      "noopener,noreferrer",
    );

    fireEvent.click(within(dialog).getByRole("button", { name: "QR code" }));
    expect(within(dialog).getByRole("img", { name: `QR code for ${permalinkInput.value}` })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: /Share post/i })).toBeNull();
    expect(shareSpy).not.toHaveBeenCalled();

    fireEvent.click(shareButton);
    fireEvent.click(screen.getByRole("dialog", { name: /Share post/i }));
    expect(screen.queryByRole("dialog", { name: /Share post/i })).toBeNull();
  });
});

describe("shared post content rendering", () => {
  it("renders links, mentions and hashtags inside post content", () => {
    render(<PostCard post={{ ...post, content: "See https://example.com and @artist #VRChat!" }} />);
    expect(screen.getByRole("link", { name: "https://example.com" })).toBeTruthy();
    const mention = screen.getByRole("link", { name: "@artist" });
    expect(mention).toHaveAttribute("href", "/artist");
    const hashtag = screen.getByRole("link", { name: "#VRChat" });
    expect(hashtag).toHaveAttribute("href", "/search?q=%23VRChat");
  });
});

describe("post pinning", () => {
  function openOptionsMenu(container: HTMLElement) {
    const menuButton = within(container).getByRole("button", { name: /Post options for Artist's post/ });
    fireEvent.click(menuButton);
  }

  it("does not show the pin option on another author's post", () => {
    const { container } = render(<PostCard post={post} />); // author_id "author-1" !== interactions userId "user-1"
    openOptionsMenu(container);
    expect(screen.queryByRole("menuitem", { name: /Pin to profile/ })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: /Unpin from profile/ })).toBeNull();
  });

  it("shows the pin option on the author's own post", () => {
    const { container } = render(<PostCard post={{ ...post, author_id: "user-1", is_pinned: false }} />);
    openOptionsMenu(container);
    expect(screen.getByRole("menuitem", { name: /Pin to profile/ })).toBeInTheDocument();
  });

  it("shows the unpin option when the author's post is already pinned", () => {
    const { container } = render(<PostCard post={{ ...post, author_id: "user-1", is_pinned: true }} />);
    openOptionsMenu(container);
    expect(screen.getByRole("menuitem", { name: /Unpin from profile/ })).toBeInTheDocument();
  });

  it("renders a subtle pinned indicator on a pinned post", () => {
    render(<PostCard post={{ ...post, author_id: "user-1", is_pinned: true }} />);
    expect(screen.getByText("Pinned")).toBeInTheDocument();
  });

  it("does not render a pinned indicator on an unpinned post", () => {
    render(<PostCard post={{ ...post, author_id: "user-1", is_pinned: false }} />);
    expect(screen.queryByText("Pinned")).toBeNull();
  });
});
