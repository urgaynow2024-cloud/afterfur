/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReportDetailPanel from "@/components/moderation/ReportDetailPanel";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("@/lib/authHeaders", () => ({
  getAuthHeaders: vi.fn(async () => ({})),
}));

const detail = {
  ok: true,
  report: {
    id: "11111111-1111-1111-1111-111111111111",
    reporterId: "user-1",
    targetType: "post",
    targetId: "post-1",
    reason: "harassment",
    description: "Reporter says this is abusive.",
    status: "pending",
    reviewedBy: null,
    reviewedAt: null,
    assignedTo: null,
    assignedAt: null,
    createdAt: "2024-01-01T00:00:00Z",
    priority: { level: "high", label: "High", rank: 3 },
  },
  reporter: { id: "user-1", username: "reporter1", display_name: "Reporter One", avatar_url: null },
  reportedUser: { id: "user-2", username: "reporteduser", display_name: "Reported User", avatar_url: null },
  targetContent: { type: "post", id: "post-1", author_id: "user-2", content: "Reported post body", created_at: "2024-01-01T00:00:00Z", media_urls: [] },
  assignee: null,
  reviewer: null,
  notes: [{ id: "n-1", reportId: "r-1", authorId: "mod-1", authorUsername: "mod1", authorDisplayName: "Mod One", body: "Internal note body", createdAt: "2024-01-02T00:00:00Z" }],
  actions: [{ id: "a-1", actorId: "mod-1", actorUsername: "mod1", actorDisplayName: "Mod One", targetType: "report", targetId: "r-1", action: "assign_report", details: null, beforeState: null, afterState: null, createdAt: "2024-01-02T00:00:00Z" }],
};

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (String(url).includes("/assignable")) {
      return { ok: true, status: 200, json: async () => ({ moderators: [{ id: "mod-2", username: "mod2", displayName: "Mod Two", role: "moderator" }] }) };
    }
    if (init?.method === "POST" && String(url).endsWith("/r-1")) {
      return { ok: true, status: 200, json: async () => ({ ok: true, note: { id: "n-2", reportId: "r-1", authorId: "mod-1", body: "Fresh note", createdAt: "2024-01-03T00:00:00Z" } }) };
    }
    return { ok: true, status: 200, json: async () => detail };
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ReportDetailPanel", () => {
  it("loads and renders report details, reporter, target, notes and history", async () => {
    render(<ReportDetailPanel reportId="r-1" currentUserId="mod-1" onClose={() => {}} onChanged={() => {}} />);

    expect(await screen.findByText("Internal note body")).toBeInTheDocument();
    expect(screen.getByText("Reporter says this is abusive.")).toBeInTheDocument();
    expect(screen.getByText("Reported post body")).toBeInTheDocument();
    expect(screen.getAllByText("Reporter One").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Reported User").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Resolved|Assign/i).length).toBeGreaterThan(0);
  });

  it("adds an internal note", async () => {
    render(<ReportDetailPanel reportId="r-1" currentUserId="mod-1" onClose={() => {}} onChanged={() => {}} />);

    const textarea = await screen.findByLabelText("Internal note");
    fireEvent.change(textarea, { target: { value: "Fresh note" } });
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
      expect(call).toBeTruthy();
      expect(JSON.parse(String(call![1]!.body))).toMatchObject({ note: "Fresh note" });
    });
  });

  it("requires a reason before resolving", async () => {
    render(<ReportDetailPanel reportId="r-1" currentUserId="mod-1" onClose={() => {}} onChanged={() => {}} />);

    fireEvent.click(await screen.findByRole("button", { name: "Resolve" }));
    const confirm = await screen.findByRole("button", { name: "Confirm resolve" });
    expect(confirm).toBeDisabled();
  });
});