/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ProfileFeed } from "@/components/profile/profile-feed";
import type { ProfileTab, ProfileMediaFilter } from "@/components/profile/profile-types";

vi.mock("@/components/PostCard", () => ({
  default: ({ post, repostedBy }: { post: { id: string; content: string }; repostedBy?: string | null }) => (
    <div data-testid="post-card" data-postid={post.id} data-repostedby={repostedBy ?? ""}>
      {post.content}
    </div>
  ),
}));

const profile = { id: "u1", username: "alex", display_name: "Alex", avatar_url: null };
const post = { id: "p1", content: "Hello world", created_at: new Date().toISOString(), author_id: "u1", media_urls: null, profiles: null };

beforeEach(() => {
  cleanup();
});
afterEach(() => {
  cleanup();
});

describe("ProfileFeed reposts", () => {
  it("renders reposts with the profile owner as the reposting identity", () => {
    render(<ProfileFeed tab="reposts" posts={[]} replies={[]} reposts={[post]} likes={[]} profile={profile} mediaFilter="all" setMediaFilter={() => {}} repostedByLabel="Alex reposted" />);
    const card = screen.getByTestId("post-card");
    expect(card).toHaveAttribute("data-repostedby", "Alex reposted");
    expect(card).toHaveTextContent("Hello world");
  });

  it("shows empty state when there are no reposts", () => {
    render(<ProfileFeed tab="reposts" posts={[]} replies={[]} reposts={[]} likes={[]} profile={profile} mediaFilter="all" setMediaFilter={() => {}} repostedByLabel="Alex reposted" />);
    expect(screen.getByText(/No reposts yet/)).toBeTruthy();
  });
});

describe("ProfileFeed replies", () => {
  it("renders replies authored by the profile owner", () => {
    const reply = { ...post, id: "r1", content: "Great post!" };
    render(<ProfileFeed tab="replies" posts={[]} replies={[reply]} reposts={[]} likes={[]} profile={profile} mediaFilter="all" setMediaFilter={() => {}} />);
    expect(screen.getByText(/Great post!/)).toBeTruthy();
  });

  it("shows empty state when there are no replies", () => {
    render(<ProfileFeed tab="replies" posts={[]} replies={[]} reposts={[]} likes={[]} profile={profile} mediaFilter="all" setMediaFilter={() => {}} />);
    expect(screen.getByText(/No replies yet/)).toBeTruthy();
  });
});

describe("ProfileFeed media filter", () => {
  it("renders the media grid and filter buttons", () => {
    const withMedia = { ...post, id: "m1", media_urls: ["https://example.com/photo.png", "https://example.com/clip.mp4"] };
    render(<ProfileFeed tab="media" posts={[withMedia]} replies={[]} reposts={[]} likes={[]} profile={profile} mediaFilter="all" setMediaFilter={() => {}} />);
    expect(screen.getByText(/photos/)).toBeTruthy();
    expect(screen.getByText(/gifs/)).toBeTruthy();
    expect(screen.getByText(/videos/)).toBeTruthy();
  });
});

describe("ProfileFeed likes", () => {
  it("renders liked posts", () => {
    render(<ProfileFeed tab="likes" posts={[]} replies={[]} reposts={[]} likes={[post]} profile={profile} mediaFilter="all" setMediaFilter={() => {}} />);
    expect(screen.getByText(/Hello world/)).toBeTruthy();
  });

  it("shows empty state when there are no likes", () => {
    render(<ProfileFeed tab="likes" posts={[]} replies={[]} reposts={[]} likes={[]} profile={profile} mediaFilter="all" setMediaFilter={() => {}} />);
    expect(screen.getByText(/No likes yet/)).toBeTruthy();
  });
});

describe("ProfileFeed tab separation", () => {
  it("keeps replies out of the reposts tab", () => {
    const reply = { ...post, id: "r1", content: "Reply text" };
    render(<ProfileFeed tab="reposts" posts={[]} replies={[reply]} reposts={[post]} likes={[]} profile={profile} mediaFilter="all" setMediaFilter={() => {}} repostedByLabel="Alex reposted" />);
    expect(screen.getByText(/Hello world/)).toBeTruthy();
    expect(screen.queryByText(/Reply text/)).not.toBeInTheDocument();
  });

  it("keeps reposts out of the replies tab", () => {
    const repost = { ...post, id: "x1", content: "Reposted content" };
    render(<ProfileFeed tab="replies" posts={[]} replies={[post]} reposts={[repost]} likes={[]} profile={profile} mediaFilter="all" setMediaFilter={() => {}} />);
    expect(screen.getByText(/Hello world/)).toBeTruthy();
    expect(screen.queryByText(/Reposted content/)).not.toBeInTheDocument();
  });
});
