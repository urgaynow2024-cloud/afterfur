/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import FollowersPage from "@/app/[username]/followers/page";
import { useParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";

const mockCreateClient = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => mockCreateClient(),
}));
vi.mock("@/components/AuthProvider", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: vi.fn(() => ({ user: { id: "viewer-1" }, loading: false })),
}));
vi.mock("next/navigation", () => ({
  useParams: vi.fn(() => ({ username: "blueybarks" })),
  usePathname: vi.fn(() => "/"),
}));

const mockUseParams = vi.mocked(useParams);
const mockUseAuth = vi.mocked(useAuth);

const mockProfile = {
  id: "u1",
  username: "blueybarks",
  display_name: "Bluey",
  avatar_url: "https://example.com/avatar.png",
};

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  mockCreateClient.mockReset();
  mockUseParams.mockReturnValue({ username: "blueybarks" });
  mockUseAuth.mockReturnValue({ user: { id: "viewer-1" }, loading: false } as any);
  global.fetch = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ error: "not_mocked" }), { status: 500 }))) as any;
});

afterEach(() => {
  cleanup();
});

function mockFetchProfile(status: number, body: any) {
  global.fetch = vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status }))) as any;
}

function mockSupabase(followerIds: string[], profileRows: any[]) {
  const followsData = followerIds.map((id) => ({ follower_id: id, status: "accepted" }));
  const followsChain = {
    eq: vi.fn(() => followsChain),
    order: vi.fn(() => Promise.resolve({ data: followsData, error: null })),
    maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
  };
  mockCreateClient.mockReturnValue({
    from: vi.fn((table: string) => {
      if (table === "follows") {
        return {
          select: vi.fn(() => followsChain),
        };
      }
      return {
        select: vi.fn(() => ({
          in: vi.fn(() => Promise.resolve({ data: profileRows, error: null })),
        })),
      };
    }),
  } as any);
}

describe("FollowersPage", () => {
  it("shows loading state initially", () => {
    render(<FollowersPage />);
    expect(screen.getByLabelText(/Loading followers/)).toBeInTheDocument();
  });

  it("renders followers list after successful load", async () => {
    mockFetchProfile(200, { profile: mockProfile });
    mockSupabase(["f1", "f2"], [
      { id: "f1", username: "follower1", display_name: "Follower One", avatar_url: null },
      { id: "f2", username: "follower2", display_name: "Follower Two", avatar_url: "https://example.com/f2.png" },
    ]);

    render(<FollowersPage />);
    await waitFor(() => {
      expect(screen.getByText(/Follower One/)).toBeInTheDocument();
    });
    expect(screen.getByText(/Follower Two/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Loading followers/)).not.toBeInTheDocument();
  });

  it("shows empty state when no followers", async () => {
    mockFetchProfile(200, { profile: mockProfile });
    mockSupabase([], []);

    render(<FollowersPage />);
    await waitFor(() => {
      expect(screen.getByText(/No followers/)).toBeInTheDocument();
    });
  });

  it("shows private profile error for 403", async () => {
    mockFetchProfile(403, { error: "forbidden" });

    render(<FollowersPage />);
    await waitFor(() => {
      expect(screen.getByText(/Private profile/)).toBeInTheDocument();
    });
  });

  it("shows not found error for 404", async () => {
    mockFetchProfile(404, { error: "not_found" });

    render(<FollowersPage />);
    await waitFor(() => {
      expect(screen.getByText(/Profile not found/)).toBeInTheDocument();
    });
  });
});
