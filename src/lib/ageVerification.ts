import { createServerClient } from "@/lib/supabase/server";
import { recordModerationAction } from "@/lib/moderation";
import type { Database, Json } from "@/lib/supabase/database.types";

export type VerificationRequestStatus = "pending" | "approved" | "rejected";

export type VerificationRequest = {
  id: string;
  user_id: string;
  status: VerificationRequestStatus;
  requested_at: string | null;
  reviewed_at: string | null;
  reviewer_id: string | null;
  review_note: string | null;
  evidence: Record<string, unknown> | null;
};

export type SubmitRequestResult =
  | { ok: true; request: VerificationRequest }
  | { ok: false; error: string; status: number };

export type DecideRequestResult =
  | { ok: true; request: VerificationRequest; profileUpdated: boolean }
  | { ok: false; error: string; status: number };

/**
 * Submit an age-verification request for the authenticated user.
 *
 * Rejects duplicate pending requests. Does NOT set any profile column - only
 * a staff member can approve, which is what flips profiles.age_verified.
 */
export async function submitAgeVerificationRequest(
  userId: string,
  evidence: Record<string, unknown> | null = null,
): Promise<SubmitRequestResult> {
  const supabase = createServerClient();
  if (!supabase) return { ok: false, error: "Supabase not configured.", status: 500 };

  // Reject if a pending request already exists for this user.
  const { data: existing, error: existingError } = await supabase
    .from("age_verification_requests")
    .select("id, status")
    .eq("user_id", userId)
    .eq("status", "pending")
    .maybeSingle();

  if (existingError) return { ok: false, error: "Unable to check existing requests.", status: 500 };
  if (existing) return { ok: false, error: "You already have a pending age-verification request.", status: 409 };

  const { data, error } = await supabase
    .from("age_verification_requests")
    .insert({ user_id: userId, evidence: (evidence ?? null) as unknown as Json })
    .select("id, user_id, status, requested_at, reviewed_at, reviewer_id, review_note, evidence")
    .single();

  if (error || !data) return { ok: false, error: "Failed to submit age-verification request.", status: 500 };

  return { ok: true, request: mapRequest(data) };
}

/**
 * List age-verification requests visible to the caller. Staff see all; users see
 * only their own.
 */
export async function listAgeVerificationRequests(
  userId: string,
  isStaff: boolean,
  status?: VerificationRequestStatus,
): Promise<VerificationRequest[]> {
  const supabase = createServerClient();
  if (!supabase) return [];

  let q = supabase
    .from("age_verification_requests")
    .select("id, user_id, status, requested_at, reviewed_at, reviewer_id, review_note, evidence")
    .order("requested_at", { ascending: false });

  if (!isStaff) q = q.eq("user_id", userId);
  if (status) q = q.eq("status", status);

  const { data } = await q;
  return (data ?? []).map(mapRequest);
}

/**
 * Approve or reject an age-verification request. Staff only.
 *
 * On approval, sets profiles.age_verified = true and records the timestamp.
 * On rejection, clears the flag. Both paths write an audit-log entry.
 * The user can never perform this action.
 */
export async function decideAgeVerificationRequest(
  requestId: string,
  actorId: string,
  decision: "approved" | "rejected",
  reviewNote: string | null,
  evidence: Record<string, unknown> | null = null,
): Promise<DecideRequestResult> {
  const supabase = createServerClient();
  if (!supabase) return { ok: false, error: "Supabase not configured.", status: 500 };

  const { data: request, error: reqError } = await supabase
    .from("age_verification_requests")
    .select("id, user_id, status, requested_at, reviewed_at, reviewer_id, review_note, evidence")
    .eq("id", requestId)
    .maybeSingle();

  if (reqError || !request) return { ok: false, error: "Age-verification request not found.", status: 404 };
  if (request.status !== "pending") {
    return { ok: false, error: "That request has already been decided.", status: 409 };
  }

  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await supabase
    .from("age_verification_requests")
    .update({
      status: decision,
      reviewed_at: now,
      reviewer_id: actorId,
      review_note: reviewNote,
      evidence: (evidence ?? request.evidence ?? null) as unknown as Json,
    })
    .eq("id", requestId)
    .select("id, user_id, status, requested_at, reviewed_at, reviewer_id, review_note, evidence")
    .single();

  if (updateError || !updated) return { ok: false, error: "Failed to update age-verification request.", status: 500 };

  // Only approval flips the profile column. Rejection clears it.
  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      age_verified: decision === "approved",
      age_verified_at: decision === "approved" ? now : null,
    })
    .eq("id", request.user_id);

  if (profileError) return { ok: false, error: "Failed to update age-verification status on profile.", status: 500 };

  await recordModerationAction({
    actorId,
    targetType: "user",
    targetId: request.user_id,
    action: decision === "approved" ? "age_verification_approved" : "age_verification_rejected",
    details: { request_id: requestId, review_note: reviewNote },
    beforeState: { age_verified: null },
    afterState: { age_verified: decision === "approved", age_verified_at: decision === "approved" ? now : null },
  });

  return { ok: true, request: mapRequest(updated), profileUpdated: true };
}

// ---------------------------------------------------------------------------
// Age-assurance approval (second, independent gate for After Dark access).
// ---------------------------------------------------------------------------

/**
 * Submit an age-assurance request. The user's age must already be verified
 * (enforced server-side) so the two controls cannot be approved out of order.
 */
