"use client";
import * as React from "react";
import { useCallback, useState } from "react";
import Link from "next/link";
import ReportDialog from "@/components/ReportDialog";
import { Button } from "@/components/ui/button";

type ProfileOverflowMenuProps = {
  profile: {
    id: string;
    username: string;
    display_name: string | null;
  };
  profileUrl: string;
  onCopyLink: () => void;
  onShare: () => void;
  onReport: () => void;
  copied: boolean;
};

export function ProfileOverflowMenu({
  profile,
  profileUrl,
  onCopyLink,
  onShare,
  onReport,
  copied,
}: ProfileOverflowMenuProps) {
  const [open, setOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const handleCopyLink = useCallback(() => {
    onCopyLink();
  }, [onCopyLink]);

  return (
    <>
      <div
        className="absolute right-0 top-full mt-2 w-56 rounded-lg border border-af-border bg-af-surface p-2 shadow-lg"
        hidden={!open}
      >
        <button
          type="button"
          onClick={() => {
            handleCopyLink();
            setOpen(false);
          }}
          className="block w-full rounded-md px-3 py-2 text-left text-sm text-af-text-2 hover:bg-af-surface-2 hover:text-af-text flex items-center gap-2"
          aria-label={copied ? "Copied link" : "Copy profile link"}
        >
          <span className="h-4 w-4 shrink-0" style={{ maskImage: "url(/icons/afterfur/link.svg)", maskPosition: "center", maskRepeat: "no-repeat", maskSize: "contain", backgroundColor: "currentColor" }} />
          {copied ? "Copied link" : "Copy profile link"}
        </button>
        <button
          type="button"
          onClick={() => {
            onShare();
            setOpen(false);
          }}
          className="block w-full rounded-md px-3 py-2 text-left text-sm text-af-text-2 hover:bg-af-surface-2 hover:text-af-text flex items-center gap-2"
          aria-label="Share profile"
        >
          <span className="h-4 w-4 shrink-0" style={{ maskImage: "url(/icons/afterfur/share.svg)", maskPosition: "center", maskRepeat: "no-repeat", maskSize: "contain", backgroundColor: "currentColor" }} />
          Share profile
        </button>
        <Separator role="separator" orientation="horizontal" className="my-2" />
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            onReport();
          }}
          className="block w-full rounded-md px-3 py-2 text-left text-sm text-af-danger hover:bg-af-danger/10 hover:text-af-danger flex items-center gap-2"
          aria-label="Report account"
        >
          <span className="h-4 w-4 shrink-0" style={{ maskImage: "url(/icons/afterfur/flag.svg)", maskPosition: "center", maskRepeat: "no-repeat", maskSize: "contain", backgroundColor: "currentColor" }} />
          Report account
        </button>
      </div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="More actions"
        className="flex h-10 w-10 items-center justify-center rounded-md text-af-muted transition-colors hover:bg-af-surface-2 hover:text-af-text"
      >
        …
      </button>
      <ReportDialog open={reportOpen} onClose={() => setReportOpen(false)} targetType="user" targetId={profile.id} targetLabel="this account" />
    </>
  );
}

function Separator({ className, orientation, ...props }: React.HTMLAttributes<HTMLDivElement> & { orientation?: "horizontal" | "vertical" }) {
  return (
    <div
      className={`w-full bg-af-border ${orientation === "vertical" ? "h-4 w-px mx-2" : "h-px mx-2"} ${className ?? ""}`}
      role="separator"
      aria-orientation={orientation}
      {...props}
    />
  );
}
