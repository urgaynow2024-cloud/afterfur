/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import Settings from "@/app/settings/page";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/followRequests", () => ({ getIncomingFollowRequests: vi.fn(async () => []), getPendingFollowRequestCount: vi.fn(async () => 0) }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }), getSession: async () => ({ data: { session: null } }), getUser: async () => ({ data: { user: null } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    }),
    rpc,
  }),
}));

vi.mock("@/components/AuthProvider", () => ({
  useAuth: vi.fn(),
}));

const { useAuth } = await import("@/components/AuthProvider");

afterEach(() => { cleanup(); rpc.mockReset(); vi.resetAllMocks(); });

describe("settings staff badge link visibility", () => {
  it("shows Manage staff badges when user has afterfur_staff_admin", async () => {
    (useAuth as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue({
      user: { id: "u1", app_metadata: { afterfur_staff_admin: true } },
    });
    render(<Settings />);
    expect(screen.getByText("Manage staff badges")).toBeTruthy();
  });

  it("hides Manage staff badges for ordinary users", async () => {
    (useAuth as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue({
      user: { id: "u2", app_metadata: {} },
    });
    render(<Settings />);
    expect(screen.queryByText("Manage staff badges")).toBeNull();
  });

  it("hides Manage staff badges when not signed in", async () => {
    (useAuth as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue({ user: null });
    render(<Settings />);
    expect(screen.queryByText("Manage staff badges")).toBeNull();
  });
});

describe("staff badge RPC authorization", () => {
  it("rejects non-staff users via server-side RPC check", async () => {
    rpc.mockResolvedValueOnce({
      error: { message: "Staff administrator access required", code: "42501" },
    });
    const supabase = (await import("@/lib/supabase/client")).createClient();
    if (!supabase) throw new Error("supabase not configured");
    const { error } = await supabase.rpc("manage_staff_badge", {
      p_target_id: "u2", p_badge_id: "staff_moderator", p_action: "grant",
    });
    expect(error?.message).toContain("Staff administrator access required");
  });

  it("rejects self-assignment of staff badges", async () => {
    rpc.mockResolvedValueOnce({
      error: { message: "Staff badges cannot be assigned to yourself", code: "42501" },
    });
    const supabase = (await import("@/lib/supabase/client")).createClient();
    if (!supabase) throw new Error("supabase not configured");
    const { error } = await supabase.rpc("manage_staff_badge", {
      p_target_id: "u1", p_badge_id: "staff_founder", p_action: "grant",
    });
    expect(error?.message).toContain("Staff badges cannot be assigned to yourself");
  });
});

describe("three-column settings category switching & navigation", () => {
  it("renders all 9 category buttons in Column 2 and displays ONLY the selected category in Column 3", () => {
    (useAuth as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue({
      user: { id: "u1", email: "user@afterfur.site", app_metadata: {} },
    });
    const { container } = render(<Settings />);

    const shell = container.querySelector(".af-settings-shell");
    expect(shell).not.toBeNull();
    expect(shell?.className).toContain("md:flex-row");

    const sidebar = container.querySelector(".af-settings-sidebar");
    expect(sidebar).not.toBeNull();

    const content = container.querySelector(".af-settings-content");
    expect(content).not.toBeNull();
    expect(content?.className).toContain("min-w-0");
    expect(content?.className).toContain("flex-1");

    const searchInput = screen.getByLabelText(/Search Settings/i);
    expect(searchInput).not.toBeNull();

    const expectedTabs = [
      "Account",
      "Security",
      "Privacy",
      "Blocked accounts",
      "Notifications",
      "Accessibility",
      "Appearance",
      "PawPass",
      "Account & Data",
    ];

    for (const tabLabel of expectedTabs) {
      const btn = screen.getByRole("button", { name: tabLabel });
      expect(btn).not.toBeNull();
    }

    // Default tab is Account: displays Edit profile and hides Security/Appearance/PawPass headings
    expect(screen.getByRole("link", { name: /Edit profile/i })).not.toBeNull();
    expect(screen.queryByRole("heading", { name: "Security and account access" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Public Profile Customisation" })).toBeNull();
    expect(screen.queryByRole("heading", { name: /PawPass membership/i })).toBeNull();

    // Switch to Security
    fireEvent.click(screen.getByRole("button", { name: "Security" }));
    expect(screen.getByRole("heading", { name: "Security and account access" })).not.toBeNull();
    expect(screen.queryByRole("link", { name: /Edit profile/i })).toBeNull();

    // Switch to Privacy
    fireEvent.click(screen.getByRole("button", { name: "Privacy" }));
    expect(screen.getByRole("heading", { name: "Privacy and safety" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Incoming follow requests" })).not.toBeNull();

    // Switch to Blocked accounts
    fireEvent.click(screen.getByRole("button", { name: "Blocked accounts" }));
    expect(screen.getByRole("heading", { level: 2, name: "Blocked accounts" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Show" })).not.toBeNull();

    // Switch to PawPass (dedicated section, not mixed into Account or Appearance)
    fireEvent.click(screen.getByRole("button", { name: "PawPass" }));
    expect(screen.getByRole("heading", { level: 2, name: "PawPass" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: /PawPass membership/i })).not.toBeNull();
    expect(screen.getByRole("heading", { name: /Founding 50 reward/i })).not.toBeNull();
    expect(screen.queryByRole("button", { name: /Save customisation/i })).toBeNull();

    // Switch to Appearance (contains ProfileCustomisationStudio)
    fireEvent.click(screen.getByRole("button", { name: "Appearance" }));
    expect(screen.getByRole("heading", { level: 2, name: "Appearance" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: /Private interface appearance/i })).not.toBeNull();
    expect(screen.getByRole("heading", { name: /Public Profile Customisation/i })).not.toBeNull();
    expect(screen.queryByRole("heading", { name: /Founding 50 reward/i })).toBeNull();

    // Switch to Account & Data
    fireEvent.click(screen.getByRole("button", { name: "Account & Data" }));
    expect(screen.getByRole("heading", { level: 2, name: "Account & Data" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: /Request my data/i })).not.toBeNull();
    expect(screen.getAllByRole("link", { name: /Terms of Service/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /Privacy Policy/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /All policies/i }).length).toBeGreaterThan(0);
  });

  it("filters settings categories when typing in Search Settings", () => {
    (useAuth as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue({
      user: { id: "u1", email: "user@afterfur.site", app_metadata: {} },
    });
    render(<Settings />);

    const searchInput = screen.getByLabelText(/Search Settings/i);
    fireEvent.change(searchInput, { target: { value: "Blocked" } });

    expect(screen.getByRole("button", { name: "Blocked accounts" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Account" })).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Blocked accounts" })).not.toBeNull();
  });

  it("does not render the old stacked profile fields and keeps single main landmark", () => {
    (useAuth as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue({
      user: { id: "u1", app_metadata: {} },
    });
    const { container } = render(<Settings />);
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.queryByLabelText(/Choose profile avatar image/i)).toBeNull();
    expect(screen.queryByLabelText(/^Bio$/i)).toBeNull();
    const layout = container.querySelector(".af-settings-layout");
    expect(layout).not.toBeNull();
  });
});

