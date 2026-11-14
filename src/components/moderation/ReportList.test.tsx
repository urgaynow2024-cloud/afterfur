/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ReportList from "@/components/moderation/ReportList";
import type { ReportListItem } from "@/components/moderation/reportTypes";

const report: ReportListItem = {
  id: "11111111-1111-1111-1111-111111111111",
  reporter_id: "u1",
  target_type: "post",
  target_id: "22222222-2222-2222-2222-222222222222",
  reason: "harassment",
  description: "This user is harassing others.",
  status: "reviewed",
  reviewed_by: null,
  reviewed_at: null,
  assigned_to: "mod-1",
  assigned_at: "2024-01-01T00:00:00Z",
  created_at: "2024-01-01T00:00:00Z",
  reporter_username: "reporter1",
  reporter_display_name: "Reporter One",
  reporter_avatar_url: null,
  assignee_username: "mod1",
  assignee_display_name: "Mod One",
  priority: { level: "high", label: "High", rank: 3 },
};

afterEach(cleanup);

describe("ReportList", () => {
  it("shows a loading state", () => {
    render(<ReportList reports={[]} loading onOpen={() => {}} />);
    expect(screen.getByText(/loading reports/i)).toBeInTheDocument();
  });

  it("shows an empty state", () => {
    render(<ReportList reports={[]} loading={false} onOpen={() => {}} emptyTitle="No matching reports" emptyBody="Try filters." />);
    expect(screen.getByText("No matching reports")).toBeInTheDocument();
    expect(screen.getByText("Try filters.")).toBeInTheDocument();
  });

  it("renders report reason, status, priority and assignee", () => {
    render(<ReportList reports={[report]} loading={false} onOpen={() => {}} />);
    expect(screen.getAllByText("Harassment or bullying").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Under review").length).toBeGreaterThan(0);
    expect(screen.getAllByText("High priority").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Mod One").length).toBeGreaterThan(0);
  });

  it("invokes onOpen when a row is activated", () => {
    const onOpen = vi.fn();
    const { container } = render(<ReportList reports={[report]} loading={false} onOpen={onOpen} />);
    const row = container.querySelector("tbody tr");
    expect(row).not.toBeNull();
    fireEvent.click(row!);
    expect(onOpen).toHaveBeenCalledWith(report);
  });
});