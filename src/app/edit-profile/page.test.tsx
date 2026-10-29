/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import EditProfile from "@/app/edit-profile/page";

const rpc = vi.hoisted(() => vi.fn());

let profileData: Record<string, unknown>;
let maybeSingleCallCount = 0;

function buildSupabase() {
  const maybeSingle = vi.fn().mockImplementation(async () => {
    maybeSingleCallCount += 1;
    if (maybeSingleCallCount === 1) {
      return { data: profileData, error: null };
    }
    return { data: null, error: null };
  });
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          ilike: () => ({
            neq: () => ({ maybeSingle }),
          }),
          neq: () => ({ maybeSingle }),
          maybeSingle,
        }),
        ilike: () => ({
          neq: () => ({ maybeSingle }),
          maybeSingle,
        }),
        neq: () => ({ maybeSingle }),
        maybeSingle,
      }),
      update: () => ({
        eq: async () => ({ data: null, error: null }),
      }),
    }),
    rpc,
  };
}

vi.mock("@/lib/supabase/client", () => ({
  createClient: buildSupabase,
}));

vi.mock("@/components/AuthProvider", () => ({
  useAuth: vi.fn(),
}));

const { useAuth } = await import("@/components/AuthProvider");

afterEach(() => { cleanup(); });

beforeEach(() => {
  profileData = {
    id: "u1",
    username: "existinguser",
    display_name: "Existing User",
    bio: "Existing bio.",
    location: "Somewhere",
    website: "https://example.com",
    avatar_url: null,
    banner_url: null,
  };
  maybeSingleCallCount = 0;
  (useAuth as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue({
    user: { id: "u1", app_metadata: {} },
  });
});

describe("Edit Profile page", () => {
  it("renders the profile editing form", () => {
    render(<EditProfile />);
    expect(screen.getByRole("heading", { name: /Edit profile/i })).toBeTruthy();
    expect(screen.getByLabelText(/Choose profile avatar image/i)).toBeTruthy();
    expect(screen.getByLabelText(/Choose profile banner image/i)).toBeTruthy();
    expect(screen.getByLabelText(/Username/i)).toBeTruthy();
    expect(screen.getByLabelText(/Display name/i)).toBeTruthy();
    expect(screen.getByLabelText(/Bio/i)).toBeTruthy();
    expect(screen.getByLabelText(/Location/i)).toBeTruthy();
    expect(screen.getByLabelText(/Website/i)).toBeTruthy();
  });

  it("prefills existing profile values", async () => {
    render(<EditProfile />);
    await waitFor(() => {
      expect((screen.getByLabelText(/Username/i) as HTMLInputElement).value).toBe("existinguser");
    });
    expect((screen.getByLabelText(/Display name/i) as HTMLInputElement).value).toBe("Existing User");
    expect((screen.getByLabelText(/Bio/i) as HTMLTextAreaElement).value).toBe("Existing bio.");
    expect((screen.getByLabelText(/Location/i) as HTMLInputElement).value).toBe("Somewhere");
    expect((screen.getByLabelText(/Website/i) as HTMLInputElement).value).toBe("https://example.com");
  });

  it("renders Save and Cancel controls", () => {
    render(<EditProfile />);
    expect(screen.getByRole("button", { name: /Save/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Cancel/i })).toBeTruthy();
  });

  it("Cancel discards unsaved changes", async () => {
    render(<EditProfile />);
    await waitFor(() => {
      expect((screen.getByLabelText(/Username/i) as HTMLInputElement).value).toBe("existinguser");
    });
    const usernameInput = screen.getByLabelText(/Username/i) as HTMLInputElement;
    fireEvent.input(usernameInput, { target: { value: "changeduser" } });
    expect(usernameInput.value).toBe("changeduser");
    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));
    await waitFor(() => {
      expect(usernameInput.value).toBe("existinguser");
    });
  });

  it("Save persists changes through the existing architecture", async () => {
    render(<EditProfile />);
    await waitFor(() => {
      expect((screen.getByLabelText(/Username/i) as HTMLInputElement).value).toBe("existinguser");
    });
    const usernameInput = screen.getByLabelText(/Username/i) as HTMLInputElement;
    fireEvent.input(usernameInput, { target: { value: "newusername" } });
    fireEvent.click(screen.getByRole("button", { name: /Save/i }));
    await waitFor(() => {
      expect(screen.getByText(/Profile saved./)).toBeTruthy();
    });
  });
});
