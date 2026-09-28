"use client";

import { LockKeyhole, Sparkles } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/components/auth/AuthProvider";
import { GiftInventorySection } from "@/components/evershop/GiftInventorySection";
import { MyBondDashboard } from "@/components/my-bond/MyBondDashboard";
import { useSiteLanguage } from "@/lib/site-language";
import { MY_BOND_COPY } from "@/lib/my-bond-language";

function MyBondContent() {
  const { language } = useSiteLanguage();
  const { session, authReady, openAuthModal } = useAuth();
  const copy = MY_BOND_COPY[language] ?? MY_BOND_COPY.EN;

  if (!authReady) {
    return (
      <main className="min-h-screen px-4 py-16 md:px-6">
        <section className="bond-container">
          <div className="mx-auto max-w-2xl rounded-[2rem] border border-bond-rose/40 bg-white/[0.035] p-8 text-center shadow-[0_0_44px_rgba(255,92,168,0.10)]">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-bond-rose/15 text-bond-rose">
              <LockKeyhole size={30} />
            </div>
            <p className="mt-6 text-sm font-bold uppercase tracking-[0.25em] text-bond-rose">
              My Companions
            </p>
            <p className="mt-5 animate-pulse text-base text-bond-muted">
              {copy.loadingBond}
            </p>
          </div>
        </section>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="min-h-screen px-4 py-16 md:px-6">
        <section className="bond-container">
          <div className="mx-auto max-w-2xl rounded-[2rem] border border-bond-rose/40 bg-white/[0.035] p-8 text-center shadow-[0_0_44px_rgba(255,92,168,0.10)]">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-bond-rose/15 text-bond-rose">
              <LockKeyhole size={30} />
            </div>
            <p className="mt-6 text-sm font-bold uppercase tracking-[0.25em] text-bond-rose">
              My Companions
            </p>
            <h1 className="mt-4 font-display text-4xl font-bold text-white md:text-5xl">
              {copy.lockedTitle}
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-bond-muted">
              {copy.lockedDescription}
            </p>
            <button
              type="button"
              onClick={openAuthModal}
              className="mt-8 inline-flex rounded-full bg-bond-rose px-7 py-3 text-sm font-bold text-white transition hover:bg-bond-rose/90"
            >
              {copy.loginSignup}
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="ug-my-companions">
      <header className="ug-my-companions-header">
        <p className="ug-kicker"><Sparkles size={15}/> YOUR WORLD</p>
        <h1>My <em>Companions</em></h1>
        <p>All your favorite connections, memories, and creations in one place.</p>
      </header>
      <MyBondDashboard session={session} />
      <GiftInventorySection session={session} />
    </main>
  );
}

export default function MyBondPage() {
  return (
    <AppShell>
      <MyBondContent />
    </AppShell>
  );
}
