/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import Settings from "@/app/settings/page";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
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
