import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { env } from "@/shared/config/env";
import { SCHOOL } from "@/shared/config/school";
import { Icon } from "@/shared/ui/icon";
import { latestNews, newsBySlug } from "@/modules/website";
import { PageHero, Section } from "../../_parts";
import { NewsCard, newsDate, newsTeaser } from "../../_news";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const n = await newsBySlug((await params).slug);
  return n ? { title: n.title, description: newsTeaser(n) } : { title: "News" };
}

export default async function NewsPostPage({ params }: Props) {
  const n = await newsBySlug((await params).slug);
  if (!n) notFound();
  const more = (await latestNews(4)).filter((p) => p.id !== n.id).slice(0, 3);
  const share = `https://wa.me/?text=${encodeURIComponent(`${n.title} · ${SCHOOL.name}\n${env().APP_URL}/news/${n.slug}`)}`;
  return (
    <>
      <PageHero crumb={[["School life"], ["News", "/news"], [n.title]]} title={n.title} lead={newsDate(n.publishedAt)} />
      <Section>
        <article className="news-article">
          {n.photoKey && (
            <div className="news-photo"><Image src={`/api/files/${n.photoKey}`} alt="" fill sizes="(max-width: 860px) 100vw, 760px" unoptimized priority /></div>
          )}
          {n.summary && <p className="news-lead">{n.summary}</p>}
          {n.body.split(/\n\s*\n/).map((para, i) => <p key={i}>{para}</p>)}
          <div className="row" style={{ marginTop: 8 }}>
            <a className="btn wa" href={share} target="_blank" rel="noopener noreferrer"><Icon name="whatsapp" size="sm" />Share on WhatsApp</a>
            <Link className="btn" href="/news"><Icon name="back" size="sm" />All news</Link>
          </div>
        </article>
      </Section>
      {more.length > 0 && (
        <Section eyebrow="More news" title="Also from the school">
          <div className="grid g3">{more.map((p) => <NewsCard key={p.id} n={p} />)}</div>
        </Section>
      )}
    </>
  );
}
