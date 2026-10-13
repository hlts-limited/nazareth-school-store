import Link from "next/link";

export default function NotFound() {
  return (
    <main className="main" style={{ maxWidth: 560 }}>
      <div className="card empty">
        <h3>Page not found</h3>
        <p>The link may be old, or the page was moved.</p>
        <div className="row" style={{ marginTop: 14, justifyContent: "center" }}>
          <Link href="/" className="btn primary">Go to the homepage</Link>
          <Link href="/login" className="btn">School Store</Link>
        </div>
      </div>
    </main>
  );
}
