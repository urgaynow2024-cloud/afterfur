"use client";
import { useCallback, useRef, useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { BadgeList } from "@/components/BadgeList";
import ReportDialog from "@/components/ReportDialog";
import ShareDialog from "@/components/ShareDialog";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import PostText from "@/components/PostText";
import { StyledDisplayName, StyledUsername } from "@/components/profile/styled-name";
import type { ProfileHeaderProps } from "./profile-types";
import { LinkChip } from "@/components/profile/profile-links";
import { ProfileOverflowMenu } from "./profile-overflow-menu";
import { followActionFor, type FollowStatus } from "@/lib/follow";

export function ProfileHeader({
  profile,
  isSelf,
  isFollowing,
  followerCount,
  followingCount,
  onFollow,
  user,
  followStatus = "none",
  followBusy = false,
}: ProfileHeaderProps) {
  const [reportOpen, setReportOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<number | null>(null);
  const [bannerFallback, setBannerFallback] = useState(false);
  const [avatarFallback, setAvatarFallback] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  useEffect(() => {
    if (!user || isSelf) return;
    const supabase = createClient();
    if (!supabase) return;
    supabase.from("blocks" as any).select("blocker_id").eq("blocker_id", user.id).eq("blocked_id", profile.id).maybeSingle().then(({ data }) => setBlocked(!!data));
  }, [user, profile.id, isSelf]);
  async function doBlock() {
    const supabase = createClient();
    if (!supabase || !user || isSelf) return;
    setBlockBusy(true);
    const { error } = await supabase.from("blocks" as any).insert({ blocker_id: user.id, blocked_id: profile.id });
    if (!error) setBlocked(true);
    setBlockBusy(false);
    setConfirmBlock(false);
  }
  async function doUnblock() {
    const supabase = createClient();
    if (!supabase || !user) return;
    setBlockBusy(true);
    await supabase.from("blocks" as any).delete().eq("blocker_id", user.id).eq("blocked_id", profile.id);
    setBlocked(false);
    setBlockBusy(false);
  }

  const profileUrl = typeof window !== "undefined" ? `${window.location.origin}/${profile.username}` : `/${profile.username}`;

  const handleCopyLink = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    navigator.clipboard.writeText(profileUrl);
    setCopied(true);
    if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
    const timer = window.setTimeout(() => setCopied(false), 2000);
    copyTimerRef.current = timer;
  }, [profileUrl]);

  const handleShare = useCallback(() => {
    setShareOpen(true);
  }, []);

  const isOwn = isSelf;
  const showReport = Boolean(user && !isOwn);

  return (
    <div className="relative w-full">
      <div className="w-full border-b border-af-border/60">
        {profile.banner_url && !bannerFallback ? (
          <img
            src={profile.banner_url}
            alt={`${profile.display_name || profile.username}'s banner`}
            className="h-48 sm:h-64 w-full object-cover"
            loading="lazy"
            decoding="async"
            onError={() => setBannerFallback(true)}
          />
        ) : (
          <div aria-hidden="true" className="h-48 sm:h-64 w-full border-b border-af-border bg-af-surface" />
        )}
      </div>

      <div className="relative z-10 mx-auto mt-[-2.5rem] flex justify-center">
        <Avatar
          src={profile.avatar_url ?? undefined}
          size={80}
          fallback={(profile.display_name || profile.username).slice(0, 1).toUpperCase()}
          className="ring-2 ring-af-border rounded-full bg-af-surface object-cover"
          onError={() => setAvatarFallback(true)}
        />
      </div>

      <div className="px-4 sm:px-6 pt-3 pb-6">
        <div className="flex items-baseline gap-2 sm:gap-3">
          <StyledDisplayName profile={profile} size="lg" />
        </div>
        <BadgeList userId={profile.id} className="mt-1" />
        <StyledUsername profile={profile} />
        {profile.pronouns && (
          <span className="ml-1 text-xs text-af-text-2">{profile.pronouns}</span>
        )}
        {profile.custom_status && (!profile.status_expires_at || new Date(profile.status_expires_at) > new Date()) && (
          <p className="mt-1 text-sm text-af-text-2">{profile.status_emoji} {profile.custom_status}</p>
        )}
        {profile.bio && (
          <p className="mt-2 sm:mt-3 max-w-prose whitespace-pre-wrap text-[15px] leading-6 text-af-text-2">
            <PostText content={profile.bio} />
          </p>
        )}
        {profile.profile_links && profile.profile_links.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {profile.profile_links
              .slice()
              .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
              .map((link) => (
                <LinkChip key={link.id} link={link} />
              ))}
          </div>
        )}
        <div className="mt-3 sm:mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-af-muted">
          {profile.location && <span className="flex items-center gap-1.5">📍 {profile.location}</span>}
          {profile.website && (
            <a
              href={profile.website}
              className="text-af-accent hover:underline flex items-center gap-1.5"
              target="_blank"
              rel="noopener noreferrer"
            >
              🔗 {profile.website.replace(/^https?:\/\//, "")}
            </a>
          )}
          <span className="flex items-center gap-1.5">📅 Joined {new Date(profile.created_at).toLocaleDateString()}</span>
        </div>
        <div className="mt-4 sm:mt-5 flex gap-8 sm:gap-10 text-sm">
          <span className="flex flex-col items-center gap-0.5">
            <strong className="text-af-text">{followingCount}</strong>
            <span className="text-af-muted text-xs">Following</span>
          </span>
          <span className="flex flex-col items-center gap-0.5">
            <strong className="text-af-text">{followerCount}</strong>
            <span className="text-af-muted text-xs">Followers</span>
          </span>
        </div>
        <div className="mt-4 sm:mt-5 flex flex-wrap items-center justify-between gap-2 sm:gap-3">
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            {isOwn ? (
              <Link href="/edit-profile" className="af-btn af-btn-ghost w-full sm:w-auto">
                Edit profile
              </Link>
            ) : (
              <Button
                variant={followStatus === "accepted" ? "secondary" : "primary"}
                onClick={onFollow}
                disabled={followBusy || blocked}
                className="w-full sm:w-auto"
              >
                {followBusy ? "..." : followStatus === "accepted" ? "Following" : followStatus === "pending" ? "Requested" : profile.is_private ? "Request Follow" : "Follow"}
              </Button>
            )}
            {showReport && (
              <button type="button" onClick={() => setReportOpen(true)} className="min-h-10 rounded-md border border-af-border px-3 text-xs font-medium text-af-text-2 hover:bg-af-surface-2 hover:text-af-text">
                Report user
              </button>
            )}
            {showReport && !blocked && (
              <button type="button" onClick={() => setConfirmBlock(true)} disabled={blockBusy} className="min-h-10 rounded-md border border-af-border px-3 text-xs font-medium text-af-text-2 hover:bg-af-surface-2 hover:text-af-text">
                Block
              </button>
            )}
            {showReport && blocked && (
              <button type="button" onClick={doUnblock} disabled={blockBusy} className="min-h-10 rounded-md border border-af-border px-3 text-xs font-medium text-af-text-2 hover:bg-af-surface-2 hover:text-af-text">
                Unblock
              </button>
            )}
            {confirmBlock && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                <div className="rounded-lg border border-af-border bg-af-surface p-4">
                  <p className="text-sm">Block this user?</p>
                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={doBlock} disabled={blockBusy} className="min-h-9 rounded-md bg-af-brand px-3 text-xs font-semibold text-white">Confirm</button>
                    <button type="button" onClick={() => setConfirmBlock(false)} className="min-h-9 rounded-md border border-af-border px-3 text-xs">Cancel</button>
                  </div>
                </div>
              </div>
            )}
          </div>
          <ProfileOverflowMenu
            profile={{ id: profile.id, username: profile.username, display_name: profile.display_name }}
            profileUrl={profileUrl}
            onCopyLink={handleCopyLink}
            onShare={handleShare}
            onReport={() => setReportOpen(true)}
            copied={copied}
          />
        </div>
      </div>
      <ShareDialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        url={profileUrl}
        title={`${profile.display_name || profile.username} on AfterFur`}
        text={`Check out ${profile.display_name || profile.username}'s profile on AfterFur`}
        dialogTitle={`Share ${profile.display_name || profile.username}'s profile`}
        authorLabel={`@${profile.username} on AfterFur`}
        onCopyLink={handleCopyLink}
      />
      <ReportDialog open={reportOpen} onClose={() => setReportOpen(false)} targetType="user" targetId={profile.id} targetLabel="this account" />
    </div>
  );
}
