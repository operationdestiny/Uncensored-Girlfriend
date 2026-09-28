import Link from "next/link";
import { CharacterGrid } from "@/components/character/CharacterGrid";
import { AppShell } from "@/components/layout/AppShell";
import { getCharactersFromSupabase } from "@/lib/characters-db";
import { guidesForLandingPage } from "@/lib/seo-guides";
import {
  getSeoLandingPage,
  relatedSeoLandingPages
} from "@/lib/seo-landing-pages";

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://uncensoredgirlfriend.chat"
).replace(/\/+$/, "");

function stableOffset(value: string) {
  let total = 0;
  for (let index = 0; index < value.length; index += 1) {
    total = (total * 31 + value.charCodeAt(index)) >>> 0;
  }
  return total % 80;
}

export async function SearchLandingPage({ slug }: { slug: string }) {
  const page = getSeoLandingPage(slug);
  const relatedPages = relatedSeoLandingPages(slug);
  const relatedGuides = guidesForLandingPage(slug).slice(0, 4);
  const perCategory = Math.max(2, Math.ceil(8 / page.categories.length));
  const offset = stableOffset(slug);

  const characterGroups = await Promise.all(
    page.categories.map((category, index) =>
      getCharactersFromSupabase(
        perCategory,
        offset + index * perCategory,
        category
      )
    )
  );
  const characters = characterGroups.flat().slice(0, 8);

  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: page.h1,
      description: page.description,
      url: `${SITE_URL}/${page.slug}`,
      isPartOf: {
        "@type": "WebSite",
        name: "Uncensored Girlfriend",
        url: SITE_URL
      }
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: page.faqs.map((faq) => ({
        "@type": "Question",
        name: faq.q,
        acceptedAnswer: {
          "@type": "Answer",
          text: faq.a
        }
      }))
    }
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <AppShell>
        <main className="mx-auto w-full max-w-[1180px] px-4 pb-16 pt-7 sm:px-6 lg:px-8 lg:pt-8">
          <section className="overflow-hidden rounded-[22px] border border-bond-rose/35 bg-[radial-gradient(circle_at_85%_10%,rgba(244,114,182,0.16),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0.012))] px-5 py-8 shadow-[0_0_36px_rgba(244,114,182,0.08)] sm:px-8 sm:py-10 lg:px-10">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-bond-rose">
              Uncensored Girlfriend companions
            </p>
            <h1 className="mt-3 max-w-4xl font-display text-3xl font-bold leading-tight text-white sm:text-4xl lg:text-5xl">
              {page.h1}
            </h1>
            <p className="mt-5 max-w-4xl text-[15px] leading-7 text-bond-muted sm:text-base">
              {page.intro}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/characters"
                className="rounded-xl border border-bond-rose/70 bg-bond-rose/15 px-5 py-3 text-sm font-bold text-white transition hover:bg-bond-rose/25"
              >
                Browse companions
              </Link>
              <Link
                href="/create"
                className="rounded-xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-bold text-white transition hover:border-white/20 hover:bg-white/[0.07]"
              >
                Create your own
              </Link>
            </div>
          </section>

          <section className="mt-10">
            <div className="mb-5 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-bond-rose">
                  Uncensored Girlfriend companions
                </p>
                <h2 className="mt-2 font-display text-2xl font-bold text-white sm:text-3xl">
                  {page.cardHeading}
                </h2>
              </div>
            </div>
            <CharacterGrid characters={characters} />
          </section>

          <section className="mt-12 grid gap-5 lg:grid-cols-3">
            {page.sections.map((section) => (
              <article
                key={section.heading}
                className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 sm:p-6"
              >
                <h2 className="font-display text-xl font-bold text-white">
                  {section.heading}
                </h2>
                <div className="mt-4 space-y-4 text-sm leading-6 text-bond-muted sm:text-[15px] sm:leading-7">
                  {section.body.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </article>
            ))}
          </section>

          <section className="mt-12 rounded-2xl border border-white/10 bg-white/[0.02] p-5 sm:p-7">
            <h2 className="font-display text-2xl font-bold text-white">
              Related topics
            </h2>
            <div className="mt-5 flex flex-wrap gap-2">
              {page.topics.map((topic) => (
                <span
                  key={topic}
                  className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-xs font-semibold text-bond-muted"
                >
                  {topic}
                </span>
              ))}
            </div>
          </section>

          {relatedGuides.length > 0 && (
            <section className="mt-12">
              <h2 className="font-display text-2xl font-bold text-white">
                Helpful Uncensored Girlfriend guides
              </h2>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {relatedGuides.map((guide) => (
                  <Link
                    key={guide.slug}
                    href={`/guides/${guide.slug}`}
                    className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 transition hover:border-bond-rose/45"
                  >
                    <span className="font-display text-lg font-bold text-white">
                      {guide.h1}
                    </span>
                    <span className="mt-2 block text-sm leading-6 text-bond-muted">
                      {guide.description}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section className="mt-12">
            <h2 className="font-display text-2xl font-bold text-white sm:text-3xl">
              Frequently asked questions
            </h2>
            <div className="mt-5 space-y-3">
              {page.faqs.map((faq) => (
                <details
                  key={faq.q}
                  className="group rounded-2xl border border-white/10 bg-white/[0.025] px-5 py-4"
                >
                  <summary className="cursor-pointer list-none pr-6 text-sm font-bold text-white sm:text-[15px]">
                    {faq.q}
                  </summary>
                  <p className="mt-3 text-sm leading-6 text-bond-muted sm:text-[15px] sm:leading-7">
                    {faq.a}
                  </p>
                </details>
              ))}
            </div>
          </section>

          <section className="mt-12 border-t border-white/10 pt-8">
            <h2 className="font-display text-xl font-bold text-white">
              Explore related Uncensored Girlfriend topics
            </h2>
            <div className="mt-4 flex flex-wrap gap-3">
              {relatedPages.map((related) => (
                <Link
                  key={related.slug}
                  href={`/${related.slug}`}
                  className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-semibold text-bond-muted transition hover:border-bond-rose/45 hover:text-white"
                >
                  {related.h1}
                </Link>
              ))}
            </div>
          </section>

          <section className="mt-12 rounded-2xl border border-bond-rose/30 bg-bond-rose/[0.06] px-5 py-7 text-center sm:px-8">
            <h2 className="font-display text-2xl font-bold text-white">
              Find the companion you want on Uncensored Girlfriend
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-bond-muted sm:text-[15px]">
              Browse existing companions or create your own. Memory keeps the relationship moving forward, and KissCoins means no recurring subscription is required.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <Link
                href="/characters"
                className="rounded-xl border border-bond-rose/70 bg-bond-rose/15 px-5 py-3 text-sm font-bold text-white transition hover:bg-bond-rose/25"
              >
                Explore Uncensored Girlfriend
              </Link>
              <Link
                href="/create"
                className="rounded-xl border border-white/10 bg-black/20 px-5 py-3 text-sm font-bold text-white transition hover:border-white/20"
              >
                Create a companion
              </Link>
            </div>
          </section>
        </main>
      </AppShell>
    </>
  );
}
