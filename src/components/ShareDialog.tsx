"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildShareTargetUrl,
  copyTextToClipboard,
  openExternalShareWindow,
  type SharePlatform,
} from "@/lib/share";
import { generateQrMatrix } from "@/lib/qr";

export type ShareDialogProps = {
  open: boolean;
  onClose: () => void;
  url: string;
  title?: string;
  text?: string;
  authorLabel?: string;
  dialogTitle?: string;
  onCopyLink?: () => void;
};

function ShareOptionIcon({ platform }: { platform: SharePlatform | "qr" }) {
  switch (platform) {
    case "x":
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      );
    case "facebook":
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
      );
    case "discord":
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
          <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z" />
        </svg>
      );
    case "whatsapp":
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
      );
    case "email":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
          <rect width="20" height="16" x="2" y="4" rx="2" />
          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
        </svg>
      );
    case "qr":
    default:
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
          <rect width="5" height="5" x="3" y="3" rx="1" />
          <rect width="5" height="5" x="16" y="3" rx="1" />
          <rect width="5" height="5" x="3" y="16" rx="1" />
          <path d="M21 16h-3a2 2 0 0 0-2 2v3" />
          <path d="M21 21v.01" />
          <path d="M12 7v3a2 2 0 0 1-2 2H7" />
          <path d="M3 12h.01" />
          <path d="M12 3h.01" />
          <path d="M12 16v.01" />
          <path d="M16 12h1" />
          <path d="M21 12v.01" />
          <path d="M12 21v-1" />
        </svg>
      );
  }
}

