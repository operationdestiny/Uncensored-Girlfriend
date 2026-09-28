import type { Metadata } from "next";

export const metadata: Metadata = {
  title: 'Contact EverBond — Support & Help',
  description: 'Contact EverBond support for help, bug reports, feature requests, and business inquiries.',
  alternates: {
    canonical: '/contact'
  },
  robots: {
    index: true,
    follow: true
  },
  openGraph: {
    title: 'Contact EverBond — Support & Help',
    description: 'Contact EverBond support for help, bug reports, feature requests, and business inquiries.',
    url: '/contact',
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
