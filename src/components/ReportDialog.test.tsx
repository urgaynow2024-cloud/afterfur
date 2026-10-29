/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import ReportDialog from "@/components/ReportDialog";

vi.mock("@/lib/supabase/client");
import { createClient } from "@/lib/supabase/client";

const mockCreateClient = vi.mocked(createClient);
const mockRpc = vi.fn();

function buttonByName(name: RegExp): HTMLButtonElement {
  return screen.getByRole("button", { name }) as HTMLButtonElement;
}

function renderDialog(props: Partial<Parameters<typeof ReportDialog>[0]> = {}) {
  const { open: initialOpen = true, ...rest } = props;
  const onClose = vi.fn();
  const onSuccess = vi.fn();

  function Harness() {
    const [open, setOpen] = useState(initialOpen);
    return (
      <ReportDialog
        open={open}
        targetType="post"
        targetId="00000000-0000-0000-0000-000000000001"
        targetLabel="this post"
        onClose={() => { onClose(); setOpen(false); }}
        onSuccess={onSuccess}
        {...rest}
      />
    );
  }

  render(<Harness />);
  return { onClose, onSuccess };
}

beforeEach(() => {
  mockRpc.mockReset();
  mockCreateClient.mockReturnValue({ rpc: mockRpc } as unknown as SupabaseClient<Database>);
});

afterEach(() => {
  cleanup();
});

describe("ReportDialog", () => {
  it("renders nothing when closed", () => {
    renderDialog({ open: false });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders an accessible dialog with reasons, optional details, and cancel", () => {
    renderDialog();

    const dialog = screen.getByRole("dialog", { name: /Report this post/i });
    expect(dialog.getAttribute("aria-modal")).toBe("true");

    expect(screen.getByLabelText(/Report reason/i)).toBeDefined();
    expect(screen.getByLabelText(/Additional details/i)).toBeDefined();
    const submit = buttonByName(/Submit report/i);
    expect(submit).toBeDefined();
    expect(submit.disabled).toBe(true);
  });

  it("lists all nine report reasons", () => {
    renderDialog();
    const select = screen.getByLabelText(/Report reason/i);
    for (const label of [
      "Harassment or bullying",
      "Hate or discriminatory abuse",
      "Threats or violence",
      "Sexual or adult content",
      "Suspected illegal content or exploitation",
      "Spam, scams or impersonation",
      "Copyright concerns",
      "Privacy violations or doxxing",
      "Other",
    ]) {
      expect(select.textContent).toContain(label);
    }
  });

  it("disables submission until a reason is selected, then submits", async () => {
    mockRpc.mockResolvedValue({ data: "report-1", error: null });
    renderDialog();

    expect(buttonByName(/Submit report/i).disabled).toBe(true);

    const select = screen.getByLabelText(/Report reason/i);
    fireEvent.change(select, { target: { value: "harassment" } });
    expect(buttonByName(/Submit report/i).disabled).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: /Submit report/i }));
    await act(async () => {});

    await screen.findByText(/Your report has been saved and will be reviewed by staff./);

    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith("submit_report", {
      p_target_type: "post",
      p_target_id: "00000000-0000-0000-0000-000000000001",
      p_reason: "harassment",
      p_description: null,
    });

    fireEvent.click(screen.getByRole("button", { name: /Done/i }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("prevents duplicate submission while a request is in flight", async () => {
    let resolveRpc: (value: unknown) => void = () => {};
    mockRpc.mockImplementation(() => new Promise((resolve) => { resolveRpc = (value) => resolve(value); }));
    renderDialog();

    const select = screen.getByLabelText(/Report reason/i);
    fireEvent.change(select, { target: { value: "harassment" } });
    fireEvent.click(screen.getByRole("button", { name: /Submit report/i }));

    expect(mockRpc).toHaveBeenCalledTimes(1);

    resolveRpc({ data: "report-2", error: null });
    await act(async () => {});
    await screen.findByText(/reviewed by staff/);
  });

  it("shows server errors and keeps the form open for retry", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "Authentication required. Sign in to submit a report." },
    });
    renderDialog();

    const select = screen.getByLabelText(/Report reason/i);
    fireEvent.change(select, { target: { value: "harassment" } });
    fireEvent.click(screen.getByRole("button", { name: /Submit report/i }));

    await screen.findByText(/Authentication required./);
    expect(buttonByName(/Submit report/i).disabled).toBe(false);
    expect(screen.getByLabelText(/Report reason/i)).toBeDefined();

    mockRpc.mockResolvedValue({ data: "report-3", error: null });
    fireEvent.click(screen.getByRole("button", { name: /Submit report/i }));
    await act(async () => {});
    await screen.findByText(/reviewed by staff/);
    expect(mockRpc).toHaveBeenCalledTimes(2);
  });

  it("closes on Cancel and on Escape", () => {
    const { onClose } = renderDialog();

    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();

    const { onClose: secondClose } = renderDialog();
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(secondClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("supports reporting a user account", () => {
    renderDialog({
      targetType: "user",
      targetId: "00000000-0000-0000-0000-000000000009",
      targetLabel: "this account",
    });
    expect(screen.getByRole("dialog", { name: /Report this account/i })).toBeDefined();
  });

  it("tracks description characters", () => {
    renderDialog();
    const textarea = screen.getByLabelText(/Additional details/i);
    fireEvent.input(textarea, { target: { value: "Some details" } });
    expect(screen.getByText("12/1000 characters")).toBeDefined();
  });
});
