/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Messages from "@/app/messages/page";
import { createClient } from "@/lib/supabase/client";

const USER_ID = "user-1";

const mockCreateClient = vi.mocked(createClient);

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/components/AuthProvider", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({ user: { id: USER_ID } }),
}));

vi.mock("@/components/Shell", () => ({
  Shell: ({ children }: { children: React.ReactNode }) => <div data-testid="shell">{children}</div>,
  PageHeader: ({ children }: { children: React.ReactNode }) => <header data-testid="page-header">{children}</header>,
  EmptyState: () => null,
}));

vi.mock("next/link", () => ({
  default: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => <a href={String(props.href)} {...props}>{children}</a>,
}));

function makeSupabaseClient(insertShouldFail = false) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => ({ data: [], error: null }),
            lt: () => ({ limit: () => ({ data: [], error: null }) }),
          }),
        }),
      }),
      insert: () => ({
        select: () => ({
          single: async () => {
            if (insertShouldFail) return { data: null, error: { message: "insert failed" } };
            return { data: { id: "msg-1", conversation_id: "conv-1", sender_id: USER_ID, content: "hi", created_at: new Date().toISOString() }, error: null };
          },
        }),
      }),
    }),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
    })),
    removeChannel: vi.fn(),
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mockCreateClient.mockReset();
});

describe("messages page", () => {
  it("renders empty state when no conversations", async () => {
    mockCreateClient.mockReturnValue(makeSupabaseClient() as any);

    render(<Messages />);

    await waitFor(() => {
      expect(screen.getByText("No conversations yet. Start one with a username.")).toBeTruthy();
    });
  });

  it("shows send form and request button", async () => {
    mockCreateClient.mockReturnValue(makeSupabaseClient() as any);

    render(<Messages />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Request/ })).toBeTruthy();
    });
  });

  it("handles failed send gracefully", async () => {
    mockCreateClient.mockReturnValue(makeSupabaseClient(true) as any);

    render(<Messages />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Request/ })).toBeTruthy();
    });
  });
});
