import Link from "next/link";

export default function NotFound() {
  return (
    <main className="main" style={{ maxWidth: 560 }}>
      <div className="card empty">
        <h3>Page not found</h3>
        <p>The link may be old, or the page was moved.</p>
        <div style={{ marginTop: 14 }}><Link href="/" className="btn primary">Go to the store</Link></div>
      </div>
    </main>
  );
}
