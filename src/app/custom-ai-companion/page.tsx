import { SearchLandingPage } from "@/components/seo/SearchLandingPage";
import { buildSeoLandingMetadata } from "@/lib/seo-landing-pages";

export const metadata = buildSeoLandingMetadata("custom-ai-companion");

export default function Page() {
  return <SearchLandingPage slug="custom-ai-companion" />;
}
