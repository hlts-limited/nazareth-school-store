"use client";

import { AreaError } from "@/shared/ui/area-states";

/** Last resort for pages outside the website, store and back office (sign-in, invites, payments). */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="main mw-560">
      <AreaError error={error} reset={reset} home="/" homeLabel="Back to the school website" />
    </main>
  );
}
