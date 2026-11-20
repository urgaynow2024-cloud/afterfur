/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Home from "@/app/page";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/AuthProvider";

const mockCreateClient = vi.mocked(createClient);
const mockUseAuth = vi.mocked(useAuth);

const USER_ID = "viewer-1";

type TestPost = {
  id: string;
  created_at: string;
  author_id: string;
  content: string;
};
type TestProfile = {
  id: string;
  is_private: boolean;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

const post = (overrides: Partial<TestPost> = {}): TestPost => ({
  id: overrides.id ?? "post-1",
  created_at: overrides.created_at ?? "2026-11-20T12:00:00Z",
  author_id: overrides.author_id ?? "author-1",
  content: overrides.content ?? "Hello",
  ...overrides,
});

let postRows: TestPost[] = [];
const setPostRows = (rows: TestPost[]) => { postRows = [...rows]; };

const profiles: TestProfile[] = [];
const blocks: { blocked_id: string }[] = [];
const follows: { following_id: string }[] = [];

function makeSupabaseClient() {
  const postChain = {
    select: () => postChain,
    or: () => postChain,
    order: () => postChain,
    limit: () => ({ data: postRows, error: null }),
  };
  const profileEq = { maybeSingle: async () => ({ data: null, error: null }) };
  const profileChain = {
    select: () => profileChain,
    limit: () => ({ data: profiles, error: null }),
    in: () => ({ data: profiles, error: null }),
    eq: () => profileEq,
    maybeSingle: async () => ({ data: null, error: null }),
  };
  return {
    setPostRows,
    from: (table: string) => {
      if (table === "posts") return postChain;
      if (table === "profiles") return profileChain;
      if (table === "blocks") return { select: () => ({ eq: () => Promise.resolve({ data: blocks, error: null }) }) };
      if (table === "follows") return { select: () => ({ eq: () => ({ data: follows, error: null }) }) };
      return { select: () => ({}) };
    },
  };
}

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(),
}));
vi.mock("@/lib/pawpass", () => ({
  loadMyMembershipStatus: vi.fn(async () => ({ status: null })),
}));
vi.mock("@/components/AuthProvider", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: vi.fn(() => ({ user: { id: USER_ID }, loading: false })),
}));
vi.mock("@/components/Shell", () => ({
  Shell: ({ children }: { children: React.ReactNode }) => <div data-testid="shell">{children}</div>,
  EmptyState: () => null,
  PageHeader: () => null,
}));
vi.mock("@/components/PostCard", () => ({
  default: ({ post }: { post: TestPost }) => (
    <div data-testid="post-card" data-post-id={post.id} data-author-id={post.author_id}>
      {post.content}
    </div>
  ),
}));
vi.mock("@/components/EmojiPicker", () => ({ default: () => null }));
vi.mock("next/link", () => ({
  default: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => (
    <a href={String(props.href)} {...props}>{children}</a>
  ),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mockCreateClient.mockReset();
  postRows = [];
  profiles.length = 0;
  blocks.length = 0;
  follows.length = 0;
  Object.defineProperty(window, "scrollY", { value: 0, writable: true, configurable: true });
  window.scrollTo = vi.fn();
});

function renderHome(user = { id: USER_ID }) {
  mockUseAuth.mockReturnValue({ user, loading: false } as any);
  const client = makeSupabaseClient();
  mockCreateClient.mockReturnValue(client as any);
  render(<Home />);
  return client;
}

describe("home feed", () => {
  it("loads the initial posts and shows no new-posts indicator", async () => {
    const client = renderHome();
    client.setPostRows([post({ id: "p1" }), post({ id: "p2", created_at: "2026-11-20T11:00:00Z" })]);

    await waitFor(() => expect(screen.getAllByTestId("post-card")).toHaveLength(2));
    expect(screen.queryByRole("button", { name: /new post/ })).not.toBeInTheDocument();
  });

  it("detects a newly available post and shows the indicator", async () => {
    const client = renderHome();
    client.setPostRows([post({ id: "p1" })]);
    await waitFor(() => expect(screen.getAllByTestId("post-card")).toHaveLength(1));

    client.setPostRows([post({ id: "p2", created_at: "2026-11-20T13:00:00Z" })]);
    fireEvent.focus(window);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /1 new post/ })).toBeInTheDocument();
    });
  });

  it("updates the count without double counting when more posts arrive", async () => {
    const client = renderHome();
    client.setPostRows([post({ id: "p1" })]);
    await waitFor(() => expect(screen.getAllByTestId("post-card")).toHaveLength(1));

    client.setPostRows([post({ id: "p2", created_at: "2026-11-20T13:00:00Z" })]);
    fireEvent.focus(window);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /1 new post/ })).toBeInTheDocument();
    });

    client.setPostRows([post({ id: "p3", created_at: "2026-11-20T14:00:00Z" })]);
    fireEvent.focus(window);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /2 new posts/ })).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /3 new posts/ })).not.toBeInTheDocument();
  });

  it("loads the latest posts without duplicating existing ones and clears the indicator", async () => {
    const client = renderHome();
    client.setPostRows([post({ id: "p1" })]);
    await waitFor(() => expect(screen.getAllByTestId("post-card")).toHaveLength(1));

    client.setPostRows([
      post({ id: "p1" }),
      post({ id: "p2", created_at: "2026-11-20T13:00:00Z" }),
    ]);
    fireEvent.focus(window);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /1 new post/ })).toBeInTheDocument();
    });

    const indicator = screen.getByRole("button", { name: /1 new post/ });
    fireEvent.click(indicator);
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /new post/ })).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getAllByTestId("post-card").map((c) => c.getAttribute("data-post-id") as string)).toEqual(["p2", "p1"]);
    });
  });

  it("preserves scroll position instead of resetting to the top when reading older posts", async () => {
    const scrollTo = vi.fn();
    Object.defineProperty(window, "scrollY", { value: 500, writable: true, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 800, writable: true, configurable: true });
    Object.defineProperty(document.documentElement, "scrollHeight", { value: 2000, writable: true, configurable: true });
    Object.defineProperty(window, "scrollTo", { value: scrollTo, writable: true, configurable: true });

    const client = renderHome();
    client.setPostRows([post({ id: "p1" })]);
    await waitFor(() => expect(screen.getAllByTestId("post-card")).toHaveLength(1));

    client.setPostRows([
      post({ id: "p1" }),
      post({ id: "p2", created_at: "2026-11-20T13:00:00Z" }),
    ]);
    fireEvent.focus(window);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /1 new post/ })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /1 new post/ }));
    await waitFor(() => {
      expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 500 }));
    });
  });

  it("does not render posts from private accounts the viewer does not follow", async () => {
    const client = renderHome();
    profiles.push({ id: "author-private", is_private: true, username: "private", display_name: "Private", avatar_url: null });
    client.setPostRows([post({ id: "p-private", author_id: "author-private" })]);

    await waitFor(() => {
      expect(screen.queryAllByTestId("post-card")).toHaveLength(0);
    });
    expect(screen.queryByText("Hello")).not.toBeInTheDocument();
  });

  it("does not render posts from blocked authors", async () => {
    const client = renderHome();
    blocks.push({ blocked_id: "author-blocked" });
    client.setPostRows([post({ id: "p-blocked", author_id: "author-blocked" })]);

    await waitFor(() => {
      expect(screen.queryAllByTestId("post-card")).toHaveLength(0);
    });
  });

  it("stops polling when the component unmounts", async () => {
    const setIntervalSpy = vi.spyOn(window, "setInterval");
    const clearIntervalSpy = vi.spyOn(window, "clearInterval");
    const client = renderHome();
    client.setPostRows([post({ id: "p1" })]);
    await waitFor(() => expect(screen.getAllByTestId("post-card")).toHaveLength(1));
    expect(setIntervalSpy).toHaveBeenCalled();

    cleanup();
    expect(clearIntervalSpy).toHaveBeenCalled();
    setIntervalSpy.mockRestore();
    clearIntervalSpy.mockRestore();
  });
});
