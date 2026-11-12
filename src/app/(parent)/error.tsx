"use client";

import { AreaError } from "@/shared/ui/area-states";

export default function AreaErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <AreaError error={error} reset={reset} home="/home" homeLabel="Back to home" />;
}
