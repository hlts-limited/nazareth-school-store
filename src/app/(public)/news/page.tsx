import type { Metadata } from "next";
import { SCHOOL } from "@/shared/config/school";
import { Empty } from "@/shared/ui/primitives";
import { latestNews } from "@/modules/website";
import { AdmissionCta, PageHero, Section, SectionLinks } from "../_parts";
import { NewsCard } from "../_news";

export const metadata: Metadata = { title: "News", description: `Results, awards, trips and other news from ${SCHOOL.name}.` };

export default async function NewsPage() {
  const posts = await latestNews(60);
  return (
    <>
      <PageHero crumb={[["School life"], ["News"]]} title="School news" lead={`Results, awards, visits and trips: what's been happening at ${SCHOOL.name}.`} />
      <Section>
        {posts.length
          ? <div className="grid g3">{posts.map((n) => <NewsCard key={n.id} n={n} />)}</div>
          : <div className="card"><Empty title="No news yet">News from the school will appear here.</Empty></div>}
      </Section>
      <SectionLinks group="School life" current="/news" />
      <AdmissionCta />
    </>
  );
}
