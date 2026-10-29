/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { BadgeList } from "@/components/BadgeList";
import { UserBadgeProvider } from "@/components/UserBadgeProvider";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ rpc }) }));

afterEach(() => { cleanup(); rpc.mockReset(); });

describe("profile badges", () => {
  it("renders icon-only badges in stable order with accessible tooltip names", async () => {
    rpc.mockResolvedValue({ data: [
      { user_id: "u1", badge_id: "pawpass_month_2" },
      { user_id: "u1", badge_id: "staff_founder" },
      { user_id: "u1", badge_id: "staff_founder" },
    ], error: null });
    render(<UserBadgeProvider><BadgeList userId="u1" /></UserBadgeProvider>);
    await waitFor(() => expect(screen.getByRole("img", { name: "Founder" })).toBeTruthy());
    const list = screen.getByLabelText("Account badges");
    expect(list.getAttribute("class")).toContain("flex-wrap");
    expect(screen.getAllByRole("img").map((icon) => icon.getAttribute("aria-label"))).toEqual(["Founder", "PawPass Month 2"]);
    expect(screen.getByRole("img", { name: "PawPass Month 2" }).getAttribute("title")).toBe("PawPass Month 2");
    expect(list.textContent).not.toContain("Founder");
  });

  it("hides the row when the server returns no known badges", async () => {
    rpc.mockResolvedValue({ data: [{ user_id: "u2", badge_id: "internal_secret_role" }], error: null });
    render(<UserBadgeProvider><BadgeList userId="u2" /></UserBadgeProvider>);
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(screen.queryByLabelText("Account badges")).toBeNull();
  });
});
