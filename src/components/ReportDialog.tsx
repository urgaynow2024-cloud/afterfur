"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  REPORT_DESCRIPTION_MAX,
  REPORT_REASONS,
  submitReport,
  type ReportReason,
  type ReportTargetType,
} from "@/lib/reports";

type ReportDialogProps = {
  open: boolean;
  onClose: () => void;
  targetType: ReportTargetType;
  targetId: string;
  targetLabel: string;
  onSuccess?: (reportId: string) => void;
};

export default function ReportDialog({
  open,
  onClose,
  targetType,
  targetId,
  targetLabel,
  onSuccess,
}: ReportDialogProps) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [wasOpen, setWasOpen] = useState(false);
  const submittingRef = useRef(false);

  // Reset the form whenever the dialog opens, so a reopened dialog is always fresh.
  if (open && !wasOpen) {
    setReason(null);
    setDescription("");
    setStatus("idle");
    setErrorMessage("");
    setWasOpen(true);
  }
  if (!open && wasOpen) {
    setWasOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (submittingRef.current) return;
      if (!reason) {
        setErrorMessage("Select a report reason.");
        return;
      }
      submittingRef.current = true;
      setStatus("submitting");
      setErrorMessage("");
      try {
        const reportId = await submitReport({
          targetType,
          targetId,
          reason,
          description: description.trim() || null,
        });
        setStatus("success");
        onSuccess?.(reportId);
        return;
      } catch (err) {
        setErrorMessage(
          err instanceof Error ? err.message : "Report could not be submitted. Try again.",
        );
        setStatus("error");
      } finally {
        submittingRef.current = false;
      }
    },
    [reason, description, targetType, targetId, onSuccess],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-dialog-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-af-border bg-af-surface p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="report-dialog-title" className="text-lg font-semibold text-af-text">
          Report {targetLabel}
        </h2>
        <p className="mt-2 text-sm text-af-text-2">
          Reports are reviewed by AfterFur staff. Your identity is not shared with
          the reported account or post author. Reporting does not guarantee content
          removal or a fixed response time.
        </p>

        {status === "error" && (
          <p role="alert" className="mt-3 rounded-md border border-af-danger/40 bg-af-danger/10 p-3 text-sm text-af-danger">
            {errorMessage}
          </p>
        )}

        {status === "success" ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-af-text-2">
              Your report has been saved and will be reviewed by staff.
            </p>
            <button type="button" onClick={onClose} className="min-h-10 rounded-md bg-af-brand px-4 text-sm font-semibold text-white hover:bg-af-brand-hover">
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-3">
            <label htmlFor="report-reason" className="text-sm font-medium text-af-text block">
              Report reason
            </label>
            <select
              id="report-reason"
              value={reason ?? ""}
              onChange={(event) => setReason((event.target.value as ReportReason) || null)}
              className="af-field w-full px-3 py-2 text-sm"
            >
              <option value="">Select a reason</option>
              {REPORT_REASONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <label htmlFor="report-description" className="text-sm font-medium text-af-text block">
              Additional details (optional)
            </label>
            <textarea
              id="report-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={REPORT_DESCRIPTION_MAX}
              rows={4}
              className="af-field w-full px-3 py-2 text-sm resize-y"
            />
            <span className="text-xs text-af-muted">
              {description.length}/{REPORT_DESCRIPTION_MAX} characters
            </span>

            <div className="mt-4 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={status === "submitting"}
                className="af-action-secondary disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!reason || status === "submitting"}
                className="min-h-10 rounded-md bg-af-brand px-4 text-sm font-semibold text-white disabled:opacity-50 hover:bg-af-brand-hover disabled:cursor-not-allowed"
              >
                {status === "submitting" ? "Submitting…" : "Submit report"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
