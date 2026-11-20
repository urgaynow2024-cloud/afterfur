"use client";
import { useEffect, useState } from "react";
import { Shell, PageHeader, EmptyState } from "@/components/Shell";
import { useAuth } from "@/components/AuthProvider";

type Eligibility = {
  eligible: boolean;
  ageVerified: boolean;
  assuranceApproved: boolean;
  reason: string;
};

type AssuranceRequest = {
  id: string;
  status: "pending" | "approved" | "rejected";
  review_note: string | null;
};

const REASON_MESSAGE: Record<string, string> = {
  age_not_verified: "Age verification is required before you can access After Dark.",
  assurance_not_approved: "Your age-assurance controls are not yet approved for After Dark access.",
  not_authenticated: "You must be signed in to access After Dark.",
  db_error: "Unable to verify your eligibility. Please try again later.",
  disabled: "After Dark is currently disabled by an administrator.",
};

export default function AfterDark() {
  const { user, session, loading: authLoading } = useAuth();
  const [eligibility, setEligibility] = useState<Eligibility | null>(null);
  const [requests, setRequests] = useState<AssuranceRequest[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadEligibility = async () => {
    if (!user || !session?.access_token) {
      setEligibility({ eligible: false, ageVerified: false, assuranceApproved: false, reason: "not_authenticated" });
      return;
    }
    try {
      const res = await fetch("/api/after-dark/eligibility", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
        credentials: "same-origin",
      });
      const json = await res.json().catch(() => ({}));
      setEligibility({ eligible: Boolean(json.eligible), ageVerified: Boolean(json.ageVerified), assuranceApproved: Boolean(json.assuranceApproved), reason: json.reason || "db_error" });
    } catch {
      setEligibility({ eligible: false, ageVerified: false, assuranceApproved: false, reason: "db_error" });
    }
  };

  const loadRequests = async () => {
    if (!session?.access_token) return;
    try {
      const res = await fetch("/api/age-assurance", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
        credentials: "same-origin",
      });
      const json = await res.json().catch(() => ({}));
      setRequests(Array.isArray(json.requests) ? json.requests : []);
    } catch {
      setRequests([]);
    }
  };

  useEffect(() => {
    let cancelled = false;
    async function init() {
      await loadEligibility();
      await loadRequests();
    }
    void init();
    const interval = setInterval(() => {
      if (!cancelled) {
        void loadEligibility();
        void loadRequests();
      }
    }, 15000);
    return () => { cancelled = true; clearInterval(interval); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, session?.access_token]);

  const pendingRequest = requests.find((r) => r.status === "pending");
  const rejectedRequest = requests.find((r) => r.status === "rejected");

  const submitRequest = async () => {
    if (!session?.access_token || submitting || pendingRequest) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/age-assurance", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
        credentials: "same-origin",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "Failed to submit request.");
        if (res.status === 409) {
          await loadRequests();
        }
        return;
      }
      setSuccess(true);
      await loadRequests();
      await loadEligibility();
    } catch {
      setError("Failed to submit request.");
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <Shell>
        <PageHeader title="After Dark" subtitle="Age-restricted content with verified access controls." />
        <EmptyState title="After Dark" body="Restoring your session…" />
      </Shell>
    );
  }

  if (!user) {
    return (
      <Shell>
        <PageHeader title="After Dark" subtitle="Age-restricted content with verified access controls." />
        <EmptyState title="After Dark is unavailable" body="You must be signed in to access After Dark." action={{ label: "Sign in", href: "/signin" }} />
      </Shell>
    );
  }

  if (!eligibility) {
    return (
      <Shell>
        <PageHeader title="After Dark" subtitle="Age-restricted content with verified access controls." />
        <EmptyState title="After Dark" body="Checking access eligibility…" />
      </Shell>
    );
  }

  if (eligibility.eligible) {
    return (
      <Shell>
        <PageHeader title="After Dark" subtitle="Age-restricted content with verified access controls." />
        <EmptyState title="Your after-dark space" body="Eligible content appears here when your account meets the platform's access requirements." />
      </Shell>
    );
  }

  const showRequestButton = eligibility.ageVerified && !eligibility.assuranceApproved;

  return (
    <Shell>
      <PageHeader title="After Dark" subtitle="Age-restricted content with verified access controls." />
      <div className="p-4 space-y-4">
        <p className="text-sm text-muted-foreground">{REASON_MESSAGE[eligibility.reason] ?? REASON_MESSAGE.db_error}</p>

        {showRequestButton && (
          <div className="space-y-3">
            {pendingRequest && (
              <p className="text-sm">You already have a pending age-assurance request. Awaiting staff review.</p>
            )}
            {success && !pendingRequest && (
              <p className="text-sm text-green-600">Your age-assurance request has been submitted.</p>
            )}
            {rejectedRequest && (
              <p className="text-sm text-red-600">Your previous request was rejected. Please contact staff or follow the resubmission process.</p>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            {!pendingRequest && (
              <button
                type="button"
                onClick={submitRequest}
                disabled={submitting}
                className="px-4 py-2 rounded bg-primary text-primary-foreground disabled:opacity-50"
              >
                {submitting ? "Submitting…" : "Request After Dark Access"}
              </button>
            )}
          </div>
        )}
      </div>
    </Shell>
  );
}

export const dynamic = 'force-dynamic';
