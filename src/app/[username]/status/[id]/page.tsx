import { Suspense } from "react";
import PostClient from "./PostClient";

export default function Page({ params }: { params: { username: string; id: string } }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-af-bg" />}>
      <PostClient username={params.username} id={params.id} />
    </Suspense>
  );
}
