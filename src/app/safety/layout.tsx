import type { Metadata } from "next";

export const metadata: Metadata = {
  title: 'EverBond Safety',
  description: 'Learn about EverBond safety rules for private AI companion chat, user-created characters, account data, and adult fictional roleplay.',
  alternates: {
    canonical: '/safety'
  },
  robots: {
    index: true,
    follow: true
  },
  openGraph: {
    title: 'EverBond Safety',
    description: 'Learn about EverBond safety rules for private AI companion chat, user-created characters, account data, and adult fictional roleplay.',
    url: '/safety',
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
