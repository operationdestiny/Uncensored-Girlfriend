import { SearchLandingPage } from "@/components/seo/SearchLandingPage";
import { buildSeoLandingMetadata } from "@/lib/seo-landing-pages";

export const metadata = buildSeoLandingMetadata("character-ai-alternative");

export default function Page() {
  return <SearchLandingPage slug="character-ai-alternative" />;
}
