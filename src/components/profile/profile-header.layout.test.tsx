/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { ProfileHeader } from "@/components/profile/profile-header";

const profile = {
  id: "u1",
  username: "blueybarks",
  display_name: "Bluey Barks",
  bio: "Hi there, Im Bluey Barks\nThe founder and developer of Afterfur~\nDiscord server; https://discord.gg/bSqevsZt2a",
  avatar_url: "https://example.com/avatar.png",
  banner_url: "https://example.com/banner.png",
  website: "https://example.com",
  location: "The Internet",
  pronouns: null,
  created_at: "2024-01-01T00:00:00Z",
  profile_customisation: null,
  profile_links: [],
};

const renderHeader = (user = { id: "u2" }) =>
  render(
    <ProfileHeader
      profile={profile}
      isSelf={user.id === profile.id}
      isFollowing={false}
      followerCount={1}
      followingCount={3}
      onFollow={() => {}}
      user={user}
    />,
  );

describe("ProfileHeader layout", () => {
  afterEach(() => {
    cleanup();
  });
  it("renders a full-width banner with object-cover and predictable height", () => {
    const { container } = renderHeader();
    const banner = container.querySelector("img[src='https://example.com/banner.png']");
    expect(banner).toHaveClass("h-48");
    expect(banner).toHaveClass("sm:h-64");
    expect(banner).toHaveClass("w-full");
    expect(banner).toHaveClass("object-cover");
  });

  it("renders an oversized avatar overlapping the banner bottom edge", () => {
    const { container } = renderHeader();
    const avatarImg = container.querySelector('img[src="https://example.com/avatar.png"]');
    expect(avatarImg).not.toBeNull();
    const wrap = container.querySelector("span.af-avatar");
    expect(wrap).not.toBeNull();
    expect(wrap).toHaveClass("ring-2");
    expect(wrap).toHaveClass("ring-af-border");
    expect(wrap).toHaveClass("rounded-full");
    expect(wrap?.getAttribute("style")).toContain("width: 80px");
    expect(wrap?.getAttribute("style")).toContain("height: 80px");
    expect(container.innerHTML).toContain("mt-[-2.5rem]");
  });

  it("does not pull the whole content block into the banner", () => {
    const { container } = renderHeader();
    expect(container.innerHTML).not.toContain("-mt-20");
    expect(container.innerHTML).not.toContain("-mt-26");
    expect(container.querySelector('[class*="pt-3"]')).not.toBeNull();
  });

  it("renders display name, username, bio, metadata and counts", () => {
    const { container, getByText, getByRole } = renderHeader();
    expect(getByText("Bluey Barks")).toBeInTheDocument();
    expect(getByText("@blueybarks")).toBeInTheDocument();
    expect(container.querySelector("p")?.textContent).toContain("Hi there, Im Bluey Barks");
    expect(getByText(/The Internet/)).toBeInTheDocument();
    expect(getByText("3")).toBeInTheDocument();
    expect(getByText("Following")).toBeInTheDocument();
    expect(getByText("1")).toBeInTheDocument();
    expect(getByText("Followers")).toBeInTheDocument();
    expect(getByRole("button", { name: "Follow" })).toBeInTheDocument();
  });

  it("aligns actions with justify-between on wider screens", () => {
    const { container } = renderHeader();
    const actions = container.querySelector('[class*="justify-between"]');
    expect(actions).not.toBeNull();
  });

  it("renders Edit profile link instead of Follow for own profile", () => {
    const { getByRole, queryByRole } = renderHeader({ id: "u1" });
    expect(queryByRole("button", { name: "Follow" })).toBeNull();
    expect(getByRole("link", { name: "Edit profile" })).toBeInTheDocument();
  });
});
