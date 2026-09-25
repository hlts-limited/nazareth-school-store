"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="main" style={{ maxWidth: 560 }}>
      <div className="card empty">
        <h3>Something went wrong</h3>
        <p>Please try again. If it keeps happening, contact the school office.</p>
        <div style={{ marginTop: 14 }}><button className="btn primary" onClick={() => reset()}>Try again</button></div>
      </div>
    </main>
  );
}
