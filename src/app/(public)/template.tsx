/** Re-mounts on every page change, so each page fades in (see .page-in in src/styles/06-motion.css). */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-in">{children}</div>;
}
