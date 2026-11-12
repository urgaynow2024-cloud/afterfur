/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { BadgeList } from "@/components/BadgeList";
import { UserBadgeProvider } from "@/components/UserBadgeProvider";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ rpc }) }));

afterEach(() => { cleanup(); rpc.mockReset(); });

describe("profile badges", () => {
  it("renders compact badges in stable order with accessible tooltip names", async () => {
    rpc.mockResolvedValue({ data: [
      { user_id: "u1", badge_id: "pawpass_month_2" },
      { user_id: "u1", badge_id: "staff_founder" },
      { user_id: "u1", badge_id: "staff_founder" },
    ], error: null });
    render(<UserBadgeProvider><BadgeList userId="u1" /></UserBadgeProvider>);
    await waitFor(() => expect(screen.getByRole("img", { name: "Founder" })).toBeTruthy());
    expect(screen.getAllByRole("img").map((icon) => icon.getAttribute("aria-label"))).toEqual(["Founder", "PawPass Month 2"]);
    expect(screen.getByRole("img", { name: "PawPass Month 2" }).getAttribute("title")).toBe("PawPass Month 2");
  });

  it("hides the row when the server returns no known badges", async () => {
    rpc.mockResolvedValue({ data: [{ user_id: "u2", badge_id: "internal_secret_role" }], error: null });
    render(<UserBadgeProvider><BadgeList userId="u2" /></UserBadgeProvider>);
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("collapses additional badges behind a +N indicator", async () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ user_id: "u3", badge_id: `pawpass_month_${i + 1}` }));
    rpc.mockResolvedValue({ data: many, error: null });
    render(<UserBadgeProvider><BadgeList userId="u3" /></UserBadgeProvider>);
    await waitFor(() => expect(screen.getByRole("button", { name: /7 more badges/ })).toBeTruthy());
    const more = screen.getByRole("button", { name: /7 more badges/ });
    expect(more.textContent).toBe("+7");
  });
});