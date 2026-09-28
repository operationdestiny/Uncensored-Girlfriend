import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Legal documents in preparation | Uncensored Girlfriend",
  description: "Legal documents for this new platform are not yet published.",
  robots: { index: false, follow: false }
};
export default function LegalLayout({ children }: { children: React.ReactNode }) { return children; }
