export function canFollow(currentUserId: string | null | undefined, targetUserId: string | null | undefined) {
  return Boolean(currentUserId && targetUserId && currentUserId !== targetUserId);
}

export function publicProfileUrl(username: string) {
  if (typeof username !== "string" || username.trim() === "") {
    throw new Error("Username is required");
  }
  return `/${encodeURIComponent(username.trim())}`;
}

export function publicPostUrl(username: string, postId: string) {
  if (typeof username !== "string" || username.trim() === "") {
    throw new Error("Username is required");
  }
  if (typeof postId !== "string" || postId.trim() === "") {
    throw new Error("Post ID is required");
  }
  return `/${encodeURIComponent(username.trim())}/status/${encodeURIComponent(postId.trim())}`;
}

export function insertAtCursor(text: string, start: number, end: number, value: string) {
  const safeStart = Math.max(0, Math.min(start, text.length));
  const safeEnd = Math.max(safeStart, Math.min(end, text.length));
  return text.slice(0, safeStart) + value + text.slice(safeEnd);
}
