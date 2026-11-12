/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { AuthProvider, useAuth } from "@/components/AuthProvider";

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/accountSessions", () => ({
  ACCOUNT_SWITCH_EVENT: "afterfur:account-switched",
  clearTransientAccountState: vi.fn(),
  clearActiveBoundClient: vi.fn(),
  setActiveBoundClient: vi.fn(),
  peekSessionForUser: vi.fn(() => null),
  ensureActiveSession: vi.fn(async () => true),
  getLegacyClient: vi.fn(() => null),
  emitAccountSwitched: vi.fn(),
  getActiveClient: vi.fn(() => ({ auth: { getSession: vi.fn().mockReturnValue(new Promise(() => {})), onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }) } })),
  getActiveUserId: vi.fn(() => null),
  getClientForUser: vi.fn(),
  getSavedAccount: vi.fn(),
  pauseInactiveClientRefresh: vi.fn(),
  readSavedAccounts: vi.fn(() => []),
  restoreAccountSession: vi.fn(),
  setActiveUserId: vi.fn(),
  signOutAccount: vi.fn(),
  touchSavedAccount: vi.fn(),
  upsertSavedAccount: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), pathname: "/", query: {} })),
}));

function TestComponent() {
  const { user, loading } = useAuth();
  return (
    <div data-testid="auth-state">
      {loading ? "checking" : user ? `signed-in:${user.id}` : "signed-out"}
    </div>
  );
}

describe("AuthProvider hydration consistency", () => {
  afterEach(() => { cleanup(); });

  it("initializes loading=true and user=null when active client exists (matching server and client initial render)", () => {
    const { getByTestId } = render(
      <AuthProvider><TestComponent /></AuthProvider>,
    );
    expect(getByTestId("auth-state")).toHaveTextContent("checking");
  });
});
