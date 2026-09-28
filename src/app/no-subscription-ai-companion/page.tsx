import { SearchLandingPage } from "@/components/seo/SearchLandingPage";
import { buildSeoLandingMetadata } from "@/lib/seo-landing-pages";

export const metadata = buildSeoLandingMetadata("no-subscription-ai-companion");

export default function Page() {
  return <SearchLandingPage slug="no-subscription-ai-companion" />;
}
