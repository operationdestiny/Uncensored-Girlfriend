import type { Metadata } from "next";

export const metadata: Metadata = {
  title: 'EverShop — EverBond',
  description: 'Explore EverShop gifts, outfits, accessories, and special items for your EverBond companion.',
  alternates: {
    canonical: '/shop'
  },
  robots: {
    index: true,
    follow: true
  },
  openGraph: {
    title: 'EverShop — EverBond',
    description: 'Explore EverShop gifts, outfits, accessories, and special items for your EverBond companion.',
    url: '/shop',
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
