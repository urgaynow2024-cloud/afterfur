import { Suspense } from "react";
import { connection } from "next/server";
import PostClient from "./PostClient";

async function RequestTimePostContent() {
  // The post is loaded client-side; this keeps its visible content request-time.
  await connection();
  return <PostClient />;
}

async function DynamicMarker() {
  await connection();
  return null;
}

export default function Page() {
  return (
    <>
      <Suspense fallback={<div className="min-h-screen bg-af-bg" />}>
        <RequestTimePostContent />
      </Suspense>
      <Suspense>
        <DynamicMarker />
      </Suspense>
    </>
  );
}
