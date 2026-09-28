import Link from "next/link";
import { CharacterGrid } from "@/components/character/CharacterGrid";
import { AppShell } from "@/components/layout/AppShell";
import { getCharactersFromSupabase } from "@/lib/characters-db";
import {
  relatedSeoGuides,
  type SeoGuideConfig
} from "@/lib/seo-guides";

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://uncensoredgirlfriend.chat"
).replace(/\/+$/, "");

function stableOffset(value: string) {
  let total = 0;
  for (let index = 0; index < value.length; index += 1) {
    total = (total * 33 + value.charCodeAt(index)) >>> 0;
  }
  return total % 75;
}

export async function GuidePage({ guide }: { guide: SeoGuideConfig }) {
  const relatedGuides = relatedSeoGuides(guide.slug);
  const relatedLandingPages = guide.relatedLandingSlugs;
  const perCategory = Math.max(2, Math.ceil(6 / guide.categories.length));
  const offset = stableOffset(guide.slug);

  const characterGroups = await Promise.all(
    guide.categories.map((category, index) =>
      getCharactersFromSupabase(
        perCategory,
        offset + index * perCategory,
        category
      )
    )
  );
  const characters = characterGroups.flat().slice(0, 6);

  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: guide.h1,
      description: guide.description,
      mainEntityOfPage: `${SITE_URL}/guides/${guide.slug}`,
      author: {
        "@type": "Organization",
        name: "Uncensored Girlfriend",
        url: SITE_URL
      },
      publisher: {
        "@type": "Organization",
        name: "Uncensored Girlfriend",
        url: SITE_URL
      }
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: guide.faqs.map((faq) => ({
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
        <main className="mx-auto w-full max-w-[1080px] px-4 pb-16 pt-7 sm:px-6 lg:px-8 lg:pt-8">
          <nav aria-label="Breadcrumb" className="mb-5 text-xs text-bond-muted">
            <Link href="/guides" className="hover:text-white">
              Uncensored Girlfriend Guides
            </Link>
            <span className="px-2">/</span>
            <span>{guide.h1}</span>
          </nav>

          <article>
            <header className="overflow-hidden rounded-[22px] border border-bond-rose/35 bg-[radial-gradient(circle_at_88%_12%,rgba(244,114,182,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0.012))] px-5 py-8 shadow-[0_0_36px_rgba(244,114,182,0.08)] sm:px-8 sm:py-10 lg:px-10">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-bond-rose">
                Uncensored Girlfriend Guides
              </p>
              <h1 className="mt-3 max-w-4xl font-display text-3xl font-bold leading-tight text-white sm:text-4xl lg:text-5xl">
                {guide.h1}
              </h1>
              <p className="mt-5 max-w-4xl text-[15px] leading-7 text-bond-muted sm:text-base">
                {guide.intro}
              </p>
            </header>

            <div className="mt-10 space-y-6">
              {guide.sections.map((section) => (
                <section
                  key={section.heading}
                  className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 sm:p-7"
                >
                  <h2 className="font-display text-2xl font-bold text-white">
                    {section.heading}
                  </h2>
                  <div className="mt-4 space-y-4 text-[15px] leading-7 text-bond-muted">
                    {section.body.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                  </div>
                </section>
              ))}
            </div>

            <section className="mt-10 rounded-2xl border border-white/10 bg-white/[0.02] p-5 sm:p-7">
              <h2 className="font-display text-xl font-bold text-white">
                Topics covered in this guide
              </h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {guide.topics.map((topic) => (
                  <span
                    key={topic}
                    className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-xs font-semibold text-bond-muted"
                  >
                    {topic}
                  </span>
                ))}
              </div>
            </section>

            <section className="mt-10">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-bond-rose">
                Uncensored Girlfriend companions
              </p>
              <h2 className="mt-2 font-display text-2xl font-bold text-white sm:text-3xl">
                {guide.cardHeading}
              </h2>
              <div className="mt-5">
                <CharacterGrid characters={characters} />
              </div>
            </section>

            <section className="mt-12">
              <h2 className="font-display text-2xl font-bold text-white sm:text-3xl">
                Frequently asked questions
              </h2>
              <div className="mt-5 space-y-3">
                {guide.faqs.map((faq) => (
                  <details
                    key={faq.q}
                    className="rounded-2xl border border-white/10 bg-white/[0.025] px-5 py-4"
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

            <section className="mt-12 grid gap-5 lg:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 sm:p-6">
                <h2 className="font-display text-xl font-bold text-white">
                  Continue reading
                </h2>
                <div className="mt-4 flex flex-col gap-2">
                  {relatedGuides.map((related) => (
                    <Link
                      key={related.slug}
                      href={`/guides/${related.slug}`}
                      className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-semibold text-bond-muted transition hover:border-bond-rose/45 hover:text-white"
                    >
                      {related.h1}
                    </Link>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 sm:p-6">
                <h2 className="font-display text-xl font-bold text-white">
                  Explore Uncensored Girlfriend
                </h2>
                <div className="mt-4 flex flex-col gap-2">
                  {relatedLandingPages.map((slug) => (
                    <Link
                      key={slug}
                      href={`/${slug}`}
                      className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-semibold text-bond-muted transition hover:border-bond-rose/45 hover:text-white"
                    >
                      {slug
                        .split("-")
                        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
                        .join(" ")}
                    </Link>
                  ))}
                </div>
              </div>
            </section>

            <section className="mt-12 rounded-2xl border border-bond-rose/30 bg-bond-rose/[0.06] px-5 py-7 text-center sm:px-8">
              <h2 className="font-display text-2xl font-bold text-white">
                Put the guide into practice on Uncensored Girlfriend
              </h2>
              <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-bond-muted sm:text-[15px]">
                Explore existing companions or create one of your own, then build an ongoing relationship with Memory and pay-as-you-go KissCoins.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-3">
                <Link
                  href="/characters"
                  className="rounded-xl border border-bond-rose/70 bg-bond-rose/15 px-5 py-3 text-sm font-bold text-white transition hover:bg-bond-rose/25"
                >
                  Browse companions
                </Link>
                <Link
                  href="/create"
                  className="rounded-xl border border-white/10 bg-black/20 px-5 py-3 text-sm font-bold text-white transition hover:border-white/20"
                >
                  Create your own
                </Link>
              </div>
            </section>
          </article>
        </main>
      </AppShell>
    </>
  );
}
