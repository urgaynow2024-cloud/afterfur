/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  session: null as unknown,
  legacySession: null as unknown,
  callback: null as null | ((event: string, session: unknown) => void),
}));

const makeSession = (id: string) => ({
  access_token: `at.${id}`,
  refresh_token: `rt.${id}`,
  user: { id, email: `${id}@example.com`, user_metadata: { username: id } },
});

vi.mock("@/lib/accountSessions", () => {
  const makeClient = (sessionProvider: () => unknown) => {
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => ({ data: null, error: null }),
    };
    return {
      auth: {
        getSession: async () => ({ data: { session: sessionProvider() }, error: null }),
        onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
          state.callback = cb;
          cb("INITIAL_SESSION", sessionProvider());
          return { data: { subscription: { unsubscribe: vi.fn() } } };
        },
        signOut: async () => ({ error: null }),
        stopAutoRefresh: async () => {},
      },
      from: () => chain,
    };
  };
  const perUser = makeClient(() => state.session);
  const legacy = makeClient(() => state.legacySession);
  return {
    ACCOUNT_SWITCH_EVENT: "afterfur:account-switch",
    clearTransientAccountState: vi.fn(),
    clearActiveBoundClient: vi.fn(),
    setActiveBoundClient: vi.fn(),
    ensureActiveSession: vi.fn(async () => true),
    emitAccountSwitched: vi.fn(),
    getActiveClient: vi.fn(() => perUser),
    getActiveUserId: vi.fn(() => "uA"),
    getClientForUser: vi.fn(() => perUser),
    getLegacyClient: vi.fn(() => legacy),
    getSavedAccount: vi.fn(() => ({ userId: "uA", storageKey: "afterfur.auth.session.uA" })),
    pauseInactiveClientRefresh: vi.fn(),
    readSavedAccounts: vi.fn(() => []),
    restoreAccountSession: vi.fn(),
    setActiveUserId: vi.fn(),
    signOutAccount: vi.fn(async () => ({ error: null })),
    signOutAllAccounts: vi.fn(async () => {}),
    upsertSavedAccount: vi.fn(),
    peekSessionForUser: vi.fn(() => null),
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import { AuthProvider, useAuth } from "@/components/AuthProvider";

function Probe() {
  const { user, loading } = useAuth();
  return <div data-testid="state">{loading ? "checking" : user ? `signed-in:${user.id}` : "signed-out"}</div>;
}

describe("AuthProvider session guards", () => {
  beforeEach(() => {
    state.session = makeSession("uA");
    state.legacySession = null;
    state.callback = null;
  });
  afterEach(cleanup);

  it("keeps the user signed in when a stale SIGNED_OUT event fires while a session still exists", async () => {
    const { getByTestId } = render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(getByTestId("state")).toHaveTextContent("signed-in:uA"));

    act(() => state.callback?.("SIGNED_OUT", null));
    await waitFor(() => expect(getByTestId("state")).toHaveTextContent("signed-in:uA"));
  });

  it("clears the user when the bound client genuinely has no session", async () => {
    const { getByTestId } = render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(getByTestId("state")).toHaveTextContent("signed-in:uA"));

    state.session = null;
    act(() => state.callback?.("SIGNED_OUT", null));
    await waitFor(() => expect(getByTestId("state")).toHaveTextContent("signed-out"));
  });

  it("recovers a legacy-client session when the per-account client has none", async () => {
    state.session = null;
    state.legacySession = makeSession("uA");
    const { getByTestId } = render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(getByTestId("state")).toHaveTextContent("signed-in:uA"));
  });
});