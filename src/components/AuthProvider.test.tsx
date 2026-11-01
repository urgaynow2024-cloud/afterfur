/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { AuthProvider, useAuth } from "@/components/AuthProvider";

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn(), pathname: "/", query: {} })),
}));

import { createClient } from "@/lib/supabase/client";

const mockCreateClient = vi.mocked(createClient);

function TestComponent() {
  const { user, loading } = useAuth();
  return (
    <div data-testid="auth-state">
      {loading ? "checking" : user ? `signed-in:${user.id}` : "signed-out"}
    </div>
  );
}

describe("AuthProvider hydration consistency", () => {
  afterEach(() => {
    cleanup();
    mockCreateClient.mockReset();
  });

  it("initializes loading=true and user=null when createClient returns a client (matching server and client initial render)", () => {
    mockCreateClient.mockReturnValue({
      auth: {
        getSession: vi.fn().mockReturnValue(new Promise(() => {})),
        onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      },
    } as unknown as ReturnType<typeof createClient>);
    const { getByTestId } = render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>,
    );
    // Initial render (both server and client): checking
    expect(getByTestId("auth-state")).toHaveTextContent("checking");
  });
});
