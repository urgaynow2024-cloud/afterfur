"use client";

import { useNotificationCount } from "@/components/NotificationProvider";

export function NotificationNavBadge() {
  const context = useNotificationCount();
  const count = context?.unreadCount ?? 0;
  if (count <= 0) return null;
  const label = count > 99 ? "99+" : String(count);
  return (
    <span
      aria-label={`${count} unread notifications`}
      className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-af-danger px-1 text-[10px] font-bold text-white"
    >
      {label}
    </span>
  );
}