import { redirect } from "next/navigation";

/**
 * Canonical profile URLs live at `/[username]`. This route previously contained
 * a second, less complete profile implementation. Redirect it so the shared
 * profile experience (privacy, media, badges, follow controls) is used.
 */
export default async function LegacyProfileRedirect({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  redirect(`/${encodeURIComponent(username)}`);
}