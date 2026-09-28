import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { SEO_GUIDES } from "@/lib/seo-guides";

export const metadata: Metadata = {
  title: "AI Companion Guides: Girlfriends, Memory & Roleplay | Uncensored Girlfriend",
  description:
    "Practical Uncensored Girlfriend guides about AI girlfriends, AI companions, memory, private chat, character creation, roleplay and pay-as-you-go companion pricing.",
  alternates: { canonical: "/guides" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Uncensored Girlfriend Companion Guides",
    description:
      "Guides to AI companions, memory, character creation, romantic roleplay, privacy and pricing.",
    url: "/guides",
    siteName: "Uncensored Girlfriend",
    type: "website"
  }
};

export default function GuidesPage() {
  return (
    <AppShell>
      <main className="mx-auto w-full max-w-[1100px] px-4 pb-16 pt-7 sm:px-6 lg:px-8 lg:pt-8">
        <header className="rounded-[22px] border border-bond-rose/35 bg-[radial-gradient(circle_at_88%_10%,rgba(244,114,182,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0.012))] px-5 py-8 sm:px-8 sm:py-10">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-bond-rose">
            Uncensored Girlfriend Guides
          </p>
          <h1 className="mt-3 font-display text-3xl font-bold text-white sm:text-4xl lg:text-5xl">
            AI Companion, Memory and Roleplay Guides
          </h1>
          <p className="mt-5 max-w-4xl text-[15px] leading-7 text-bond-muted sm:text-base">
            Practical explanations for choosing, creating and building ongoing relationships with AI companions. Explore memory, private chat, romantic roleplay, pricing and character design without changing the main Uncensored Girlfriend browsing experience.
          </p>
        </header>

        <section className="mt-10 grid gap-4 md:grid-cols-2">
          {SEO_GUIDES.map((guide) => (
            <article
              key={guide.slug}
              className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 sm:p-6"
            >
              <h2 className="font-display text-xl font-bold text-white">
                <Link
                  href={`/guides/${guide.slug}`}
                  className="transition hover:text-bond-rose"
                >
                  {guide.h1}
                </Link>
              </h2>
              <p className="mt-3 text-sm leading-6 text-bond-muted">
                {guide.description}
              </p>
              <Link
                href={`/guides/${guide.slug}`}
                className="mt-4 inline-flex text-sm font-bold text-bond-rose hover:text-white"
              >
                Read guide →
              </Link>
            </article>
          ))}
        </section>
      </main>
    </AppShell>
  );
}
