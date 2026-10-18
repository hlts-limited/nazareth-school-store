import type { NewsPost } from "@prisma/client";
import Image from "next/image";
import Link from "next/link";

export const newsDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Lagos" });

/** The summary, or the start of the story when there is none */
export const newsTeaser = (n: NewsPost) => n.summary || (n.body.length > 180 ? `${n.body.slice(0, 180).replace(/\s+\S*$/, "")}…` : n.body);

export function NewsCard({ n }: { n: NewsPost }) {
  return (
    <article className="card pad-0 news-card lift">
      <div className="news-card-img">
        {n.photoKey
          ? <Image src={`/api/files/${n.photoKey}`} alt="" fill sizes="(max-width: 860px) 100vw, 400px" unoptimized />
          : <span className="news-card-ph" aria-hidden="true">News</span>}
      </div>
      <div className="stack tight card-b">
        <span className="small muted">{newsDate(n.publishedAt)}</span>
        <h3><Link className="card-link" href={`/news/${n.slug}`}>{n.title}</Link></h3>
        <p className="muted news-teaser">{newsTeaser(n)}</p>
      </div>
    </article>
  );
}
