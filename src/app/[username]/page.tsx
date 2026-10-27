import { Suspense } from "react";
import ProfileClient from "./ProfileClient";

export default async function Page({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return (
    <Suspense fallback={<div className="min-h-screen bg-af-bg" />}>
      <ProfileClient username={username} />
    </Suspense>
  );
}
