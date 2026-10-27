"use client";
import { Suspense } from "react";
import ProfileClient from "./ProfileClient";

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-af-bg" />}>
      <ProfileClient />
    </Suspense>
  );
}
