/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ProfileFeed } from "@/components/profile/profile-feed";
import { ProfileHeader } from "@/components/profile/profile-header";
import type { ProfileHeaderProps } from "@/components/profile/profile-types";

vi.mock("@/components/PostCard", () => ({
  default: ({ post, repostedBy }: { post: { id: string; content: string; profiles?: { username: string; display_name: string | null; avatar_url: string | null } | null }; repostedBy?: string | null }) => (
    <div data-testid="post-card" data-postid={post.id} data-repostedby={repostedBy ?? ""}>
      <div data-testid="author-name">{post.profiles?.display_name ?? "unknown"}</div>
      <div data-testid="author-username">@{post.profiles?.username ?? "unknown"}</div>
      <div data-testid="author-avatar" data-avatar={post.profiles?.avatar_url ?? ""} />
      {post.content}
      {repostedBy && <div data-testid="reposted-by">{repostedBy}</div>}
    </div>
  ),
}));

const makeProfile = (overrides: Partial<ProfileHeaderProps["profile"]> = {}): ProfileHeaderProps["profile"] => ({
  id: "u1",
  username: "profileowner",
  display_name: "Profile Owner",
  bio: "A bio here",
  avatar_url: "https://example.com/avatar1.png",
  banner_url: null,
  website: null,
  location: null,
  pronouns: null,
  created_at: "2024-01-01T00:00:00Z",
  ...overrides,
});

const authorProfile = { id: "u2", username: "originalauthor", display_name: "Original Author", avatar_url: "https://example.com/avatar2.png" };
const ownerProfile = makeProfile();

const likedPost = {
  id: "p1",
  content: "A liked post",
  created_at: new Date().toISOString(),
  author_id: "u2",
  media_urls: null,
  profiles: authorProfile,
};

const repostedPost = {
  id: "p2",
  content: "A reposted post",
  created_at: new Date().toISOString(),
  author_id: "u2",
  media_urls: null,
  profiles: authorProfile,
};

const replyPost = {
  id: "p3",
  content: "A reply",
  created_at: new Date().toISOString(),
  author_id: "u1",
  media_urls: null,
  profiles: ownerProfile,
};

beforeEach(() => {
  cleanup();
});
afterEach(() => {
  cleanup();
});

describe("ProfileFeed likes — correct author info", () => {
  it("renders the original post author's name (not unknown)", () => {
    render(<ProfileFeed tab="likes" posts={[]} replies={[]} reposts={[]} likes={[likedPost]} profile={ownerProfile} mediaFilter="all" setMediaFilter={() => {}} />);
    expect(screen.getByTestId("author-name")).toHaveTextContent("Original Author");
    expect(screen.queryByText("unknown")).not.toBeInTheDocument();
  });

  it("renders the original post author's username (not @unknown)", () => {
    render(<ProfileFeed tab="likes" posts={[]} replies={[]} reposts={[]} likes={[likedPost]} profile={ownerProfile} mediaFilter="all" setMediaFilter={() => {}} />);
    expect(screen.getByTestId("author-username")).toHaveTextContent("@originalauthor");
  });

  it("renders the original post author's avatar", () => {
    render(<ProfileFeed tab="likes" posts={[]} replies={[]} reposts={[]} likes={[likedPost]} profile={ownerProfile} mediaFilter="all" setMediaFilter={() => {}} />);
    expect(screen.getByTestId("author-avatar")).toHaveAttribute("data-avatar", "https://example.com/avatar2.png");
  });

  it("shows 'unknown' only when profiles are genuinely missing", () => {
    const postWithoutProfiles = { ...likedPost, profiles: null };
    render(<ProfileFeed tab="likes" posts={[]} replies={[]} reposts={[]} likes={[postWithoutProfiles]} profile={ownerProfile} mediaFilter="all" setMediaFilter={() => {}} />);
    expect(screen.getByTestId("author-name")).toHaveTextContent("unknown");
    expect(screen.getByTestId("author-username")).toHaveTextContent("@unknown");
  });
});

