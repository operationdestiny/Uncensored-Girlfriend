import type { Metadata } from "next";

export const metadata: Metadata = {
  title: 'Buy EverCoin — EverBond',
  description: 'Buy EverCoin for EverBond messages, images, videos, voice calls, gifts, and other supported features. One-time purchases with no recurring subscription.',
  alternates: {
    canonical: '/coins'
  },
  robots: {
    index: true,
    follow: true
  },
  openGraph: {
    title: 'Buy EverCoin — EverBond',
    description: 'Buy EverCoin for EverBond messages, images, videos, voice calls, gifts, and other supported features. One-time purchases with no recurring subscription.',
    url: '/coins',
    siteName: "EverBond",
    type: "website"
  }
};

export default function Layout({
  children
}: {
  children: React.ReactNode;
}) {
  return children;
}