export default function ShareDialog({
  open,
  onClose,
  url,
  title = "Share post",
  text = "",
  authorLabel,
  dialogTitle,
  onCopyLink,
}: ShareDialogProps) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const copyTimerRef = useRef<number | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  const requestClose = useCallback(() => {
    setCopied(false);
    setCopyError(false);
    setShowQr(false);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    previousActiveElementRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusTimer = window.setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = prevOverflow;
      if (previousActiveElementRef.current && document.contains(previousActiveElementRef.current)) {
        previousActiveElementRef.current.focus();
      }
    };
  }, [open]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent | React.KeyboardEvent) => {
      if (!open) return;
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
        return;
      }
      if (event.key === "Tab" && dialogRef.current) {
        const focusable = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((el) => el.offsetParent !== null || el === document.activeElement);

        if (focusable.length === 0) return;
        const firstEl = focusable[0]!;
        const lastEl = focusable[focusable.length - 1]!;

        if (event.shiftKey && document.activeElement === firstEl) {
          event.preventDefault();
          lastEl.focus();
        } else if (!event.shiftKey && document.activeElement === lastEl) {
          event.preventDefault();
          firstEl.focus();
        }
      }
    },
    [open, requestClose],
  );

  useEffect(() => {
    if (!open) return;
    const listener = (event: KeyboardEvent) => handleKeyDown(event);
    window.addEventListener("keydown", listener);
    document.addEventListener("keydown", listener);
    return () => {
      window.removeEventListener("keydown", listener);
      document.removeEventListener("keydown", listener);
    };
  }, [open, handleKeyDown]);

  const qrMatrix = useMemo(() => {
    if (!open || !showQr || !url) return null;
    try {
      return generateQrMatrix(url, "M");
    } catch {
      return null;
    }
  }, [open, showQr, url]);

  async function handleCopyLink() {
    const success = await copyTextToClipboard(url);
    if (success) {
      setCopied(true);
      setCopyError(false);
      onCopyLink?.();
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => {
        setCopied(false);
      }, 2400);
    } else {
      setCopied(false);
      setCopyError(true);
    }
  }

  function handleExternalShare(platform: SharePlatform) {
    if (platform === "discord") {
      void copyTextToClipboard(url);
    }
    const targetUrl = buildShareTargetUrl(platform, url, { title, text });
    openExternalShareWindow(targetUrl);
  }

  if (!open) return null;

  const headingId = "share-dialog-title";
  const resolvedTitle = dialogTitle ?? "Share post";

  const shareOptions: {
    id: Exclude<SharePlatform, never> | "qr";
    platform: SharePlatform | "qr";
    targetUrl: string;
    action: () => void;
    ariaPressed?: boolean;
  }[] = [
    {
      id: "x",
      platform: "x",
      targetUrl: buildShareTargetUrl("x", url, { title, text }),
      action: () => handleExternalShare("x"),
    },
    {
      id: "facebook",
      platform: "facebook",
      targetUrl: buildShareTargetUrl("facebook", url, { title, text }),
      action: () => handleExternalShare("facebook"),
    },
    {
      id: "discord",
      platform: "discord",
      targetUrl: buildShareTargetUrl("discord", url, { title, text }),
      action: () => handleExternalShare("discord"),
    },
    {
      id: "whatsapp",
      platform: "whatsapp",
      targetUrl: buildShareTargetUrl("whatsapp", url, { title, text }),
      action: () => handleExternalShare("whatsapp"),
    },
    {
      id: "email",
      platform: "email",
      targetUrl: buildShareTargetUrl("email", url, { title, text }),
      action: () => handleExternalShare("email"),
    },
    {
      id: "qr",
      platform: "qr",
      targetUrl: "",
      action: () => setShowQr((prev) => !prev),
      ariaPressed: showQr,
    },
  ];

  return (
    <div
      className="af-share-overlay fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          requestClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        className="af-share-dialog max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-af-border-strong bg-af-surface p-4 text-af-text shadow-2xl shadow-black/60 sm:p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-af-border/80 pb-3.5">
          <div className="min-w-0">
            <h2 id={headingId} className="truncate text-base font-semibold tracking-tight text-af-text sm:text-lg">
              {resolvedTitle}
            </h2>
            <p className="mt-0.5 truncate text-xs text-af-muted">
              {authorLabel ?? "Share this post on AfterFur"}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={requestClose}
            aria-label="Close share dialog"
            title="Close"
            className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-af-muted transition-colors hover:bg-af-surface-2 hover:text-af-text focus-visible:outline-2 focus-visible:outline-af-focus"
          >
            <span aria-hidden="true" className="text-xl leading-none">×</span>
          </button>
        </div>

        <div className="mt-3.5">
          <label htmlFor="share-permalink-input" className="mb-1.5 block text-xs font-medium text-af-text-2">
            Post permalink
          </label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              id="share-permalink-input"
              type="text"
              readOnly
              value={url}
              onClick={(event) => event.currentTarget.select()}
              aria-label="Post permalink"
              className="af-field min-h-10 min-w-0 flex-1 bg-af-surface-2 px-3 py-2 font-mono text-xs text-af-text-2 focus-visible:text-af-text"
            />
            <button
              type="button"
              onClick={() => { void handleCopyLink(); }}
              aria-label={copied ? "Copied link" : "Copy link"}
              className={`min-h-10 shrink-0 rounded-lg px-4 text-xs font-semibold transition-all ${
                copied
                  ? "bg-af-success/15 text-af-success ring-1 ring-af-success/40"
                  : "bg-af-brand text-white shadow-sm shadow-af-brand/20 hover:bg-af-brand-hover"
              }`}
            >
              {copied ? "Copied!" : "Copy link"}
            </button>
          </div>
          <div aria-live="polite" role="status" className="min-h-[1.25rem] pt-1 text-[11px]">
            {copyError ? (
              <span className="text-af-danger">Could not copy link to clipboard.</span>
            ) : copied ? (
              <span className="text-af-success">Link copied to clipboard!</span>
            ) : null}
          </div>
        </div>

        <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {shareOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={option.action}
              aria-label={option.id === "qr" ? "QR code" : undefined}
              aria-pressed={option.ariaPressed}
              data-share-id={option.id}
              data-share-url={option.targetUrl || undefined}
              data-url={option.targetUrl || undefined}
              className={`flex min-h-[3.25rem] w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-af-focus ${
                (option.id === "qr" && showQr)
                  ? "border-af-brand/50 bg-af-brand/15 text-af-brand-soft"
                  : "border-af-border bg-af-surface-2 text-af-text-2 hover:border-af-border-strong hover:bg-af-surface-raised hover:text-af-text"
              }`}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                  option.id === "qr" && showQr ? "bg-af-brand text-white" : "bg-af-surface-raised text-af-brand-soft"
                }`}
                aria-hidden="true"
              >
                <ShareOptionIcon platform={option.platform} />
              </span>
              <span className="truncate">
                {option.platform === "x"
                  ? "X"
                  : option.platform === "qr"
                    ? "QR code"
                    : option.platform === "email"
                      ? "Email"
                      : option.platform === "facebook"
                        ? "Facebook"
                        : option.platform === "discord"
                          ? "Discord"
                          : "WhatsApp"}
              </span>
            </button>
          ))}
        </div>

        {showQr && qrMatrix && (
          <div
            id="share-qr-panel"
            role="region"
            aria-label="Post QR code"
            className="af-share-qr-panel mt-4 flex flex-col items-center rounded-xl border border-af-border bg-af-surface-2 p-3.5"
          >
            <div className="rounded-lg bg-white p-2.5 shadow-sm">
              <svg
                role="img"
                aria-label={`QR code for ${url}`}
                viewBox={`0 0 ${qrMatrix.size} ${qrMatrix.size}`}
                width={140}
                height={140}
                shapeRendering="crispEdges"
                className="block h-[140px] w-[140px]"
              >
                <rect width={qrMatrix.size} height={qrMatrix.size} fill="#ffffff" />
                {qrMatrix.modules.map((row, r) =>
                  row.map((filled, c) =>
                    filled ? (
                      <rect
                        key={`${r}-${c}`}
                        x={c}
                        y={r}
                        width={1}
                        height={1}
                        fill="#09090f"
                      />
                    ) : null,
                  ),
                )}
              </svg>
            </div>
            <p className="mt-2 text-center text-[11px] font-medium text-af-text-2">
              Scan QR code to view this post
            </p>
            <code className="mt-1 max-w-full truncate break-all rounded bg-af-surface px-2 py-0.5 text-[10px] text-af-brand-soft">
              {url}
            </code>
          </div>
        )}
      </div>
    </div>
  );
}