describe("ProfileFeed reposts — reposter + original author identity", () => {
  it("renders reposted-by label identifying the reposter", () => {
    render(<ProfileFeed tab="reposts" posts={[]} replies={[]} reposts={[repostedPost]} likes={[]} profile={ownerProfile} mediaFilter="all" setMediaFilter={() => {}} repostedByLabel="Profile Owner reposted" />);
    expect(screen.getByTestId("reposted-by")).toHaveTextContent("Profile Owner reposted");
  });

  it("renders the original post author's info alongside reposter identity", () => {
    render(<ProfileFeed tab="reposts" posts={[]} replies={[]} reposts={[repostedPost]} likes={[]} profile={ownerProfile} mediaFilter="all" setMediaFilter={() => {}} repostedByLabel="Profile Owner reposted" />);
    expect(screen.getByTestId("author-name")).toHaveTextContent("Original Author");
    expect(screen.getByTestId("author-username")).toHaveTextContent("@originalauthor");
  });
});

describe("ProfileFeed replies — correct author info", () => {
  it("renders the reply author's name", () => {
    render(<ProfileFeed tab="replies" posts={[]} replies={[replyPost]} reposts={[]} likes={[]} profile={ownerProfile} mediaFilter="all" setMediaFilter={() => {}} />);
    expect(screen.getByTestId("author-name")).toHaveTextContent("Profile Owner");
    expect(screen.getByTestId("author-username")).toHaveTextContent("@profileowner");
  });
});

describe("ProfileHeader — profile links display", () => {
  const profileWithLinks = makeProfile({
    bio: "A bio here",
    profile_links: [
      { id: "l1", url: "https://github.com/user", label: "My GitHub", display_order: 0 },
      { id: "l2", url: "https://patreon.com/user", label: null, display_order: 1 },
    ],
  });

  const profileWithoutLinks = makeProfile({ profile_links: null });

  it("renders profile links underneath the biography", () => {
    render(<ProfileHeader profile={profileWithLinks} isSelf={true} isFollowing={false} followerCount={1} followingCount={3} onFollow={() => {}} user={{ id: "u1" }} />);
    expect(screen.getByText("My GitHub")).toBeInTheDocument();
    expect(screen.getByText("Patreon")).toBeInTheDocument();
  });

  it("makes links clickable with safe rel attributes", () => {
    render(<ProfileHeader profile={profileWithLinks} isSelf={true} isFollowing={false} followerCount={1} followingCount={3} onFollow={() => {}} user={{ id: "u1" }} />);
    const links = screen.getAllByRole("link");
    const githubLink = links.find((l) => l.getAttribute("href") === "https://github.com/user");
    expect(githubLink).toBeTruthy();
    expect(githubLink).toHaveAttribute("target", "_blank");
    expect(githubLink).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("wraps multiple links without overflow", () => {
    render(<ProfileHeader profile={profileWithLinks} isSelf={true} isFollowing={false} followerCount={1} followingCount={3} onFollow={() => {}} user={{ id: "u1" }} />);
    const linkContainer = screen.getByText("My GitHub").closest('div[class*="flex-wrap"]');
    expect(linkContainer).toHaveClass("flex-wrap");
  });

  it("does not render links when profile_links is null", () => {
    render(<ProfileHeader profile={profileWithoutLinks} isSelf={true} isFollowing={false} followerCount={1} followingCount={3} onFollow={() => {}} user={{ id: "u1" }} />);
    expect(screen.queryByText("My GitHub")).not.toBeInTheDocument();
    expect(screen.queryByText("Patreon")).not.toBeInTheDocument();
  });

  it("truncates long link titles instead of breaking layout", () => {
    const longLinkProfile = makeProfile({
      profile_links: [{ id: "l3", url: "https://example.com", label: "A very long custom link title that should wrap and truncate", display_order: 0 }],
    });
    render(<ProfileHeader profile={longLinkProfile} isSelf={true} isFollowing={false} followerCount={1} followingCount={3} onFollow={() => {}} user={{ id: "u1" }} />);
    const titleEl = screen.getByText("A very long custom link title that should wrap and truncate");
    expect(titleEl).toHaveClass("truncate");
  });
});
