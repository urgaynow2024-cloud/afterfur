"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

interface Props {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "primary" | "danger" | "success";
  loading?: boolean;
  disabled?: boolean;
  onClose: () => void;
  onConfirm: () => void;
  width?: "sm" | "md" | "lg";
}

export default function ModActionDialog({
  open,
  title,
  description,
  children,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "primary",
  loading = false,
  disabled = false,
  onClose,
  onConfirm,
  width = "md",
}: Props) {
  const overlayRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const widthClass = width === "sm" ? "max-w-sm" : width === "lg" ? "max-w-lg" : "max-w-md";
  const confirmClass =
    variant === "danger"
      ? "bg-af-danger hover:bg-af-danger/90"
      : variant === "success"
        ? "bg-af-success hover:bg-af-success/90"
        : "bg-af-brand hover:bg-af-brand-hover";

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 sm:p-6"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`w-full ${widthClass} max-h-[92vh] overflow-y-auto rounded-xl border border-af-border bg-af-surface p-5 shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-af-text">{title}</h2>
          {description && <p className="mt-1 text-sm text-af-text-2">{description}</p>}
        </div>
        <div className="space-y-4">{children}</div>
        <div className="mt-5 flex items-center justify-between gap-2">
          <button type="button" onClick={onClose} className="af-action-secondary" disabled={loading}>
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={disabled || loading}
            className={`min-h-10 rounded-md px-4 text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed ${confirmClass}`}
          >
            {loading ? "Processing..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}