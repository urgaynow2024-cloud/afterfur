"use client";
import { Suspense } from "react";
import PostClient from "./PostClient";

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-af-bg" />}>
      <PostClient />
    </Suspense>
  );
}
