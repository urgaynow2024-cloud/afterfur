import { Suspense } from "react";
import PostClient from "./PostClient";

export default async function Page({ params }: { params: Promise<{ username: string; id: string }> }) {
  const { username, id } = await params;
  return (
    <Suspense fallback={<div className="min-h-screen bg-af-bg" />}>
      <PostClient username={username} id={id} />
    </Suspense>
  );
}

export const dynamic = 'force-dynamic';
