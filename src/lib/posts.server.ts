import { createServerClient } from "@/lib/supabase/server";
import { canViewPost } from "@/lib/postPrivacy";

export type GetPostForViewerResult = {
  post: any | null;
  error: "no-server-client" | "not-found" | "forbidden" | string | null;
};

function isStaff(appMetadata: Record<string, unknown> | null | undefined): boolean {
  return appMetadata?.afterfur_staff_admin === true || appMetadata?.afterfur_staff_admin === "true";
}

async function hasModeratorRole(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const supabase = createServerClient();
  if (!supabase) return false;
  try {
    const { data } = await supabase.from("moderator_roles").select("role").eq("user_id", userId).maybeSingle();
    return Boolean((data as any)?.role);
  } catch {
    return false;
  }
}

export async function getPostForViewer(opts: {
  postId: string;
  viewerId: string | null;
}): Promise<GetPostForViewerResult> {
  const supabase = createServerClient();
  if (!supabase) return { post: null, error: "no-server-client" };

  let userData: any = { data: { user: null } };
  try {
    const getUser = (supabase as any).auth?.getUser;
    if (typeof getUser === "function") userData = await getUser.call((supabase as any).auth);
  } catch {}
  userData = userData ?? { data: { user: null } };
  const viewerIsStaff = isStaff((userData.user as any)?.app_metadata) || (await hasModeratorRole(opts.viewerId));

  const { data: post, error: postError } = await supabase
    .from("posts")
    .select("*")
    .eq("id", opts.postId)
    .maybeSingle();

  if (postError || !post) return { post: null, error: postError?.message ?? "not-found" };

  // Moderation visibility: hide removed content from ordinary viewers (404 semantics).
  if (!viewerIsStaff && ((post as any).moderation_status ?? "visible") === "removed") {
    return { post: null, error: "not-found" };
  }

  const authorId = (post as any).author_id as string | null;
  if (!authorId) return { post: null, error: "not-found" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id,is_private")
    .eq("id", authorId)
    .maybeSingle();

  const profileIsPrivate = !!(profile as any)?.is_private;

  let blocked = false;
  if (opts.viewerId && authorId) {
    const { data: block } = await supabase
      .from("blocks")
      .select("blocker_id")
      .eq("blocker_id", opts.viewerId)
      .eq("blocked_id", authorId)
      .maybeSingle();
    blocked = !!block;
  }

  let followStatus: "pending" | "accepted" | "rejected" | "none" | null = "none";
  if (opts.viewerId && authorId) {
    if (opts.viewerId === authorId) followStatus = null;
    else {
      const { data: follow } = await supabase
        .from("follows")
        .select("status")
        .eq("follower_id", opts.viewerId)
        .eq("following_id", authorId)
        .maybeSingle();
      if (follow?.status === "accepted" || follow?.status === "pending" || follow?.status === "rejected") followStatus = follow.status;
      else followStatus = "none";
    }
  }

  const allowed = canViewPost({
    authorId,
    viewerId: opts.viewerId,
    profileIsPrivate,
    followStatus,
    blocked,
  });

  if (!allowed) return { post: null, error: "forbidden" };
  return { post, error: null };
}

export async function getFeedPostsForViewer(opts:{viewerId:string|null, limit?:number, cursor?:{created_at:string,id:string}|null, onlyFollowing?:boolean}){
  const supabase = createServerClient();
  if(!supabase) return { posts: [], error: 'no-server-client' };

  // Staff/moderators can see removed content in moderation tools, but public feed
  // should still hide removed content for ordinary viewers.
  let userData: any = { data: { user: null } };
  try {
    const getUser = (supabase as any).auth?.getUser;
    if (typeof getUser === "function") userData = await getUser.call((supabase as any).auth);
  } catch {}
  userData = userData ?? { data: { user: null } };
  const viewerIsStaff = isStaff((userData?.user as any)?.app_metadata) || (await hasModeratorRole(opts.viewerId));

  let q = supabase.from('posts').select('*').order('created_at',{ascending:false}).order('id',{ascending:false}).limit(opts.limit||40);
  if(opts.cursor){
    q = (q as any).or(`created_at.lt.${opts.cursor.created_at},and(created_at.eq.${opts.cursor.created_at},id.lt.${opts.cursor.id})`);
  }
  if (!viewerIsStaff) {
    // Compatible with migration 0034: treat null/missing as visible.
    q = (q as any).or('moderation_status.is.null,moderation_status.eq.visible');
  }

  const { data: posts, error } = await q;
  if(error || !posts) return { posts: [], error: error?.message||'error' };
  const authorIds=[...new Set((posts as any[]).map((p:any)=>p.author_id).filter(Boolean))];
  const { data: profiles } = authorIds.length ? await supabase.from('profiles').select('id,username,display_name,avatar_url,is_private').in('id',authorIds):{data:[]};
  const profMap=new Map((profiles||[]).map((p:any)=>[p.id,p]));
  let followMap=new Map();
  let blockedSet=new Set<string>();
  if(opts.viewerId){
    const [follows,blocks] = await Promise.all([
      supabase.from('follows').select('following_id,status').eq('follower_id',opts.viewerId),
      supabase.from('blocks').select('blocked_id').eq('blocker_id',opts.viewerId),
    ]);
    (follows.data||[]).forEach((f:any)=>{ if(f.following_id) followMap.set(f.following_id,f.status); });
    (blocks.data||[]).forEach((b:any)=>{ if(b.blocked_id) blockedSet.add(b.blocked_id); });
  }
  const { canShowPostInFeed } = await import('@/lib/feedPrivacy');
  const filtered = (posts as any[])
    .filter((p:any)=> !blockedSet.has(p.author_id))
    .filter((p:any)=> viewerIsStaff || ((p.moderation_status ?? 'visible') === 'visible'))
    .filter((p:any)=>{ const prof=profMap.get(p.author_id); return canShowPostInFeed(p, prof, { viewerId: opts.viewerId, followMap, blockedSet }); })
    .map((p:any)=>({...p, profiles: profMap.get(p.author_id)||null}));
  return { posts: filtered, error: null };
}
