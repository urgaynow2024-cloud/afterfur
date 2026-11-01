"use client";
import * as React from "react";

type ProfileTab = "posts" | "replies" | "reposts" | "media" | "likes";

type ProfileTabsProps = {
  activeTab: ProfileTab;
  onTabChange: (tab: ProfileTab) => void;
  tabs?: ProfileTab[];
  className?: string;
};

const LABELS: Record<ProfileTab, string> = {
  posts: "Posts",
  replies: "Replies",
  reposts: "Reposts",
  media: "Media",
  likes: "Likes",
};

export function ProfileTabs({ activeTab, onTabChange, tabs, className }: ProfileTabsProps) {
  const items = tabs ?? Object.keys(LABELS) as ProfileTab[];
  return (
    <div
      role="tablist"
      aria-label="Profile tabs"
      className={`flex border-b border-af-border px-2 ${className ?? ""}`}
    >
      {items.map((tab) => {
        const label = LABELS[tab];
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => onTabChange(tab)}
            className={`relative min-h-10 flex-1 px-3 sm:px-4 text-xs sm:text-sm font-medium transition-colors ${
              activeTab === tab ? "font-bold text-af-text" : "text-af-muted hover:text-af-text"
            }`}
          >
            {label}
            {activeTab === tab && (
              <div className="absolute inset-x-1 sm:inset-x-2 bottom-0 h-0.5 rounded-full bg-af-brand" />
            )}
          </button>
        );
      })}
    </div>
  );
}
