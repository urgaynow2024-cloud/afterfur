"use client";

import type { ReactNode } from "react";
import { useAuth } from "@/components/AuthProvider";
import { PostInteractionProvider } from "@/components/PostInteractionProvider";
import { UserBadgeProvider } from "@/components/UserBadgeProvider";

export function PostInteractionGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return <PostInteractionProvider user={user}><UserBadgeProvider>{children}</UserBadgeProvider></PostInteractionProvider>;
}
