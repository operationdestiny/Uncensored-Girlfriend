import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

const EVERBOND_SLOGAN = "Bond forever with truly unrestricted AI companions";

export function HeroSection() {
  const hero = {
    name: "Uncensored Girlfriend",
    tagline: "Choose a companion that remembers your story.",
    image: "/everbond-logo.png",
  };

  return (
    <section className="relative overflow-hidden py-16 md:py-24">
      <div className="bond-container grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
        <div>
          <div className="mb-8 flex items-center gap-5">
            <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-[2rem] border border-bond-gold/30 bg-black shadow-glow md:h-36 md:w-36">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/everbond-logo.png" alt="Uncensored Girlfriend logo" className="h-full w-full object-cover" />
            </div>
            <div>
              <p className="font-display text-5xl font-bold text-bond-rose md:text-6xl">Uncensored Girlfriend</p>
              <p className="text-sm text-bond-muted md:text-base">{EVERBOND_SLOGAN}</p>
            </div>
          </div>
          <h1 className="mt-6 font-display text-5xl font-bold leading-[0.95] tracking-tight md:text-7xl">
            {EVERBOND_SLOGAN}
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-bond-muted md:text-xl">
            Chat instantly with AI companions powered with Memory™ so you can always continue where you left off. 100% private chats.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/companions"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-bond-violet px-6 py-3.5 text-sm font-bold text-white shadow-glow transition hover:scale-[1.02]"
            >
              Start chatting <ArrowRight size={16} />
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.03] px-6 py-3.5 text-sm font-bold text-white transition hover:bg-white/[0.07]"
            >
              Buy KissCoins
            </Link>
          </div>

          <div className="mt-14 flex w-full flex-col items-center justify-center text-center">
            <p className="font-display text-2xl font-bold text-bond-gold drop-shadow-[0_0_24px_rgba(251,191,36,0.85)] md:text-3xl">
              Scroll down for details
            </p>
            <p className="mt-2 text-5xl leading-none text-bond-gold drop-shadow-[0_0_24px_rgba(251,191,36,0.85)]">↓</p>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-[470px]">
          <div className="absolute -inset-4 rounded-[3rem] bg-bond-violet/20 blur-3xl" />
          <div className="bond-card relative overflow-hidden rounded-[2.4rem]">
            <div className="relative aspect-[3/4]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={hero.image} alt={hero.name} className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-bond-bg via-bond-bg/20 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-6">
                <div className="mb-4 flex items-center gap-2">
                  <Sparkles size={16} className="text-bond-gold" />
                  <span className="text-sm font-semibold text-bond-gold">Memory™ keeps the bond alive</span>
                </div>
                <h2 className="font-display text-3xl font-bold">{hero.name}</h2>
                <p className="mt-2 text-sm leading-6 text-bond-muted">{hero.tagline}</p>
                <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm leading-6">
                  <span className="text-bond-gold">✦ Remembered:</span> your story, your moments, and where you left off.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
