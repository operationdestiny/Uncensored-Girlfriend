import type { Metadata } from "next";
import { BRAND } from "@/lib/brand";
import { Inter, Space_Grotesk } from "next/font/google";
import { PwaRuntime } from "@/components/pwa/PwaRuntime";
import { OFFICIAL_SITE_URL } from "@/lib/site-seo";
import "./globals.css";
import "./standalone-app.css";
import "./ug-design.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const space = Space_Grotesk({ subsets: ["latin"], variable: "--font-space-grotesk" });

const EVERBOND_SLOGAN = BRAND.slogan;

export const metadata: Metadata = {
  title: "Uncensored Girlfriend — Your Companion. Your Imagination.",
  description:
    "Chat privately with uncensored AI girlfriends, boyfriends, and anime companions. Create your own companions with memory, images, videos, and live voice.",
  metadataBase: new URL(OFFICIAL_SITE_URL),
  applicationName: BRAND.name,
  robots: process.env.LAUNCH_INDEXING_ENABLED === "true" ? { index: true, follow: true } : { index: false, follow: false },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      {
        url: "/pwa/ug-lips-192.png",
        sizes: "192x192",
        type: "image/png"
      },
      {
        url: "/pwa/ug-lips-512.png",
        sizes: "512x512",
        type: "image/png"
      }
    ],
    shortcut: "/pwa/ug-lips-192.png",
    apple: [
      {
        url: "/pwa/ug-lips-192.png",
        sizes: "192x192",
        type: "image/png"
      }
    ]
  },
  appleWebApp: {
    capable: true,
    title: BRAND.name,
    statusBarStyle: "black-translucent"
  },
  openGraph: {
    title: BRAND.name,
    description: EVERBOND_SLOGAN,
    url: `${OFFICIAL_SITE_URL}/`,
    siteName: BRAND.name,
    images: [
      {
        url: "/pwa/ug-lips-512.png",
        width: 512,
        height: 512,
        alt: BRAND.name
      }
    ],
    type: "website"
  },
  twitter: {
    card: "summary",
    title: BRAND.name,
    description: EVERBOND_SLOGAN,
    images: ["/pwa/ug-lips-512.png"]
  }
};

const INITIAL_LANGUAGE_SCRIPT = `
try {
  var code = localStorage.getItem("ug-language") || "EN";
  var languages = { EN: "en", ES: "es", FR: "fr", DE: "de", JA: "ja", KO: "ko" };
  document.documentElement.lang = languages[code] || "en";
} catch (_) {}
`;

const INITIAL_STANDALONE_SCRIPT = `
try {
  var isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;

  if (isStandalone) {
    document.documentElement.classList.add("everbond-standalone");
  }
} catch (_) {}
`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${space.variable}`} suppressHydrationWarning>
      <head>
        <link
          rel="icon"
          href="/pwa/ug-lips-192.png"
          sizes="192x192"
          type="image/png"
        />
        <link
          rel="icon"
          href="/pwa/ug-lips-512.png"
          sizes="512x512"
          type="image/png"
        />
        <link rel="shortcut icon" href="/pwa/ug-lips-192.png" />
        <script dangerouslySetInnerHTML={{ __html: INITIAL_LANGUAGE_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: INITIAL_STANDALONE_SCRIPT }} />
      </head>
      <body>
        <PwaRuntime />
        {children}
      </body>
    </html>
  );
}
