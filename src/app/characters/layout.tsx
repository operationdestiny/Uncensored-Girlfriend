import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Discover AI Companions — EverBond",
  description:
    "Browse thousands of EverBond AI companions and find characters for private, unrestricted chat, romance, roleplay, Ever Memory, images, video, and voice.",
  alternates: {
    canonical: "/characters"
  },
  robots: {
    index: true,
    follow: true
  },
  openGraph: {
    title: "Discover AI Companions — EverBond",
    description:
      "Browse thousands of EverBond AI companions for private, unrestricted conversations.",
    url: "/characters",
    siteName: "EverBond",
    type: "website"
  }
};

export default function CharactersLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
