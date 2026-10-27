import { Suspense } from "react";
import CallbackClient from "./CallbackClient";

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-af-bg px-4"><div className="w-full max-w-md rounded-2xl border border-af-border bg-af-surface p-6 text-center"><p className="text-sm text-af-text">Confirming your account...</p></div></div>}>
      <CallbackClient />
    </Suspense>
  );
}
