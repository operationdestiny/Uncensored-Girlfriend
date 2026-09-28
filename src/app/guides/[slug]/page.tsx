import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GuidePage } from "@/components/seo/GuidePage";
import {
  SEO_GUIDES,
  getSeoGuide,
  metadataForSeoGuide
} from "@/lib/seo-guides";

type GuideRouteProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return SEO_GUIDES.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({
  params
}: GuideRouteProps): Promise<Metadata> {
  const { slug } = await params;
  const guide = getSeoGuide(slug);

  if (!guide) {
    return {
      title: "EverBond Guides",
      robots: { index: false, follow: false }
    };
  }

  return metadataForSeoGuide(guide);
}

export default async function GuideRoute({ params }: GuideRouteProps) {
  const { slug } = await params;
  const guide = getSeoGuide(slug);

  if (!guide) notFound();

  return <GuidePage guide={guide} />;
}
