import { Suspense } from "react";
import ProfileClient from "./ProfileClient";

export default function Page({ params }: { params: { username: string } }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-af-bg" />}>
      <ProfileClient username={params.username} />
    </Suspense>
  );
}
