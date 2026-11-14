export type ProfileTab = "posts" | "replies" | "reposts" | "media" | "likes";

export type ProfileMediaFilter = "all" | "photos" | "gifs" | "videos";

export type ProfileLink = {
  id: string;
  url: string;
  label: string | null;
  display_order: number;
};

export type ProfileHeaderProps = {
  profile: {
    id: string;
    username: string;
    display_name: string | null;
    bio: string | null;
    avatar_url: string | null;
    banner_url: string | null;
    website: string | null;
    location: string | null;
    pronouns: string | null;
    created_at: string;
    profile_customisation?: Record<string, unknown> | null;
    custom_status?: string | null;
    status_emoji?: string | null;
    status_expires_at?: string | null;
    is_private?: boolean | null;
    profile_links?: ProfileLink[] | null;
  };
  isSelf: boolean;
  isFollowing: boolean;
  followerCount: number;
  followingCount: number;
  onFollow: () => void;
  user?: { id: string } | null;
  followStatus?: "pending" | "accepted" | "rejected" | "none";
  followBusy?: boolean;
};
