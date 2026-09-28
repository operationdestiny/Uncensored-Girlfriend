import type { Metadata } from "next";
/** Legacy URL redirect only. No old brand metadata on the new domain. */
export const metadata: Metadata = {
  title: "Why Choose Us | Uncensored Girlfriend",
  alternates: { canonical: "/why-choose-us" },
  robots: { index: false, follow: false }
};
export default function LegacyWhyLayout({ children }: { children: React.ReactNode }) { return children; }