export async function submitAgeAssuranceRequest(
  userId: string,
  evidence: Record<string, unknown> | null = null,
): Promise<SubmitRequestResult> {
  const supabase = createServerClient();
  if (!supabase) return { ok: false, error: "Supabase not configured.", status: 500 };

  // Age must already be verified before an assurance request can be submitted.
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("age_verified")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) return { ok: false, error: "Unable to verify age status.", status: 500 };
  if (!profile || !profile.age_verified) {
    return { ok: false, error: "Complete age verification before requesting age-assurance approval.", status: 400 };
  }

  const { data: existing, error: existingError } = await supabase
    .from("age_assurance_requests")
    .select("id, status")
    .eq("user_id", userId)
    .eq("status", "pending")
    .maybeSingle();

  if (existingError) return { ok: false, error: "Unable to check existing requests.", status: 500 };
  if (existing) return { ok: false, error: "You already have a pending age-assurance request.", status: 409 };

  const { data, error } = await supabase
    .from("age_assurance_requests")
    .insert({ user_id: userId, evidence: (evidence ?? null) as unknown as Json })
    .select("id, user_id, status, requested_at, reviewed_at, reviewer_id, review_note, evidence")
    .single();

  if (error || !data) return { ok: false, error: "Failed to submit age-assurance request.", status: 500 };

  return { ok: true, request: mapRequest(data) };
}

export async function listAgeAssuranceRequests(
  userId: string,
  isStaff: boolean,
  status?: VerificationRequestStatus,
): Promise<VerificationRequest[]> {
  const supabase = createServerClient();
  if (!supabase) return [];

  let q = supabase
    .from("age_assurance_requests")
    .select("id, user_id, status, requested_at, reviewed_at, reviewer_id, review_note, evidence")
    .order("requested_at", { ascending: false });

  if (!isStaff) q = q.eq("user_id", userId);
  if (status) q = q.eq("status", status);

  const { data } = await q;
  return (data ?? []).map(mapRequest);
}

/**
 * Approve or reject an age-assurance request. Staff only.
 *
 * On approval, sets profiles.age_assurance_approved = true. On rejection,
 * clears it. Both paths write an audit-log entry. The user can never perform
 * this action.
 */
export async function decideAgeAssuranceRequest(
  requestId: string,
  actorId: string,
  decision: "approved" | "rejected",
  reviewNote: string | null,
  evidence: Record<string, unknown> | null = null,
): Promise<DecideRequestResult> {
  const supabase = createServerClient();
  if (!supabase) return { ok: false, error: "Supabase not configured.", status: 500 };

  const { data: request, error: reqError } = await supabase
    .from("age_assurance_requests")
    .select("id, user_id, status, requested_at, reviewed_at, reviewer_id, review_note, evidence")
    .eq("id", requestId)
    .maybeSingle();

  if (reqError || !request) return { ok: false, error: "Age-assurance request not found.", status: 404 };
  if (request.status !== "pending") {
    return { ok: false, error: "That request has already been decided.", status: 409 };
  }

  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await supabase
    .from("age_assurance_requests")
    .update({
      status: decision,
      reviewed_at: now,
      reviewer_id: actorId,
      review_note: reviewNote,
      evidence: (evidence ?? request.evidence ?? null) as unknown as Json,
    })
    .eq("id", requestId)
    .select("id, user_id, status, requested_at, reviewed_at, reviewer_id, review_note, evidence")
    .single();

  if (updateError || !updated) return { ok: false, error: "Failed to update age-assurance request.", status: 500 };

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      age_assurance_approved: decision === "approved",
      age_assurance_approved_at: decision === "approved" ? now : null,
    })
    .eq("id", request.user_id);

  if (profileError) return { ok: false, error: "Failed to update age-assurance status on profile.", status: 500 };

  // Notification to user (duplicate prevention by request id)
  const notifType = decision === "approved" ? "age_assurance_approved" : "age_assurance_rejected";
  const { data: existingNotif } = await supabase
    .from("notifications")
    .select("id")
    .eq("user_id", request.user_id)
    .eq("type", notifType)
    .contains("payload", { request_id: requestId })
    .limit(1);
  if (!existingNotif || existingNotif.length === 0) {
    await supabase.from("notifications").insert({
      user_id: request.user_id,
      type: notifType,
      payload: {
        request_id: requestId,
        decision,
        review_note: reviewNote,
        reviewed_at: now,
        href: "/after-dark",
      },
      read: false,
    });
  }

  await recordModerationAction({
    actorId,
    targetType: "user",
    targetId: request.user_id,
    action: decision === "approved" ? "age_assurance_approved" : "age_assurance_rejected",
    details: { request_id: requestId, review_note: reviewNote },
    beforeState: { age_assurance_approved: null },
    afterState: { age_assurance_approved: decision === "approved", age_assurance_approved_at: decision === "approved" ? now : null },
  });

  return { ok: true, request: mapRequest(updated), profileUpdated: true };
}

function mapRequest(data: any): VerificationRequest {
  return {
    id: String(data.id),
    user_id: String(data.user_id),
    status: data.status as VerificationRequestStatus,
    requested_at: data.requested_at ?? null,
    reviewed_at: data.reviewed_at ?? null,
    reviewer_id: data.reviewer_id ?? null,
    review_note: data.review_note ?? null,
    evidence: (data.evidence as Record<string, unknown>) ?? null,
  };
}