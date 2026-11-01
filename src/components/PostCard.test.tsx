/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
