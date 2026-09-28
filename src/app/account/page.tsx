"use client";

import { AppShell } from "@/components/layout/AppShell";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { useSiteLanguage } from "@/lib/site-language";

export default function AccountPage() {
  const { t } = useSiteLanguage();

  const sections = [t("username"), t("subscriptionStatus"), t("createdCompanions"), t("favorites")];

  return (
    <AppShell>
      <main className="py-14">
        <div className="bond-container">
          <SectionHeader
            eyebrow={t("profile")}
            title={t("yourEverBondAccount")}
            description={t("accountDescription")}
          />
          <div className="mx-auto grid max-w-3xl gap-4">
            {sections.map((section) => (
              <div key={section} className="bond-card rounded-[2rem] p-5">
                <p className="font-display text-xl font-bold">{section}</p>
                <p className="mt-2 text-sm text-bond-muted">{t("connectSupabaseAuth")}</p>
              </div>
            ))}
          </div>
        </div>
      </main>
    </AppShell>
  );
}
